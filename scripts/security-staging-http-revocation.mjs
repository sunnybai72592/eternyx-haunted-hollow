#!/usr/bin/env node
// Cybersecurity Wave 13: deliberate, real-account, GET-only staging HTTP acceptance.
// No writes, no automatic revocation, no migration, no production unlock.
import { readFileSync } from "node:fs";
import {
  validateHttpRevocationConfig, validateHttpRevocationReport,
  runSecurityHttpRevocation
} from "../src/lib/securityStagingHttpRevocation.mjs";

const args=process.argv.slice(2);
const command=args[0]??"--explain";
if(args.length>1||!["--explain","--check-config","--baseline","--revoked"].includes(command)){
 process.stderr.write("Use --explain, --check-config, --baseline, or --revoked.\n");
 process.exit(2);
}
if(command==="--explain"){
 process.stdout.write([
  "Wave 13: real JWT HTTP baseline then operator-driven attestation revocation, GET-only.",
  "Neither phase writes, deploys, revokes a session, or grants production access.",
  "Before --baseline: stage BOTH authenticated accounts and seven private table fixtures.",
  "Between phases: authorized operator revokes account A's test engagement (draft/cancelled, attested false).",
  "Afterwards: --revoked requires the unchanged JWTs, project, secret, fixture IDs and baseline report.",
  "No staging account credentials or data are included in output; reports remain unsigned.",
  "Production release: BLOCKED."
 ].join("\n")+"\n");
 process.exit(0);
}
let config,options;
try{
 if(command!=="--check-config"&&process.env.ETERNYX_STAGING_HTTP_ACK!=="I_APPROVE_GET_ONLY_STAGING"){
  throw new Error("Real HTTP staging execution requires its separate explicit GET-only acknowledgement.");
 }
 const env={...process.env,
  ETERNYX_STAGING_HTTP_PHASE:command==="--revoked"?"revoked":"baseline"};
 ({config,options}=validateHttpRevocationConfig(env));
 if(command==="--revoked"){
  const name=env.ETERNYX_STAGING_HTTP_BASELINE_FILE;
  if(typeof name!=="string"||!name.trim())throw new Error("Baseline file is required for phase two.");
  const {size}=await import("node:fs").then(fs=>fs.statSync(name));
  if(size<1||size>48*1024)throw new Error("Baseline report outside 48 KiB bound.");
  options.baseline=validateHttpRevocationReport(JSON.parse(readFileSync(name,"utf8")),"baseline");
 }
}catch(e){
 // Never display token/secret-derived input or raw exceptions to protect staging configuration.
 process.stderr.write("HTTP REVOCATION STAGING BLOCKED: invalid staging project, identities, acknowledgement, phase or baseline.\n");
 process.exit(2);
}
if(command==="--check-config"){
 process.stdout.write("PASS: staging-only HTTP configuration checked, without network calls.\n");
 process.exit(0);
}
try{
 const {report,requestCount}=await runSecurityHttpRevocation(config,options);
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
 process.stderr.write("PASS: "+report.phase+" staging HTTP observations ("+requestCount+
  " GET requests). Unsigned evidence, no writes. Production BLOCKED.\n");
}catch(e){
 process.stderr.write("HTTP REVOCATION STAGING BLOCKED: JWT, private table access, cross-owner RLS, Storage, "+
  "revocation audit or phase binding failed. No HTTP writes performed.\n");
 process.exitCode=1;
}
