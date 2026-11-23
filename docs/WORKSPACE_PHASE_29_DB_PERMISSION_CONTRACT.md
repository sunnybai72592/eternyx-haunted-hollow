# Workspace Phase 29 — Staging permission and signature audit hardening

The previous read-only Phase 28 audit tested migration *version presence*,
15 table RLS flags, and the presence of 17 RPC *names*. Name-only checks
could pass an unexpected overload or a same-name function with wrong
permissions. An RLS-enabled table with no policy or an anonymous write grant
could also escape detection.

This revision expands metadata-only coverage without connecting to production:

1. Audit **all 18 Workspace tables** declared by the 14 tracked migrations,
   including `workspace_import_batches`, `workspace_import_files`, and
   `workspace_item_revisions`.
2. Each table must have RLS enabled, at least one policy entry, and **no
   effective anonymous SELECT, INSERT, UPDATE, or DELETE privilege**.
3. For each of the 17 team RPCs, use an exact PostgreSQL argument signature
   via `to_regprocedure`; no same-name substitute passes.
4. Check each RPC is SECURITY DEFINER with pinned `search_path=''`,
   executable by `authenticated`, not executable by `anon`, and has no
   unexpected public-schema overload.
5. Phase 29 increments the strict parser/report contract to version 2.
   Missing or legacy receipts fail closed, and tests exercise each misconfig
   and its source/SQL wiring.

## Safety and execution

The existing explicit isolated-staging consent, exact project ref/host checks,
pinned CA and TLS verify-full, short statement timeouts, read-only transaction,
temporary file cleanup, and sanitized diagnostic handling are retained.

Use `npm run workspace:staging:db:config` then, **on a separately authorized
nonproduction staging project**, `npm run workspace:staging:db:audit`. Never
enter production credentials. This PR does not execute the audit, deploy
migrations, or change live policies.

The report can return `manual_review_required` only after all metadata
receipts pass. It **never certifies production**: catalog permissions do not
prove policy predicates, RLS behavior with owner/editor/viewer/outsider JWTs,
private file bytes, Realtime revocation, applied SQL body parity, or complete
migration rollout. The four-account staging scenarios and release signoff
remain necessary.
