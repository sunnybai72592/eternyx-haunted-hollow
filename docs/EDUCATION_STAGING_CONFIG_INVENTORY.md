# Education: protected staging configuration inventory

**Status: non-destructive readiness diagnostic; not a live Supabase acceptance result.**

Use **GitHub Actions → Education hosted staging configuration inventory (no network) → Run workflow** and choose `preflight`, `rehearsal` or `journey`. This job uses the repository's `rls-staging` environment and reports only the **names** of absent settings. It has no SQL client, database connection, Supabase API call, service-role RPC or schema/fixture write.

The diagnostic checks up to **27 base settings** (isolated staging project ref/host/publishable key, two dedicated student accounts, existing read-only CBT/result fixtures, grade expectations and the staging PostgreSQL password). Rehearsal and journey additionally require **9 write-mode settings** (separate instructor credentials, review/finalization fixtures and the staging-only privileged key). Values stay within the protected GitHub runner and never enter the uploaded inventory or job summary.

It also executes the same **pure local config validators** used by the existing Education release process, including production project fingerprint rejection, Auth-account format, unique fixture IDs, expected scores and finalization permission-key shape. To exercise validators without triggering any action, the script passes approval phrases **only to pure functions in memory**, not to a hosted acceptance runner or live service. The report contains only fixed check names, pass/blocked states, exact GitHub SHA/run/attempt provenance, and absent setting names.

The same audit runs at the **start** of the existing Education hosted release workflow; if a required setting is absent, the release stops **before** any remote SQL, login, exam start, instructor review or official final-grade write. Its sanitized report is uploaded with the other evidence even after failure. Running the standalone diagnostic never consumes a one-time exam, deploys any SQL, provisions any Supabase resources, or authorizes production.

## Operator checklist after a blocked inventory

1. Establish a separate authorized Supabase staging project or suitable independently isolated environment. **Do not reuse the existing production project or its credentials.** Provisioning may incur billing, and the inventory does not create resources.
2. Restrict the GitHub `rls-staging` environment to trusted reviewers and intended deployment branches before adding secrets. Store passwords, publishable keys and the staging-only service key as environment **secrets**; keep IDs and project reference values in **variables**.
3. Run the inventory in `preflight` mode and use the missing-name report to fill approved synthetic fixture configuration. Do not put credentials into GitHub logs, comments or pull requests.
4. Independently deploy reviewed staging SQL/RPCs, check migration history and project isolation, and then run the **real hosted read-only preflight**. The inventory does not test actual hosted access or SQL installation.
5. Only after successful read-only acceptance and independent review, consider an explicitly approved one-time `journey` with prepared synthetic accounts, approved exam/instructor, validated expected scores, and a recent staging backup.

**Never treat `configuration_syntax_ready` as `staging_verified` or `production_approved`.** Offline completeness is not live authentication, row-level-security proof, or an authorization to deploy.
