# AI Arsenal Phase 11 — Research Notebook Local Backup & Coverage

## Scope and delivery

The existing Research Studio is an explicitly **manual, source-linked, unverified** evidence notebook. Phase 11 adds useful continuity and evidence-coverage checks without pretending to browse, verify sources or independently cite them.

1. **Complete versioned notebook JSON backup**: `format: "eternyx.research-notebook"`, `version: 1`, user-entered sources, notes, question and AI request mode. No fabricated citations or synthesized content.
2. **Deterministic round-trip**: a valid local export can be imported and exported again without changing the user's linked IDs, fields or note order.
3. **Strict fail-closed import validation**: exactly whitelisted root fields, optional source/evidence attributes and supported enum values. Unknown versions, extra execution/permission fields, invalid IDs, duplicate URLs/IDs, HTTP URLs, credential-bearing links, unlinked evidence, invalid stances or oversized text are rejected using existing local validators.
4. **Bounded backup reads**: only explicit .json selections, with file-size and decoded JSON limits of 512 KiB. Invalid files fail before any notebook state changes; no partial restore.
5. **Human-reviewed replacement gate**: validated file is previewed with source/note counts before a separate destructive replacement confirmation. Cancel retains existing work. This is **replace**, not automatic merge.
6. **Stale async guard**: in-progress file reads are invalidated by notebook edits, clearing and newer file selections. Previous AI results and drafts are invalidated upon restore, so past responses are never represented as conclusions from the new notebook.
7. **Local exports**: versioned full JSON backup, full plain-text research brief, and source-coverage TXT report. Only user clicks create browser-local downloads; no server upload or account credit.
8. **Source evidence coverage**: actual source-linked counts, stance breakdown per source, number with and without notes. These counts are not source-quality scores or external evidence.
9. **Potential tag disagreement review**: flags *identically worded* user claims (case/whitespace normalized) labeled both "supports" and "challenges"; reports how many distinct source IDs have each tag. Does not infer semantic contradiction or judge truth.
10. **Pure regression tests**: round-trip, optional properties, tampering, malformed JSON, version mismatches, duplicate/orphan references, unsupported URLs, source limits, file-read failures, counts, disagreements, and UI import state boundaries.

## Privacy & security

- Imported files are processed **locally**; no fetch calls, external research provider, database, localStorage or automatic cloud persistence. Source URLs are checked as HTTPS URLs only; they are **not visited**.
- The full JSON export is **plaintext**, containing user-entered URLs, excerpts, claims and notes. Protect it like any other sensitive research document. Do not share externally without authorization.
- JSON imports cannot grant permissions or trigger agent/workflow actions. Unexpected fields are rejected.
- Download is user initiated; the notebook itself still lives in memory until refresh/close. **There is no automatic recovery or cloud sync.**
- The existing optional AI Chat note synthesis is unchanged. It still requires an explicit click, authenticated provider access, `ai.chat` credits and may save chat history.
- Coverage is only a review aid: a source with notes is not independently verified, and two opposing labels on the same claim do not prove disagreement.
- No AI Video changes, remote database migrations, scanned-PDF OCR, semantic embeddings or search-provider enablement.

## Required release verification

- [ ] Run `tests/ai-research-backup-phase11.test.mjs` plus existing Research Studio regression suite.
- [ ] Export a notebook with 25 references, 100 notes, optional fields, multiple stances; import it and compare the resulting complete exported JSON.
- [ ] Reject malformed JSON, unsupported versions, unknown keys/permissions, duplicate/credential-bearing source URLs, invalid tag values and orphan evidence without changing current notes.
- [ ] Import a backup that exceeds 512 KiB; confirm no partial state or upload.
- [ ] Choose backup A, then B or edit/clear the notebook before A finishes reading; confirm stale A can never replace newer state.
- [ ] Preview an import, cancel it, and confirm existing state is retained. Confirm explicit destructive replacement is always required.
- [ ] Confirm all exports are local; JSON is full plaintext and should be user-protected. Inspect copy/download keyboard and mobile behavior.
- [ ] Confirm the note-count coverage reports align with actual source IDs; opposing-tag flags only match exact normalized claims.
- [ ] Confirm AI Chat still runs only on a separate click, with provider/credit/history disclosure.
- [ ] Verify on staging and after deployment. CI alone cannot prove real authenticated AI provider availability.

No new remote services or subscription enforcement are introduced.
