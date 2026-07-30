# Cloud checkpoint

Current Athlete OS preview acceptance path:

1. Vercel `trainingvault` project holds server-only TrainVault, Supabase, OpenAI and Garmin bridge variables.
2. Railway hosts the production-hardened Garmin bridge at the configured HTTPS origin.
3. Railway persists `garmin_tokens.json` on the `/data/garmin` volume and restores the Garmin session without account credentials.
4. Remote `/profile` and `/devices` checks have returned HTTP 200 with the Railway-held bearer token.
5. The remaining acceptance test is the feature-branch Vercel preview: private login -> Settings reports Garmin live -> recovery/activity sync -> phone -> structured workout -> Garmin Connect/watch with the local bridge stopped.

Do not place passwords, API keys, Garmin tokens, Supabase service-role keys, or session secrets in this document.
