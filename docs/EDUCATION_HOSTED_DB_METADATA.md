# Education: hosted database metadata release gate

**Status: SOURCE ONLY; no staging project has been provisioned or inspected by this PR. Production is not verified.**

Before the existing hosted Education release rehearsal, the manual GitHub Actions workflow now requires a real PostgreSQL metadata audit against a **separate** staging project. It runs with a read-only transaction and read-only session, and reads only catalog permissions/definitions, never private CBT rows or answer keys.

The audit verifies RLS on the seven core Education tables, denial of sensitive browser column and ledger privileges, authenticated-only atomic exam RPCs, server-only atomic final grading and an enabled grade-review locking trigger. It fails if **any** expected check is absent/false. It cannot itself prove that every row-level policy is correctly scoped, so the existing real-JWT student/instructor negative tests still remain mandatory.

For the protected GitHub environment \`rls-staging\`, add the new secret \`ETERNYX_EDU_STAGING_DB_PASSWORD\` using the **independent staging project** PostgreSQL credential, never the production password and never a frontend environment variable. The runner requires the exact direct hostname \`db.<staging-ref>.supabase.co\`; it rejects a matching production reference. Some direct Supabase connections require IPv6-capable GitHub runners, so provide a verified safe runner rather than relaxing the host guard.

Manual \`preflight\` and \`rehearsal\` both require explicit read-only approval. The check runs BEFORE any Education attempt or grading write. Failure blocks subsequent stages and uploads no fabricated pass. The output contains only fixed pass labels and GitHub SHA/run/attempt provenance with no project URL, user IDs, grade values, credentials or SQL details. The SQL contains no DDL or DML, and no production state or flags are changed.

Until an operator provisions staging, installs reviewed SQL/RPCs, configures the protected environment and runs the workflow successfully, the feature is **NOT staging-verified and NOT approved for production**.
