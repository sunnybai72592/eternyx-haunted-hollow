# ETERNYX Education — Local Question Bank Studio

## Scope and availability

Route: \`/education/question-bank\`, accessible to signed-in ETERNYX users through the Education hub. This is an actual **local authoring workspace**; it is **not** an institutional instructor-authorized dashboard. Because historical \`user_roles\` may be self-selected, client-side teacher labels cannot authorize access to student records, protected answer keys or privileged database edits.

The studio supports single-answer multiple-choice (2–8 options), true/false (two fixed labels), and short-answer questions (manual grading only). Authors can add, edit, reorder and delete questions, choose objective correct answers, preview a learner-safe representation, and import/export JSON.

## Saving and privacy

- A **Save draft JSON** download preserves structurally valid but incomplete work. This is an explicit local file download, not autosave.
- A **validated bank JSON** download requires a title, complete question text, valid choices and exactly one correct objective option.
- Imports accept this format's version 1 and a file below 256 KB, with strict ID/field/length/type validation and removal of unknown properties.
- No background network requests, AI generation, user tracking, database writes or browser storage are introduced by the authoring studio.
- The downloaded instructor JSON contains correct-answer flags; keep it private. The learner preview omits those flags and has **no ability to deliver or grade an actual exam**.
- The studio does not create live exams, publish tests or sync between browsers. Export drafts before closing the tab.

## Server-side instructor work still required

The source files \`src/pages/TeacherDashboard.tsx\`, \`src/pages/CreateTest.tsx\`, and \`src/pages/RoleSelection.tsx\` exist but are **not mounted** as live app routes. They contain client-driven CRUD assumptions that are incompatible with the staged \`scripts/sql/staging-education-cbt-atomic-security.sql\` restrictions and unverified instructor authorization. Do not expose or enable those old screens without remediating them.

For an institutional rollout, separately provision *trusted educator grants* from administrator-controlled data (not the self-selectable \`user_roles\` or profile fields). Use strictly scoped server-side instructor RPCs for test metadata, question and answer-key CRUD; keep \`options.is_correct\` inaccessible to student REST clients. Implement password/enrollment admission, meaningful test publication states, question versioning once attempts have started, and manual grading for written answers. Test all privileges using two students and two educators in **staging** before deploying.

No Supabase schema or permissions are changed by the local authoring PR. The Education CBT release gate remains blocked until actual database/RLS and submission tests pass.
