# The Agoge

The Agoge is Ray's private hybrid training and coaching system for running, fell running, CrossFit and Spartan/OCR preparation.

## Canonical production origin

The canonical app origin is:

`https://project-poo2v.vercel.app`

That is intentionally the original TrainVault Vercel origin. Existing programme, session, workout and block history was stored in browser `localStorage` under that exact origin, so The Agoge is now deployed as an in-place evolution of TrainVault rather than as a separate migration target.

Requests to the newer `trainingvault-*.vercel.app` project are redirected to the canonical origin for user-facing routes.

## Data continuity

On startup The Agoge:

- reads the existing TrainVault local-storage keys directly;
- merges any available cloud snapshot without discarding local session history;
- restores the merged snapshot in-place; and
- attempts to seed/update the private cloud snapshot for durable cross-device recovery.

Legacy storage keys are intentionally retained in code for backwards compatibility.

## Development

```bash
npm install
npm run dev
```

The application is built with Next.js and deploys to Vercel from `main`.
