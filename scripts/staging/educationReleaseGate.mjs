/**
 * A release rehearsal cannot be inferred from passing source tests or
 * individual preflights. All hosted reports must come from one ordered run.
 * This module intentionally has no network side effects.
 */
import { validateEducationReadOnlyConfig, EDUCATION_READ_CASES } from "./educationHostedReadOnlyConfig.mjs";
import { validateEducationHostedCbtConfig, CBT_STAGING_CASES } from "./educationHostedCbtWriteConfig.mjs";
import { validateEducationHostedReviewConfig, REVIEW_STAGE_CASES } from "./educationHostedReviewConfig.mjs";
import { validateEducationTrustedFinalizerConfig, TRUSTED_FINALIZER_CASES } from "./educationTrustedFinalizerConfig.mjs";
import { validateEducationResultsReadConfig, RESULTS_CASES } from "./educationHostedResultsConfig.mjs";

const requiredModes = Object.freeze(["preflight", "rehearsal"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function refuse() { throw new Error("Education staging release gate blocked: incomplete approval, isolated fixture or proof"); }

export function validateEducationReleaseConfig(env) {
  if (!env || !requiredModes.includes(env.ETERNYX_EDU_RELEASE_MODE) ||
      env.ETERNYX_EDU_RELEASE_APPROVAL !== "I_APPROVE_EDUCATION_STAGING_RELEASE_CHECKS") refuse();
  const mode = env.ETERNYX_EDU_RELEASE_MODE;
  const read = validateEducationReadOnlyConfig(env);
  const cbt = validateEducationHostedCbtConfig(env);
  const results = validateEducationResultsReadConfig(env);
  if (cbt.mode !== (mode === "rehearsal" ? "write" : "preflight") ||
      read.projectRef !== cbt.projectRef || read.projectRef !== results.projectRef ||
      read.fixture.attemptId === results.fixture.finalA ||
      read.fixture.attemptId === results.fixture.runningA ||
      read.fixture.testId === cbt.fixture.testId) refuse();

  if (mode === "preflight") {
    if (env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY ||
        env.ETERNYX_EDU_REVIEW_MODE === "review" ||
        env.ETERNYX_EDU_FINALIZE_MODE === "finalize") refuse();
    return Object.freeze({mode, projectRef: read.projectRef});
  }

  if (env.ETERNYX_EDU_RELEASE_IRREVERSIBLE_ACK !==
      "I_ACKNOWLEDGE_STAGING_EXAM_REVIEW_AND_GRADE_ARE_IRREVERSIBLE") refuse();
  const review = validateEducationHostedReviewConfig(env);
  const finalizer = validateEducationTrustedFinalizerConfig(env);
  if (review.mode !== "review" || finalizer.mode !== "finalize" ||
      review.projectRef !== read.projectRef || finalizer.projectRef !== read.projectRef ||
      review.fixture.testId === cbt.fixture.testId ||
      review.fixture.attemptId === read.fixture.attemptId ||
      review.fixture.attemptId !== results.fixture.finalA ||
      finalizer.fixture.attemptId !== review.fixture.attemptId ||
      review.awarded > finalizer.expectedMarks.score ||
      results.marks.aScore !== finalizer.expectedMarks.score ||
      results.marks.aMax !== finalizer.expectedMarks.max ||
      !UUID.test(review.fixture.answerId)) refuse();
  return Object.freeze({mode, projectRef: read.projectRef});
}

export const EDUCATION_RELEASE_STAGES = Object.freeze({
  preflight: Object.freeze([
    Object.freeze({id:"owner-read", filename:"education-hosted-readonly.json", suite:"education-hosted-readonly", cases:EDUCATION_READ_CASES}),
    Object.freeze({id:"cbt-preflight", filename:"education-hosted-cbt-write.json", suite:"education-hosted-cbt-student-write", mode:"preflight", cases:CBT_STAGING_CASES.preflight}),
    Object.freeze({id:"verified-results", filename:"education-hosted-final-results.json", suite:"education-hosted-final-results", cases:RESULTS_CASES}),
  ]),
  rehearsal: Object.freeze([
    Object.freeze({id:"owner-read", filename:"education-hosted-readonly.json", suite:"education-hosted-readonly", cases:EDUCATION_READ_CASES}),
    Object.freeze({id:"cbt-write", filename:"education-hosted-cbt-write.json", suite:"education-hosted-cbt-student-write", mode:"write", cases:CBT_STAGING_CASES.write}),
    Object.freeze({id:"instructor-review", filename:"education-hosted-instructor-final-grade.json", suite:"education-hosted-instructor-final-grade", mode:"review", cases:REVIEW_STAGE_CASES.review}),
    Object.freeze({id:"trusted-finalize", filename:"education-trusted-finalization.json", suite:"education-hosted-trusted-finalization", mode:"finalize", cases:TRUSTED_FINALIZER_CASES.finalize}),
    Object.freeze({id:"verified-results", filename:"education-hosted-final-results.json", suite:"education-hosted-final-results", cases:RESULTS_CASES}),
  ]),
});

export function summarizeEducationReleaseEvidence(mode, entries, provenance) {
  const stages = EDUCATION_RELEASE_STAGES[mode];
  if (!stages || !Array.isArray(entries) || entries.length !== stages.length ||
      !provenance || !/^[0-9a-f]{40}$/.test(provenance.sha || "") ||
      !/^[1-9][0-9]*$/.test(String(provenance.runId || "")) ||
      !/^[1-9][0-9]*$/.test(String(provenance.attempt || ""))) refuse();
  const reviewed = stages.map((stage, i) => {
    const e = entries[i];
    if (!e || e.schema !== 1 || e.suite !== stage.suite ||
        e.environment !== "isolated-supabase-staging" ||
        e.configured !== true || e.production_tested !== false ||
        e.production_certified !== false || e.sessions_signed_out !== true ||
        (stage.mode ? e.mode !== stage.mode : Object.hasOwn(e, "mode")) ||
        e.expected_cases !== stage.cases.length ||
        e.attempted_cases !== stage.cases.length ||
        e.passed_cases !== stage.cases.length ||
        !Array.isArray(e.results) || e.results.length !== stage.cases.length ||
        e.results.some((r,j) => !r || r.case !== stage.cases[j] || r.result !== "passed")) refuse();
    if (stage.id === "owner-read" &&
        (e.writes_performed !== false || e.staged_sql_deployed_by_test !== false ||
         e.distinct_authenticated_students !== true)) refuse();
    if (stage.id.startsWith("cbt-") &&
        (e.education_writes_attempted !== (mode === "rehearsal") ||
         e.synthetic_attempt_confirmed !== (mode === "rehearsal") ||
         e.hosted_sql_deployed_by_test !== false ||
         e.distinct_authenticated_students !== true)) refuse();
    if (stage.id === "instructor-review" &&
        (e.instructor_review_write_attempted !== true ||
         e.instructor_review_write_confirmed !== true ||
         e.trusted_finalizer_invoked !== false ||
         e.three_distinct_authenticated_accounts !== true)) refuse();
    if (stage.id === "trusted-finalize" &&
        (e.privileged_rpc_attempted !== true ||
         e.privileged_rpc_confirmed !== true ||
         e.schema_deployed_by_test !== false ||
         e.three_distinct_authenticated_accounts !== true)) refuse();
    if (stage.id === "verified-results" &&
        (e.writes_performed !== false || e.staged_sql_deployed_by_test !== false ||
         e.distinct_authenticated_students !== true)) refuse();
    return Object.freeze({stage:stage.id, passed_cases:stage.cases.length, status:"passed"});
  });
  return Object.freeze({
    schema:1, suite:"education-hosted-release-readiness",
    environment:"isolated-supabase-staging", mode,
    source_sha:provenance.sha, github_run_id:String(provenance.runId),
    github_run_attempt:String(provenance.attempt),
    outcome:mode === "rehearsal" ? "staging_rehearsal_passed" : "read_only_preflight_passed",
    verified_stages:reviewed, production_tested:false,
    production_certified:false, production_release_approved:false,
  });
}
