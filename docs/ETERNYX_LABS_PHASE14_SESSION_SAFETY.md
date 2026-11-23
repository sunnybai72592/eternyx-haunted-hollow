# ETERNYX LABS Phase 14 — Authenticated session control reliability

This is a production-safety improvement for the existing /labs/sessions UI, not
a deployment of hosted cybersecurity targets.

- Validate provider capacity, heartbeat-derived availability fields and conservative
  15-minute session duration from ctf-range-control before displaying readiness.
- Validate at most 12 owner-scoped session rows, UUIDs, known states, fixed
  challenge packs, timestamps and optional dates; never copy internal provider
  identifiers, access URLs or secrets into rendered state.
- Refuse stale read responses after logout, another login, a newer refresh or
  component unmount. The fence checks the live authenticated owner identity.
- Clear previously displayed private records and provider capability when a
  refresh fails; never leave stale green availability on screen.
- Prevent repeated overlapping reservation/stop actions using synchronous
  single-flight lock in addition to disabled buttons.
- Require exact, allowlisted server reservation and stop receipts. Stop replies
  must match the selected session ID. Unverified replies never claim success.
- Keep operator-only hosted access disabled and do not invent a browser
  terminal, execution result, credential, VM, or staging proof.
- Include adversarial tests for malformed responses, cross-account staleness,
  duplicate sessions, mismatched stop confirmations, and PostgreSQL ISO offsets.

Run: node --test tests/eternyx-labs-session-client.test.mjs
Then: npm test && npm run build.

This work does **not** establish that the Supabase staging database, Edge
Functions, provider heartbeat, external ingress or authenticated accounts are
working live. Separate credentials, explicit staging approval and external
provider checks remain required.
