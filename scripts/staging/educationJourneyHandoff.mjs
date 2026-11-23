// Private, staging-only handoff between student submission and grading.
export const HANDOFF_PATH="test-results/education-journey-private.json";
export const JOURNEY_APPROVAL="I_APPROVE_SINGLE_STAGING_EXAM_FULL_JOURNEY";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=()=>{throw new Error("Unapproved or stale Education staging journey");};
export function checkJourneyApproval(env){
 if(env?.ETERNYX_EDU_RELEASE_MODE!=="journey"||
 env?.ETERNYX_EDU_JOURNEY_APPROVAL!==JOURNEY_APPROVAL)fail();
}
export function makeJourneyHandoff(env,attemptId,answerId){
 checkJourneyApproval(env);
 const h={schema:1,sha:env.GITHUB_SHA,run:String(env.GITHUB_RUN_ID),
   iteration:String(env.GITHUB_RUN_ATTEMPT),testId:env.ETERNYX_EDU_WRITE_TEST_ID,
   attemptId,answerId};
 verifyJourneyHandoff(env,h);
 return h;
}
export function verifyJourneyHandoff(env,h){
 checkJourneyApproval(env);
 const keys=["schema","sha","run","iteration","testId","attemptId","answerId"];
 if(!h||JSON.stringify(Object.keys(h).sort())!==JSON.stringify(keys.sort())||
 h.schema!==1||!/^[0-9a-f]{40}$/.test(h.sha)||h.sha!==env.GITHUB_SHA||
 !/^[1-9][0-9]*$/.test(h.run)||h.run!==String(env.GITHUB_RUN_ID)||
 !/^[1-9][0-9]*$/.test(h.iteration)||h.iteration!==String(env.GITHUB_RUN_ATTEMPT)||
 !uuid.test(h.testId)||!uuid.test(h.attemptId)||!uuid.test(h.answerId)||
 h.testId!==env.ETERNYX_EDU_WRITE_TEST_ID||
 h.attemptId===h.answerId||
 [env.ETERNYX_EDU_REVIEW_ATTEMPT_ID,env.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT,
 env.ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT,env.ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT,
 env.ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT,env.ETERNYX_EDU_STAGING_ATTEMPT_ID]
 .includes(h.attemptId))fail();
 return true;
}
export function journeyStageEnv(env,h){
 verifyJourneyHandoff(env,h);
 return {...env,ETERNYX_EDU_REVIEW_TEST_ID:h.testId,
  ETERNYX_EDU_REVIEW_ATTEMPT_ID:h.attemptId,ETERNYX_EDU_REVIEW_ANSWER_ID:h.answerId,
  ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT:h.attemptId};
}
