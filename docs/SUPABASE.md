# Supabase foundation

TrainVault's durable model is defined by
`supabase/migrations/20260729101909_athlete_os_foundation.sql`.
The migration adds the athlete operating-system tables without altering the
legacy `public.trainvault_state` compatibility table.

## Data ownership

`public.athletes.id` is the matching `auth.users.id`. Every other public table
stores `athlete_id`, and every relationship between athlete-owned tables uses a
composite foreign key that also checks `athlete_id`. This prevents a valid row
owned by one athlete from being attached to another athlete's plan, session,
activity, or insight.

All 17 new public tables have Row Level Security enabled. The `authenticated`
role receives explicit `select`, `insert`, `update`, and `delete` privileges,
then an ownership policy limits every operation to `auth.uid()`. The `anon`
role has no privileges on these tables. Server integrations may use the
server-only service role; never expose that credential in browser code.

## Compatibility and history

- Imported programme identifiers can be retained in `source`, `source_id`, and
  `legacy_id` columns.
- Plans, sessions, session blocks, and logs preserve immutable original
  prescriptions alongside current prescriptions and completed results in
  JSONB.
- `sessions` stores Garmin workout, schedule, device, and delivery state.
  `garmin_activities` retains provider IDs and raw provider payloads while
  `activity_records` contains normalized activity data.
- `data_migrations` records one-time local-storage imports, checkpoints, and
  counts. A cloud migration flow must not delete local data automatically.
- `integration_accounts` contains provider metadata and sync state only. Garmin
  credentials, tokens, passwords, and OpenAI keys do not belong in the
  database.

## Local validation

The checked-in `supabase/config.toml` targets Postgres 17 and keeps automatic
Data API exposure disabled. The migration explicitly grants the intended
roles, matching the current Supabase default.

With Docker running:

```sh
npx supabase start
npx supabase db reset --local --no-seed
npx supabase db advisors --local --type all
npx supabase migration list --local
```

These commands operate on the local Supabase stack. Link and push to a hosted
project only after confirming the intended active project and reviewing the
migration there.
