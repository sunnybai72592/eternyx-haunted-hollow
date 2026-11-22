# ETERNYX Education — private instructor draft recovery & revision copies

**Status: SOURCE-ONLY, STAGING SQL, NOT DEPLOYED. Public CBT security remains BLOCKED.**

## What this milestone adds

The Education Question Bank Studio can load a previous **inactive, unpublished** server draft for the verified, current instructor and reconstruct it as a version-1 local question bank. The instructor can change questions, correct options, marks, duration and title, then explicitly save a **new unpublished draft copy**. The original server draft is never overwritten or deleted. This is not a publishing, approval, or student admission mechanism.

The new staging script, scripts/sql/staging-education-instructor-draft-recovery.sql, declares education_instructor_load_draft(p_test_id uuid), a schema-qualified, authenticated-only SECURITY DEFINER function with an empty search path. Every request checks auth.uid() against protected education_instructor_grants and its matching teachers record, then requires the requested test teacher_id to match, is_active=false, is_published=false, and **no existing attempts**.

The response contains the private correct-answer flags. **This RPC is instructor-only.** Student listings and learner previews must not call it. Direct REST access to options.is_correct must still be denied under the separately staged CBT grants.

Restored question ordering follows database order_index. True/False options are sorted as True then False. Existing MCQ options have no stored order field, so they are returned in stable UUID order; an instructor should review this before saving a revision. A response over 256 KB or outside 1–100 questions is rejected. The browser also runs the same versioned question-bank parser before replacing local state.

## Staged SQL repair

The existing scripts/sql/staging-education-verified-instructors.sql contained **two invalid regex literals** for integer duration and points. This PR fixes their closing delimiters, and preserves exactly one BEGIN/COMMIT and five original instructor functions. That file was never deployed by this workflow. The new load RPC is a separate staging-only script, never an automatic migration.

## Important constraints

- Feature remains disabled unless **both** VITE_CBT_ATOMIC_RPC=true and VITE_EDUCATION_INSTRUCTOR_RPC=true are set at build time, and matching trusted backend and grants are tested in staging.
- An unapproved account never sees the load control. The server independently authorizes every RPC, regardless of React visibility.
- Loading prompts before replacing the local editor; **export local JSON first** to preserve unsaved edits.
- If the authenticated account changes, previously loaded server answer keys are cleared from component state.
- Loading is read-only. The existing education_instructor_create_draft saves a new copy; repeated submissions may create duplicates. No editing-in-place, automatic synchronization, bulk import, deletion, enrollment, answer-sheet grading or publication.
- The load RPC intentionally returns correctness flags only to a verified instructor. Once those keys reach a browser, developer tools can inspect them; this is an approved authoring flow, not student-facing secrecy.

## Required release gate

1. Validate SQL syntax and schema compatibility against an **isolated staging database**. Existing metadata inspection of production previously timed out; source checks are not database verification.
2. Validate instructor revocation, two approved instructors, two students, and a self-selected unapproved teacher using direct JWT-authenticated REST and RPC requests. Cross-instructor loads, student loads, and attempts to load published or started exams must fail.
3. Test that answer keys cannot be retrieved by student query to options.is_correct, other RPCs, or views. Confirm that teacher authoring still works after planned direct-grant restrictions.
4. Test malformed/oversize drafts, null correctness flags, JSON encoding, Unicode, True/False option ordering, and any legacy question bank data.
5. Run database security advisors and obtain a coordinated migration/rollback plan before enabling flags. Production must remain on the current path until staged security tests pass.

**No live Supabase changes, migration deployment, paid API calls or public exam publication occur in this PR.**
