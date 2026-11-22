/**
 * Manual-only, three-role Education review and finalized-result acceptance.
 * Pure config validation: ZERO Auth calls, hosted DB writes or deployments.
 */
import { validateStagingRlsReadOnlyConfig } from "./stagingRlsConfig.mjs";

export const REVIEW_WRITE_APPROVAL="I_APPROVE_SYNTHETIC_INSTRUCTOR_REVIEW_WRITE";
export const REVIEW_WRITE_ACK="I_ACKNOWLEDGE_REVIEW_WILL_PERSIST_IN_STAGING";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instructor=/^(?:rls-|[a-z0-9._-]+\+rls-)[^@]*@[a-z0-9.-]+\.[a-z]{2,}$/i;
const cases=Object.freeze({
  preflight:Object.freeze([
    "three-distinct-real-auth-identities",
    "instructor-verified-by-grant",
    "instructor-is-not-an-admin",
    "student-a-is-not-an-instructor",
    "student-b-is-not-an-instructor",
    "student-a-owns-submitted-attempt",
    "student-a-owns-written-answer",
    "instructor-owns-submitted-review-queue-item",
    "instructor-review-is-unrecorded",
    "student-a-result-pending",
    "student-b-cannot-read-a-attempt",
    "student-b-cannot-read-a-written-answer",
    "student-a-cannot-select-private-review-table",
    "student-b-cannot-select-private-review-table",
    "anonymous-cannot-select-private-review-table",
  ]),
  review:Object.freeze([
    "student-a-cannot-write-manual-review",
    "student-b-cannot-write-manual-review",
    "anonymous-cannot-write-manual-review",
    "instructor-records-synthetic-human-mark",
    "instructor-queue-records-reviewed-points",
    "instructor-idempotent-same-points",
    "invalid-above-maximum-review-rejected",
    "review-points-unchanged-after-rejection",
    "student-grade-still-pending-after-review",
    "attempt-score-still-null-before-finalizer",
    "student-b-still-cannot-see-review",
    "anonymous-still-cannot-see-review",
  ]),
  verify:Object.freeze([
    "instructor-queue-shows-reviewed-points",
    "student-a-ledger-backed-final-grade",
    "student-a-score-matches-approved-expectation",
    "student-a-verified-final-timestamp",
    "student-a-repeated-read-stable",
    "student-b-cannot-read-final",
    "anonymous-cannot-read-final",
    "student-a-cannot-select-grade-ledger",
    "student-b-cannot-select-grade-ledger",
    "anonymous-cannot-select-grade-ledger",
    "final-attempt-marks-match-receipt",
    "final-written-answer-credit-matches-reviewed-mark",
  ]),
});
export const REVIEW_STAGE_CASES=Object.freeze({
  preflight:Object.freeze([...cases.preflight,"three-auth-sessions-signed-out"]),
  review:Object.freeze([...cases.preflight,...cases.review,"three-auth-sessions-signed-out"]),
  verify:Object.freeze([
    ...cases.preflight.filter(name=>![
      "instructor-review-is-unrecorded","student-a-result-pending",
      "student-a-cannot-write-manual-review","student-b-cannot-write-manual-review",
      "anonymous-cannot-write-manual-review",
    ].includes(name)),...cases.verify,"three-auth-sessions-signed-out",
  ]),
});
function refuse(){throw new Error("Education hosted review staging approval or fixture invalid");}
function points(env,name,positive=false){
  const value=env[name];
  if(typeof value!=="string" || !/^(0|[1-9][0-9]{0,5})$/.test(value))refuse();
  const x=Number(value);
  if(!Number.isSafeInteger(x) || x>100000 || (positive && x<1))refuse();
  return x;
}
export function validateEducationHostedReviewConfig(env){
  if(!env||!["preflight","review","verify"].includes(env.ETERNYX_EDU_REVIEW_MODE))refuse();
  const base=validateStagingRlsReadOnlyConfig(env);
  const values=[
    env.ETERNYX_EDU_REVIEW_TEST_ID,
    env.ETERNYX_EDU_REVIEW_ATTEMPT_ID,
    env.ETERNYX_EDU_REVIEW_ANSWER_ID,
  ];
  if(values.some(v=>typeof v!=="string"||!uuid.test(v)) ||
    new Set(values.map(v=>v.toLowerCase())).size!==values.length)refuse();
  const email=env.ETERNYX_RLS_INSTRUCTOR_EMAIL;
  const password=env.ETERNYX_RLS_INSTRUCTOR_PASSWORD;
  if(typeof email!=="string" || !instructor.test(email) ||
    typeof password!=="string" || password.length<12 ||
    base.accounts.some(a=>a.email.toLowerCase()===email.toLowerCase()))refuse();
  const mode=env.ETERNYX_EDU_REVIEW_MODE;
  const awarded=points(env,"ETERNYX_EDU_REVIEW_AWARDED_POINTS");
  if(awarded>1000)refuse();
  let marks=null;
  if(mode==="verify"){
    const score=points(env,"ETERNYX_EDU_REVIEW_FINAL_SCORE");
    const max=points(env,"ETERNYX_EDU_REVIEW_FINAL_MAX",true);
    if(score>max)refuse();
    marks=Object.freeze({score,max});
  }
  if(mode==="review" && (
    env.ETERNYX_EDU_REVIEW_WRITE_APPROVAL!==REVIEW_WRITE_APPROVAL ||
    env.ETERNYX_EDU_REVIEW_WRITE_ACK!==REVIEW_WRITE_ACK
  ))refuse();
  return Object.freeze({
    ...base,mode,awarded,marks,
    instructorAccount:Object.freeze({email,password}),
    fixture:Object.freeze({
      testId:values[0].toLowerCase(),
      attemptId:values[1].toLowerCase(),
      answerId:values[2].toLowerCase(),
    }),
    expectedCases:REVIEW_STAGE_CASES[mode],
  });
}
