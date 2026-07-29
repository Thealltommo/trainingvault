-- The legacy compatibility snapshot is accessed only by authenticated
-- TrainVault Next.js server routes using SUPABASE_SERVICE_ROLE_KEY.
-- Browser roles must never read or mutate the private athlete snapshot directly.

revoke all privileges on table public.trainvault_state from anon, authenticated;

drop policy if exists "Allow TrainVault sync row select" on public.trainvault_state;
drop policy if exists "Allow TrainVault sync row insert" on public.trainvault_state;
drop policy if exists "Allow TrainVault sync row update" on public.trainvault_state;

alter table public.trainvault_state enable row level security;

comment on table public.trainvault_state is
  'Private TrainVault compatibility snapshot. Server service_role only; no direct anon/authenticated access.';
