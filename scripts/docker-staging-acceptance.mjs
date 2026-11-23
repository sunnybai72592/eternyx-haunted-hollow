#!/usr/bin/env node
// Manually dispatched, read-only staging security acceptance.
// Secrets ONLY from protected workflow env and never printed.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {validateDockerStagingAcceptanceConfig,
 runDockerStagingAcceptance} from "../src/lib/dockerStagingAcceptance.mjs";
const env=process.env;
function manifest(){
 const encoded=env.ETERNYX_DOCKER_STAGING_MANIFEST_B64;
 if(typeof encoded!=="string"||encoded.length<24||encoded.length>32768||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error("Missing staged manifest.");
 const bytes=Buffer.from(encoded,"base64");
 if(bytes.length>16384||bytes.toString("base64")!==encoded)
  throw Error("Noncanonical staged manifest.");
 return JSON.parse(bytes.toString("utf8"));
}
function acceptanceConfig(){
 return {
  manifest:manifest(),
  pinnedManifestSha256:env.ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256,
  stagingRef:env.ETERNYX_DOCKER_STAGING_REF,
  productionRef:env.ETERNYX_DOCKER_PRODUCTION_REF,
  releaseCommitSha:env.ETERNYX_DOCKER_APPROVED_COMMIT_SHA,
  checkedOutCommitSha:env.ETERNYX_DOCKER_CHECKOUT_COMMIT_SHA,
  managementToken:env.ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN,
  probe:{
   stagingUrl:env.ETERNYX_DOCKER_STAGING_URL,
   pinnedStagingHost:env.ETERNYX_DOCKER_STAGING_PINNED_HOST,
   productionHost:env.ETERNYX_DOCKER_PRODUCTION_HOST,
   publishableKey:env.ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY,
   ownerAJwt:env.ETERNYX_DOCKER_STAGING_OWNER_A_JWT,
   ownerBJwt:env.ETERNYX_DOCKER_STAGING_OWNER_B_JWT,
   ownerAWorkspaceId:env.ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE,
   ownerBWorkspaceId:env.ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE
  }
 };
}
function sanitizedRecord(report){
 if(JSON.stringify(report).length>16384)
  throw Error("Sanitized staging evidence exceeded output size.");
 return JSON.stringify(report,null,2)+"\n";
}
try{
 const action=process.argv[2];
 if(process.argv.length!==3||!["--preflight","--run"].includes(action))
  throw Error("Only --preflight and --run are available.");
 if(env.ETERNYX_DOCKER_STAGING_READONLY_APPROVAL!=="I_APPROVE_READ_ONLY_STAGING")
  throw Error("Explicit manual read-only staging approval required.");
 if(env.ETERNYX_DOCKER_INPUT_STAGING_REF!==env.ETERNYX_DOCKER_STAGING_REF||
    env.ETERNYX_DOCKER_INPUT_PRODUCTION_REF!==env.ETERNYX_DOCKER_PRODUCTION_REF||
    env.ETERNYX_DOCKER_INPUT_RELEASE_SHA!==env.ETERNYX_DOCKER_APPROVED_COMMIT_SHA)
  throw Error("Manual inputs do not match protected environment pins.");
 const config=acceptanceConfig();
 validateDockerStagingAcceptanceConfig(config);
 if(action==="--preflight"){
  process.stdout.write(JSON.stringify({
   schema:"eternyx-docker-staging-readonly-preflight-v1",
   releaseCommitSha:config.releaseCommitSha,
   stagingProjectRef:config.stagingRef,
   approvedEnvironmentPinsMatched:true,
   remoteRequestsSent:false,productionDeploymentAuthorized:false
  })+"\n");
 }else{
  const report=await runDockerStagingAcceptance(config);
  const body=sanitizedRecord(report);
  const root=resolve("test-results");
  mkdirSync(root,{recursive:true,mode:0o700});
  writeFileSync(join(root,"docker-staging-readonly-acceptance.json"),body,
    {encoding:"utf8",mode:0o600,flag:"wx"});
  process.stdout.write(body);
 }
}catch{
 // Never print thrown raw HTTP errors or credentials.
 process.stderr.write("Docker staging acceptance refused: missing approval/pins, stale deployment, failed identity isolation, or unavailable read-only staging service. No secrets printed.\n");
 process.exitCode=1;
}
