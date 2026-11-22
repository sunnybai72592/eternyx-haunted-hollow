/**
 * Strict one-attempt hosted Education finalization acceptance config.
 * NO network, writes, or secrets emitted by this module.
 */
import { validateEducationHostedReviewConfig } from "./educationHostedReviewConfig.mjs";

export const TRUSTED_FINALIZE_APPROVAL="I_APPROVE_ONE_SYNTHETIC_STAGING_FINAL_GRADE";
export const TRUSTED_FINALIZE_ACK="I_ACKNOWLEDGE_OFFICIAL_GRADE_BECOMES_IMMUTABLE";
const shared=Object.freeze([
 "three-distinct-staging-auth-identities",
 "instructor-grant-still-approved",
 "instructor-is-not-admin",
 "student-a-is-not-instructor",
 "student-b-is-not-instructor",
 "submitted-attempt-owned-by-a",
 "written-answer-belongs-to-synthetic-exam",
 "exact-instructor-review-remains-recorded",
 "student-b-cannot-inspect-a-attempt",
 "student-b-cannot-inspect-a-answer",
 "student-a-direct-ledger-select-denied",
 "student-b-direct-ledger-select-denied",
 "anonymous-direct-ledger-select-denied",
]);
const pending=Object.freeze([
 "pending-student-receipt-hides-scores",
 "attempt-grades-not-written-before-finalizer",
 "student-b-cannot-read-a-unfinalized-receipt",
 "anonymous-cannot-read-a-unfinalized-receipt",
]);
const finalized=Object.freeze([
 "student-a-final-receipt-matches-reviewed-expectation",
 "finalized-receipt-has-valid-timestamp",
 "student-a-repeat-result-read-is-stable",
 "finalized-attempt-matches-receipt-score",
 "finalized-essay-matches-approved-mark",
 "student-b-cannot-read-a-final-result",
 "anonymous-cannot-read-a-final-result",
]);
const finish="all-staging-sessions-signed-out";
export const TRUSTED_FINALIZER_CASES=Object.freeze({
 preflight:Object.freeze([...shared,...pending,finish]),
 finalize:Object.freeze([
  ...shared,...pending,
  "trusted-server-finalization-invoked",
  "official-grading-result-matches-expected-score",
  "finalizer-idempotent-retry-reuses-ledger",
  ...finalized,finish,
 ]),
 verify:Object.freeze([...shared,...finalized,finish]),
});
const number=(v,max)=>typeof v==="string"&&
 /^(0|[1-9][0-9]{0,5})$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=max?
 Number(v):null;
function fail(){throw new Error("Education trusted staging finalize authorization or fixture invalid");}
function inspectSecret(key,ref,publishable){
 if(typeof key!=="string" || key.length<25 || key.length>4000 || key===publishable)fail();
 if(key.startsWith("sb_secret_")){
  if(!/^sb_secret_[A-Za-z0-9_-]{18,}$/.test(key))fail();
  return key;
 }
 // Legacy service-role JWTs must affirm both role and the exact staging ref.
 const parts=key.split(".");
 if(parts.length!==3||parts.some(x=>!x))fail();
 try{
  const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
  if(!claims||claims.role!=="service_role"||claims.ref!==ref)fail();
 }catch{fail();}
 return key;
}
export function validateEducationTrustedFinalizerConfig(env){
 if(!env||!["preflight","finalize","verify"].includes(env.ETERNYX_EDU_FINALIZE_MODE))fail();
 // Reuse approved project fingerprint, strict staging URL, real users,
 // third instructor and synthetic fixture contract, but never inherit
 // the older review-mode write permission.
 const base=validateEducationHostedReviewConfig({
   ...env,ETERNYX_EDU_REVIEW_MODE:"preflight",
 });
 const mode=env.ETERNYX_EDU_FINALIZE_MODE;
 const score=number(env.ETERNYX_EDU_FINALIZE_EXPECTED_SCORE,100000);
 const max=number(env.ETERNYX_EDU_FINALIZE_EXPECTED_MAX,100000);
 if(score===null||max===null||max<1||score>max)fail();
 const expectedMarks=Object.freeze({score,max});
 let secret=null;
 if(mode==="finalize"){
  if(env.ETERNYX_EDU_FINALIZE_WRITE_APPROVAL!==TRUSTED_FINALIZE_APPROVAL ||
     env.ETERNYX_EDU_FINALIZE_IMMUTABLE_ACK!==TRUSTED_FINALIZE_ACK)fail();
  secret=inspectSecret(env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY,
   base.projectRef,base.publishableKey);
 }else if(env.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY){
  // Read-only jobs must not receive a privileged key, even accidentally.
  fail();
 }
 return Object.freeze({
  ...base,mode,expectedMarks,secret,
  expectedCases:TRUSTED_FINALIZER_CASES[mode],
 });
}
