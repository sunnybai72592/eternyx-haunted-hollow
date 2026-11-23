#!/usr/bin/env node
// Manual operator-only fresh Auth session acceptance. Auth password sign-ins
// DO create staging sessions; the subsequent Docker checks are read-only.
import {mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {validateDockerStagingAcceptanceContext,runDockerStagingAcceptance}
 from "../src/lib/dockerStagingAcceptance.mjs";
import {validateFreshDockerAccounts,obtainFreshDockerStagingProbe}
 from "../src/lib/dockerFreshStagingAccounts.mjs";

const e=process.env;
function manifest(){
 const value=e.ETERNYX_DOCKER_STAGING_MANIFEST_B64;
 if(typeof value!=="string"||value.length<24||value.length>32768||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
  throw Error("Missing privately stored release expectations.");
 const data=Buffer.from(value,"base64");
 if(data.length>16384||data.toString("base64")!==value)
  throw Error("Malformed independently pinned release manifest.");
 return JSON.parse(data.toString("utf8"));
}
function cfg(){
 return {
  manifest:manifest(),
  pinnedManifestSha256:e.ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256,
  stagingRef:e.ETERNYX_DOCKER_STAGING_REF,
  productionRef:e.ETERNYX_DOCKER_PRODUCTION_REF,
  releaseCommitSha:e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,
  checkedOutCommitSha:e.ETERNYX_DOCKER_CHECKOUT_COMMIT_SHA,
  managementToken:e.ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN,
  probe:{
   stagingUrl:e.ETERNYX_DOCKER_STAGING_URL,
   pinnedStagingHost:e.ETERNYX_DOCKER_STAGING_PINNED_HOST,
   productionHost:e.ETERNYX_DOCKER_PRODUCTION_HOST,
   publishableKey:e.ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY,
   ownerAWorkspaceId:e.ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE,
   ownerBWorkspaceId:e.ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE
  }
 };
}
function accounts(){
 return {
  ownerA:{email:e.ETERNYX_DOCKER_STAGING_OWNER_A_EMAIL,
   password:e.ETERNYX_DOCKER_STAGING_OWNER_A_PASSWORD,
   userId:e.ETERNYX_DOCKER_STAGING_OWNER_A_USER_ID},
  ownerB:{email:e.ETERNYX_DOCKER_STAGING_OWNER_B_EMAIL,
   password:e.ETERNYX_DOCKER_STAGING_OWNER_B_PASSWORD,
   userId:e.ETERNYX_DOCKER_STAGING_OWNER_B_USER_ID}
 };
}
try{
 if(process.argv.length!==3||!["--preflight","--run"].includes(process.argv[2]))
  throw Error("Only --preflight and --run are available.");
 if(e.ETERNYX_DOCKER_FRESH_AUTH_WRITE_APPROVAL!=="I_APPROVE_STAGING_AUTH_SESSIONS"||
    e.ETERNYX_DOCKER_INPUT_STAGING_REF!==e.ETERNYX_DOCKER_STAGING_REF||
    e.ETERNYX_DOCKER_INPUT_PRODUCTION_REF!==e.ETERNYX_DOCKER_PRODUCTION_REF||
    e.ETERNYX_DOCKER_INPUT_RELEASE_SHA!==e.ETERNYX_DOCKER_APPROVED_COMMIT_SHA)
  throw Error("Staging Auth session creation needs explicit approval and independent release pins.");
 const config=cfg(),profiles=accounts();
 validateDockerStagingAcceptanceContext(config);
 validateFreshDockerAccounts(config.probe,profiles);
 if(process.argv[2]==="--preflight"){
  process.stdout.write(JSON.stringify({
   schema:"eternyx-docker-fresh-auth-preflight-v1",
   stagingProjectRef:config.stagingRef,releaseCommitSha:config.releaseCommitSha,
   twoPinnedAccountsPresent:true,authSessionsCreated:false,
   stagingRequestsSent:false,productionDeploymentAuthorized:false,
   dockerExecutionAuthorized:false
  })+"\n");
 }else{
  const report=await runDockerStagingAcceptance(config,{
   freshSessionProvider:probe=>obtainFreshDockerStagingProbe(probe,profiles)
  });
  if(report.stagingAuthSessionsCreated!==true||report.passed!==true||
     report.stagingDataMutationRequestsSent!==false)
   throw Error("Staging Auth acceptance did not meet the exact safety contract.");
  const json=JSON.stringify(report,null,2)+"\n";
  if(json.length>16384)throw Error("Acceptance evidence exceeded the bounded limit.");
  mkdirSync(resolve("test-results"),{recursive:true,mode:0o700});
  writeFileSync(join(resolve("test-results"),"docker-staging-fresh-auth-acceptance.json"),
   json,{encoding:"utf8",mode:0o600,flag:"wx"});
  process.stdout.write(json);
 }
}catch{
 process.stderr.write("Docker fresh staging Auth acceptance refused: independent pins, test credentials, expected user identity, deployed metadata or isolation checks failed. No credentials, access tokens or refresh tokens were logged.\n");
 process.exitCode=1;
}
