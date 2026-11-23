#!/usr/bin/env node
// Staging-only, GET-only two-account acceptance. Never deploy migrations.
import { validateSecurityStagingConfig,runSecurityStagingReadOnly,evaluateCybersecurityReleaseGate } from "../src/lib/securityStagingReadiness.mjs";
const args=process.argv.slice(2),command=args[0]??"--explain";
if(args.length>1||!["--explain","--check-config","--run"].includes(command)){
  process.stderr.write("Use --explain, --check-config or --run.\n");process.exit(2);
}
if(command==="--explain"){
  const gate=evaluateCybersecurityReleaseGate();
  process.stdout.write("Cybersecurity production promotion: BLOCKED.\n"+gate.blockers.map((x,i)=>(i+1)+". "+x).join("\n")+"\n");
  process.stdout.write("No network, database writes or deployment occurred.\n");process.exit(0);
}
let config;
try{config=validateSecurityStagingConfig(process.env);}
catch{
  process.stderr.write("STAGING BLOCKED: missing or invalid staging-only configuration. Requires distinct staging project and two real account JWTs. No network used.\n");process.exit(2);
}
if(command==="--check-config"){
  process.stdout.write("PASS: staging config and project separation valid; no network calls made.\n");process.exit(0);
}
try{
  const report=await runSecurityStagingReadOnly(config);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  process.stderr.write("STAGING READ-ONLY PASS. Production stays BLOCKED. Report is not signed.\n");
}catch{
  process.stderr.write("STAGING BLOCKED: a real account Data API / Storage check failed. Review staging fixtures, grants and policies. No data changed.\n");
  process.exitCode=1;
}
