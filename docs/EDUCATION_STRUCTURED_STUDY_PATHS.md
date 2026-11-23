# ETERNYX Education — Study Paths (local structured lessons)

ETERNYX now offers a dedicated **Study Paths** workspace at \`/education/study-paths\`, reachable from the Education Hub and the existing instructor Question Bank Studio. This complements the independently built practice worksheet experience (\`/education/practice\`) without modifying authenticated CBT or server grading.

## Real authoring and learner journey

An instructor or learner selects **Create lesson pack** and adds up to 30 lessons. Each lesson is intentionally user-authored: title, measurable learning objective, reading material, practical activity prompt, reflection prompt, and suggested study minutes. Lessons can be reordered or removed, with explicit confirmation for deletion. A path cannot be exported or opened until all required fields pass validation, including unique titles and minimum reading lengths. **No example content is silently created.**

Selecting **Export validated path (.json)** downloads a portable \`eternyx-local-study-path\` v1 file. The recipient visits **Study lessons**, imports that file, and sees the real reading, activities and reflection prompts. They enter activity observations, reflections and optional private notes; flag lessons, filter completed/uncompleted/flagged, navigate freely and jump to the next incomplete lesson. **Completion is a manual action** allowed only after a meaningful activity and reflection response. Removing either response automatically reopens a completed lesson. Started, completed, remaining, flagged and percentage counts are derived from the actual local records and are never exam grades.

**Save study resume (.json)** exports the entire validated path plus only the learner's records. Importing this versioned \`eternyx-local-study-session\` file restores all notes and completion decisions. **Export private notes (.csv)** downloads the current lesson/work records, with spreadsheet-formula-safe quoting for untrusted prompts, titles and responses.

## Privacy and data integrity

Everything runs locally in the tab. No account or Supabase project is used; no network calls, hidden grading service, course enrollment, database mutations, localStorage or automatic persistence. Refreshing or closing the tab loses unsaved work; the interface tells users to export the resume JSON first. Replacing a loaded study session and clearing an authoring draft both require explicit confirmation.

The file parser accepts only the exact versioned study path/session schemas with strict key allowlists at *every* level, sequential lesson numbers, realistic text and duration limits, a maximum of 30 lessons, no duplicate lesson titles, precisely one record per lesson, and bounded free-text responses. Unknown privileged fields (e.g. \`answer_key\`, \`correct\`, \`score\`, \`certificate\`) are rejected. Notes and reading are rendered as text, never executable HTML. CSV export uses Education's existing spreadsheet-injection defense.

## Verification and release

The PR ships executable unit tests for both import formats, real authoring/export, manual completion, notes and flags, resume round-trips, adversarial extra fields, unknown grade keys, malformed session rows, oversized content, CSV injection, public route wiring and TSX parsing. The dedicated offline Education browser workflow additionally executes 14 real Chrome checks (7 each on desktop and mobile) covering lesson authoring, export, completion, resume restoration, formula-safe CSV and hostile key-bearing import rejection. It never reaches Supabase. The normal application build and desktop/mobile smoke CI are still required. This user-authored content feature does not claim that protected CBT backend has passed live staging or that ETERNYX provides certified courses. Production CBT stays behind the existing independent staging acceptance gate.
