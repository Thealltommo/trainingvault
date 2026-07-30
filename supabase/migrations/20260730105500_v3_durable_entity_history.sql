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
    and btrim(coalesce(x.source_key, '')) <> ''
  on conflict (sync_id, entity_type, entity_id) do update
    set effective_date = excluded.effective_date,
        source_key = excluded.source_key,
        data = excluded.data,
        updated_at = excluded.updated_at;

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

comment on table public.trainvault_v3_entities is 'Durable canonical athlete entity bank. Observed entities are upserted and retained for longitudinal history; snapshot history provides rollback/audit context.';
comment on function public.trainvault_v3_sync_snapshot(text, jsonb, text, timestamptz, jsonb) is 'Atomically stores the compatibility head snapshot, append-only snapshot history, and upserts durable canonical entities without discarding older athlete evidence.';
