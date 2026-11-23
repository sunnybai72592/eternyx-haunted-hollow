# ETERNYX Education — Learner Practice Workspace

The Education Hub now offers a real **local, ungraded practice workspace** at \`/education/practice\`, usable without signing in. This completes an existing workflow: an instructor already exports answer-key-free learner worksheets from Question Bank Studio; a learner can now actually open and answer those files interactively rather than only reading a static TXT or JSON file.

## Learning workflow

1. In Question Bank Studio, finish a real MCQ, true/false and/or short-answer question bank, validate it, review wording and click **Learner worksheet JSON**.
2. Share **only** that key-free worksheet with learners; do not share the original private instructor bank JSON with correct-answer flags.
3. At \`/education/practice\`, import the exported learner worksheet. The interface accepts up to 100 questions and shows one question at a time with a controlled radio choice or short written response (up to 5,000 characters).
4. Review your answered/unanswered counts, filter unanswered or flagged questions, jump to the next unanswered question, and revise work without penalties or invented marking.
5. **Save resume (.json)** to download a single self-contained file containing only the key-free worksheet, your entered responses, and question flags. Reimport it later to resume. You can also export **my answers (.csv)** with spreadsheet formula injection neutralized.
6. To replace or clear an active session, explicitly confirm; the UI advises exporting your answers first.

The entire session stays **in browser-tab memory** until the learner explicitly downloads a file. There is **no upload, localStorage, IndexedDB, background autosave, account lookup, remote scoring, hidden answer key, certificate, or official grade**. Refreshing or closing the tab loses unsaved practice, which is disclosed prominently.

## Strict import boundary

Only the precise schema \`eternyx-learner-practice-worksheet\` version 1 exported from the existing instructor studio, or the new \`eternyx-learner-practice-session\` version 1, is allowed. The parser rejects unexpected fields at every level, including \`correct\`, \`answer_key\`, instructor option IDs and exam score metadata. It also enforces sequential question numbers, valid types, one response per question, allowed answer kinds, bounded text and file sizes, 1–100 questions, choices per type, and sorted unique review flags. Malformed files leave the currently loaded session intact.

CSV output uses the shared Education formula-safe quoting helper for untrusted worksheet titles, prompts, option labels and written responses. A downloaded CSV is **private** and should not be shared publicly.

## Scope and verification

This is a useful standalone Education learning feature—not an alternate route to protected CBT, a published exam or a server grading feature. It does not read or modify Supabase. The existing authenticated, enrollment-aware assessment and final-grade pipeline remains separate and unchanged.

Node regression tests exercise real existing instructor worksheet exports, interactive response updates, resume JSON roundtrips, tamper rejection, CSV formula safety, route wiring and TSX transpilation. The repository's existing build and desktop/mobile smoke CI remain mandatory before merging.
