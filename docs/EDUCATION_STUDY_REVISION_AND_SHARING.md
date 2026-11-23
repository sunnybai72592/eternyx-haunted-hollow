# Education Study Paths — revision planning, progress insights and safe course sharing

This phase extends the existing real local Study Paths workspace at \`/education/study-paths\`. It continues to accept **original v1 study-path exports and v1 saved learning sessions**. New **version 2 study-session** downloads include a manual per-lesson revision schedule alongside lesson content, private responses, notes and manual completion decisions. There are no fictional preloaded lessons, automated exam scores, graded courses or certificates.

## What learners can do

- Complete an actual user-authored lesson with an activity response and reflection. Only manually completed lessons are eligible for the **Manual revision planner**.
- Select a revision interval of **1, 3, 7, 14, or 30 days**, select self-reported confidence (*needs practice*, *developing*, or *comfortable*), and explicitly click **Reviewed today — schedule next review**. The next UTC date is calculated from the chosen interval; this is a manual study plan, **not a timed reminder**, scheduled push notification or AI mastery estimate.
- See **Due now**, **Overdue**, **Due in 7 days**, **Needs schedule**, **Lessons reviewed**, and **Estimated minutes left**, all computed directly from the learner's validated local records. The estimate uses authored lesson durations, not a claim that time was actually spent.
- Navigate to the next due or unplanned review, filter the outline by due or unscheduled lessons, or adjust the interval. Editing out required activity/reflection text or reopening a lesson **clears the old review history and due date** while preserving the chosen interval.
- Save a **private resume JSON v2** to keep the course, completed lessons, responses, private notes, selected intervals, confidence and review dates. Both existing v1 formats still import and initialize an empty review plan. Importing a malformed file preserves the active session.
- Export a **private revision-calendar CSV** with due dates, counts and confidence but no learner notes or activity answers. CSV fields use the existing formula-injection defense.

## Better sharing without leaking student data

A loaded course now offers **Share course only (.json)** and **Share course outline (.txt)**. Both are generated **only from the validated course definition**; they cannot include a learner's responses, private notes, review dates, completion decisions or confidence. The JSON remains compatible with the existing Study Paths import. The plain-text outline contains lesson titles, objectives, recommended minutes, activity prompts and reflection prompts (not the full reading). The authoring editor also exposes the course-outline export without needing to create a learner session.

**Never share a private resume JSON as if it were a course-only file.** Learners must explicitly download and distribute the dedicated course-only JSON or outline. Respect authors' rights to the included reading material and prompts.

## Data and security boundary

Everything remains inside the current browser tab, with explicit downloads and imports only. No Supabase calls, server writes, localStorage, analytics-derived grades, automatic persistence or scheduled/background work. Course progress and confidence are self-reported. UTC revision status is computed as of the date when the tab loaded; refresh and import a saved session to update it after a day changes.

The revision parser rejects unknown properties, forged scores/certificates, invalid UTC dates (including leap-day mistakes), modified derived due dates, unauthorized completed flags, foreign lesson IDs, malformed counts or mismatched record length. Review dates must be consistent with the selected interval and a genuinely completed lesson. Unit tests cover v1/v2 migration, due/overdue calculations, recurrence, reopening cleanup, sharing isolation and formula-safe calendar export. A dedicated Chrome suite additionally exercises the real user journey without any hosted credentials.

This feature does **not** establish authenticated online courses, instructor certification, verified student records or launch authorization for protected CBT. Independent Supabase staging validation is still required for that backend.
