# Coaching engine

## Principle

OpenAI is TrainVault's interpretation and interaction layer. It is not the
training algorithm.

```text
athlete data
  -> deterministic TrainVault rules
  -> bounded context and allowed actions
  -> OpenAI interpretation OR safe fallback
  -> strict schema validation and sanitization
  -> athlete reviews one proposal
  -> explicit confirmation
  -> existing deterministic plan mutation
```

TrainVault remains fully usable without `OPENAI_API_KEY`.

## Deterministic ownership

The following stay outside the model:

- GREEN / AMBER / RED readiness and contributing-factor calculation;
- FULL / ADJUSTED / MINIMUM variant definitions;
- planned load and hybrid interference classification;
- conservative running volume/elevation progression and taper foundations;
- Hawkeye/CrossFit text parsing and session-cost classification;
- Garmin activity matching and planned-vs-actual comparison;
- session identity, status, lifecycle, original/current prescriptions;
- sample-size guards for analytics and confidence.

The model may explain those results and propose a constrained change. It cannot
replace or contradict them.

## Server configuration

The exact OpenAI environment variable is:

```dotenv
OPENAI_API_KEY=
```

`OPENAI_MODEL` is optional. The current default in
`app/api/coach/route.ts` is `gpt-5.6-luna`.

Both variables are server-only. Do not prefix them with `NEXT_PUBLIC_`, include
them in browser state, commit them, print them, or return key fragments from a
diagnostic endpoint.

The authenticated route uses the official OpenAI SDK and Responses API:

- `responses.parse`;
- Zod structured output named `trainvault_coach_decision`;
- low reasoning effort and low response verbosity;
- maximum 2,500 output tokens;
- 30-second client timeout and one SDK retry;
- `store: false`;
- stable non-PII safety identifier.

Model availability can differ by OpenAI project. Set `OPENAI_MODEL` to an
available compatible model if the default is unavailable; fallback behaviour
still protects the application.

## Input boundary

The browser sends only:

- athlete message: 2-2,000 characters;
- today's date;
- TrainVault readiness zone/score, up to 12 factors, and override state;
- at most 42 nearby sessions;
- at most 24 recent subjective logs;
- at most 8 upcoming events.

Each nested field is length/range constrained and unknown keys are rejected.
The route rejects a declared body over 64 KiB and validates the full request
with a strict Zod schema before invoking OpenAI.

Session context contains only the information required for a decision: known ID,
title, date, type, status, selected variant, duration, intensity, target
stimulus, and a lower-body signal. Recent logs include bounded notes, RPE, and
duration.

Garmin-linked sessions enter context as completed. Detailed activity/lap
telemetry is not currently sent to OpenAI. Recovery is represented through
TrainVault's deterministic readiness result rather than a raw database dump.

The system instruction explicitly treats all supplied context text as athlete
data, not instructions, which reduces prompt-injection risk from imported
programme text or notes.

## Output boundary

The strict decision shape contains:

- concise summary;
- one to six rationale points;
- zero to four cautions;
- confidence: low, medium, or high;
- one to six data-summary points;
- at most six proposed changes.

Only two proposal actions exist:

1. `reschedule`: a known incomplete session plus a valid new date within the
   accepted planning window;
2. `select_variant`: FULL, ADJUSTED, or MINIMUM for a known incomplete session.

Server sanitization rejects proposals when:

- the session ID is unknown;
- the session is already complete;
- the action fields are inconsistent;
- the date is invalid/outside the planning window;
- the variant is absent/invalid;
- the proposal duplicates another proposal.

The server response does not apply a mutation. On `/coach`, each proposed
change has its own review action and `window.confirm` gate. Only after athlete
confirmation does the client call the existing reschedule or variant storage
function and attach a Coach-proposal reason.

This is deliberate: valid structured output is still advice, not authorization.

## Fallback behaviour

Fallback is used when:

- `OPENAI_API_KEY` is not set;
- OpenAI is temporarily unavailable or times out;
- the model response cannot be parsed;
- the configured model/project rejects the request.

The fallback:

- identifies itself with `source: "fallback"`;
- summarizes available deterministic context;
- does not claim an OpenAI call succeeded;
- does not invent plan changes;
- includes conservative training/medical caveats;
- leaves Today, Plan, Log, Insights, and manual session workflows untouched.

The integration-status route returns only whether a key is configured. It does
not validate or reveal the key.

## Rate limiting and privacy

The route allows 12 Coach requests per 10-minute in-memory client bucket. This
is a useful private-v0 guardrail, not distributed production rate limiting:
each server instance has its own map and a restart clears it.

The request uses `store: false`, but OpenAI remains an external processor.
Send only the bounded context the feature needs and configure the OpenAI project
under the athlete's intended privacy/data-governance controls.

No Coach conversation history or decision is currently persisted to the
normalized Supabase tables. The schema contains `coach_decisions` and
`coach_insights` for that future durable flow.

## Safety expectations

Coach instructions require it to:

- preserve ambitious goals without aggressive unbounded load growth;
- defer to deterministic readiness and interference logic;
- flag uncertainty and sparse evidence;
- avoid diagnoses, invented injuries, fabricated measurements, or fake
  statistical confidence;
- describe proposals as proposals, never completed writes;
- direct concerning symptoms to qualified help.

The athlete remains responsible for judgment. Readiness and Coach output are
not medical advice.

## Verification

Pure Coach tests cover:

- bounded request and decision schemas;
- unknown/completed-session proposal rejection;
- invalid action-field combinations;
- date-window restrictions;
- duplicate sanitization;
- deterministic fallback shape.

Run them with the full application suite:

```powershell
npm run test
npm run typecheck
npm run build
```

To check configuration without exposing a value, sign in and inspect Settings
or the authenticated `/api/status` response. A live request from `/coach` should
show **OpenAI** as its source; a missing/unavailable key should show the safe
fallback source.

## Known limitations

- Coach currently proposes only date moves and variant selections.
- There is no persisted conversation, tool-call loop, streaming UI, or durable
  decision history.
- Detailed Garmin pace/HR/lap/elevation data and personal-record history are not
  sent to the model.
- Rate limiting is per process, not a shared durable quota.
- The model cannot create a new training plan or mutate a workout prescription.
- A successful model response is not evidence that its training interpretation
  is correct; deterministic guards and athlete confirmation remain mandatory.
