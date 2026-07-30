create table if not exists public.trainvault_v3_athletes (
  sync_id text primary key,
  display_name text,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainvault_v3_athletes_sync_id_not_blank check (btrim(sync_id) <> ''),
  constraint trainvault_v3_athletes_timezone_not_blank check (btrim(timezone) <> '')
);

create table if not exists public.trainvault_v3_snapshots (
  id bigint generated always as identity primary key,
  sync_id text not null references public.trainvault_v3_athletes(sync_id) on delete cascade,
  fingerprint text not null,
  exported_at timestamptz,
  snapshot jsonb not null,
  entity_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint trainvault_v3_snapshots_fingerprint_not_blank check (btrim(fingerprint) <> ''),
  constraint trainvault_v3_snapshots_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint trainvault_v3_snapshots_entity_count_valid check (entity_count >= 0),
  constraint trainvault_v3_snapshots_sync_fingerprint_key unique (sync_id, fingerprint)
);

create table if not exists public.trainvault_v3_entities (
  sync_id text not null references public.trainvault_v3_athletes(sync_id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  effective_date date,
  source_key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (sync_id, entity_type, entity_id),
  constraint trainvault_v3_entities_type_not_blank check (btrim(entity_type) <> ''),
  constraint trainvault_v3_entities_id_not_blank check (btrim(entity_id) <> ''),
  constraint trainvault_v3_entities_source_not_blank check (btrim(source_key) <> ''),
  constraint trainvault_v3_entities_data_valid check (jsonb_typeof(data) in ('object', 'array', 'string', 'number', 'boolean', 'null'))
);

create index if not exists trainvault_v3_entities_type_date_idx
  on public.trainvault_v3_entities (sync_id, entity_type, effective_date desc nulls last);
create index if not exists trainvault_v3_entities_date_idx
  on public.trainvault_v3_entities (sync_id, effective_date desc nulls last);

create table if not exists public.trainvault_v3_sync_runs (
  id bigint generated always as identity primary key,
  sync_id text not null references public.trainvault_v3_athletes(sync_id) on delete cascade,
  fingerprint text not null,
  entity_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint trainvault_v3_sync_runs_fingerprint_not_blank check (btrim(fingerprint) <> ''),
  constraint trainvault_v3_sync_runs_entity_count_valid check (entity_count >= 0)
);

create index if not exists trainvault_v3_sync_runs_latest_idx
  on public.trainvault_v3_sync_runs (sync_id, created_at desc);

create table if not exists public.trainvault_v3_decisions (
  id bigint generated always as identity primary key,
  sync_id text not null references public.trainvault_v3_athletes(sync_id) on delete cascade,
  decision_key text not null,
  decision_type text not null,
  status text not null default 'proposed',
  rationale text,
  proposal jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainvault_v3_decisions_key_not_blank check (btrim(decision_key) <> ''),
  constraint trainvault_v3_decisions_type_not_blank check (btrim(decision_type) <> ''),
  constraint trainvault_v3_decisions_status_valid check (status in ('proposed','accepted','rejected','applied','expired')),
  constraint trainvault_v3_decisions_proposal_object check (jsonb_typeof(proposal) = 'object'),
  constraint trainvault_v3_decisions_sync_key unique (sync_id, decision_key)
);

alter table public.trainvault_v3_athletes enable row level security;
alter table public.trainvault_v3_snapshots enable row level security;
alter table public.trainvault_v3_entities enable row level security;
alter table public.trainvault_v3_sync_runs enable row level security;
alter table public.trainvault_v3_decisions enable row level security;

revoke all on table public.trainvault_v3_athletes from public, anon, authenticated;
revoke all on table public.trainvault_v3_snapshots from public, anon, authenticated;
revoke all on table public.trainvault_v3_entities from public, anon, authenticated;
revoke all on table public.trainvault_v3_sync_runs from public, anon, authenticated;
revoke all on table public.trainvault_v3_decisions from public, anon, authenticated;

grant select, insert, update, delete on table public.trainvault_v3_athletes to service_role;
grant select, insert, update, delete on table public.trainvault_v3_snapshots to service_role;
grant select, insert, update, delete on table public.trainvault_v3_entities to service_role;
grant select, insert, update, delete on table public.trainvault_v3_sync_runs to service_role;
grant select, insert, update, delete on table public.trainvault_v3_decisions to service_role;

create or replace function public.trainvault_v3_sync_snapshot(
  p_sync_id text,
  p_snapshot jsonb,
  p_fingerprint text,
  p_exported_at timestamptz,
  p_entities jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_entity_count integer := 0;
begin
  if p_sync_id is null or btrim(p_sync_id) = '' then
    raise exception 'sync id is required';
  end if;
  if p_fingerprint is null or btrim(p_fingerprint) = '' then
    raise exception 'snapshot fingerprint is required';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'snapshot must be a JSON object';
  end if;
  if p_entities is null or jsonb_typeof(p_entities) <> 'array' then
    raise exception 'entities must be a JSON array';
  end if;

  insert into public.trainvault_v3_athletes (sync_id, updated_at)
  values (p_sync_id, v_now)
  on conflict (sync_id) do update set updated_at = excluded.updated_at;

  insert into public.trainvault_v3_snapshots (
    sync_id, fingerprint, exported_at, snapshot, entity_count, created_at
  )
  values (
    p_sync_id,
    p_fingerprint,
    p_exported_at,
    p_snapshot,
    jsonb_array_length(p_entities),
    v_now
  )
  on conflict (sync_id, fingerprint) do nothing;

  delete from public.trainvault_v3_entities where sync_id = p_sync_id;

  insert into public.trainvault_v3_entities (
    sync_id,
    entity_type,
    entity_id,
    effective_date,
    source_key,
    data,
    updated_at
  )
  select
    p_sync_id,
    x.entity_type,
    x.entity_id,
    case
      when x.effective_date ~ '^\d{4}-\d{2}-\d{2}$' then x.effective_date::date
      else null
    end,
    x.source_key,
    coalesce(x.data, '{}'::jsonb),
    v_now
  from jsonb_to_recordset(p_entities) as x(
    entity_type text,
    entity_id text,
    effective_date text,
    source_key text,
    data jsonb
  )
  where btrim(coalesce(x.entity_type, '')) <> ''
    and btrim(coalesce(x.entity_id, '')) <> ''
    and btrim(coalesce(x.source_key, '')) <> '';

  get diagnostics v_entity_count = row_count;

  insert into public.trainvault_state (id, data, updated_at)
  values (p_sync_id, p_snapshot, v_now)
  on conflict (id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at;

  insert into public.trainvault_v3_sync_runs (
    sync_id, fingerprint, entity_count, created_at
  ) values (
    p_sync_id, p_fingerprint, v_entity_count, v_now
  );

  return jsonb_build_object(
    'updated_at', v_now,
    'fingerprint', p_fingerprint,
    'entity_count', v_entity_count
  );
end;
$$;

revoke all on function public.trainvault_v3_sync_snapshot(text, jsonb, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.trainvault_v3_sync_snapshot(text, jsonb, text, timestamptz, jsonb)
  to service_role;

comment on table public.trainvault_v3_snapshots is 'Append-only private snapshots used for rollback and audit. Browser access is blocked; TrainVault server uses service role only.';
comment on table public.trainvault_v3_entities is 'Current canonical entity projection from the latest TrainVault snapshot. History remains in trainvault_v3_snapshots.';
comment on table public.trainvault_v3_decisions is 'Audit trail for deterministic or coach-proposed adaptive plan decisions.';
comment on function public.trainvault_v3_sync_snapshot(text, jsonb, text, timestamptz, jsonb) is 'Atomically stores the compatibility head snapshot, append-only snapshot history, and canonical entity projection for one private TrainVault sync identity.';