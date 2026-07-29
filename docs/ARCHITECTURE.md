# TrainVault architecture

## Scope

TrainVault v0 evolves the existing programme-centric Next.js application into a
single-athlete operating system without replacing its imported programme,
workout, override, block-result, session-log, or JSON backup formats.

The architectural priority is resilience:

```text
PLAN -> EXECUTE -> MEASURE -> UNDERSTAND -> ADAPT
```

Today, Plan, Log, and session execution must remain available when Garmin,
OpenAI, or Supabase is unavailable.

## System boundary

```text
┌──────────────────────────────── Browser ────────────────────────────────┐
│ Next.js client pages                                                    │
│                                                                         │
│ Programme adapter -> unified CalendarSession -> Today/Plan/Log/Insights │
│                         |                                               │
│                         +-> readiness, load, variants, matching, insight │
│                                                                         │
│ localStorage: plans, logs, recovery, Garmin state, events, PRs          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ same-origin, signed HttpOnly session
┌───────────────────────────────v─────────────────────────────────────────┐
│ Next.js 16 server boundary (Node runtime)                               │
│                                                                         │
│ /api/cloud + /api/sync -> server-only Supabase client                  │
│ /api/coach             -> server-only OpenAI client                    │
│ /api/garmin/*          -> validated server-to-server Garmin adapter    │
└───────────────┬───────────────────┬────────────────────┬────────────────┘
                │                   │                    │
                v                   v                    v
        Supabase Postgres   OpenAI Responses API   FastAPI bridge
        normalized + RLS    structured proposal          │
                                                     normalized models
                                                          │
                                                          v
                                                 python-garminconnect
                                                          │
                                                          v
                                                    Garmin Connect
```

No browser bundle receives `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
Garmin credentials, Garmin refresh tokens, or `GARMIN_BRIDGE_API_KEY`.

## Application layers

### UI and routes

The main information architecture is:

| Route | Responsibility |
| --- | --- |
| `/` | Today, current readiness, current session, weekly context, recent work, upcoming event. |
| `/plan` | Week/month calendar and session lifecycle operations. |
| `/plan/run/new` | Explicit Garmin-safe structured running prescription builder. |
| `/session/[id]` | Original/current prescription, variants, block execution, Garmin delivery, and athlete result entry. |
| `/log` | Session logs, bounded Garmin activity sync, matching, and planned-vs-actual observations. |
| `/log/manual` | Fast manual Hawkeye/CrossFit/custom session parsing and capture. |
| `/insights` | Actionable adherence, minutes, load, running, and interference summaries. |
| `/insights/records` | Manual personal records and correction history. |
| `/coach` | Bounded OpenAI/fallback Coach and confirmation-required proposals. |
| `/settings` | Integration status, normalized migration, import/export, and source views. |
| `/settings/events` | A/B/C event management. |
| `/admin/import` | Existing programme and snapshot JSON workflows. |

`/program` and `/progress` remain as compatibility/detail views. Desktop uses a
left rail; mobile uses the six-item bottom navigation.

### Deterministic athlete domain

Code under `lib/athlete/` owns rules that an LLM must not replace:

- legacy programme/workout adapters and stable semantic identifiers;
- immutable original, editable current, and completed session representations;
- FULL / ADJUSTED / MINIMUM variants;
- multi-axis session cost: lower body, upper body, mixed, aerobic, anaerobic,
  eccentric, grip, and impact;
- conservative running-plan foundations, mileage/elevation progression,
  strength/CrossFit interference, and taper primitives;
- TrainVault readiness with GREEN / AMBER / RED outputs and contributing
  factors, including a manual athlete override;
- deterministic Hawkeye text classification;
- Garmin activity matching and planned-vs-actual comparison;
- guarded analytics that report sample quantity and avoid conclusions from
  insufficient evidence;
- event and personal-record primitives.

The React storage adapters compose imported programme sessions and manual
sessions into one `CalendarSession` view. Imported original prescriptions are
not mutated by moves, variants, or completion.

### Server route handlers

All non-login application/API routes pass through `proxy.ts`. Important handlers:

| Route | Boundary |
| --- | --- |
| `/api/login`, `/api/logout` | Password verification and signed session lifecycle. |
| `/api/status` | Booleans only; never returns credentials or key fragments. |
| `/api/cloud/migrate` | Authenticated, schema-bounded one-time normalized migration. |
| `/api/sync/push`, `/api/sync/pull` | Authenticated legacy `trainvault_state` snapshot compatibility. |
| `/api/coach` | Authenticated, validated, rate-limited OpenAI/fallback decision. |
| `/api/garmin/health` | Authenticated bridge health check. |
| `/api/garmin/devices` | Authenticated normalized device list. |
| `/api/garmin/recovery` | Authenticated nullable daily recovery and training status. |
| `/api/garmin/activities` | Authenticated bounded fetch/matching batch. |
| `/api/garmin/workouts` | Authenticated upload -> schedule -> optional push orchestration. |

OpenAI, Supabase, cloud migration, sync, and Garmin handlers explicitly use the
Node runtime.

## Current persistence model

### Browser storage

The interactive application is local-first. The principal keys are:

| Key | Data |
| --- | --- |
| `trainvault_active_programme` | Imported programme. |
| `trainvault_session_logs` | Subjective/completed session logs. |
| `trainvault_workout_overrides` | Current prescription edits while preserving originals. |
| `selectedTodayWorkoutId` | Athlete-selected Today session. |
| `trainvault_block_progress_<id>` / `trainvault_block_results_<id>` | In-session execution and results. |
| `trainvault_manual_sessions_v1` | Athlete-created sessions. |
| `trainvault_session_lifecycle_v1` | Skip/archive/reschedule/variant lifecycle metadata. |
| `trainvault_structured_running_workouts_v1` | Explicit Garmin-safe running steps. |
| `trainvault_recovery_records_v1` | Manual/Garmin/mixed daily recovery. |
| `trainvault_garmin_v1` | Workout delivery IDs, bounded activities, matches, and sync cursors. |
| `trainvault_athlete_records_v1` | Events, personal records, revisions, and archive state. |

Storage hooks use `useSyncExternalStore` and emit same-tab change events while
also listening for browser `storage` events.

Local storage is resilient and offline-friendly, but it is not encrypted,
multi-device durable, or protected by database RLS. Treat the browser profile
and origin as private.

### Supabase target model

`supabase/migrations/20260729101909_athlete_os_foundation.sql` adds:

- identity/config: `athletes`, `athlete_settings`;
- goals/events/plans: `training_goals`, `events`, `training_plans`;
- planned/completed work: `sessions`, `session_blocks`, `session_variants`,
  `session_logs`;
- integrations/measurement: `integration_accounts`, `activity_records`,
  `garmin_activities`, `daily_recovery`, `training_metrics`;
- coaching/history: `coach_decisions`, `coach_insights`, `data_migrations`.

All 17 public tables have RLS enabled. The authenticated policy checks
`auth.uid()` against athlete ownership, composite foreign keys prevent
cross-athlete relationships, anon access is revoked, and the intended
authenticated grants are explicit. Plans/sessions/logs retain source and legacy
identifiers plus original/current/completed JSONB where appropriate.

The web login is not yet a Supabase Auth session. `TRAINVAULT_ATHLETE_ID` must
therefore be the UUID of an independently created Supabase Auth user, and the
authenticated Next server uses its service-role boundary for migration.

### One-time normalized migration

Settings sends a bounded core snapshot, manual sessions, and lifecycle map to
`/api/cloud/migrate`. The server:

1. validates the signed TrainVault session and input shape;
2. computes a canonical source fingerprint;
3. derives deterministic UUIDs for compatible athlete/plan/session/block/
   variant/log rows;
4. upserts in batches and checkpoints `data_migrations`;
5. returns early without duplicates when the same fingerprint is complete.

Browser data is never deleted. The operation is resumable for the same
fingerprint, but the batches are not enclosed in one Postgres transaction. A
different snapshot after the migration has been claimed returns a conflict
instead of silently mixing sources.

The migration currently omits structured-run storage, Garmin local state,
recovery records, events, personal records, and later ongoing mutations.
Supabase is therefore a validated durable foundation, not yet the complete live
source of truth.

## Garmin flows

Outbound:

```text
structured TrainVault run
  -> Next validates and converts
  -> bridge uploads workout
  -> Garmin workout ID persisted locally
  -> bridge schedules for session date
  -> schedule ID persisted locally
  -> optional device push
  -> accepted device ID/state persisted locally
```

Inbound:

```text
manual Log sync
  -> bounded Garmin page
  -> normalized nullable activities
  -> compare workout ID, type, date/time, distance, duration
  -> confident auto-link OR explicit ambiguous confirmation
  -> completed session + planned-vs-actual observations
  -> athlete adds separate RPE/notes SessionLog
```

The bridge is documented in [GARMIN.md](GARMIN.md).

## Coaching flow

The client builds a small context of nearby sessions, recent logs, readiness,
and upcoming events. `/api/coach` validates that context, calls the OpenAI
Responses API with a strict output schema when configured, and sanitizes every
proposal against known incomplete sessions.

The only mutation types are reschedule and select variant. The route never
applies them. The athlete confirms each proposal in the browser before the
existing deterministic planning functions run. See
[COACHING_ENGINE.md](COACHING_ENGINE.md).

## Security model

- `TRAINVAULT_PASSWORD` is checked using constant-time digest comparison.
- The cookie contains a versioned payload, expiry, random nonce, and HMAC-SHA256
  signature. It is HttpOnly, SameSite=Lax, 30-day, and Secure in production.
- Use a separate high-entropy `TRAINVAULT_SESSION_SECRET`; rotating it invalidates
  existing cookies.
- Login and Coach rate limits are in-memory guardrails for this private v0. They
  reset on process restart and are not a distributed abuse-control system.
- API bodies and upstream responses are schema validated and bounded where
  implemented. Errors are reduced to safe public messages.
- Supabase's service-role key is imported only by a `server-only` module.
- The Next Garmin adapter permits plain HTTP only for loopback hosts, rejects
  credential-bearing/redirecting bridge URLs, uses no-store fetches and
  timeouts, and validates normalized responses.
- The bridge requires a bearer token whenever it binds beyond localhost. Its
  health response contains only service/version state.
- OpenAI requests use minimal structured context, strict output parsing,
  `store: false`, and confirmation-required writes.

## Resilience and degradation

| Failure | Behaviour |
| --- | --- |
| Supabase absent/down | Local programme, session, log, calendar, and recovery workflows continue. Migration/snapshot sync reports a safe error. |
| OpenAI absent/down | Coach returns a safe fallback; deterministic readiness and plan functions continue. |
| Garmin absent/down | Today's prescription and manual completion remain available; Garmin panels show explicit errors without fake state. |
| Garmin metric absent | The normalized value stays `null`; UI renders an unavailable/partial state. |

## Deployment topology

Recommended first production shape:

```text
Vercel Next.js (private project)
   |- server secrets scoped by environment
   |- function region near Supabase
   |
   +--> hosted Supabase eu-north-1
   +--> OpenAI API
   `--> HTTPS private Garmin bridge
           |- persistent owner-only token storage
           `- outbound Garmin Connect access
```

The deployment audit found Vercel's `iad1` function default and a Supabase
`eu-north-1` project. Move data-calling functions closer, such as `arn1`, after
validating plan/region availability. Local Node was 22.17 while new Vercel
projects default to Node 24; select and test one production major deliberately.

The current bridge token implementation requires a persistent filesystem. A
production deployment needs a persistent private host or a new managed
secret-store implementation behind the existing `TokenStore` interface.
