# Education — scoped staging credentials and main-branch-only release acceptance

The seven manual Education staging workflows now reject execution unless the event is `workflow_dispatch` on the exact `sunnybai72592/eternyx-haunted-hollow` repository's `main` branch. GitHub's protected `rls-staging` environment still supplies staged credentials when reviewers approve a manual run. A feature branch cannot use these workflows to run its changed code with staging credentials.

**Credential scope:** Hosted staging secrets are no longer inherited by the entire Actions job. They are scoped to only the explicit configuration validator and actual live acceptance test steps that require them. In particular, `actions/checkout`, `actions/setup-node`, `npm ci` and evidence upload/validation receive no staging Auth passwords, service-role keys, or staging URL secrets. The combined release workflow only exposes the privileged service-role key to the guarded validator/inventory and full release executor steps, not the PostgreSQL metadata audit or fresh-fixture SQL preflight. Its PostgreSQL password remains confined to the relevant read-only SQL audit/preflight steps.

The live release executor continues to strip the privileged key from every child process except trusted finalization. Read-only modes produce an empty privileged-key binding and cannot authorize writes. All existing approval phrases, synthetic fixture validation, audit checks, and evidence requirements remain unchanged.

The original `rls-staging` environment should still require trusted human reviewers, restrict deployment branches, enforce protected main and limit repository write permissions. Actions environment restrictions are a separate essential layer; YAML safeguards alone do not prove that a secure staging project has been provisioned. No hosted or production database, account or configuration has been changed by this patch.

Regression tests assert the main-only job guard, zero inherited job secrets, no exposure during npm installation, the intended step-level bindings, and lack of privileged key on read-only SQL steps. A green CI result is not a real hosted staging acceptance run.
