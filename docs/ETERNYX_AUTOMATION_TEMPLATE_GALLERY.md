# ETERNYX Automation Phase 2I: Curated Templates and Private Server Preview

## Real curated recipes

This adds eight migration-seeded, deterministic text workflows: Clean & deduplicate, Sorted inventory, ERROR log triage, Review queue extractor, Missing security controls, CP rectifier notes, Coating hold points and Release tag list.

The authenticated backend reads template steps from a service-only RLS-protected PostgreSQL catalog and runs each example using the existing actual text processing engine. Real sample output is computed, not faked in the browser. No scripts, paid APIs or third-party automation actions are present in these recipes.

## Owner-owned installation

A signed-in account can select and install a template into its own saved workflows. PostgreSQL copies the catalog's real steps, not untrusted client-provided steps, and records the source ID and version. This consumes one of the account's maximum 20 saved workflow slots. Copied workflows remain editable, pauseable and manually runnable. No webhook, schedule or GitHub issue is created or enabled by an installation.

Template installation uses a durable UUID idempotency receipt: retrying the same request key returns its original workflow and prevents duplicate saved copies; another template with that key fails. Deleting a copied workflow does not silently recreate it during a retry.

## Private dry-run preview

The Preview safely action loads the account-owned active saved workflow and current revision from the database, executes the actual deterministic steps on no more than 2,000 UTF-8 input bytes, and returns no more than 10,000 UTF-8 bytes of computed output.

It DOES NOT record a completed cloud run, trigger a webhook, schedule a job or post a GitHub issue. Instead, a separate service-only audit records only owner, workflow ID/revision, request UUID, input/output sizes, line count, timestamp and a keyed HMAC fingerprint. Neither raw input nor output text is stored in preview audit. This requires a dedicated server-only 32-byte hex secret named AUTOMATION_PREVIEW_AUDIT_KEY.

Each account gets 20 private previews per rolling 24 hours, independent of the existing recorded run budget. Duplicate UUIDs with unchanged content are replay-safe. Old preview/installation audit is eligible for opportunistic deletion after seven days on owner gallery load; no background cron or exact-time erasure guarantee is installed.

These are hosting-request quotas, NOT monetary spending caps. Avoid entering passwords, sensitive data, tokens or confidential records.

## Deploy separately after a reviewed, green PR

1. Check PostgreSQL 17 acceptance, GitGuardian, Node tests, build, release provenance and desktop/mobile browser acceptance.
2. Apply the database migration named 20261123050000_automation_template_gallery.sql after earlier Automation migrations.
3. Generate an independent random 32-byte server secret, represented as 64 hex characters, and configure it only in Supabase Edge secrets as AUTOMATION_PREVIEW_AUDIT_KEY. Never commit or share the key.
4. Redeploy automation-control and publish the new AutomationTemplateGallery and updated AutomationCloudPanel.
5. Staging-test each recipe's actual example output, idempotent install, owner access and editable copies. Confirm zero external triggers created.
6. Preview a saved copy and confirm its real computed output is not in completed run history. Exercise quota exhaustion, paused workflow, stale revisions, cross-user attempts and old audit cleanup.
7. Verify hosting charges separately before a public rollout. This PR does not itself deploy a backend or configure secrets.

## Tests

Run the Node test automation-template-gallery.test.mjs and the normal npm test / npm run build pipeline. The dedicated Automation Curated Template and Private Preview SQL Acceptance workflow tests the database against disposable network-isolated PostgreSQL 17.
