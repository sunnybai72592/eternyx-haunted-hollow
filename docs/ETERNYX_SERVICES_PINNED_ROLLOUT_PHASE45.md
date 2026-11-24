# ETERNYX Services Phase 45 — pinned staging rollout review

## Actual staging baseline, 24 November 2026

Connected read-only catalog inspection found auth.users and auth.uid(), but no public.admin_users, public.is_admin(), eternyx_private schema, or public Services relations. The registered staging history contains nine migrations: three security/pentest and six LABS. No Services migrations are recorded. The reviewed baseline is captured by exact name/version pairs in the rollout manifest, not interpreted as proof of applied SQL content.

The staging postgres creator has schema-specific public default ACL records granting anon, authenticated and service_role broad table privileges and function EXECUTE. Phase 44 tested the foundation under those defaults but removed them before rehearsing the 13 Services files. Phase 45 keeps the defaults intact, repeats the entire existing migration chain and RLS tests, checks anonymous table/column/RPC denials and authenticated column-scoped rather than broad table writes, and executes the exact 64-check catalog verdict. Service_role is a trusted server-side role with RLS bypass, not a client; its existing grants are not removed globally by this change.

## Reviewed deployment sequence

Run `node scripts/services-phase45-pinned-rollout.mjs --check` on the exact reviewed checkout. This checks the existing cross-pillar collision/source guard and the actual Git blob hash of the 14 allowlisted SQL inputs, starting with the seedless foundation. The 13 existing migration files remain unmodified. Each input has its exact intended managed migration name, with the source timestamp kept distinct from any actual managed migration version. Phase 13 before Phase 14 remains required. No migration timestamp is assigned or invented in this manifest.

The tool is offline and cannot apply SQL or authorize any rollout. It compares a freshly collected complete managed history against the recorded baseline only when supplied to the exported comparison function. Any difference blocks use of that baseline; review new cross-pillar changes rather than ignoring them. A matching baseline does not independently authenticate history, establish target identity, or prove that SQL content was deployed.

## Staging-only operator approval boundary

Required before applying anything: explicit approval of the exact pinned 14-step rollout to the already registered, separate Eternyx Staging project only. Do not use production credentials, run a global db push, alter project-wide default ACLs, copy any production admin assignments, or create paid infrastructure. No Auth users or administrator grants are included.

After explicit approval:

1. Re-read project registration and full history, compare current names/versions to the manifest, inspect relevant existing objects and their dependencies, and confirm the creator-role ACL assumptions. If another pillar has added or changed objects/history, stop and reconcile.
2. Apply the exact seedless foundation in its own transactional, uniquely recorded managed migration. Stop if either object exists, and verify the real foundation permissions and zero assignments afterward.
3. Apply the 13 pinned Services files in their exact sequence with the exact reviewed managed names. Allow the managed migration interface to assign unique versions; confirm each applied name/version before proceeding. If a step fails or concurrent history changes, stop, preserve prior successful history, and explicitly review the remaining suffix. Never repair history, blindly rerun an already-applied step, or reset the staging database.
4. Verify all recorded names in strict actual version order, all six schema markers, all 12 trusted-admin facts, 64/64 catalog verdict, effective ACLs and routine protections. A dedicated staging admin and owner A/B accounts must be separately approved and configured before real authenticated acceptance.

The offline tests and rehearsal are not real Supabase Auth or live staging certification. No remote migration was applied in Phase 45. Merge is source review, not a database deployment approval. Production remains untouched.
