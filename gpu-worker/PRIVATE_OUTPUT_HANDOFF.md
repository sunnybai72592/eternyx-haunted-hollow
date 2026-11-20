# ETERNYX AI Video — private job output handoff

## State: source implementation, not a live hosted video service
This milestone closes part of the gap between local Wan inference and the existing
Supabase private-output materialization core. No GPU has been hired, no inference
has been benchmarked and no media is being delivered through a production UI.

## Internal trusted-worker API
`GET /v1/jobs/:taskId/output` is **service-authenticated**, not browser- or
user-authenticated. The worker:
- requires the same server-only bearer secret as its submit/status endpoints;
- checks that the exact task exists and has succeeded with a recorded
  `asset_...` handle;
- reads only `<ETERNYX_PRIVATE_VIDEO_DIR>/<recorded-asset>.mp4`;
- opens the output relative to a restricted private folder with `O_NOFOLLOW`;
- verifies a regular MP4-shaped file no larger than 200 MiB;
- streams with `Content-Type: video/mp4`, `Content-Length`,
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`;
- never accepts a client-provided path, raw output reference or object URL.

The TypeScript `createSelfHostedVideoOutputDownloader(config, maxBytes)`
accepts a server-side provider/task/output tuple from a verified job and:
1. validates trusted configuration, provider identity and safe IDs;
2. checks `GET /v1/jobs/:taskId` reports `succeeded` with the **same**
   output reference;
3. downloads only from `GET /v1/jobs/:taskId/output`, with redirect rejection;
4. bounds declared and received bytes, validates the MP4 header and rejects
   truncated responses.
Its return shape `{bytes, contentType:"video/mp4"}` matches the existing
`AIOutputMaterializationDependencies.downloadProviderOutput` callback.

## Critical authorization and security boundary
The GPU worker only knows the shared **trusted-service credential**, not the
end-user's Supabase JWT. **Never expose this endpoint directly in the website
or return the worker bearer secret to a browser.** The caller must authenticate
the user, verify the job belongs to that user, confirm the active job lease,
then materialize the bytes through the existing create-only **private Supabase
storage** path. A video file cannot be called "delivered" until storage
ownership, access controls and settlement have been checked.

A compromised trusted backend or leaked service secret could read other GPU
worker outputs. Network isolation, secret rotation, per-service access control,
TLS proxying, disk access restrictions and audit logs remain mandatory before
staging deployment.

## Known limitations / follow-on requirements
- Backend dependency composition and production deployment are not wired up.
- Inference model download, GPU availability and model compatibility are
  deliberately untested: this PR runs only offline HTTP transport fixtures.
- MP4 `ftyp` signature checking catches obvious corruption, **not** all
  malformed media. Add trusted media validation/transcoding before production.
- Full media downloads are buffered in the server-side TypeScript adapter and
  limited to a trusted approved `maxBytes` setting. Higher-scale streaming
  transfer will need new storage integration.
- Storage cleanup, expiry and disk quotas are not handled by this endpoint.
- A successful task may not have a valid local file after disk loss; retrieval
  correctly fails rather than returning fabricated video.
- The previously created GPU worker returns terminal state on idempotent submit
  replays. The submit adapter still treats that as uncertain; subsequent status
  reconciliation rather than blind resubmission is required.

## Verification
The dedicated Python worker workflow runs `gpu-worker/tests/test_server.py`.
Node `npm test` exercises `tests/ai-self-hosted-video-output.test.mjs`.
Both are offline and never rent a GPU. Real staging acceptance must check
private media ownership, signed Supabase output access, duplicate jobs, exact
credit settlement, budget ceilings, safe moderation and real video playback.

No customer charges or GPU services have been activated.
