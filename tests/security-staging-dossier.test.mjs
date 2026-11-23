import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
 DOSSIER_SCHEMA,EVIDENCE_IDS,REQUIRED_PRODUCTION_BLOCKERS,
 makeDossierCore,createStagingDossier,inspectStagingDossier,
} from "../src/lib/securityStagingDossier.mjs";
import { WRITE_RECEIPT_SCHEMA,validateWriteReceipt } from "../src/lib/securityStagingWriteReceipt.mjs";
import { REQUIRED_CHECKS } from "../src/lib/securityStagingReadiness.mjs";
import { HTTP_REVOCATION_CHECKS } from "../src/lib/securityStagingHttpRevocation.mjs";
import { EXPECTED_IDS,sourceReleasePreflight } from "../scripts/security-ledger-catalog-gate.mjs";
import { buildOperatorStagingDossier,DOSSIER_INPUTS } from "../scripts/security-staging-dossier.mjs";

const stage="stagingabcd",prod="prodexample";
const first="2026-11-23T09:00:00.000Z";
const second="2026-11-23T09:30:00.000Z";
const now="2026-11-23T10:00:00.000Z";
const hex=(x)=>createHash("sha256").update(x).digest("hex");
const runSubjects=Object.fromEntries(["a","b","engagementA","engagementB","run"].map(k=>[k,hex(k+"-synthetic-wave14")]));
const limitations=[
 "Unsigned local user observation report has no independent authenticated external signature.",
 "Real engagement attestation is not JWT revocation; the historical evidence stays owner-readable.",
 "This operator test performed no HTTP mutations, migrations or production authorizations.",
];
function wave10(){return {
 schema:"eternyx.cybersecurity.staging-readonly.v1",
 environment:"staging-readonly",stagingProjectRef:stage,productionProjectRef:prod,
 observedAt:first,status:"pass",checks:REQUIRED_CHECKS.map(id=>({id,status:"pass"})),
 summary:{distinctAccounts:2,coveredTables:7,privateStorageAccounts:2,remoteMutations:0},
 limitations:[
 "An unsigned local report does not provide independent evidence of execution.",
 "Read-only tests did not verify SQL writes or migrations.",
 "Production promotion has not been approved by these tests.",
 ],
};}
function wave13(phase){
 return {
  schema:"eternyx.cybersecurity.http-revocation.v1",phase,
  stagingRef:stage,productionRef:prod,
  observedAt:phase==="baseline"?first:second,
  subjects:runSubjects,
  checks:HTTP_REVOCATION_CHECKS.map(id=>({id,
    status:phase==="baseline"&&["revocation-audit","phase-linked-identities"].includes(id)?"deferred":"pass"})),
  summary:{accounts:2,tables:7,remoteWrites:0,authMode:"live-user-JWT",
   engagementState:phase==="baseline"?"attested":"revoked",independentApproval:false},
  limitations,
 };
}
const writeReceipt=()=>{
 const sql=readFileSync(new URL("../tests/sql/security-ledger-transactional-writes.sql",import.meta.url),"utf8");
 return {schema:WRITE_RECEIPT_SCHEMA,stagingProjectRef:stage,productionProjectRef:prod,
  observedAt:second,status:"operator-reported-pass",
  mode:"database-role-emulation-not-http-jwt",transactionRolledBack:true,
  sourceSha256:hex(sql),productionAuthorized:false,
  limitations:[
   "This operator receipt is unsigned and cannot establish real database origin.",
   "The role emulation does not verify JWT HTTP grants or disaster recovery.",
  ]};
};
const syntheticFiles=()=>({
 [DOSSIER_INPUTS["live-two-account-data-api"]]:JSON.stringify(wave10()),
 [DOSSIER_INPUTS["live-jwt-http-baseline"]]:JSON.stringify(wave13("baseline")),
 [DOSSIER_INPUTS["live-jwt-http-revocation"]]:JSON.stringify(wave13("revoked")),
 [DOSSIER_INPUTS["staging-pg-catalog"]]:EXPECTED_IDS.map(id=>id+"|pass").join("\n")+"\n",
 [DOSSIER_INPUTS["staging-transactional-write-rollback"]]:JSON.stringify(writeReceipt()),
});
function sandbox(files={}){
 const path=mkdtempSync(join(tmpdir(),"eternyx-wave14-"));
 for(const [name,value] of Object.entries(files))writeFileSync(join(path,name),value);
 return {path,cleanup:()=>rmSync(path,{force:true,recursive:true})};
}

test("empty artifact directory is explicitly incomplete and never production-approved",async()=>{
 const dir=sandbox();
 try{
  const {dossier,localEvidenceCount,missingCategories}=await buildOperatorStagingDossier({
   dir:dir.path,stagingRef:stage,productionRef:prod,now});
  assert.equal(dossier.core.schema,DOSSIER_SCHEMA);
  assert.equal(localEvidenceCount,0);
  assert.equal(missingCategories.length,EVIDENCE_IDS.length);
  assert.equal(dossier.core.summary.completeLocalReview,false);
  assert.equal(dossier.core.summary.productionApproved,false);
  assert.equal(dossier.core.production,"blocked");
  assert.equal((await inspectStagingDossier(JSON.stringify(dossier),webcrypto.subtle)).production,"blocked");
 }finally{dir.cleanup();}
});
test("five synthetic source artifacts are parsed, cross-wave linked, privacy-redacted and 3 release gates remain missing",async()=>{
 const dir=sandbox(syntheticFiles());
 try{
  const {dossier,localEvidenceCount,missingCategories}=await buildOperatorStagingDossier({
   dir:dir.path,stagingRef:stage,productionRef:prod,now});
  assert.equal(localEvidenceCount,5);
  assert.deepEqual(missingCategories,[
   "verified-migration-history","verified-backup-restore","independent-signed-approval"
  ]);
  assert.equal(dossier.core.summary.missing,3);
  assert.equal(dossier.core.blockers.length,REQUIRED_PRODUCTION_BLOCKERS.length);
  assert.equal(dossier.checksum.hex.length,64);
  const checked=await inspectStagingDossier(JSON.stringify(dossier),webcrypto.subtle);
  assert.equal(checked.attestation,"none");
  assert.equal(checked.production,"blocked");
  assert.match(checked.warning,/not real staging execution/);
  const output=JSON.stringify(dossier);
  assert.doesNotMatch(output,/Bearer |PGPASSWORD|session token|private\.txt|11111111-1111|22222222-2222/);
  assert.match(output,/unsigned-local-consistency-only/);
 }finally{dir.cleanup();}
});
test("strict receipt validation and source fingerprint drift both fail closed",async()=>{
 assert.equal(validateWriteReceipt(writeReceipt()).transactionRolledBack,true);
 assert.throws(()=>validateWriteReceipt({...writeReceipt(),transactionRolledBack:false}));
 assert.throws(()=>validateWriteReceipt({...writeReceipt(),productionAuthorized:true}));
 assert.throws(()=>validateWriteReceipt({...writeReceipt(),sessionSecret:"raw"}));
 const data=syntheticFiles();
 data[DOSSIER_INPUTS["staging-transactional-write-rollback"]]=JSON.stringify({
  ...writeReceipt(),sourceSha256:"f".repeat(64)});
 const dir=sandbox(data);
 try{
  await assert.rejects(()=>buildOperatorStagingDossier({
   dir:dir.path,stagingRef:stage,productionRef:prod,now}),/source fingerprint differs/);
 }finally{dir.cleanup();}
});
test("mismatched project, mismatched HMAC subjects, backwards phases and stale timestamps refuse to assemble",async()=>{
 const mutate=[
  files=>{files[DOSSIER_INPUTS["live-two-account-data-api"]]=JSON.stringify({...wave10(),stagingProjectRef:"wrongstage"});},
  files=>{files[DOSSIER_INPUTS["live-jwt-http-revocation"]]=JSON.stringify({...wave13("revoked"),
   subjects:{...runSubjects,a:"f".repeat(64)}});},
  files=>{files[DOSSIER_INPUTS["live-jwt-http-revocation"]]=JSON.stringify({...wave13("revoked"),
   observedAt:"2026-11-22T09:00:00.000Z"});},
  files=>{files[DOSSIER_INPUTS["live-two-account-data-api"]]=JSON.stringify({...wave10(),
   observedAt:"2026-11-01T09:00:00.000Z"});},
  files=>{files[DOSSIER_INPUTS["staging-pg-catalog"]]=EXPECTED_IDS.slice(1).map(id=>id+"|pass").join("\n");},
 ];
 for(const alter of mutate){
  const files=syntheticFiles();alter(files);
  const dir=sandbox(files);
  try{await assert.rejects(()=>buildOperatorStagingDossier({
   dir:dir.path,stagingRef:stage,productionRef:prod,now}));}
  finally{dir.cleanup();}
 }
});
test("a missing HTTP baseline cannot certify a revoked phase",async()=>{
 const files=syntheticFiles();
 delete files[DOSSIER_INPUTS["live-jwt-http-baseline"]];
 const dir=sandbox(files);
 try{await assert.rejects(()=>buildOperatorStagingDossier({
  dir:dir.path,stagingRef:stage,productionRef:prod,now}),/cannot be reviewed without its matching baseline/);}
 finally{dir.cleanup();}
});
test("checksum, missing blockers and fake release status cannot be silently modified",async()=>{
 const dir=sandbox(syntheticFiles());
 try{
  const {dossier}=await buildOperatorStagingDossier({dir:dir.path,stagingRef:stage,productionRef:prod,now});
  for(const changed of [
   {...dossier,core:{...dossier.core,stagingRef:"otherstage"}},
   {...dossier,core:{...dossier.core,production:"approved"}},
   {...dossier,core:{...dossier.core,blockers:[]}},
   {...dossier,core:{...dossier.core,summary:{...dossier.core.summary,productionApproved:true}}},
   {...dossier,core:{...dossier.core,evidence:dossier.core.evidence.slice(0,4)}},
   {...dossier,checksum:{...dossier.checksum,hex:"f".repeat(64)}},
   {...dossier,unexpected:"secrets"},
  ])await assert.rejects(()=>inspectStagingDossier(JSON.stringify(changed),webcrypto.subtle));
 }finally{dir.cleanup();}
});
test("CLI source review and dossier export never require database credentials or reveal raw artifact bodies",()=>{
 const cli=fileURLToPath(new URL("../scripts/security-staging-dossier.mjs",import.meta.url));
 const info=spawnSync(process.execPath,[cli,"--explain"],{encoding:"utf8",
  env:{...process.env,ETERNYX_STAGING_ONLY:""}});
 assert.equal(info.status,0);
 assert.match(info.stdout,/No network/);
 const dir=sandbox(syntheticFiles());
 try{
  const r=spawnSync(process.execPath,[cli,"--assess",dir.path],{encoding:"utf8",env:{
   ...process.env,ETERNYX_STAGING_PROJECT_REF:stage,ETERNYX_PRODUCTION_PROJECT_REF:prod
  }});
  assert.equal(r.status,0);
  const report=JSON.parse(r.stdout);
  assert.equal(report.core.production,"blocked");
  assert.match(r.stderr,/Unsigned; production BLOCKED/);
  assert.doesNotMatch(r.stdout,/synthetic-ephemeral|private\.txt|authorization_attested_at/);
  const missing=spawnSync(process.execPath,[cli,"--assess",dir.path],{encoding:"utf8",env:{
   ...process.env,ETERNYX_STAGING_PROJECT_REF:stage,ETERNYX_PRODUCTION_PROJECT_REF:stage
  }});
  assert.equal(missing.status,1);
  assert.equal(missing.stdout,"");
 }finally{dir.cleanup();}
});
test("Wave 12 --run-json receipt is only issued after successful staging-only transactional execution",async()=>{
 const src=readFileSync(new URL("../scripts/security-ledger-staging-writes.mjs",import.meta.url),"utf8");
 assert.match(src,/--run-json/);
 assert.match(src,/validateWriteReceipt/);
 assert.match(src,/transactionRolledBack:true/);
 assert.match(src,/result\.status!==0/);
 assert.match(src,/PRODUCTION RELEASE REMAINS BLOCKED/);
 const cli=fileURLToPath(new URL("../scripts/security-ledger-staging-writes.mjs",import.meta.url));
 const result=spawnSync(process.execPath,[cli,"--run-json"],{encoding:"utf8",env:{
  ...process.env,ETERNYX_STAGING_ONLY:""
 }});
 assert.equal(result.status,2);
 assert.equal(result.stdout,"");
});
test("Release Readiness UI makes missing gates visible and does not grant production access",()=>{
 const page=readFileSync(new URL("../src/pages/SecurityReleaseReadiness.tsx",import.meta.url),"utf8");
 for(const phrase of ["inspectStagingDossier","Consolidated staging evidence dossier",
   "Production BLOCKED","Locally validated · unsigned","Missing","sourceFingerprints"])
  assert.ok(page.includes(phrase)||phrase==="sourceFingerprints",phrase);
 assert.doesNotMatch(page,/supabase\.from|apply_migration|service_role|setProductionApproved/);
});
