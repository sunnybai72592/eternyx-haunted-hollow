# Services Phase 48 — shared administrator helper compatibility hardening

## Actual baseline
PR #760 merged after successful PostgreSQL replay. Live read-only staging inspection found 37 recorded inbound dependencies on public.is_admin(), the original seedless boolean SECURITY DEFINER body, and no eternyx_admin_private schema. The staging account, admin assignment and Services request counts remain zero; no auditor exists. Both Supabase public callable-definer warnings remain until a reviewed live change is applied.

## Review candidate
scripts/sql/services-staging-admin-helper-hardening-candidate.sql is deliberately outside automatic migrations. It rejects an unexpected original helper body, owner, signature, configuration, RLS or table grants, and an occupied private namespace. It creates a new, narrowly scoped private definer with the original caller-bound lookup, then replaces the public function in place with a stable SECURITY INVOKER SQL-standard RETURN wrapper bound to the private helper by OID. No arbitrary identity parameter, role metadata trust, seeds, direct assignment access or new public elevated routine. Existing anon/authenticated/service_role boolean call contracts are preserved; schema USAGE and helper EXECUTE are explicitly granted only to those roles plus owner, subject to effective ACL verification. Anon with no JWT identity returns false. This is not a revoked-session fence or a claim that every other pillar is hardened.

The candidate MUST NOT be applied if the live Data API exposes the new private schema, or if existing callers require different semantics. Repository config.toml only lists public and graphql_public, but is not proof of deployed API settings. Review actual remote exposed schemas, effective default privileges, current function owner and dependencies independently. Explicitly approve this additional staging-only mutation after successful CI; never change production, recreate the old foundation, reset the database, or apply global defaults.

## Verification
The networkless PG17 workflow rehearses the exact candidate after all 13 migrations and the Phase47 fixtures; compares actual public helper OID and inbound dependency count; requires 10/10 metadata facts; reruns the original positive/negative fixture acceptance, tests immediate admin-assignment revocation, direct table/self-assignment denial, anonymous false and auditor denied, and reruns 64/64 catalog. Duplicate application must fail.

The protected inventory has a separate Phase48 metadata proof; Phase43's old result describes the original definer foundation and is historical after hardening. The new proof does not claim live API exposure or actual Auth acceptance. If eventually deployed, verify live OID and dependencies before/after, all ten facts, six markers and 64 catalog checks, and rerun security advisors. Review the remaining intentional no-policy notice. Do not change the original 14 pinned SQL blobs/history. Actual real account acceptance remains blocked by missing three dedicated Auth accounts and auditor; see Phase47.

No live DDL, admin assignments, users or paid infrastructure changed in Phase48.
