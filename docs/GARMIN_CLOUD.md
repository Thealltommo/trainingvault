# TrainVault Garmin bridge — cloud deployment

This runbook moves the working local Garmin bridge into a persistent private service so the Vercel app can reach Garmin while the laptop is off.

## Target topology

```text
Phone / laptop / tablet
        |
        v
TrainVault on Vercel
        |
        | HTTPS + server-only bearer token
        v
Garmin bridge on Railway
        |
        | token-only python-garminconnect session
        v
Garmin Connect
        |
        v
Garmin watch
```

The browser never calls the Garmin bridge directly. `GARMIN_BRIDGE_URL` and `GARMIN_BRIDGE_API_KEY` stay on the Next.js server. Garmin credentials, refresh tokens and cookies never enter browser storage.

## 1. One-time local Garmin authentication

Use the already-proven browser bootstrap on the laptop. The resulting token file is normally:

```text
%USERPROFILE%\.trainvault\garmin\garmin_tokens.json
```

Do not paste that file into chat, GitHub, Vercel, source code, logs or screenshots.

The cloud service should not be given `GARMIN_EMAIL` or `GARMIN_PASSWORD`.

## 2. Create the Railway service

Create a Railway project from the GitHub repository `Thealltommo/trainingvault`.

For the Garmin service configure:

- **Root Directory:** `/services/garmin-bridge`
- **Railway Config File:** `/services/garmin-bridge/railway.toml`
- Railway builds the `Dockerfile` from that isolated service root.
- Add a persistent volume mounted at `/data/garmin`.
- Generate a public Railway HTTPS domain after the service is healthy.

Railway injects `PORT`; the bridge supports it automatically. Railway's config-file path is repository-relative and does not automatically follow the configured Root Directory, which is why the explicit absolute config-file path above matters.

## 3. Railway variables

Set these service variables:

```dotenv
GARMIN_TOKEN_STORE=/data/garmin
GARMIN_BRIDGE_HOST=0.0.0.0
GARMIN_BRIDGE_ENV=production
GARMIN_INTERACTIVE_AUTH=false
GARMIN_BRIDGE_API_TOKEN=<generate-a-long-random-secret>
```

Do **not** set:

```dotenv
GARMIN_EMAIL=
GARMIN_PASSWORD=
```

Do not manually set `PORT` unless Railway requires a custom target; the platform injects it and TrainVault uses that value automatically.

In production the bridge refuses to start without `GARMIN_BRIDGE_API_TOKEN`, disables FastAPI `/docs` and `/openapi.json`, and sends no-store/security headers.

## 4. Seed the persistent token volume

The only file the service needs from the authenticated laptop is `garmin_tokens.json`.

Use Railway's service/volume file browser (`railway volume browse` / Railway service files) to upload the local token file into the mounted volume so the final remote path is:

```text
/data/garmin/garmin_tokens.json
```

Treat the file like a password. Never commit it. Railway's volume is the long-lived store; normal deployment filesystems are disposable.

## 5. Verify the bridge before connecting Vercel

`GET /health` is intentionally public and must return 200.

Account-data routes must reject requests without the bearer token. With the correct token, verify:

```text
GET /profile
GET /devices
GET /activities?start=0&limit=5
```

A successful profile/device response proves the cloud process can restore the saved Garmin session without username/password authentication.

## 6. Point Vercel at Railway

Add these **server-only** variables to the TrainVault Vercel Preview environment first:

```dotenv
GARMIN_BRIDGE_URL=https://<railway-domain>
GARMIN_BRIDGE_API_KEY=<same-value-as-GARMIN_BRIDGE_API_TOKEN>
```

Never prefix them with `NEXT_PUBLIC_`.

After changing Preview environment variables, trigger a fresh `feature/athlete-os-v0` deployment; existing preview deployments keep the environment snapshot they were built with. Open **Settings** on the new deployment and confirm Garmin reports live connectivity before using phone Garmin actions.

## 7. Establish cross-device TrainVault state

Before opening a fresh phone browser, use the laptop copy that currently contains the authoritative training plan/history:

1. Pull the latest `feature/athlete-os-v0` branch.
2. Open **Settings**.
3. Under **Cross-device handoff**, choose **Use this device as source** once.
4. Confirm Supabase reports the new cloud timestamp.

This replaces only the legacy compatibility snapshot. It does not delete local data and is separate from the normalized 17-table Athlete OS migration.

A fresh signed-in phone/browser can then hydrate the compatible TrainVault state automatically. Established devices reconcile in the background. If both local and cloud changed since the same baseline, TrainVault deliberately refuses to guess which side should win; use Settings to resolve the source explicitly.

## 8. Phone acceptance test

With the laptop Garmin bridge stopped — ideally with the laptop fully off — use the Vercel preview from a phone:

1. Open TrainVault and confirm the plan/log state has hydrated.
2. Open Today and confirm Garmin recovery can refresh.
3. Open Log and confirm Garmin activities can sync.
4. Open Plan and select/create a structured running session.
5. Send the session to Garmin.
6. Confirm TrainVault records a real Garmin workout ID and scheduled state.
7. Open Garmin Connect / the watch and confirm the workout exists.

That proves the complete remote path:

```text
phone -> Vercel -> Railway -> Garmin Connect -> watch
```

## 9. Production promotion

Only after the remote acceptance test succeeds:

- configure the same bridge variables for Vercel Production;
- merge/promote the Athlete OS branch;
- keep Railway deployment limited to one replica because its token store is attached to a single persistent volume;
- leave `/health` as the Railway deployment healthcheck;
- rotate `GARMIN_BRIDGE_API_TOKEN` if it is ever exposed.

## Operational notes

- `python-garminconnect` is unofficial and Garmin may change behaviour without notice.
- A Railway volume survives normal application redeploys; the container filesystem does not.
- A service with an attached Railway volume cannot use replicas and may have a short interruption during deployment while the volume is remounted.
- If the Garmin refresh token is eventually revoked, repeat the local Chrome bootstrap and replace only `/data/garmin/garmin_tokens.json`.
- Do not enable interactive Garmin login in the cloud service.
- The bridge is a private adapter for one TrainVault athlete, not a general Garmin proxy.
