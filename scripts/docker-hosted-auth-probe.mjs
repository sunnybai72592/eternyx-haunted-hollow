#!/usr/bin/env node
// Opt-in staging probe. Secrets are consumed ONLY via process environment,
// never printed in report, CLI arguments, exception text, or verbose logging.
import {validateDockerHostedProbeConfig,runDockerHostedAuthProbe}
 from "../src/lib/dockerHostedAuthProbe.mjs";
const usage="Usage: node scripts/docker-hosted-auth-probe.mjs --check-config | --run";
function config(){
 const e=process.env;
 return {
  stagingUrl:e.ETERNYX_DOCKER_STAGING_URL,
  pinnedStagingHost:e.ETERNYX_DOCKER_STAGING_PINNED_HOST,
  productionHost:e.ETERNYX_DOCKER_PRODUCTION_HOST,
  publishableKey:e.ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY,
  ownerAJwt:e.ETERNYX_DOCKER_STAGING_OWNER_A_JWT,
  ownerBJwt:e.ETERNYX_DOCKER_STAGING_OWNER_B_JWT,
  ownerAWorkspaceId:e.ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE,
  ownerBWorkspaceId:e.ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE
 };
}
try{
 if(process.argv.length!==3||!["--run","--check-config"].includes(process.argv[2]))
  throw Error(usage);
 const opt=process.argv[2];
 if(opt==="--run"&&process.env.ETERNYX_DOCKER_STAGING_PROBE_ENABLED!=="true")
  throw Error("Hosted staging probe is disabled. Explicit operator opt-in is required.");
 const safe=validateDockerHostedProbeConfig(config());
 const result=opt==="--run"?await runDockerHostedAuthProbe(config()):{
  schema:"eternyx-docker-staging-auth-preflight-v1",
  targetHost:safe.host,configurationValidated:true,hostIsNotDeclaredProduction:true,
  liveStagingAuthTested:false,mutationRequestsSent:false,
  productionDeploymentAuthorized:false,manualSecurityApprovalRequired:true};
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(opt==="--run"&&!result.passed)process.exitCode=1;
}catch{
 process.stderr.write("Docker staging authentication probe refused: invalid settings, test failure or unavailable staging host. No credentials have been printed.\n");
 process.exitCode=1;
}
