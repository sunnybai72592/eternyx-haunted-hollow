# Docker release evidence review workspace — account-owned and auditable

This milestone follows merged PR #498 and adds **real owner-only persisted review history** to Docker governance. It does NOT introduce release authorization or Docker execution. Records are metadata assertions only. No binary, private key, original signed report, JWT or full Docker log is stored.

## Eleven connected improvements

1. New `docker_release_reviews` records strictly bind an account owner, idempotency request key, exact 40-character Git commit, candidate hash, source snapshot hash, manifest hash and 20-character staging Supabase project reference.
2. Persistent review lifecycle: `submitted -> in_review -> reviewed` or `blocked` from either open stage; terminal states cannot be reopened. `reviewed` means only that this account owner marked a record reviewed—not an independently validated security approval.
3. Separate server-recorded append-only-by-application-contract event records contain bounded notes, state and timestamps; no client writes or deletes.
4. PostgreSQL RLS restricts both review and event SELECT to `auth.uid()=owner_id`, with explicit grants and no browser INSERT/UPDATE/DELETE.
5. Service-role-only SECURITY INVOKER RPCs enforce transitions, owner-scoped advisory locks and cross-owner denials.
6. Idempotent retry of an exact request key returns the existing row; conflicting evidence under the same key is rejected.
7. Bounded owner quotas: maximum 100 lifetime reviews and 20 per rolling 24 hours; maximum 10 decision events per review.
8. The existing JWT-protected Docker Control Edge Function validates exact release action schemas, obtains the owner only from `authenticateUser/getUser`, and never accepts a client owner ID.
9. The list response now includes 30 latest owner release records and up to 80 latest owner audit events, with no execution or independent approval claim.
10. A functional React workspace lets the owner submit hash metadata, start review, record an explicit complete-review phrase, or block a record, and inspect real server history.
11. Standalone Node contract/UI tests plus actual isolated PostgreSQL 17 lifecycle and two-account RLS acceptance in dedicated CI, with fail-closed checks for browser privileges and no deployed execution.

## What users will see

Under Docker Operation Review & Approval, the Release Evidence Review section shows the authenticated owner's saved records and decision notes. The owner enters only independently obtained hash metadata. The field `candidateSha256` should come from the **offline #498 dual-signed handoff** after an independent verification step. The hosted UI itself cannot validate the author/reviewer keys. Do not copy private keys, full original evidence, access tokens or unredacted audit logs into note fields.

Start review, then deliberately mark the account review complete using a short confirmation phrase, or block a record. Blocking cannot automatically revoke a deployed Docker permit: this is metadata review only, not an execution-control plane. Separate incident containment remains the proper path for operational holds.

## Actual permissions and durability

RLS plus explicit SELECT grants make review history visible only to authenticated owners. Service-role SQL RPCs, called solely after verified server-side user identity, are the only permitted write paths. No browser can update records directly. Events are append-only via RPC transitions but are **not cryptographically immutable** against administrators/service-role actors.

## Deployment & test boundaries

CI applies only the new migration to an offline, network-isolated PostgreSQL 17 database containing two synthetic auth users, runs real RPC transactions and tests both users' SELECT visibility using `SET ROLE authenticated` and JWT subject claims. This does not prove staging or production has been deployed. After merging, the migration and the updated Docker Control Edge Function must be deployed separately to authorized staging before the new UI can load there.

The Docker server and agent flags remain disabled by default. UI decisions always return `releaseExecutionAuthorized=false`, `releaseIndependentApprovalVerified=false`, and `executionStatus=not_executed`. No PR auto-merges or production changes occur as a result.