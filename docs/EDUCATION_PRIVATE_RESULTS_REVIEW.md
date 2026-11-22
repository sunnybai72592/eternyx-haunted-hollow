# Education — private student results review and evidence-safe exports

**Status: implemented frontend source; NOT DEPLOYED or production-certified.** This milestone creates no database tables, migrations, admin roles, billing calls or external analysis services. Existing backend result verification remains opt-in behind its independently approved configuration and staging checks.

## Genuine learner workflows

The existing authenticated **Assessment results** page loads the student's attempt via an owner-filtered `user_attempts` query, and only then loads the associated submitted answers. New results-review features work exclusively on these rows, after the existing RLS and account checks. None of the changes query instructor answer keys, publish grades or award XP.

### Search and review

1. Search **question text or the learner's own submitted answer** within answers already returned to the browser. Search is local, case-insensitive and bounded to 120 characters; it does not send answer text to a new API or search service.
2. Filter **all returned answers**, **grading pending**, **reviewed or marked**, **marked correct**, or **marked incorrect**. Grading filters are offered only when the current display mode permits marks. Written answers reviewed for numeric points are **not** mislabeled correct or incorrect.
3. View truthful counts of **server-returned answers** and records awaiting review. The UI explicitly states that these counts are not all questions in the assessment, because an unanswered question may have no returned answer record.
4. Clear filters to restore the complete returned list. An empty match gives an explicit explanation rather than pretending the student submitted nothing.
5. Grade provenance is made explicit on the result page: final-ledger verified, official review pending, verification incomplete, or **legacy recorded grade—not independently verified**. A score alone is never a verified pass/fail threshold.
6. On account change, private search terms and errors are cleared before the new account paints.

### Private exports

The original, user-triggered **Download report (.txt)** now adds an explicit **Grade provenance** line. Existing report contents and the prohibition on fabricated passing thresholds/certificates remain unchanged.

A second **Download my answers (.csv)** action exports only the student's currently authenticated, submitted attempt and its server-returned answers. It is manually triggered; no upload or stored remote copy is created. The CSV includes the assessment name, owned attempt ID, provenance, returned question, submitted answer, readable review status and **marks only when a matching, finalized grade receipt is confirmed**. Legacy and pending-result exports never include numeric marks, correct/incorrect flags, or a false official certification.

Because question titles and learner-written responses are uncontrolled text, CSV cells are protected against spreadsheet formula injection (including `=`, `+`, `-`, `@` and whitespace-prefixed formulas), with correct quote escaping, UTF-8 BOM and CRLF rows. They remain local sensitive exports: the UI reminds students to keep files on trusted devices. Exports are disabled until owned, completed attempt records and real answer queries have loaded. Invalid answer data is rejected instead of generating a plausible but partial transcript.

Neither file is an **official certificate**. Official grading and exam status remain server-side. No stage-gated backend security is activated by this PR.

## Verification and limits

**48 new Node regression tests** exercise real helper transformations, pending/verified grade separation, written review labels, case-insensitive filtering, zero/returned counts, CSV formula escaping (including multiline and quote edge cases), ownership boundaries, stale search resets, no hidden answer-key retrieval, exported mark redaction, legacy provenance and the actual UI wiring. Standard repository tests, application build, desktop/mobile browser journeys and secret detection must also pass.

This frontend enhancement cannot prove hosted production readiness, alter existing RLS, guarantee availability of unpublished historical question text or supply scores before the trusted ledger finalizes them. Those remain separate approval and acceptance processes, with explicit production rollout authorization required.
