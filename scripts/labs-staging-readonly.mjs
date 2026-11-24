#!/usr/bin/env node
/**
 * Explicit operator opt-in. No credentials, URLs, user IDs or payloads printed.
 * --check-config uses zero network calls. --run sends read-only fixed probes.
 */
import {fileURLToPath} from "node:url";
import path from "node:path";
import {
  LABS_STAGING_REQUIRED_CHECKS,validateLabsStagingConfig,runLabsStagingReadOnly,
} from "../src/lib/eternyxLabsStagingReadiness.mjs";
const usage="Use --explain, --check-config or --run (isolated staging only).\n";
export async function main(args=process.argv.slice(2),env=process.env){
  if(args.length!==1||!["--explain","--check-config","--run"].includes(args[0]))
    throw Error("labs_staging_invalid_arguments");
  if(args[0]==="--explain"){
    process.stdout.write("LABS staging read-only checks: "+LABS_STAGING_REQUIRED_CHECKS.join(", ")+
      "\nNo project, session, flag, worker, database or production changes.\n");
    return;
  }
  const config=validateLabsStagingConfig(env);
  if(args[0]==="--check-config"){
    process.stdout.write(JSON.stringify({
      schema:"eternyx.labs.staging-preflight.v1",
      stagingRef:config.ref,stagingOnly:true,productionExcluded:true,
      networkRequestsSent:0,databaseWritesMade:0,releaseAuthorized:false,
    })+"\n");
    return;
  }
  const result=await runLabsStagingReadOnly(config);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)main().catch(e=>{
  const safe=e instanceof Error&&/^labs_staging_[a-z_]+$/.test(e.message)?
    e.message:"labs_staging_validation_failed";
  process.stderr.write(safe+"\n");process.exitCode=1;
});
