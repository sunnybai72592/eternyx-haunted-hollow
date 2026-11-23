#!/usr/bin/env node
/**
 * ETERNYX: read-only, standalone staging DB connection preflight.
 * This module NEVER connects to a database, reads passwords, logs
 * connection strings, runs SQL or changes hosted resources. The separately
 * operator-approved workflow invokes psql with a hardcoded SELECT-only script.
 */
import {fileURLToPath} from "node:url";
import path from "node:path";

export const ETERNYX_PRODUCTION_REF = "wcncuarekaofmfurbtbh";
const REF=/^[a-z]{20}$/;
const POOL_HOST=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const DIRECT_HOST=/^db\.([a-z]{20})\.supabase\.co$/;
const SAFE_PORT="5432";
const SAFE_DATABASE="postgres";
const SAFE_USERS=new Set(["postgres"]);
const COLLISION_VERSIONS=new Set([
  "20261115060000","20261123030000","20261123040000",
  "20261123050000","20261123070000","20261123080000",
  "20261123090000","20261123100000","20261123110000",
  "20261123120000","20261123130000",
]);

function problem(code){throw Error("staging_db_"+code);}
export function inspectStagingConnection(env={}){
  const stage=env.ETERNYX_AUTOMATION_STAGING_REF;
  const prod=env.ETERNYX_AUTOMATION_PRODUCTION_REF;
  const host=env.ETERNYX_AUTOMATION_STAGING_PGHOST;
  const user=env.ETERNYX_AUTOMATION_STAGING_PGUSER;
  const port=env.ETERNYX_AUTOMATION_STAGING_PGPORT;
  const database=env.ETERNYX_AUTOMATION_STAGING_PGDATABASE;
  if(typeof stage!=="string"||!REF.test(stage)||
     typeof prod!=="string"||!REF.test(prod)||
     stage===prod||stage===ETERNYX_PRODUCTION_REF||
     prod!==ETERNYX_PRODUCTION_REF)
    problem("target_not_isolated");
  if(typeof host!=="string"||
     typeof user!=="string"||typeof port!=="string"||
     typeof database!=="string")problem("incomplete_connection_metadata");
  if(port!==SAFE_PORT||database!==SAFE_DATABASE)
    problem("invalid_database_or_port");
  const direct=DIRECT_HOST.exec(host);
  if(direct){
    if(direct[1]!==stage||!SAFE_USERS.has(user))
      problem("direct_target_mismatch");
  }else if(POOL_HOST.test(host)){
    if(user!=="postgres."+stage)problem("pooler_target_mismatch");
  }else{
    problem("unapproved_database_host");
  }
  return {
    schema:"eternyx-automation-staging-db-readonly-v1",
    mode:"explicit_staging_only",
    stagingRef:stage,
    productionRefIsKnown:true,
    connectionType:direct?"direct":"session_pooler",
    targetBound:true,
    requireTlsVerifyFull:true,
    requirePinnedCa:true,
    transactionMode:"READ ONLY",
    statementTimeoutMs:5000,
    connectTimeoutSeconds:8,
    migrationsChanged:false,
    databaseWritesAllowed:false,
    executed:false,
    cloudFunctionsDeployed:false,
    productionReady:false,
    stagingApproved:false,
  };
}
export function classifyStagingPgFailure(stderr){
  if(typeof stderr!=="string")return "unknown_failure";
  const msg=stderr.slice(0,12000).toLowerCase();
  if(/certificate verify failed|server certificate|certificate has expired|unable to get local issuer certificate|root certificate file|sslrootcert|tlsv/.test(msg))
    return "tls_certificate_verification_failed";
  if(/password authentication failed|no password supplied|authentication failed/.test(msg))
    return "authentication_failed";
  if(/could not translate host name|name or service not known|nodename nor servname/.test(msg))
    return "dns_resolution_failed";
  if(/timeout expired|connection timed out|could not connect to server.*timed out/.test(msg))
    return "connection_timeout";
  if(/connection refused|no route to host|network is unreachable/.test(msg))
    return "network_unreachable";
  if(/permission denied|must be owner of|insufficient privilege/.test(msg))
    return "read_permission_denied";
  if(/relation .* does not exist|schema .* does not exist/.test(msg))
    return "migration_history_unavailable";
  if(/canceling statement due to statement timeout/.test(msg))
    return "read_query_timeout";
  return "other_readonly_probe_failure";
}
export function parseProbeLines(output){
  if(typeof output!=="string"||output.length>4000)
    problem("unexpected_probe_output");
  const results={};
  const supported=new Set(["connection_ok","transaction_read_only",
    "migration_history_present","automation_workflows_present",
    "automation_runs_present","automation_webhooks_present",
    "automation_schedules_present"]);
  const applied=new Set();
  for(const line of output.trim().split(/\r?\n/)){
    if(!line)continue;
    if(line.startsWith("applied_collision_version=")){
      const version=line.slice("applied_collision_version=".length);
      if(!COLLISION_VERSIONS.has(version)||applied.has(version))
        problem("malformed_migration_receipt");
      applied.add(version);
    }else {
      const index=line.indexOf("=");
      if(index===-1)problem("unrecognized_query_output");
      const k=line.slice(0,index),v=line.slice(index+1);
      if(!supported.has(k)||!(v==="true"||v==="false")||k in results)
        problem("unrecognized_query_output");
      results[k]=v==="true";
    }
  }
  if([...supported].some(x=>!Object.hasOwn(results,x))||
      !results.connection_ok||!results.transaction_read_only||
      !results.migration_history_present)
    problem("incomplete_or_unsafe_query_output");
  return {
    schema:"eternyx-automation-staging-db-probe-result-v1",
    observed:results,
    collidedAppliedVersionCount:applied.size,
    collidedAppliedVersions:[...applied].sort(),
    historySource:"independent_staging_readonly_database_query",
    whichCollidedSqlExecuted:"unknown",
    deployedFunctionInventoryChecked:false,
    migrationRepairsPerformed:false,
    databaseWritesPerformed:false,
    productionVerified:false,
    releaseAuthorized:false,
  };
}
export function main(argv=process.argv.slice(2),env=process.env){
  if(argv.length!==1||argv[0]!=="--check-config")problem("invalid_arguments");
  const result=inspectStagingConnection(env);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  return 0;
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try {process.exitCode=main();}
  catch(e){
    // Do not echo arbitrary user-supplied hostnames, credentials or URLs.
    const code=e instanceof Error&&/^staging_db_[a-z_]+$/.test(e.message)?
      e.message:"staging_db_validation_failed";
    process.stderr.write(code+"\n");
    process.exitCode=2;
  }
}
