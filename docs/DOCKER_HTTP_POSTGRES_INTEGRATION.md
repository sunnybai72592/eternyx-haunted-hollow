# Docker signed HTTP to real isolated PostgreSQL integration

This milestone builds on merged PR #461. It uses the identical shared Docker dispatch HTTP handler called by production Edge code, genuine ephemeral Ed25519 keys, and **actual PostgreSQL 17 database RPCs**. It is an isolated CI acceptance fixture, not a deployed Supabase connection or physical operator Docker host.

## What is actually exercised

1. Disabled-by-default lab dispatch blocks HTTP before consuming a nonce.
2. Bad Ed25519 signatures, browser Origins and expired timestamps do not consume a nonce.
3. Valid signed claim over local HTTP writes a real database nonce and unique claim tied to an approved owner request.
4. Replaying the same signed action is denied by the database, not by an in-memory replay mock.
5. Authorization produces a genuine server-signed short-lived permit validated by the agent's pinned-public-key validator.
6. A second authorization is rejected for the same claim.
7. Agent-reported completed receipt persists, duplicated matching receipts are idempotent, and contradictory reports are rejected.
8. A second failure receipt produces a real incident; escalation blocks new signed claims and re-enabling review.
9. Releasing an incident hold leaves the owner review policy explicitly disabled.
10. Revoked agent keys are rejected before nonce RPC, and backend errors produce non-sensitive unavailable responses.

## Isolation controls

The CI workflow creates a disposable postgres:17-alpine instance using Docker --network none with zero published ports. All PostgreSQL interactions occur through docker exec with a **hardcoded test container name**, a fixed allowlist of RPCs, and carefully quoted synthetic inputs. A Node HTTP server listens exclusively on 127.0.0.1 and uses the production shared dispatcher with a test-only database adapter. No physical Docker operator agent, remote lab container, production service-role key, hosted Supabase project, DNS or external AI service is contacted.

## Still not verified

This integration does not test the deployed Edge runtime or Supabase gateway, real JWT authentication, credential provisioning, public endpoint exposure, real operator-owned Docker Engine state or physical machine attestation. Earlier CI independently covers owner A/B SQL RLS. All server and operator execution flags should remain disabled on production until a separately authorized staging deployment and physical isolation review pass.

Run the GitHub Actions workflow Docker integrated HTTP and PostgreSQL security acceptance. The test requires a trusted GitHub runner with Docker enabled and Node.js 22; do not point the fixture at a host containing actual ETERNYX production data.
