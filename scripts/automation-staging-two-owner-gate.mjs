#!/usr/bin/env node
/**
 * An independent, manual-only consent gate for two REAL staging account
 * Automation HTTP acceptance. This module never connects to a host, reads
 * account JWTs, deploys code or changes any database.
 */
import path from "node:path";
import {fileURLToPath} from "node:url";
import {ETERNYX_PRODUCTION_REF} from "./automation-staging-db-readonly.mjs";

const REF=/^[a-z]{20}$/;
const INSPECT="INSPECT_ONLY";
const EXECUTE="ONE_TEMPORARY_WORKFLOW";
const REVIEW="STAGING_TEST_ACCOUNTS_REVIEWED";
const WRITE="I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN";
function fail(code){throw Error("automation_two_owner_gate_"+code);}
export function validateTwoOwnerGate(env={}){
  const stage=env.ETERNYX_AUTOMATION_STAGING_REF;
  const prod=env.ETERNYX_AUTOMATION_PRODUCTION_REF;
  const mode=env.ETERNYX_AUTOMATION_TWO_OWNER_MODE;
  const review=env.ETERNYX_AUTOMATION_TWO_OWNER_REVIEW;
  const writeConsent=env.ETERNYX_AUTOMATION_TWO_OWNER_WRITE_CONSENT;
  if(typeof stage!=="string"||!REF.test(stage)||
     stage===ETERNYX_PRODUCTION_REF||prod!==ETERNYX_PRODUCTION_REF)
    fail("production_target_denied");
  if(mode!==INSPECT && mode!==EXECUTE)fail("invalid_mode");
  if(review!==REVIEW)fail("accounts_not_reviewed");
  if(mode===EXECUTE && writeConsent!==WRITE)fail("explicit_staging_write_approval_missing");
  if(mode===INSPECT && writeConsent!== "NOT_APPROVED")
    fail("read_only_mode_cannot_accept_write_consent");
  return {
    schema:"eternyx-two-owner-http-staging-consent-v1",
    stagingRef:stage,
    mode:mode===INSPECT?"inspect":"execute",
    isolatedStagingRequired:true,
    productionTargetDenied:true,
    managementProjectIdentityRequired:true,
    twoRealNonanonymousAccountsRequired:true,
    writesAuthorizedByExplicitApproval:mode===EXECUTE,
    singleTemporaryWorkflowMaximum:true,
    persistedRunHistoryMayRemainAfterWorkflowDeletion:mode===EXECUTE,
    externalProvidersForbidden:true,
    schedulerTickForbidden:true,
    publicWebhookExecutionForbidden:true,
    productionReady:false,
    projectVerifiedByThisCheck:false,
    executed:false,
  };
}
export function checkTwoOwnerEvidence(raw,expectedMode){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     !["inspect","execute"].includes(expectedMode)||
     raw.mode!==expectedMode||
     raw.independentAccounts!==2||
     raw.ownerIsolationBetweenListedRecords!==true||
     raw.productionReady!==false||
     raw.releaseAuthorized!==false||
     raw.externalIntegrationTriggered!==false)
    fail("unsafe_or_malformed_evidence");
  if(expectedMode==="inspect"){
    if(raw.result!=="staging_read_only_verified"||
       raw.stagingManualRunVerified!==false||
       raw.mutationsPerformed!==0||raw.cleanupVerified!==false)
      fail("unsafe_or_malformed_evidence");
  }else{
    if(raw.result!=="isolated_staging_manual_flow_verified"||
       raw.stagingManualRunVerified!==true||
       raw.idempotentReplayVerified!==true||
       raw.foreignOwnerDenied!==true||
       raw.persistedPrivateHistoryVerified!==true||
       raw.temporaryWorkflowCleanupVerified!==true||
       raw.mutationsPerformed!==3)
      fail("unsafe_or_malformed_evidence");
  }
  return {
    schema:"eternyx-two-owner-http-staging-verification-v1",
    mode:expectedMode,
    independentAccounts:2,
    isolationVerified:true,
    manualWorkflowVerified:expectedMode==="execute",
    singleWorkflowDeleted:expectedMode==="execute",
    persistedHistoryMayRemain:expectedMode==="execute",
    externalProvidersCalled:false,
    productionDeployment:false,
    productionReady:false,
    releaseAuthorized:false,
  };
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    if(process.argv.length!==3||process.argv[2]!=="--check-config")fail("invalid_arguments");
    process.stdout.write(JSON.stringify(validateTwoOwnerGate(process.env),null,2)+"\n");
  }catch(e){
    const msg=e instanceof Error&&/^automation_two_owner_gate_[a-z_]+$/.test(e.message)?
      e.message:"automation_two_owner_gate_unavailable";
    process.stderr.write(msg+"\n");process.exitCode=1;
  }
}
