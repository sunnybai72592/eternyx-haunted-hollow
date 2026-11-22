/**
 * Explicit, read-only hosted results acceptance against a separate Supabase
 * staging project. Reuses the existing tested nonproduction host and key guard.
 * This module does not make API calls or authorize staging writes.
 */
import { validateStagingRlsReadOnlyConfig } from "./stagingRlsConfig.mjs";

export const RESULTS_READ_APPROVAL = "I_APPROVE_EDUCATION_STAGING_RESULTS_READ_ONLY";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const RESULTS_CASES = Object.freeze([
  "two-independent-authenticated-students",
  "student-a-non-admin",
  "student-b-non-admin",
  "student-a-own-final-grade",
  "student-a-expected-mark",
  "student-a-receipt-minimal",
  "student-b-denied-a-final",
  "anonymous-denied-a-final",
  "student-b-own-final-grade",
  "student-b-expected-mark",
  "student-b-receipt-minimal",
  "student-a-denied-b-final",
  "anonymous-denied-b-final",
  "student-a-pending-no-score",
  "student-b-denied-a-pending",
  "student-a-in-progress-no-score",
  "student-b-denied-a-in-progress",
  "student-a-legacy-no-score",
  "student-b-denied-a-legacy",
  "student-a-denied-unknown-attempt",
  "student-b-denied-unknown-attempt",
  "anonymous-rpc-denied",
  "student-a-direct-ledger-denied",
  "student-b-direct-ledger-denied",
  "anonymous-direct-ledger-denied",
  "both-authenticated-sessions-signed-out",
]);
const ids = Object.freeze({
  finalA:"ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT",
  finalB:"ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT",
  pendingA:"ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT",
  runningA:"ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT",
  legacyA:"ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT",
});
function fail(message) { throw new Error("Staging final results read refused: "+message); }
function expected(env, field) {
  const value = env[field];
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,5})$/.test(value))
    fail("expected integer mark fixture metadata missing");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 100000) fail("invalid expected mark");
  return n;
}
export function validateEducationResultsReadConfig(env) {
  if (!env || env.ETERNYX_EDU_RESULTS_READ_APPROVAL !== RESULTS_READ_APPROVAL)
    fail("explicit read-only approval is required");
  const config = validateStagingRlsReadOnlyConfig(env);
  const fixture = Object.fromEntries(Object.entries(ids).map(([name,key])=>{
    const value=env[key];
    if (typeof value !== "string" || !uuid.test(value))
      fail("missing or invalid reviewed synthetic fixture attempt");
    return [name,value.toLowerCase()];
  }));
  if (new Set(Object.values(fixture)).size !== Object.keys(ids).length)
    fail("all fixture attempts must be distinct");
  const marks = Object.freeze({
    aScore:expected(env,"ETERNYX_EDU_RESULT_A_SCORE"),
    aMax:expected(env,"ETERNYX_EDU_RESULT_A_MAX"),
    bScore:expected(env,"ETERNYX_EDU_RESULT_B_SCORE"),
    bMax:expected(env,"ETERNYX_EDU_RESULT_B_MAX"),
  });
  if (marks.aMax < 1 || marks.bMax < 1 ||
      marks.aScore > marks.aMax || marks.bScore > marks.bMax)
    fail("reviewed expected grade scores are inconsistent");
  return Object.freeze({ ...config, fixture:Object.freeze(fixture), marks });
}
