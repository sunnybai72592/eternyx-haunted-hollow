/**
 * Manual, non-destructive Education acceptance against a dedicated Supabase
 * staging project. This helper validates configuration; it never connects.
 */
import { validateStagingRlsReadOnlyConfig } from "./stagingRlsConfig.mjs";

export const EDUCATION_READ_APPROVAL = "I_APPROVE_EDUCATION_STAGING_READ_ONLY";
export const EDUCATION_READ_CASES = Object.freeze([
  "two-distinct-student-auth-identities",
  "student-a-non-admin",
  "student-b-non-admin",
  "student-a-not-approved-instructor",
  "student-b-not-approved-instructor",
  "student-a-enrolled-catalog",
  "student-b-unenrolled-catalog",
  "student-a-enrolled-test-readable",
  "student-b-test-invisible",
  "student-a-question-readable",
  "student-b-question-invisible",
  "student-a-own-option-readable",
  "student-b-option-invisible",
  "student-a-own-attempt-readable",
  "student-b-attempt-invisible",
  "student-a-own-answer-readable",
  "student-b-answer-invisible",
  "student-a-answer-key-column-denied",
  "student-b-answer-key-column-denied",
  "anonymous-answer-key-column-denied",
  "student-a-private-enrollment-table-denied",
  "student-b-private-enrollment-table-denied",
  "student-a-private-instructor-grants-denied",
  "student-b-private-instructor-grants-denied",
  "student-a-admin-review-rpc-denied",
  "student-b-admin-review-rpc-denied",
  "anonymous-catalog-rpc-denied",
  "anonymous-attempt-invisible",
  "anonymous-answer-invisible",
  "both-staging-sessions-signed-out",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = Object.freeze({
  testId: "ETERNYX_EDU_STAGING_TEST_ID",
  questionId: "ETERNYX_EDU_STAGING_QUESTION_ID",
  optionId: "ETERNYX_EDU_STAGING_OPTION_ID",
  attemptId: "ETERNYX_EDU_STAGING_ATTEMPT_ID",
  answerId: "ETERNYX_EDU_STAGING_ANSWER_ID",
});
export function validateEducationReadOnlyConfig(env) {
  if (!env || env.ETERNYX_EDU_STAGING_READ_APPROVAL !== EDUCATION_READ_APPROVAL)
    throw new Error("Education staging read-only approval required");
  // Reuse the same production project fingerprint, exact host validation,
  // publishable/anon key check, and dedicated test-account guard as RLS CI.
  // This function intentionally does NOT bypass the write-runner approval:
  // only the separate validateStagingRlsConfig() authorizes that runner.
  const config = validateStagingRlsReadOnlyConfig(env);
  const fixture = Object.fromEntries(Object.entries(fields).map(([field, key]) => {
    const value = env[key];
    if (typeof value !== "string" || !uuid.test(value))
      throw new Error("A reviewed synthetic Education staging fixture ID is missing");
    return [field, value.toLowerCase()];
  }));
  if (new Set(Object.values(fixture)).size !== 5)
    throw new Error("Education fixture IDs must be distinct");
  return Object.freeze({ ...config, fixture: Object.freeze(fixture) });
}
