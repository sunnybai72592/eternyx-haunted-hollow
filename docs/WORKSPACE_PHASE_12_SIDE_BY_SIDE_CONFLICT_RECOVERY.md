# ETERNYX Workspace Phase 12 — resolve import conflicts without overwriting edited work

**Status: proposed code for review.** No production database changes or remote data mutations are performed by this PR itself. Uses existing Workspace v1/v2/v3 export validation and Phase 9–11 imported-project recovery.

## What is new

1. **Non-destructive Recovery Center action:** For an owner-inspected import that is protected/on hold, or whose live project records no longer match the last checkpoint, provide **Prepare separate recovery copy**. The old project stays untouched. No destructive merge, overwrite or automatic re-run is performed.
2. **Exact original source verification:** Requires choosing the **same original archive bytes** that created the old import, checked against its saved SHA-256 fingerprint. A different source, corrupt archive or wrong account/project lookup fails without producing a recovery copy.
3. **Owner-scoped, paginated read-only comparison:** Fetches the actual selected project's tasks and saved items from Supabase with both `owner_id` and `project_id` filters, stable pagination and bounded reads. Queries stop with visible errors rather than reporting incomplete data as a perfect match.
4. **Duplicate-safe comparison:** Uses multisets of actual task title/details/status/priority/due date and note/link title/body/target. It reports exact matches, source-only and current-only records, including duplicate titles, without inventing cross-import IDs. **Checklist content and file bytes are explicitly excluded from this field comparison**, even though the fork itself can preserve them.
5. **Verified distinct recovery archive:** The new JSON file keeps the source archive's supported v1/v2/v3 content, changes only the exported *project display name* to include **(Recovery copy)**, and adds a structurally validated `recovery_fork` marker with a new random UUID, creation timestamp and **informational** original source digest. The original source, currently edited imported project, project IDs and Storage keys remain unchanged.
6. **Portable private-file/checklist integrity:** Before offering the download, the fork is reparsed through the existing format validator. Its tasks, notes, links, and checklist states must match the validated original. If the original archive includes private file bytes, their sizes, MIME types and actual SHA-256 digests must match. Any mismatch, malformed marker or size overflow rejects the whole copy.
7. **Distinct idempotency identity with safe retries:** The saved fork's **actual bytes** differ from the original, producing a distinct SHA-256 key for the existing owner-only Phase 9 import session system. After download, the user selects the fork in **Restore an export**, which creates a **separate** private project. If interrupted, the **same fork file** resumes that new import; importing it again does not create duplicate project records.
8. **Truthful recovery UI:** The user gets the counts and comparison limits before download, a direct warning that the fork contains the original archive rather than later manual edits, and a second download confirmation. Import preview labels recovered forks. No fake conflict resolution, automatic text replacement or lost-work cleanup is claimed.
9. **Regression testing:** Node tests check the three archive formats, duplicate task titles, checklist preservation, embedded private file bytes, original SHA checks, UTF-8 BOM handling, forged marker rejection, safe project naming, duplicate-safe multiset comparisons, owner/project-paged reads and error handling.

## Important boundaries

- **This is side-by-side recovery, not an in-place merge.** The edited project stays intact; the new project contains the original archive's content. Users can inspect both projects and manually reconcile differences, with backup exports available. Original and fork source archives must be retained for reliable retry. Existing project quotas apply to any new restore.
- A `recovery_fork` marker is **informational**, not a signed provenance statement. It can be authored by anyone with a valid JSON file. It does not authenticate source ownership, grant access to private Storage, or bypass Supabase RLS.
- The comparison cannot reliably pair duplicate-titled records by original identity after importing. It compares only current task and note/link data, not checklist steps, private file bytes, revision histories, past activity or physical Storage. An exact match by fields alone does not prove data origin.
- File-inclusive v2/v3 backup limits remain **8 files / 12 MiB file bytes / 24 MiB JSON**. Legacy v1 remains **1 MiB**; adding a fork marker may push a full v1 archive over its limit, in which case the operation fails visibly. No partially verified archive is downloaded.
- Restoring the generated fork requires explicitly selecting it in the standard importer and confirming import. The fork-generation step **does not contact SQL write RPCs** or alter the original import session. 
- Import is still atomic per task/item batch, not globally atomic across PostgreSQL and Storage. The generated archive contains current export data only, without historical note revisions, original completion timestamps or activity logs.
- No new database migration is required for Phase 12. Phase 9–11 server schema and auth/RLS policies are prerequisites for the authenticated application workflow. This PR does not deploy those migrations to production.
- No GPU, paid external AI model, dummy project, automatic conflict rewrite, unauthorized file download, background job or billing change.

## Staging acceptance

1. Verify Phase 9–11 migrations are already approved and applied to **staging**, and tests `npm test` and `npm run build` pass.
2. Start a v3 import containing two tasks with duplicate titles, private notes, checklist steps and one private file. Interrupt it after one task batch, edit a task's actual text, then protect/inspect it in Recovery Center.
3. Choose **Prepare separate recovery copy**. A different JSON file must be rejected by exact SHA-256 before comparison. Choose the original to see the limited read-only field comparison and explicit original/edited differences.
4. Export a current **Backup files + checklists** of the modified project before downloading the new recovery copy.
5. Create the recovery copy; reopen it in **Restore an export**. Verify original partial project and manual edits remain unchanged. The newly restored project should have the **(Recovery copy)** title, original task/checklist contents and validated private bytes.
6. Retry the same generated fork file; it should reuse its own import session rather than create duplicate projects. A different generated fork file should create a separate branch, explicitly consuming another project slot.
7. Test v1/v2/v3 files, wrong account IDs, network read failure, more than 5,000 comparison rows, corrupted file manifests and canceled file picker; no misleading success indicators or partial downloaded backup.
8. Review accessibility, mobile layout and severe backend or auth failures. Never merge without reviewing the actual GitHub CI test outcomes.

## Deferred future work

A fully server-mediated, owner-confirmed record-by-record merge with immutable revisions, complete checklist/file comparison and precise conflict policies is separate and substantially more complex than this safe parallel restore.
