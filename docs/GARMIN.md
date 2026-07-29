# Garmin bridge

## Status and boundary

TrainVault integrates with Garmin Connect through a small Python/FastAPI
service in `services/garmin-bridge/`. It uses
[python-garminconnect](https://github.com/cyberjunky/python-garminconnect),
an unofficial Garmin client.

```text
TrainVault browser
  -> authenticated same-origin Next API
  -> server-only bridge URL + bearer token
  -> normalized FastAPI models
  -> python-garminconnect
  -> Garmin Connect
```

The browser never calls the bridge directly and never receives Garmin account
credentials, refresh tokens, or the bridge bearer token.

The adapter and UI have contract/unit coverage, but this environment did not
perform a live Garmin login, upload, schedule, physical-device push, or completed
activity round trip. Garmin can change its unofficial API at any time.

## Bridge endpoints

The FastAPI service exposes only TrainVault-specific operations:

| Method and path | Result |
| --- | --- |
| `GET /health` | Non-sensitive service/version health. |
| `GET /profile` | Normalized account profile. |
| `GET /activities?start=0&limit=20&activityType=...` | Bounded normalized activity page, maximum 100. |
| `GET /activities/latest` | Latest normalized activity, if available. |
| `GET /recovery/{YYYY-MM-DD}` | Nullable recovery snapshot plus partial/unavailable metadata. |
| `GET /training-status?date=YYYY-MM-DD` | Nullable training status/load/VO2 data. |
| `GET /devices` | Normalized device list. |
| `POST /workouts` | Validate and upload a typed running workout. |
| `POST /workouts/{id}/schedule` | Schedule a real Garmin workout ID for a date. |
| `POST /workouts/{id}/push` | Request delivery to an explicit or last-used device. |

All responses are Pydantic models. Garmin's raw response shape remains inside
the bridge. Missing account/device metrics are returned as `null`; a partial
recovery response reports unavailable sources rather than failing the whole UI.

When `GARMIN_BRIDGE_API_TOKEN` is configured, every account-data endpoint
accepts `Authorization: Bearer <token>` (or the internal compatibility header).
`/health` remains non-sensitive. The bridge refuses to bind beyond localhost
without a token.

## Service environment

`services/garmin-bridge/.env.example` is committed with empty values only:

| Variable | Default/meaning |
| --- | --- |
| `GARMIN_EMAIL` | Legacy programmatic recovery only. Browser bootstrap ignores it; keep it blank. |
| `GARMIN_PASSWORD` | Legacy programmatic recovery only. Browser bootstrap ignores it; keep it blank. |
| `GARMIN_TOKEN_STORE` | Token directory; defaults to `~/.trainvault/garmin`. |
| `GARMIN_INTERACTIVE_AUTH` | Legacy programmatic recovery only; permits a terminal MFA prompt. |
| `GARMIN_BRIDGE_API_TOKEN` | Server-to-server bearer token; mandatory for a non-loopback bind. |
| `GARMIN_BRIDGE_HOST` | Defaults to `127.0.0.1`. |
| `GARMIN_BRIDGE_PORT` | Defaults to `8765`. |

The root Next environment uses:

| Variable | Meaning |
| --- | --- |
| `GARMIN_BRIDGE_URL` | Origin only, such as `http://127.0.0.1:8765` or `https://garmin-bridge.example.com`. Paths, embedded credentials, queries, and fragments are rejected. |
| `GARMIN_BRIDGE_API_KEY` | Must equal the bridge's `GARMIN_BRIDGE_API_TOKEN`. |

Do not prefix either root variable with `NEXT_PUBLIC_`.

## Install and perform the first browser login on Windows

Use a clean, dedicated Python 3.12 virtual environment. Explicitly selecting
the interpreter prevents compiled wheels from a different Python version being
mixed into the environment:

```powershell
Set-Location services/garmin-bridge
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
python -m pip check
python -m playwright install chromium
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Leave `GARMIN_EMAIL` and `GARMIN_PASSWORD` blank. The browser command
deliberately does not load `.env`, so a forgotten password there cannot enter
the bootstrap process. When the default `~/.trainvault/garmin` location is
unsuitable, pass the path explicitly and set the same value in `.env` for later
bridge startups:

```powershell
python -m app.browser_login
# Custom path:
python -m app.browser_login --token-store C:\private\trainvault-garmin
```

The command:

1. launches Playwright Chromium with `headless=False` and an ephemeral context;
2. opens Garmin's normal `https://connect.garmin.com/modern/` entry and lets
   Garmin choose its current redirects; TrainVault never constructs a
   `/portal/sso/...` login URL;
3. lets you type credentials and complete Garmin JavaScript, CAPTCHA, or
   step-up verification entirely in Garmin's page;
4. watches trusted Garmin response metadata and Connect navigation for an
   unconsumed service ticket plus Garmin's exact service URL, including path
   spelling and trailing slash;
5. separately recognizes an authenticated Connect page plus an applicable
   `JWT_WEB` cookie, or a validated JSON current-user response, without
   exporting, printing, or persisting cookie values, and briefly keeps
   monitoring queued network events for the exchange artifact;
6. closes the browser and gives the captured ticket and exact service URL to
   python-garminconnect 0.3.7's version-pinned native DI OAuth exchange;
7. requires a real lightweight authenticated profile response before writing;
8. writes the native `di_token`, `di_refresh_token`, and `di_client_id` to a
   temporary sibling store through python-garminconnect's hardened writer;
9. creates a fresh `GarminClientProvider` with username and password explicitly
   absent, reloads only that saved store, and verifies the profile and device
   methods used by the bridge;
10. atomically promotes the verified token file, leaving an existing working
   store untouched if any earlier step fails.

The command never calls a Python credential prompt, fills a password field,
prints authentication material, writes Playwright `storage_state`, or creates a
persistent browser profile. CAPTCHA and other Garmin controls are neither
disabled nor bypassed. TLS verification remains at the browser and upstream
client defaults. The legacy `python -m app.login` and
`trainvault-garmin-login` entry points are compatibility aliases for this same
browser flow; neither accepts credentials in Python.

The bridge pins python-garminconnect 0.3.7 because the public client does not
yet expose a browser-ticket bootstrap method. The compatibility seam is isolated
and tested; re-audit it before changing that dependency version. The older
Garth OAuth token format and `.garth` files are not compatible with this store.
Version 0.3.7 cannot serialize browser cookies by themselves: its compatible
store contains only `di_token`, `di_refresh_token`, and `di_client_id`. If
Garmin Connect is authenticated but its current flow exposes no unconsumed
Connect ticket, the command therefore fails clearly without writing tokens or
retrying credentials.

Progress is reported without secret values:

```text
Opening Garmin login ...
Browser authenticated.
Garmin ticket/session captured.
Exchanging tokens.
Verifying profile.
Verifying devices.
Token store promoted.
```

The local token store uses upstream owner-only file protections: 0700 directory
and 0600 token file on supported POSIX systems. On Windows it lives under the
current user's profile and inherits that profile's ACL. It is safe for a
single-user local proof, but it is not an encrypted managed production store.

## Run and verify the bridge

Start the bridge from the service directory:

```powershell
.\.venv\Scripts\Activate.ps1
python -m app
```

It listens on `127.0.0.1:8765` by default. In a separate window:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://127.0.0.1:8765/profile
Invoke-RestMethod http://127.0.0.1:8765/devices
```

The health response has this shape:

```json
{
  "status": "ok",
  "service": "trainvault-garmin-bridge",
  "version": "0.1.0"
}
```

`/profile` must return the normalized authenticated Garmin profile, and
`/devices` must return the account's real registered watch list. If
`GARMIN_BRIDGE_API_TOKEN` is configured, send it as an `Authorization: Bearer`
header for those two account-data requests; `/health` remains public.

Configure the root `.env.local`:

```dotenv
GARMIN_BRIDGE_URL=http://127.0.0.1:8765
```

If using a bearer token, generate a separate high-entropy value and place the
same value in the service and Next environments:

```dotenv
# services/garmin-bridge/.env
GARMIN_BRIDGE_API_TOKEN=the-same-random-value

# root .env.local
GARMIN_BRIDGE_API_KEY=the-same-random-value
```

Restart both processes after environment changes. Sign in to TrainVault and
check **Settings -> Garmin bridge** or call the authenticated
`/api/garmin/health` route from the browser.

## Delete tokens and re-authenticate

Stop the bridge before changing its token file. For the default Windows token
store, delete only this file:

```powershell
Remove-Item -LiteralPath "$env:USERPROFILE\.trainvault\garmin\garmin_tokens.json"
```

For a custom `GARMIN_TOKEN_STORE` directory, delete only its
`garmin_tokens.json`. If `GARMIN_TOKEN_STORE` itself ends in `.json`, delete
that exact file. Do not remove the containing directory or unrelated files.
Then run:

```powershell
python -m app.browser_login
python -m app
```

No browser profile or cookie file needs deletion because the bootstrap never
creates one.

## Service tests

```powershell
Set-Location services/garmin-bridge
.\.venv\Scripts\Activate.ps1
python -m pytest
```

These tests exercise authentication boundaries, endpoint contracts,
normalization, nullable data, workout conversion, scheduling, device push, and
safe upstream errors using fakes. They do not substitute for a real Garmin
account/device acceptance test.

## Structured workout delivery

Create a run at **Plan -> Structured run**. The v0 builder creates explicit:

- warm-up time;
- continuous work time, or distance work inside repetitions;
- time recoveries;
- cool-down time;
- pace range or open targets.

The underlying normalized schema/converter also represents time/distance/open
steps, repetitions, pace ranges, and heart-rate targets. The v0 form does not
yet expose every target/step combination supported by the types or every
capability of every watch.

On a session, **Send to Garmin** runs a staged, truthful operation:

1. `not_sent` -> upload typed workout;
2. persist the real Garmin workout ID;
3. schedule it for the TrainVault calendar date;
4. persist the schedule ID;
5. optionally request a push to the selected or Garmin last-used device;
6. persist the accepted device and final state.

UI states are:

- **Not sent**
- **Syncing**
- **Scheduled**
- **Sent to device**
- **Error**

An error records the failed stage. Safe retries reuse a persisted workout ID
instead of blindly duplicating an already-uploaded workout. A changed calendar
date is treated as a new scheduling state. No stage is shown as successful
until the bridge returns the corresponding validated identifier/acceptance.

## Recovery sync

Today exposes a manual **Refresh** for the selected date. The Next route fetches
both recovery and training status and saves a local manual/Garmin/mixed record.
Potential fields include:

- sleep duration and score;
- last-night and weekly-average HRV;
- resting HR;
- stress and body battery;
- Garmin readiness;
- acute and chronic load;
- training status/load and VO2 max at the normalized bridge boundary.

Not every field is available on every account or device. TrainVault readiness
uses available inputs alongside training and subjective signals; it does not
copy Garmin's readiness score or present medical advice.

## Activity sync and matching

Activity import is manual and paged:

1. Open **Log**.
2. Select **Sync latest** for up to 30 records.
3. Use **Load older** to advance the stored cursor.

The browser keeps at most 250 normalized activities and known IDs prevent
duplicate local records. The matching engine considers:

- persisted Garmin workout ID, when supplied by the activity;
- activity type;
- planned date/time proximity;
- planned distance;
- planned duration.

A confident candidate links automatically. Multiple plausible candidates
produce **Match this activity?** and require explicit selection. No plausible
candidate remains unlinked. A link may be manually removed.

Linked activity data can mark a session complete without overwriting the
prescription. Plan, Today, Coach context, and Insights use that completion.
Log shows deterministic planned-vs-actual adherence and observations for
distance, duration, pace, average HR, elevation, and recorded laps where data
permits.

Garmin does not provide subjective RPE. Open the matched session and submit the
normal completion form to add RPE, notes, and optional block results as a
separate `SessionLog`.

## Sunday easy-run acceptance runbook

### A. Preflight

1. Confirm the upcoming Sunday as an explicit `YYYY-MM-DD` date.
2. Run `python -m app.browser_login` once and confirm saved-token verification.
3. Start `python -m app`; verify `/health`.
4. Set `GARMIN_BRIDGE_URL` in root `.env.local`; if protected, verify the two
   bridge token variables contain the same value.
5. Start TrainVault with `npm run dev`, sign in, and confirm Garmin reports
   Ready in Settings.

### B. Create and deliver

1. Open **Plan -> Structured run**.
2. Name it `Sunday easy run`, select the upcoming Sunday, and retain
   **Continuous run**.
3. Enter explicit warm-up, continuous work, cool-down, and easy fastest/slowest
   pace values. Confirm the preview contains only the intended steps.
4. Select **Add structured run**. The app opens the new session.
5. Verify the **Structured running** panel, total estimate, date, and pace.
6. In **Garmin**, decide whether to enable **Also push to a device**. If enabled,
   load/select the intended watch or leave Garmin's last-used device selected.
7. Select **Send to Garmin** once.
8. Require one of these real outcomes:
   - **Scheduled** with a workout and schedule ID; or
   - **Sent to device** with workout, schedule, and accepted device IDs.
9. If **Error** appears, record the public stage/message, correct the bridge or
   account problem, and retry. Do not create a second TrainVault run merely to
   hide the error.
10. Open Garmin Connect and sync the watch. Confirm the workout is scheduled for
    Sunday and/or available on the intended device.

### C. Execute and import

1. On Sunday, start the delivered structured workout on the watch.
2. Complete and save it.
3. Sync the watch to Garmin Connect and verify the completed activity appears
   there before asking TrainVault to import it.
4. Open TrainVault **Log -> Sync latest**.
5. If the match is confident, verify **Auto-linked**. If the panel asks
   **Match this activity?**, choose `Sunday easy run`. If no match appears,
   compare the date/type/duration/distance and leave it unlinked until the
   correct session is available.

### D. Inspect and complete the athlete record

1. In the linked Log card, inspect **Planned vs actual**:
   distance, time, pace, average HR, elevation, adherence, lap count, and
   deterministic observation text where available.
2. Verify Plan/session status is **Completed**.
3. Open the session and select **Complete Session**.
4. Enter athlete-owned RPE and notes; save the result.
5. Open **Insights** and confirm completed count and actual weekly minutes
   include the linked activity without inventing an RPE.
6. Treat the planned-vs-actual observations as the v0 basic post-run Coach
   Insight. Optionally ask Coach to review the session after adding RPE. Coach
   currently sees completion/log context, not full Garmin lap telemetry.

## Production deployment

The local bridge is suitable for the first acceptance test. Production needs:

- a persistent Python 3.12+ process, not an ephemeral request-only filesystem;
- persistent private token storage, or a managed `TokenStore` implementation;
- HTTPS at the bridge origin because Next rejects non-loopback plain HTTP;
- a strong `GARMIN_BRIDGE_API_TOKEN`/`GARMIN_BRIDGE_API_KEY` pair;
- network access from the Next server to the bridge and from the bridge to
  Garmin Connect;
- log redaction and access controls around the host;
- monitoring for authentication expiry, rate limiting, and upstream changes.

The current Next URL validator accepts an origin only. Host the bridge at the
origin root or place a reverse proxy there; a base URL containing a path is
rejected.

For Vercel, `127.0.0.1` refers to the Vercel function instance, not the
developer's laptop. A Vercel-deployed TrainVault therefore cannot call a bridge
running only on the athlete's home machine unless a deliberately secured tunnel
or private network makes it reachable.

## Known limitations

- Garmin Connect has no supported public contract for this client.
- No live credentials or device were available for end-to-end validation.
- Local token files are permission-restricted but not backed by an implemented
  managed/encrypted production token store.
- Sync is user-triggered, not scheduled/background.
- Only a bounded local activity history is retained, and it is not yet included
  in the normalized cloud migration.
- Subjective RPE remains separate and manual.
- Watch models differ; a bridge acceptance response does not guarantee a device
  has completed its next Garmin Connect sync.
- Race prediction, endurance score, hill score, and every possible Garmin
  health field are not yet surfaced by the TrainVault UI.
