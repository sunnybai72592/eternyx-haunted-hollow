# ETERNYX Education — genuine learner exam review and safe submission

**Status: implemented frontend source; NOT DEPLOYED or production-certified.** The existing atomic CBT environment feature flag, database functions, enrollment decisions and verified grading remain unchanged. No hosted Supabase instance was modified.

## Student examination workflow

A student taking a real, server-returned CBT assessment can now use the **Review questions** overview rather than moving only Previous / Next. Every rendered question button reflects the exact original question number and whether the student entered a meaningful answer, and can jump to that question without submitting. The overview can be shown or hidden for a more compact layout on a phone. An accessible label announces **answered / unanswered / flagged for review** without leaking the correct answer.

The answer count is derived solely from the **current authenticated exam's question IDs**, so a stale answer returned for a question in another exam cannot inflate progress or suggest readiness. Multiple choice/True-False require a selected option; written answers containing only whitespace remain unanswered. Neither the overview nor its pure helpers request the answer key or score.

**Flag for review** marks any recognized question—even an already answered one—to revisit. Students can jump to **Next unanswered** or **Next flagged**, with wraparound navigation. Flagging an answered question does not change its completion status. Counts and visual indicators are factual and based on the live in-memory exam state.

The final **Submit assessment** dialog now includes the actual number of unanswered and flagged questions plus clickable **Revisit before submitting** links. It still allows a deliberate submission with unanswered/flagged questions; these review hints are not server-backed submission requirements, disciplinary flags, scores or fabricated marking. The real server continues to decide status, deadlines, attempt ownership, and grading.

## Save and account safety

1. In atomic CBT mode, a **Save answers now** action lets a student explicitly flush queued real answer writes before the debounce completes; the already existing save failure/retry mechanism remains available.
2. The browser's standard unload safeguard warns about **actual still-queued/in-flight answers** when closing or refreshing the page. It does not claim every navigation or browser crash can be prevented. No private responses are persisted on localStorage, sessionStorage or background services.
3. Both legacy and atomic modes now clear locally held answers and all review flags when the authenticated user or active attempt changes. The reset uses a pre-paint React effect to reduce previous-account answer exposure.
4. Official **submitted and auto_submitted** attempts redirect to their existing results instead of remaining editable. An unknown attempt status fails closed rather than enabling more writes. Exam editing is permitted only for the real server-returned `in_progress` status.
5. The deadline timer initiates expiry submission only for in-progress attempts, and still uses the existing server-enforced submission RPC. Flagged questions do not delay or extend deadlines.
6. The new question navigator does not silently autosave, finalize, or modify learner scores. Existing answer autosave continues to call the genuine configured backend when the staged atomic flag is enabled.

## Privacy and honest limitations

**Flagged questions are local-only UI hints.** They disappear on account/attempt changes, tab close or refresh. They are deliberately **not** stored in the examination database or considered an official exam result. The UI tells students this explicitly.

A browser tab close warning is best-effort, not a delivery guarantee. If answer saves have not reached the real server, data may be lost on device exit. Server-side checks remain authoritative. This PR does not implement invigilation, proctoring, certificates, paid tools, models, production database permissions or automatic public deployment.

**Production rollout** still requires the existing separate Education feature-flag security review, real JWT and PostgreSQL acceptance, permission/RLS validation and operational approval. The legacy CBT route remains a provisional compatibility pathway until reviewed atomic services are enabled.

## Validation

At least **35 new Node regression tests** cover actual answer-state counting, unique-question and wrong-test isolation, flag toggles, next-question wraparound, completion integrity, safe pre-submit review, current attempt status enforcement, prevention of duplicate completed submissions, account reset, explicit save and real server boundaries. The standard repository utility tests, build, security checks and desktop/mobile browser journeys are also required before merge.
