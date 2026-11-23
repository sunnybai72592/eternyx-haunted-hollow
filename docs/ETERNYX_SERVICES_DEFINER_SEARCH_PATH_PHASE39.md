# Services Phase 39 — secure callable SECURITY DEFINER routines and trigger search paths

**Scope:** independent Services staging release safety. **No new migration, no remote SQL write, no project provisioning, no production access.**

## Threat and response

Phase 38 checks whether the staging read-only auditor can execute *volatile* SECURITY DEFINER functions and privileged procedures. It does not catch a callable function labeled `STABLE` or `IMMUTABLE`, nor does it verify that a client-callable elevated function or privileged trigger pins its SQL search path. A SECURITY DEFINER running with a caller-dependent or mutable path risks executing shadowed objects with its owner's authority.

Phase 39 adds **three separate read-only PostgreSQL catalog assertions** to the **existing protected Phase 36 SQL transaction**:

1. The staging auditor must not have effective EXECUTE on **nonvolatile (STABLE/IMMUTABLE) SECURITY DEFINER functions** inside `public` or `eternyx_private`. This closes Phase 38's volatility-only gap; trigger/event-trigger functions are excluded from direct-call analysis.
2. For **anonymous or authenticated client-callable SECURITY DEFINER functions** in those schemas, the definer must use an explicitly pinned **empty `search_path`** (requiring schema-qualified references). This is detected using `pg_proc.proconfig`. Both implicit PUBLIC EXECUTE and direct grants are evaluated using effective PostgreSQL privilege functions. A fixed but broader search path is not automatically allowed; this strict setting must be intentionally reviewed.
3. **SECURITY DEFINER trigger functions** in those schemas must likewise pin an empty search path. Trigger return types are detected independently of whether the auditor can directly call them, because they execute as part of row changes.

Each flag must be boolean TRUE; missing, NULL, false, wrong-type and extra facts all block the staging gate **before any real-user login**. The query uses only pg_catalog procedure, schema and privilege metadata. It neither reads the function body nor calls any function.

This rule is grounded in the existing production-auth source: `public.is_admin()` and `public.get_current_user_role()` are declared STABLE SECURITY DEFINER and `SET search_path = ''`, with execute permissions intentionally granted to real application roles. The auditor should not be granted their execution rights. Phase 39 does **not** forbid client roles from calling these explicitly hardened functions.

## Actual PostgreSQL tests

The existing **--network none disposable PG17** Services CI now creates a synthetic least-privilege auditor. It verifies a hardened client function passes, then deliberately:

- grants auditor EXECUTE on a STABLE definer (must fail the new nonvolatile check);
- changes a client-callable definer's path to `public` (must fail), then fixes it;
- **removes** the explicit `search_path` (must fail), then fixes it;
- creates a weak definer with PostgreSQL's default PUBLIC EXECUTE (must fail);
- revokes PUBLIC EXECUTE to prove the accidental client attack surface is removed, then explicitly grants authenticated EXECUTE (must fail until hardened);
- creates a SECURITY DEFINER trigger with a missing `search_path` (must fail) and then hardens it;
- removes all synthetic functions and the auditor, and checks the clean baseline.

All writes occur exclusively inside CI's ephemeral network-isolated Postgres container, not Supabase. The protected manual staging workflow runs only the independent catalog SQL and existing real-account acceptance.

## Guardrails and limits

The gate checks *effective grants and metadata*, not the security or business logic of every function body. Dangerous routines in system or other application schemas, unsafe dynamic SQL inside a hardcoded search path, trigger chains and future privilege changes require additional review. A point-in-time passing result is not a proof that a historical collision migration file matched deployed SQL.

No production or staging deployment is performed by this phase. The connected account has only exposed the production-linked Eternyx project so far. It lacks the two named later Services phases (brief amendments/journal); do not deploy missing SQL to it without separate explicit approval. First provision an approved independent **staging project**, reconcile all historical cross-pillar version collisions, deploy approved missing schema in dependency order (**Phase 13 before Phase 14**), and then perform protected **real-account staging** A/B/admin/anonymous acceptance.

Passing Phase 39 local CI alone does not mean Services is **production-ready**.
