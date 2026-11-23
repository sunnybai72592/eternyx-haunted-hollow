#!/usr/bin/env node
// Cybersecurity Wave 14: offline, secret-free, fail-closed operator dossier assembly.
// NEVER connects to Supabase, never runs migrations, and never unlocks production.
import { createHash, webcrypto } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSecurityStagingReport } from "../src/lib/securityStagingReadiness.mjs";
import { validateHttpRevocationReport } from "../src/lib/securityStagingHttpRevocation.mjs";
import { evaluateCatalogOutput, sourceReleasePreflight } from "./security-ledger-catalog-gate.mjs";
import { validateWriteReceipt } from "../src/lib/securityStagingWriteReceipt.mjs";
import { createStagingDossier, makeDossierCore } from "../src/lib/securityStagingDossier.mjs";

export const DOSSIER_INPUTS=Object.freeze({
 "live-two-account-data-api":"wave10-readonly.json",
 "live-jwt-http-baseline":"wave13-baseline.json",
 "live-jwt-http-revocation":"wave13-revoked.json",
 "staging-pg-catalog":"wave11-catalog.txt",
 "staging-transactional-write-rollback":"wave12-transactional.json",
});
const REF=/^[a-z0-9]{8,32}$/;
const HEX=/^[a-f0-9]{64}$/;
function fail(message){throw new Error("Staging dossier BLOCKED: "+message);}
function readBounded(dir,name,max=48*1024) {
 const file=join(dir,name);
 if(!existsSync(file))return null;
 const stat=statSync(file);
 if(!stat.isFile()||stat.size<1||stat.size>max)fail(name+" is empty, too large, or is not a regular file.");
 return readFileSync(file,"utf8");
}
function parseJson(raw,label){
 try{return JSON.parse(raw);}catch{fail(label+" is not a valid JSON file.");}
}
function sha(raw){return createHash("sha256").update(raw,"utf8").digest("hex");}
function sameRef(v,ref,prod,label){
 const staging=v.stagingProjectRef??v.stagingRef;
 const production=v.productionProjectRef??v.productionRef;
 if(staging!==ref||production!==prod)fail(label+" does not reference the selected staging/production projects.");
}
function observed(raw,now,label){
 const time=Date.parse(raw);
 if(!Number.isFinite(time)||time>now+5*60*1000||time<now-7*86400000)
  fail(label+" is stale, future-dated, or missing its observation timestamp.");
 return new Date(time).toISOString();
}
export async function buildOperatorStagingDossier({
 dir,stagingRef,productionRef,now=new Date().toISOString()
}){
 if(typeof dir!=="string"||!dir.trim()||typeof stagingRef!=="string"||
   typeof productionRef!=="string"||!REF.test(stagingRef)||!REF.test(productionRef)||
   stagingRef===productionRef)
  fail("Distinct project refs and an evidence directory are required.");
 const nowMs=Date.parse(now);
 if(!Number.isFinite(nowMs))fail("Review clock is invalid.");
 const root=resolve(dir);
 if(!existsSync(root)||!statSync(root).isDirectory())fail("Evidence directory does not exist.");
 const files={},validated={},add=(id,raw,time)=>{
  files[id]={sha256:sha(raw),observedAt:observed(time,nowMs,id)};
 };
 const readOnly=readBounded(root,DOSSIER_INPUTS["live-two-account-data-api"]);
 if(readOnly){
  const v=validateSecurityStagingReport(parseJson(readOnly,"Wave 10"));
  sameRef(v,stagingRef,productionRef,"Wave 10");
  validated.readOnly=v;
  add("live-two-account-data-api",readOnly,v.observedAt);
 }
 const baseline=readBounded(root,DOSSIER_INPUTS["live-jwt-http-baseline"]);
 if(baseline){
  const v=validateHttpRevocationReport(parseJson(baseline,"Wave 13 baseline"),"baseline");
  sameRef(v,stagingRef,productionRef,"Wave 13 baseline");
  validated.baseline=v;
  add("live-jwt-http-baseline",baseline,v.observedAt);
 }
 const revoked=readBounded(root,DOSSIER_INPUTS["live-jwt-http-revocation"]);
 if(revoked){
  const v=validateHttpRevocationReport(parseJson(revoked,"Wave 13 revoked"),"revoked");
  sameRef(v,stagingRef,productionRef,"Wave 13 revoked");
  validated.revoked=v;
  add("live-jwt-http-revocation",revoked,v.observedAt);
 }
 if(validated.revoked&&!validated.baseline)
  fail("The revoked HTTP phase cannot be reviewed without its matching baseline.");
 if(validated.baseline&&validated.revoked){
  for(const key of ["a","b","engagementA","engagementB","run"]){
   if(validated.baseline.subjects[key]!==validated.revoked.subjects[key])
    fail("HTTP baseline and revoked identity/fixture bindings differ.");
  }
  const start=Date.parse(validated.baseline.observedAt),end=Date.parse(validated.revoked.observedAt);
  if(end<start||end-start>24*3600000)
   fail("HTTP revocation baseline is later than, or too old for, the revoked phase.");
 }
 const catalog=readBounded(root,DOSSIER_INPUTS["staging-pg-catalog"],30000);
 if(catalog){
  evaluateCatalogOutput(catalog);
  // Raw PG catalog output has no authenticated remote time or project identity:
  // this current timestamp is the OPERATOR'S dossier import time, not a DB proof.
  add("staging-pg-catalog",catalog,now);
 }
 const write=readBounded(root,DOSSIER_INPUTS["staging-transactional-write-rollback"]);
 if(write){
  const v=validateWriteReceipt(parseJson(write,"Wave 12 write receipt"));
  sameRef(v,stagingRef,productionRef,"Wave 12");
  const sqlSource=readFileSync(fileURLToPath(new URL("../tests/sql/security-ledger-transactional-writes.sql",import.meta.url)),"utf8");
  if(v.sourceSha256!==sha(sqlSource))
   fail("Staging write receipt source fingerprint differs from the reviewed Wave 12 SQL.");
  add("staging-transactional-write-rollback",write,v.observedAt);
 }
 const source=sourceReleasePreflight();
 const core=makeDossierCore({
  stagingRef,productionRef,observedAt:new Date(nowMs).toISOString(),files,
  sourceFingerprints:{ledger:source.sourceSha256,catalog:source.catalogSha256,
   parentMigrations:source.parentSha256},
 });
 const dossier=await createStagingDossier(core,webcrypto.subtle);
 return {dossier,localEvidenceCount:core.summary.provided,
   missingCategories:core.evidence.filter(v=>v.status==="missing").map(v=>v.id)};
}
function main(){
 const args=process.argv.slice(2);
 if(args.length===0||args[0]==="--explain"){
  if(args.length>1){process.stderr.write("Only --explain or --assess <local-directory>.\n");return 2;}
  process.stdout.write("Offline staging dossier: compare Waves 10–13 local reports, 60 PG catalog checks, source fingerprints, and rollback receipt.\n");
  process.stdout.write("Inputs: "+JSON.stringify(DOSSIER_INPUTS)+"\n");
  process.stdout.write("For --assess, set ETERNYX_STAGING_PROJECT_REF and a distinct ETERNYX_PRODUCTION_PROJECT_REF.\n");
  process.stdout.write("No network. All inputs are UNSIGNED; production is ALWAYS BLOCKED.\n");
  return 0;
 }
 if(args.length!==2||args[0]!=="--assess"){
  process.stderr.write("Usage: node scripts/security-staging-dossier.mjs --assess <local-directory>\n");
  return 2;
 }
 return buildOperatorStagingDossier({dir:args[1],stagingRef:process.env.ETERNYX_STAGING_PROJECT_REF,
  productionRef:process.env.ETERNYX_PRODUCTION_PROJECT_REF}).then(({dossier,localEvidenceCount,missingCategories})=>{
   process.stdout.write(JSON.stringify(dossier,null,2)+"\n");
   process.stderr.write("Dossier: "+localEvidenceCount+" locally checked reports; "+
    missingCategories.length+" missing gates. Unsigned; production BLOCKED.\n");
   return 0;
 }).catch(()=>{
  process.stderr.write("Staging dossier BLOCKED: missing, invalid, mismatched, stale or incompatible evidence; no output released.\n");
  return 1;
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const code=main();
 if(typeof code==="number")process.exitCode=code;
 else code.then(v=>{process.exitCode=v;});
}
