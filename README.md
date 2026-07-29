# TrainVault

TrainVault is a private, local-first athlete operating system for planning,
executing, measuring, and adapting hybrid training. It keeps the existing
programme and workout model, then layers a calendar, deterministic readiness
and load logic, Garmin workflows, normalized Supabase storage, and a controlled
OpenAI Coach around it.

This is a single-athlete v0. It is not a social product, and its readiness and
coaching output is training guidance rather than medical advice.

## What is in this version

- Today dashboard with recovery inputs, a TrainVault readiness recommendation,
  FULL / ADJUSTED / MINIMUM variants, current load, and upcoming training.
- Responsive week/month plan with touch and keyboard drag/drop, manual sessions,
  structured runs, completion, skip, reschedule, duplicate, archive, and restore.
- Manual Hawkeye/CrossFit capture with a deterministic text parser and editable
  load classification.
- Garmin bridge for nullable recovery data, structured workout upload,
  scheduling, optional device push, bounded activity sync, matching, and
  planned-vs-actual observations.
- Insights for adherence, minutes, load, running, and guarded interference
  findings, plus events and personal records.
- OpenAI Coach using bounded structured context and confirmation-required plan
  proposals. Deterministic TrainVault rules remain authoritative.
- A normalized 17-table Supabase foundation with athlete-owned RLS and an
  idempotent one-time local-to-cloud migration.
- Existing JSON import/export and legacy programme views remain available.

## Architecture

```text
Browser
  |- Next.js athlete UI
  |- deterministic athlete/domain engines
  `- localStorage (current interactive source of truth)
          |
          | signed HttpOnly TrainVault session
          v
Next.js server route handlers
  |- Supabase admin boundary ----> normalized Postgres + RLS
  |- OpenAI Coach boundary ------> Responses API
  `- Garmin boundary ------------> FastAPI bridge
                                      |
                                      `-> python-garminconnect -> Garmin Connect
```

The browser never receives the Supabase service key, OpenAI key, Garmin
credentials, Garmin token files, or bridge API token. See
[Architecture](docs/ARCHITECTURE.md), [Garmin](docs/GARMIN.md),
[Coaching engine](docs/COACHING_ENGINE.md), and
[Supabase](docs/SUPABASE.md) for the detailed boundaries.

## Prerequisites

- Node.js 22 or newer for local development. This implementation was verified
  locally with Node 22.17 and npm 11.18.
- Python 3.12 or newer for the optional Garmin bridge.
- Docker Desktop only if using the full local Supabase stack.
- A Supabase CLI login and hosted project for durable migration.
- A Garmin account and compatible Garmin device for the live Garmin flow.

## Local setup

```powershell
git checkout feature/athlete-os-v0
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set at least these two values in `.env.local` before starting:

```dotenv
TRAINVAULT_PASSWORD=choose-a-strong-private-password
TRAINVAULT_SESSION_SECRET=use-a-separate-long-random-secret
```

Generate a session secret locally if needed:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Open <http://localhost:3000> and sign in with `TRAINVAULT_PASSWORD`.
Restart the development server after changing environment variables.

## Environment variables

The committed [.env.example](.env.example) contains empty placeholders only.
Secrets belong in the ignored `.env.local` file locally and in encrypted,
environment-scoped project settings when deployed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TRAINVAULT_PASSWORD` | Yes | Password for the private TrainVault login. |
| `TRAINVAULT_SESSION_SECRET` | Strongly recommended | Separate HMAC secret for the signed 30-day session cookie. The password is only a fallback. |
| `SUPABASE_URL` | For cloud features | Server-side hosted Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | For cloud features | Server-only Supabase secret/service-role key. Never use a publishable or anon key here. |
| `TRAINVAULT_ATHLETE_ID` | For normalized migration | UUID of an existing Supabase Auth user; it becomes the athlete owner ID. |
| `TRAINVAULT_SYNC_ID` | Optional | Row ID for the legacy `trainvault_state` snapshot sync; defaults to `ray`. |
| `OPENAI_API_KEY` | Optional | Exact OpenAI key name used by the server-side Coach route. |
| `OPENAI_MODEL` | Optional | Model override; the current server default is `gpt-5.6-luna`. |
| `GARMIN_BRIDGE_URL` | For Garmin | Bridge origin, for example `http://127.0.0.1:8765` locally. |
| `GARMIN_BRIDGE_API_KEY` | For protected bridge | Must exactly match the bridge's `GARMIN_BRIDGE_API_TOKEN`. |

There are deliberately no `NEXT_PUBLIC_` secret variables.

## Quality commands

Run the complete TypeScript/Next.js checks from the repository root:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Run the Garmin service tests separately:

```powershell
Set-Location services/garmin-bridge
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
python -m pip check
python -m pytest
```

## Supabase setup

The migration is
`supabase/migrations/20260729101909_athlete_os_foundation.sql`. It has been
validated locally, but it has **not** been applied to the hosted project.

1. Create or select the intended hosted Supabase project.
2. In Supabase Auth, create the private athlete user and copy its user UUID.
3. Set that UUID as `TRAINVAULT_ATHLETE_ID`.
4. Review and apply the migration:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase db advisors --linked --type all
npx supabase migration list --linked
```

5. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, restart
   TrainVault, then use **Settings -> Migrate local data** once.

The migration copies compatible core programme, plan, session, variant, block,
and log data without deleting the browser copy. Retry the same snapshot after a
transient failure. See [docs/SUPABASE.md](docs/SUPABASE.md) before applying it.

## OpenAI Coach setup

Add the key under this exact name:

```dotenv
OPENAI_API_KEY=
```

Optionally set `OPENAI_MODEL`. The key is read only by `/api/coach`; the browser
submits a bounded plan/recovery context to that authenticated route. If the key
is absent, invalid, rate-limited, or temporarily unavailable, Coach returns a
safe deterministic fallback and the rest of TrainVault remains usable.

The model can propose only a date move or FULL / ADJUSTED / MINIMUM selection
for a known incomplete session. Each proposal requires a separate browser
confirmation before local state changes.

## Garmin bridge setup

From a second PowerShell window:

```powershell
Set-Location services/garmin-bridge
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
python -m pip check
python -m playwright install chromium
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -m app.browser_login
python -m app
```

The one-time login command opens a visible, temporary Chromium window. Enter
credentials, CAPTCHA, and any verification only in Garmin's page. TrainVault
does not prompt for, fill, log, or save the password and does not retain browser
cookies or a browser profile. It starts at Garmin Connect's normal public entry
and lets Garmin choose its current login redirects; it does not construct a
legacy Portal sign-in URL. It verifies and saves refreshable native tokens under
`~/.trainvault/garmin` by default, then proves a fresh normal provider can load
them with no username or password.

For the local-only bridge, set this in the root `.env.local` and restart
TrainVault:

```dotenv
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
```

If a bridge token is configured, set the same random value as
`GARMIN_BRIDGE_API_TOKEN` in `services/garmin-bridge/.env` and
`GARMIN_BRIDGE_API_KEY` in the root `.env.local`. Full setup and production
constraints are in [docs/GARMIN.md](docs/GARMIN.md).

## Sunday easy-run end-to-end test

This is the primary v0 acceptance path:

1. Start the authenticated Garmin bridge and TrainVault as described above.
2. Open TrainVault and sign in.
3. Open **Plan -> Structured run**.
4. Choose the upcoming Sunday, keep **Continuous run**, and enter the warm-up,
   continuous work, cool-down, and easy pace range. Check the preview, then
   select **Add structured run**.
5. On the session page, verify the explicit structured prescription.
6. In **Garmin**, optionally enable **Also push to a device**, choose a device
   (or Garmin's last-used device), then select **Send to Garmin**.
7. Do not continue until the UI reports **Scheduled** or
   **Sent to device** and shows a real Garmin workout ID. If it reports an
   error, retry; the persisted ID is reused where safe.
8. Sync Garmin Connect/the watch and confirm the workout is on Sunday's
   calendar or available on the selected device.
9. Complete and save the workout on the Garmin device, then let the device sync
   successfully to Garmin Connect.
10. In TrainVault open **Log** and select **Sync latest**. A confident match is
    linked automatically. If **Match this activity?** appears, select the
    correct Sunday session.
11. Verify the session is **Completed** and inspect the deterministic
    **Planned vs actual** distance, duration, pace, HR, elevation, adherence,
    and observation summary. These observations are the v0 basic post-run
    insight.
12. Open the matched session, use **Complete Session** to add subjective RPE
    and notes, and save the athlete log.
13. Return to **Insights** and confirm weekly completed count/minutes changed.
    Coach can now inspect the logged session and RPE, but detailed Garmin lap
    telemetry is not yet sent to OpenAI.

TrainVault never fabricates a successful upload, schedule, push, or activity
match. A real account/device run is still required to validate this path.

## Deployment considerations

- The Next.js application can run on Vercel, but every server secret must be set
  independently for Production, Preview, and Development as intended. Environment
  changes require a new deployment.
- Local verification used Node 22 while new Vercel projects default to Node 24.
  This repository does not currently pin an `engines.node` version; run the full
  check suite under the selected production runtime before promoting.
- The current deployment audit placed functions in `iad1` while the Supabase
  project is in `eu-north-1`. Put the data-calling functions nearer the database
  (for example the Vercel `arn1` region) and measure before production use.
- `GARMIN_BRIDGE_URL=http://127.0.0.1:8765` works only when Next.js and the
  bridge share the same machine. A deployed Next app needs a separately hosted,
  HTTPS bridge origin with a strong bearer token.
- The bridge's current token store is local filesystem storage. Do not place it
  on ephemeral serverless storage; use a persistent private host or implement
  the planned managed secret-store adapter first.
- Keep the bridge private where possible. The browser never needs direct bridge
  access, so CORS is not required.

## Known limitations

- Hosted Supabase migration and remote advisors have not been run. No production
  database was changed by this implementation.
- Interactive training state remains local-first. The one-time normalized
  migration does not yet include structured-run records, Garmin local state,
  recovery records, events, personal records, or subsequent ongoing edits.
- The one-time cloud migration is resumable/idempotent for the same fingerprint
  but is not one database transaction. A retry can complete partial rows.
- Authentication is a private shared-password boundary, not full Supabase Auth
  in the web UI. Local browser data is not encrypted.
- `python-garminconnect` is an unofficial Garmin Connect client. Garmin can
  change endpoints, rate-limit access, or return different fields at any time.
  Every Garmin metric is nullable.
- Garmin unit/contract tests pass, but no live Garmin account, real workout
  upload, or physical-device delivery was performed in this environment.
- Activity and recovery sync are manual and bounded; there is no background
  worker. Subjective RPE remains a separate athlete-entered session log.
- The structured-run schema/converter supports richer target types, but the v0
  builder UI exposes continuous time or distance-repeat workouts with pace/open
  targets; not every Garmin/watch step capability is exposed.
- OpenAI is optional and never owns the training algorithm. Coach conversations
  are not persisted, and its in-memory rate limit resets when a server instance
  restarts.
