# Education Question Bank Studio — Real quality review and learner worksheets

**Status: implemented frontend source; NOT DEPLOYED or production-certified.** This PR does not enable, deploy, or change Supabase databases/functions, instructor access, publication permissions, assessments, grading, certificates, billing or external services.

## Overview

The existing **Local Question Bank Studio** can create questions, specify answer keys, validate draft structure, export private instructor JSON and optionally save a new unpublished draft through already-gated authorized instructor services. This change adds a real quality-review workflow and carefully separated **learner practice worksheet exports**. It does not issue an assessment, auto-grade any answer or connect new private endpoints.

## Genuine authoring enhancements

1. The **Question quality review** section counts the actual authored questions in three **mutually exclusive** states: **Needs fixing** (strict per-question validation failed), **Review wording** (editorial warning, otherwise valid) and **Ready** (no question-level issue). These are authoring states, **not scores or predicted learner performance**.
2. Report exact maximum points and question-type distribution (multiple-choice, true/false and written) from the current local draft; do not claim any learner has earned those points.
3. Reuse the existing strict question-bank validator for each question's correctness/structure requirements, including unfinished stems, invalid point values, missing MCQ choices, missing or multiple marked choices and true/false canonical options.
4. Flag **identical MCQ option wording**, ignoring casing and excess whitespace. This makes ambiguous multiple-choice answer sets visible to the instructor even when exactly one option is marked correct.
5. Reuse the existing repeated-prompt checks for other identical question wording. These are **advisory editorial warnings**, not enforcement of academic misconduct or grading decisions.
6. Warn in the actual question editor card with all of the selected question's validation issues and editorial warnings rather than only showing the first twelve global validation messages.
7. **Next question to fix** and **Next wording to review** jump directly to the real question ID with wraparound, resetting local question filters so the selected item is visible. Both controls disable when no qualifying item exists.
8. Add a **Question quality** filter in the question list, composed with existing question-text search and question type. Existing authoring, undo/redo, duplication and answer-key editing stay unchanged.
9. Provide an **instructor-only CSV quality checklist** of question numbers, types, maximum possible points, status and warning/validation descriptions. No question bodies, answer text or answer-key booleans are placed in the audit CSV. Uses established formula-safe CSV quoting and UTF-8 BOM.

## Key-free learner practice worksheets

Two downloadable formats are added, **JSON** and **plain TXT**. The local worksheet exporter:
- Runs only after the **whole bank passes strict validation** (valid title, question wording, correct-answer selections and all existing structural rules). An unfinished bank cannot generate a convincing practice worksheet.
- Builds a fresh, **strict allowlist projection** containing the authored title, description, suggested duration, question order, question wording, possible points and the **displayed choice texts only**.
- Explicitly **omits question IDs, option IDs, `correct` booleans, instructor-only metadata and arbitrary imported source properties**; the JSON has no answer-key fields or grading state.
- Displays each question and options A–H in TXT, with a blank line for written responses; it is never labeled as an active timed assessment, auto-graded exam or course certificate.
- Is bounded to a **1 MB local export** and fails closed if a validated bank would generate an oversized worksheet.
- Requires an **instructor's review of the actual question text before sharing**. This is important: a question prompt can itself contain a hint, example solution or even an answer. Removing explicit answer-key fields **cannot sanitize clues intentionally written into question wording**.

The private original instructor JSON export still contains actual answer-key flags and **must not be sent to students**. The worksheet export is a distinct action, filename, schema and code path. No silent uploads, storage, automatic enrollment, publishing, AI marking or new paid API is introduced.

## Security, limits, validation

Authoring remains an in-memory editor. The existing 30-step undo/redo snapshots, account-change clearing of **all private answer keys**, stale asynchronous draft-response guards, server instructor approval and gated publication-review workflows remain unchanged. Only already authorized instructors may use the existing private draft services; a local audit never grants an instructor role or publishes an exam.

**53 new Node regression tests** cover strict issue identification, advisory duplicate content, safe wraparound navigation, real progress counts, immutable audit projections, exact removal of hidden answer-key fields and private IDs, malicious extra source metadata, Unicode, explicit worksheet notices, CSV handling and real instructor UI wiring. Normal repository tests, build, desktop/mobile browser journeys and secret detection are also required before merge.

**Production rollout remains separate** and requires review of the existing backend security, permission boundaries, grading service and authorized release configuration. No staging or production database changes occur in this PR.
