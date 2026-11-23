# ETERNYX Automation Phase 2V — Handoff Preflight and UI Isolation

Phase 2U introduced source-backed manual owner handoffs. Phase 2V hardens that
existing process **without any new database migration, API secret, worker, paid
provider, schedule change, deploy, or automatic release path.** The owner
remains the only attestor: this phase does not create an independent reviewer.

## Ten concrete improvements in one PR

1. **Fresh authenticated preflight:** The UI calls the existing owner-only
   `incidentAuditHandoffAssessment` immediately before requesting user
   confirmation for a handoff; it does not trust a prior screen load.
2. **Review lineage equality:** The preflight verifies the same package UUID,
   case UUID/revision, last positive review UUID/decision, evidence UUID, and
   capture timestamp. A later negative/positive review requires reinspection.
3. **Version and source invalidation:** Source/plan/evidence changes or a case
   revision change deny the outdated confirmation even if the old UI still
   renders a previously eligible package.
4. **Receipt uniqueness at the operator level:** Already-current handoffs
   cannot be recorded again through this UI, preserving existing DB quotas.
   The database remains the final authority for idempotency and concurrency.
5. **Explicit changed-state recovery:** A changed preflight updates the owner
   panel to its new assessment, clears previous acknowledgments and receipt
   history, and asks the operator to inspect/reconfirm rather than silently
   recording a receipt.
6. **Case/refresh response isolation:** Requests carry a component-local
   generation token. Results or failures from an earlier case or refresh
   cannot populate the newly selected incident.
7. **Package and history isolation:** Selection changes invalidate pending
   history and mutations; stored receipt lists are only rendered/exported
   for their matching package.
8. **Strict audit reason provenance:** The validator checks reason-code
   precedence against real source/evidence/ledger/review state, denies an
   orphaned current handoff and checks impossible timestamps.
9. **Immutable-history chronology checks:** Receipt sequence ordering and
   actual record creation timestamps must agree; note-free exports remain
   allowlisted and spreadsheet-safe.
10. **Direct regression coverage and truthful UI:** Dedicated Node tests
    cover valid preflight, changed incident/review/evidence, current receipt,
    impossible metadata, history timestamp inversions, safe exports and
    guarded UI. The header now calls this **owner-only handoff**, not an
    independent review. The release limitations render as real emphasis,
    not visible Markdown asterisks.

## Security and operational boundaries

- The preflight is **advisory client-side revalidation**, not a transaction,
  lock, cryptographic proof, deployment test, CI lookup or external signature.
- The existing Phase 2U RPC remains the final server-side enforcement; it
  rechecks current source/review state under the case row lock. A changed case
  between preflight and commit must still be rejected by that RPC.
- User notes stay private in the existing database. New checks do not export
  them or accept additional arbitrary server fields into reports.
- No workflow, webhook, schedule, delivery, notification, auto-remediation,
  release, infrastructure change, or paid GPU/AI API is invoked by this phase.
- "Owner-only" is literal: **one authenticated account**. No second identity,
  external availability, independent review, artifact integrity proof or
  deployment verification is asserted.

## Verification and rollout

1. Run `node --test tests/automation-audit-handoff.test.mjs tests/automation-handoff-preflight.test.mjs`.
2. Run the repository's full Node utility tests, TypeScript/build, lint and
   existing browser checks through CI; reject the PR while required checks
   fail. PostgreSQL 17 Phase 2U acceptance remains the backend baseline.
3. In authenticated staging, load a reviewed, current owner package and test
   a handoff while a second session changes its case/review. The second
   authenticated preflight must refuse; database validation remains mandatory.
4. Switch incidents and packages while responses are pending. Ensure old
   case/receipt data, errors and exports do not appear under a new selection.
5. Test owner A versus owner B and ensure no privileged service_role key
   exists in frontend source. Inspect note-free JSON/CSV for leakage.
6. Publish the updated frontend after CI and staging acceptance. **No new
   migration and no Edge Function change are required in Phase 2V.** Earlier
   Phase 2U migrations and the existing Edge deployment must already be
   verified in the target environment. A merge is not proof of deployment.
7. If necessary, roll back only these frontend/helper changes; immutable
   Phase 2U handoff records are not touched.

**Definition of done:** All required checks pass, manual staging scenarios
are confirmed, and new handoffs remain source-locked, owner-scoped, private
and strictly non-executing.
