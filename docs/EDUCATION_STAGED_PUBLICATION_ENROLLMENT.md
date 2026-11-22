# Education — Controlled publication and enrollment

STATUS: STAGING ONLY. NOT DEPLOYED. NO PRODUCTION AUTHORIZATION CLAIM.

## Scope

This PR creates a staged, admin-reviewed process for publishing exam drafts and enrolling students. Approved instructors can request review of their own unpublished, inactive draft, but **cannot publish an exam themselves**. A trusted administrator can approve or reject a pending request after server-side readiness checks. Only the administrator can enroll students in an approved published exam or revoke an enrollment before an attempt has started.

The publication request state and per-test enrollment are stored in protected RLS-enabled tables. Direct anonymous/authenticated table grants are revoked. All public RPC endpoints independently check either an administrator assignment using protected is_admin() authority, or an approved instructor grant and matching teacher identity. Only safe metadata is returned by admin request queues and the student catalog. No answer keys are returned to learners.

The internal readiness check covers exam ownership and inactive/unpublished status, exam duration and title, no previous attempts, at least one valid question, MCQ and True/False answer-key completeness, short-answer separation, and absence of access passwords. The staged atomic CBT start RPC now requires an approved publication request AND a matching student enrollment.

## Files

- scripts/sql/staging-education-publication-enrollment.sql — staged DB tables and owner-checked RPCs
- scripts/sql/staging-education-cbt-atomic-security.sql — amended enrolled-only exam start authorization
- src/lib/educationPublicationRpc.ts — explicitly enabled publication, enrollment and student catalog client
- src/pages/EducationPublicationAdmin.tsx — staged administrative review and enrollment UI
- src/pages/EducationInstructorStudio.tsx — verified instructor publication request action
- src/pages/Education.tsx — staged account-specific catalog
- src/App.tsx and src/pages/AdminOverview.tsx — admin page route and feature-flagged link

## Coordinated rollout flags

All three values must be true at build time in the tested staging environment:
- VITE_CBT_ATOMIC_RPC=true
- VITE_EDUCATION_INSTRUCTOR_RPC=true
- VITE_EDUCATION_PUBLICATION_RPC=true

By default the publication feature is disabled and old production behavior remains unchanged.

## Required security and operational tests before any deployment

1. Inspect the actual staging schema, function owners, effective grants, RLS policies and question-bank data. Prior production inspection timed out; the repository is not proof of deployed permissions.
2. In an isolated staging project, apply and validate the reviewed atomic CBT, verified instructor, draft recovery and publication/enrollment scripts as a coordinated release. The atomic start RPC depends on the enrollment table introduced here.
3. Use two students, two instructors (including one unapproved) and a trusted admin. Cross-account drafts and direct publication calls must be denied. Instructors must never self-approve.
4. Prove student access to correctness flags (options.is_correct) and grading columns is denied through direct REST, SQL views and exposed functions. Confirm unpublished and unenrolled question reads are rejected.
5. Verify admin-only approvals, one-time status transitions, race handling, rejection, and a publication denial for incomplete questions, multiple correct options, invalid points and password-protected exams.
6. Verify enrollment requires a known Auth user, a reviewed published exam, and that duplicate calls are idempotent. Enrollment revocation must fail after an attempt exists.
7. Verify Student A sees only Student A's enrolled tests and cannot start another student's enrolled exam even with its UUID. Confirm student question reading and timed submission still function under the new RLS policy.
8. Coordinate changes with legacy clients: old browser direct-write flows will fail after strict grants. Verify teacher authoring, student test-taking and trusted grading in staging.
9. Require PostgreSQL integration tests, audited migrations, database backup, rollback, security advisors, browser tests and production build before public CBT activation.

Non-goals: public self-enrollment, invitation emails, password-based admission, course purchasing, automatic certificates, retakes, exam invigilation, written-answer grading, or payment integrations.

NO live Supabase operations, permissions, functions or data have been changed by this PR.
