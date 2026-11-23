/**
 * ETERNYX Education hosted student write rehearsal configuration.
 * Validates only; never touches Supabase or creates/modifies test fixtures.
 */
import { validateStagingRlsReadOnlyConfig } from "./stagingRlsConfig.mjs";

export const EDUCATION_CBT_WRITE_APPROVAL = "I_APPROVE_FRESH_EDUCATION_STAGING_CBT_ATTEMPT";
export const EDUCATION_CBT_IRREVERSIBLE_ACK = "I_ACKNOWLEDGE_STAGING_ATTEMPT_CANNOT_BE_RETAKEN";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredIds = Object.freeze({
  testId: "ETERNYX_EDU_WRITE_TEST_ID",
  mcqId: "ETERNYX_EDU_WRITE_MCQ_ID",
  mcqOptionId: "ETERNYX_EDU_WRITE_MCQ_OPTION_ID",
  essayId: "ETERNYX_EDU_WRITE_ESSAY_ID",
});
export const CBT_PREFLIGHT_CASES = Object.freeze([
  "two-distinct-verified-test-students",
  "student-a-not-admin",
  "student-b-not-admin",
  "student-a-not-an-instructor",
  "student-b-not-an-instructor",
  "student-a-has-enrollment",
  "student-b-has-no-enrollment",
  "student-a-can-read-approved-exam",
  "student-a-can-read-mcq-question",
  "student-a-can-read-written-question",
  "student-a-can-read-safe-option",
  "student-b-cannot-read-exam",
  "student-a-has-no-existing-attempt",
  "student-b-has-no-existing-attempt",
  "student-a-cannot-read-option-key",
  "anonymous-cannot-read-enrolled-catalog",
]);
export const CBT_WRITE_CASES = Object.freeze([
  "student-a-starts-one-staging-attempt",
  "student-a-repeated-start-reuses-attempt",
  "student-a-saves-mcq-choice",
  "student-a-saves-written-response",
  "student-a-reads-only-two-owned-responses",
  "student-a-attempt-in-progress",
  "student-b-cannot-read-a-attempt",
  "student-b-cannot-read-a-answers",
  "student-b-cannot-save-a-answer",
  "student-b-cannot-submit-a-attempt",
  "student-a-cannot-forge-attempt-score",
  "student-a-cannot-finalize-attempt-directly",
  "student-a-cannot-insert-forged-attempt",
  "student-a-cannot-forge-written-answer-points",
  "student-a-cannot-bypass-answer-save-rpc",
  "student-b-cannot-forge-a-attempt-score",
  "student-b-cannot-forge-a-answer-points",
  "anonymous-cannot-forge-a-attempt-score",
  "all-synthetic-records-unchanged-after-direct-tamper",
  "student-a-submits-staging-exam",
  "student-a-repeat-submit-is-idempotent",
  "student-a-late-save-is-blocked",
  "student-a-has-pending-unverified-result",
  "student-b-cannot-read-a-result",
  "anonymous-cannot-read-a-result",
  "student-a-submission-is-persisted",
  "student-a-cannot-read-private-grade-ledger",
  "student-b-did-not-gain-an-attempt",
  "student-a-cannot-retake-submitted-exam",
]);
export const CBT_STAGING_CASES = Object.freeze({
  preflight: Object.freeze([...CBT_PREFLIGHT_CASES,"both-test-sessions-signed-out"]),
  write: Object.freeze([...CBT_PREFLIGHT_CASES,...CBT_WRITE_CASES,"both-test-sessions-signed-out"]),
});
function fail(reason) { throw new Error("Education staging CBT rehearsal refused: "+reason); }
export function validateEducationHostedCbtConfig(env) {
  if (!env || !["preflight","write"].includes(env.ETERNYX_EDU_WRITE_MODE))
    fail("explicit staging mode is required");
  const config=validateStagingRlsReadOnlyConfig(env);
  const fixture=Object.fromEntries(Object.entries(requiredIds).map(([key,envName])=>{
    const value=env[envName];
    if (typeof value!=="string" || !uuid.test(value))
      fail("a valid reviewed synthetic fixture ID is required");
    return [key,value.toLowerCase()];
  }));
  if (new Set(Object.values(fixture)).size!==Object.keys(requiredIds).length)
    fail("all synthetic exam, question and option IDs must differ");

  const write=env.ETERNYX_EDU_WRITE_MODE==="write";
  if (write && (
    env.ETERNYX_EDU_CBT_WRITE_APPROVAL!==EDUCATION_CBT_WRITE_APPROVAL ||
    env.ETERNYX_EDU_IRREVERSIBLE_ACK!==EDUCATION_CBT_IRREVERSIBLE_ACK
  )) fail("separate owner write approval and one-time attempt acknowledgement required");

  // An optional approval alone does not turn preflight into a write; mode
  // must independently be selected as 'write' in the manual workflow.
  return Object.freeze({
    ...config, mode:write?"write":"preflight",
    fixture:Object.freeze(fixture),
    expectedCases:CBT_STAGING_CASES[write?"write":"preflight"],
  });
}
