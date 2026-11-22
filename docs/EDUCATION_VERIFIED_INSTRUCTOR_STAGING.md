# ETERNYX Education — verified instructor draft foundation

**Status: source implemented; separate staging SQL prepared; NOT DEPLOYED.**

## Goal

The authenticated local Question Bank Studio remains available without any server writes. In a separately validated staging environment, an administrator-approved instructor can explicitly save a **private, inactive, unpublished** assessment draft to Supabase.

This does not allow live exam publication, enrolling students, opening password access, rewriting attempts, editing an existing private draft, or auto-grading essays.

## Trusted instructor approval

The legacy RoleSelection.tsx writes a requested teacher role to user_roles. A self-selected label is not authorization to access student records or correctness flags. Existing legacy teacher management pages are still not routed.

The separate staging table education_instructor_grants permits only trusted admin approval through admin_approve_education_instructor. It checks public.is_admin(), which reads protected admin_users assignments rather than profile metadata. Administrators may also revoke access through admin_revoke_education_instructor.

Every instructor read/write RPC looks up the current auth.uid() in the trusted grants, checks that the teachers record belongs to that authenticated user, and never accepts a client-supplied teacher or user ID. No browser role has direct access to the grants. The script also removes direct browser authoring rights on tests, questions and options, including explicit column-level permissions.

## Private-draft backend

Staging script: scripts/sql/staging-education-verified-instructors.sql

- admin_approve_education_instructor(p_user_id, p_display_name): verified Auth user plus admin-only approval
- admin_revoke_education_instructor(p_user_id): admin-only revocation
- education_instructor_access(): returns only an approval boolean for the current user
- education_instructor_create_draft(p_bank): validates bounded version-1 JSON, duration, question type, points, text, options, uniqueness and a single correct objective answer; inserts a complete test with its questions/options within one PostgreSQL transaction
- education_instructor_list_drafts(): at most 50 metadata-only private drafts owned by the current approved instructor; never includes correctness flags

All created tests are is_active=false and is_published=false. Invalid content or database failures roll back the entire import. This PR does NOT implement live publishing or trusted editing of existing drafts.

## Client rollout flags

Two explicit build-time flags are required simultaneously:

- VITE_CBT_ATOMIC_RPC=true: only after secure CBT submission and answer-key isolation work in staging
- VITE_EDUCATION_INSTRUCTOR_RPC=true: only after approved instructor RPCs work in that same staging project

With either flag off, no remote instructor controls appear; users still edit and export their local JSON normally. Authentication and screen visibility are not authorization; server RPCs verify approved grants.

**Do not activate either flag in production yet.** Source files do not deploy or verify database schema.

## Staging security and release checklist

1. Inspect the actual staging schema, role grants, RLS, function owners and teacher assignments. Prior live metadata inspection attempts timed out, so deployed policies are not confirmed.
2. Apply reviewed atomic CBT and verified instructor staging scripts as one coordinated security rollout. Old direct-write browser clients must be retired before restricted privileges activate.
3. Test two students, an unapproved self-selected teacher and two approved instructors. Unapproved users cannot create/list educator drafts; approved instructors cannot access one another's records.
4. Using direct PostgREST, verify that option correctness flags and grading fields are inaccessible/writable by neither student account. Audit views and alternate functions too.
5. Attempt malformed input, too many questions/options, duplicate IDs, missing answer keys and oversize values. Verify the full transaction rolls back on every failure.
6. Check that new drafts are unpublished/inactive, never enter the student assessment catalog and become inaccessible for new writes immediately after grant revocation.
7. Keep legacy TeacherDashboard.tsx and CreateTest.tsx disconnected until their direct-write logic is replaced.
8. Repeated-click or lost-response retries can currently create duplicate private drafts; add a DB-backed idempotency key in a future production milestone.
9. Run real PostgreSQL integration checks with signed JWT identities, then Supabase security advisors. Node tests and TypeScript parsing do not certify RLS.
10. Prepare a reviewable migration and rollback plan before production. Publication, enrollments, manual grading and password-protected admission are separate work.

There is no payment provider, GPU, AI model call, email or background job.

**No production database mutations or Supabase deployment are included in this PR.**
