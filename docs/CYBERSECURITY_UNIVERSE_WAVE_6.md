# Cybersecurity Universe — Wave 6: Private Security Investigations

## Delivered in one PR

A separate, authenticated investigation workspace built on the **existing** owner-scoped pentest engagements, private evidence bucket and append-only evidence audit triggers.

1. Owner+engagement+declared-target binding and excluded-scope filtering. Signed-in, attested engagements required to save.
2. Investigation lifecycle: open → investigating → contained → monitoring → resolved → closed. These are **analyst assertions**, not automatic incident detection or containment.
3. Append-only **analyst timeline** per immutable snapshot (observation, action, decision, handoff, retest), bounded to 100 events and timestamp-validated.
4. Action ownership, deadlines, tasks and overdue triage, with closure guarded against incomplete tasks.
5. Select and link existing private evidence metadata, max 20. Every ID is checked by an owner-scoped and engagement-scoped server query before save and restore. Only opaque IDs are included, not signed/public URLs.
6. Documented closure gates: substantive closure narrative, linked private evidence and a recorded decision/retest event. This is documentation, not verified remediation.
7. Save/restore immutable private JSON versions (max 256 KiB) in the existing pentest-evidence bucket; audit trigger records metadata registration. Cleanup of unregistered object is attempted on metadata failure; failure is surfaced.
8. Paginated evidence history with stale-result cancellation, recent recorded audit activity, readable Markdown report, integration into Hub and authenticated routes.
9. Regression tests: ownership, scope, closure, evidence links, size, enum/date checks, Markdown escaping, private storage/audit API contracts.

## Operational boundaries

- This is **not** a hosted SIEM, live incident feed, ticketing synchronization, automated analysis, alerting, containment, risk certification or independent authorization verification.
- No new migration is committed, generated, or applied. This workspace uses older pentest evidence tables independently of the separate staged relational ledger. No production data was modified in building this PR.
- Existing RLS and private storage policies remain the **authoritative server authorization**; UI checks cannot grant permissions. No service key in the frontend.
- JSON is versioned rather than indexed by finding/task/event. Case versions use private evidence metadata search scoped by engagement. For full team collaboration, queryable investigations and roles require staged schema migrations and further access-control design.
- Audited metadata proves a record was uploaded; it does not prove that its narrative or remediation was true.
- Page-offset listing can be affected by concurrent inserts. Unique row IDs are de-duplicated client side, and no silent success is shown for failed uploads/registrations.

## Release verification

- Run \`node --test tests/security-investigation-workspace.test.mjs\`, \`npm test\`, and \`npm run build\`.
- Staging with two signed-in accounts: verify cross-owner evidence selection/download/restore is denied by database and storage; excluded/revoked target is rejected.
- Save → refresh → restore; verify private JSON metadata and upload audit row exist.
- Attempt resolution with absent evidence or decision and confirm refusal. Confirm no action remains open before marking closed.
- Revoke engagement while editor is open and confirm server denies stale write; reconcile state in staging.
- Verify accessibility, mobile layout and keyboard controls.

## Next gated milestone

Finish authentic Supabase staging acceptance of the Wave 4 indexed ledger; only then design queryable multi-user incident collaborations. Do not use CI-only acceptance to claim production deployment.
