# ETERNYX Workspace Phase 5 — Owner limits and practical discovery

**Status:** Source changes proposed for code review. Neither the Supabase migration nor any external service is automatically deployed by this PR.

## Real improvements

1. **Server-side owner quotas** (new reviewed migration): maximum **100 projects**, **5,000 tasks**, **5,000 saved items** and **100 MiB of registered private file contents per account**. The limits include archived projects and apply even when requests bypass the web UI. The limits use a transaction-scoped per-owner advisory lock to serialize concurrent inserts. The SECURITY DEFINER trigger rejects a forged `owner_id` before accessing any quota counts.
2. **Verified file registration**: the database checks each new registered file's declared byte size and MIME type against the existing private Storage object's `metadata.size` and `metadata.mimetype`, rather than trusting a client-supplied size. Missing or inconsistent metadata prevents registration. This is important for credible registered-byte totals and quota enforcement.
3. **Account-owned pinned projects**: a persisted `pinned` field is editable only by the authenticated project owner using existing RLS and a narrow column UPDATE grant. Pinned projects appear first in the project list, with archived status still respected.
4. **Workspace-wide discovery**: an account-local search across all successfully loaded owned projects, task titles/due dates, saved note text, bookmark URLs, and file titles. Results name their owning project and open that project. Search results are capped for usability and do not expose Storage object keys, owner IDs or hidden/cross-owner records.
5. **Registered-storage usage visibility**: actual registered byte totals and counts are displayed alongside project, task and item limits. **Orphaned/unregistered Storage objects are not included** in these metrics. Client-side preflight warns early; the database makes the final decision.
6. **Bulk finish tasks**: with explicit confirmation, the owner can mark all unfinished tasks in the selected active project done in one owner-scoped database operation. RLS blocks archived projects. Unrelated projects and other accounts are not touched.
7. **Database + Node acceptance**: network-isolated PostgreSQL 17 applies Phase 1/2/5 migrations and checks real file metadata, account isolation, pinned project rights, exact project/task/item quotas, registered-byte limits, and forged owner IDs; JavaScript tests cover sorting, aggregate byte labels and search.

## Important boundaries

- The 100 MiB cap applies to **registered** private file rows. Storage objects uploaded but never registered remain governed by Supabase's per-file 5 MiB bucket limit, not this aggregate quota. Preventing unregistered/orphaned uploads or implementing object-byte quotas directly at the Storage level is distinct follow-up work; do not call this a universal bucket quota.
- Existing signed-in Workspace sessions may fail to load the `pinned` field or see verification errors until the new migration is applied through the approved environment rollout.
- The search operates on the **complete loaded account library** only, currently bounded to 5,000 rows in the dashboard. Search is not a remote full-text index, and the app must show an error rather than presenting an incomplete account library as complete.
- There is no pricing, billing tier, analytics fabrication, automatic deletion of user files, or migration rollout from this PR.
- The triggers add per-insert counting overhead. Load and concurrency testing is required in staging before production launch.

## Acceptance and deployment

1. Review existing Phase 1/2 migrations as applied. Run `20261124010000_workspace_owner_quotas_and_pinned.sql` **after** the prior Workspace migrations in an authorized staging Supabase environment. No earlier migration is rewritten in this PR.
2. Run `npm test`, `npm run build`, browser smoke tests and the dedicated PostgreSQL acceptance workflow. Verify the updated Storage metadata fixture.
3. Test signed-in owners A and B: pin/unpin, bulk-finish tasks, global search and cross-owner isolation. Confirm a forged owner ID is rejected.
4. Test genuine authenticated file uploads and imports using Storage's real metadata shape. A registration with an altered declared file size or MIME type must fail; a correct registration must pass.
5. Test the 100-project, 5,000-task, 5,000-item and 100 MiB registered-file caps with concurrent clients. Confirm retries do not silently create duplicates and errors remain actionable.
6. Verify archived projects remain read-only and pinned status cannot be changed by another owner.
7. Check slow accounts, mobile layout and keyboard navigation. Confirm the legacy device scratchpad remains accessible.
8. Only after staging acceptance, apply migration to production and deploy the reviewed client build.

**Not delivered:** organization collaboration, arbitrary full-text indexing, file upload reservation/garbage collection, total physical Storage billing, unlimited pagination, and live alert notifications.
