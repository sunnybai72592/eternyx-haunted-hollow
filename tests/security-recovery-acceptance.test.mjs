import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
 RECOVERY_PACKET_SCHEMA,RECOVERY_EVIDENCE_IDS,
 validateRecoveryOperatorPlan,calculateRecoveryMetrics,buildRecoveryPacket,
 parseRecoveryPacketJson
} from "../src/lib/securityRecoveryEvidence.mjs";
import {
 reviewLedgerMigrationCandidate,CANDIDATE_PREAMBLE
} from "../scripts/security-ledger-candidate-review.mjs";
import {
 assessRecoveryFolder,checkLocalCandidate,FILES
} from "../scripts/security-recovery-acceptance.mjs";
import {sourceReleasePreflight,EXPECTED_IDS} from "../scripts/security-ledger-catalog-gate.mjs";
import {buildMigrationObservation} from "../scripts/security-staging-migration-history.mjs";
import {RECOVERY_REQUIRED} from "../src/lib/securityStagingRecoveryReadiness.mjs";

const stage="stagingabcd",recovery="recoverabcd",production="prodexample";
const observedAt="2026-11-23T12:00:00.000Z";
const hashes=s=>createHash("sha256").update(s).digest("hex");
const root=new URL("../",import.meta.url);
const source=()=>sourceReleasePreflight();
const paths={
 source:fileURLToPath(new URL("../scripts/sql/staged-security-case-ledger.sql",import.meta.url)),
 query:fileURLToPath(new URL("../scripts/sql/security-staging-migration-history.sql",import.meta.url)),
};
const timeline={
 backupCompletedAt:"2026-11-23T09:00:00.000Z",
 incidentDeclaredAt:"2026-11-23T09:10:00.000Z",
 restoreStartedAt:"2026-11-23T09:12:00.000Z",
 serviceRestoredAt:"2026-11-23T09:45:00.000Z",
 newestRecoveredDataAt:"2026-11-23T09:04:00.000Z"
};
const blank=()=>Object.fromEntries(RECOVERY_EVIDENCE_IDS.map(k=>[k,null]));
function plan(restore=true){
 const files=blank();
 if(restore){
  files["recoverable-backup-reference"]=hashes("backups-only-synthetic");
  files["restore-execution"]=hashes("restore-only-synthetic");
  files["restore-integrity"]=hashes("integrity-only-synthetic");
  files["recovery-metrics"]=hashes("rto-rpo-operator-claimed");
 }
 return {schema:"eternyx.cybersecurity.recovery-operator-plan.v1",
  stagingRef:stage,recoveryRef:recovery,productionRef:production,
  observedAt,timeline:restore?timeline:Object.fromEntries(Object.keys(timeline).map(k=>[k,null])),
  artifactDigests:files,
  limitations:[
   "The operator plan has no independent authenticated signature and no verified backup restoration.",
   "Supplied times and file checksums are local claims, not real external execution attestations.",
  ]};
}
function localDir(files={}){
 const folder=mkdtempSync(join(tmpdir(),"eternyx-wave16-"));
 for(const [name,content] of Object.entries(files))writeFileSync(join(folder,name),content);
 return {folder,clear:()=>rmSync(folder,{recursive:true,force:true})};
}
function build(input=plan(),extra={}){
 const s=source();
 return buildRecoveryPacket(input,{
  ledgerSha256:s.sourceSha256,
  migrationQuerySha256:hashes(readFileSync(paths.query,"utf8")),...extra
 });
}
function fakeHistory(ref=stage){
 const checks=["history-engagement","history-evidence","table-engagement","table-evidence",
  "table-ledger-assets","table-ledger-findings","table-ledger-evidence","table-ledger-history"]
  .map((id,i)=>id+"|"+(i<4?"present":"missing")).join("\n")+"\n";
 return buildMigrationObservation({stagingProjectRef:ref,productionProjectRef:production},checks,{now:observedAt});
}
const catalogText=EXPECTED_IDS.map(id=>id+"|pass").join("\n")+"\n";

test("eight independent recovery categories exist and unsigned approval cannot be supplied",()=>{
 assert.deepEqual(RECOVERY_EVIDENCE_IDS,RECOVERY_REQUIRED.map(x=>x.id));
 assert.equal(RECOVERY_EVIDENCE_IDS.length,8);
 assert.equal(RECOVERY_EVIDENCE_IDS.at(-1),"independent-approval");
 assert.equal(validateRecoveryOperatorPlan(plan()).recoveryRef,recovery);
 assert.throws(()=>validateRecoveryOperatorPlan({
  ...plan(),artifactDigests:{...plan().artifactDigests,["independent-approval"]:hashes("not-an-authenticated-signature")}
 }));
});
test("RTO and RPO are computed from exact ordered event timestamps; missing metrics remain missing",()=>{
 assert.deepEqual(calculateRecoveryMetrics(timeline),{rtoSeconds:2100,rpoSeconds:360});
 assert.deepEqual(calculateRecoveryMetrics(plan(false).timeline),{rtoSeconds:null,rpoSeconds:null});
 for(const changed of [
  {...timeline,restoreStartedAt:"2026-11-23T09:01:00.000Z"},
  {...timeline,newestRecoveredDataAt:"2026-11-23T09:12:00.000Z"},
  {...timeline,serviceRestoredAt:"2026-11-22T09:45:00.000Z"},
  {...timeline,restoreStartedAt:null},
  {...timeline,incidentDeclaredAt:"2030-01-01"},
 ])assert.throws(()=>calculateRecoveryMetrics(changed));
});
test("isolated projects, review timestamps, backup and restore digests are mandatory",()=>{
 const p=plan();
 for(const x of [
  {...p,recoveryRef:stage},{...p,productionRef:recovery},
  {...p,observedAt:"2025/01/01"},{...p,unknown:"ready"},
  {...p,artifactDigests:{...p.artifactDigests,["restore-execution"]:"not-sha"}},
  {...p,artifactDigests:{...p.artifactDigests,["restore-execution"]:null}},
  {...p,artifactDigests:{...p.artifactDigests,["recoverable-backup-reference"]:null}},
 ])assert.throws(()=>validateRecoveryOperatorPlan(x));
});
test("recovery packet always blocks production and explains limits of unsigned evidence",()=>{
 const packet=build();
 assert.equal(packet.schema,RECOVERY_PACKET_SCHEMA);
 assert.equal(packet.metrics.rtoSeconds,2100);
 assert.equal(packet.metrics.rpoSeconds,360);
 assert.equal(packet.productionAuthorized,false);
 assert.equal(packet.independentApproval,false);
 assert.equal(packet.catalog.status,"missing");
 assert.equal(packet.migration.status,"missing");
 assert.equal(packet.requirements.at(-1).status,"missing");
 assert.deepEqual(parseRecoveryPacketJson(JSON.stringify(packet)),packet);
 assert.doesNotMatch(JSON.stringify(packet),/password|Bearer |storage_path|private\.txt/i);
});
test("tampering with labels, RTO, cross-project identities or release state is rejected",()=>{
 const p=build();
 const variants=[
  {...p,productionAuthorized:true},{...p,independentApproval:true},
  {...p,trust:"signed"},{...p,recoveryRef:stage},
  {...p,metrics:{...p.metrics,rtoSeconds:0}},
  {...p,requirements:p.requirements.slice(1)},
  {...p,requirements:p.requirements.map(x=>x.id==="independent-approval"?
     {...x,status:"operator-supplied-unsigned",sha256:hashes("forged")}:x)},
  {...p,sourceHashes:{...p.sourceHashes,ledgerProposal:"bad"}},
  {...p,extra:true}
 ];
 for(const x of variants)assert.throws(()=>parseRecoveryPacketJson(JSON.stringify(x)));
 assert.throws(()=>parseRecoveryPacketJson("{}"));
 assert.throws(()=>parseRecoveryPacketJson("x".repeat(50*1024)));
});
test("Wave 15 migration source SHA and staging refs must match and observed recovery catalog is exactly 60 checks",()=>{
 const good=fakeHistory();
 const raw=JSON.stringify(good);
 const packet=build(plan(),{
  migration:{payload:good,sha256:hashes(raw)},
  catalogDigest:hashes(catalogText)
 });
 assert.equal(packet.migration.status,"operator-reported-history-only");
 assert.equal(packet.catalog.checkCount,60);
 assert.equal(packet.catalog.status,"operator-reported-60-check-pass");
 assert.throws(()=>build(plan(),{
  migration:{payload:fakeHistory("differentstage"),sha256:hashes(raw)}
 }));
 const different={...good,sourceSha256:"f".repeat(64)};
 assert.throws(()=>build(plan(),{migration:{payload:different,sha256:hashes(JSON.stringify(different))}}));
});
test("candidate review requires exact CLI preamble and reviewed SQL bytes without deploying",()=>{
 const proposal=readFileSync(paths.source,"utf8");
 const baseline=["20261111210000_pentest_engagement_management.sql",
 "20261111220000_pentest_evidence_and_audit.sql"];
 const name="20261124123456_security_case_indexed_ledger.sql";
 const good=reviewLedgerMigrationCandidate({
  filename:name,proposal,candidate:CANDIDATE_PREAMBLE+proposal,baselineMigrations:baseline
 });
 assert.equal(good.localByteMatch,true);
 assert.equal(good.appliedToStaging,false);
 assert.equal(good.productionAuthorized,false);
 for(const item of [
  {filename:"not-a-migration.sql"},
  {candidate:CANDIDATE_PREAMBLE+proposal+"\n-- extra statement"},
  {candidate:proposal},
  {candidate:CANDIDATE_PREAMBLE+proposal.replace("CREATE TABLE","DROP TABLE")},
  {filename:"20261110123456_security_case_indexed_ledger.sql"},
 ]) assert.throws(()=>reviewLedgerMigrationCandidate({
  filename:name,proposal,candidate:CANDIDATE_PREAMBLE+proposal,baselineMigrations:baseline,...item
 }));
});
test("offline CLI accepts controlled operator reports but keeps authority blocked; rejects cross-project and bad catalog",()=>{
 const inputs={
  [FILES.plan]:JSON.stringify(plan()),
  [FILES.migration]:JSON.stringify(fakeHistory()),
  [FILES.catalog]:catalogText
 };
 const temp=localDir(inputs);
 try{
  const packet=assessRecoveryFolder(temp.folder,{
   stagingRef:stage,recoveryRef:recovery,productionRef:production,now:"2026-11-23T12:10:00.000Z"
  });
  assert.equal(packet.catalog.checkCount,60);
  assert.equal(packet.migration.status,"operator-reported-history-only");
  assert.equal(packet.productionAuthorized,false);
  assert.throws(()=>assessRecoveryFolder(temp.folder,{
   stagingRef:stage,recoveryRef:production,productionRef:production,now:observedAt
  }));
  writeFileSync(join(temp.folder,FILES.catalog),catalogText.replace("table:pentest_evidence|pass","table:pentest_evidence|fail"));
  assert.throws(()=>assessRecoveryFolder(temp.folder,{stagingRef:stage,recoveryRef:recovery,productionRef:production,now:observedAt}));
 }finally{temp.clear();}
});
test("CLI does not contact network for --explain or --assess and does not emit raw inputs on failures",()=>{
 const cli=fileURLToPath(new URL("../scripts/security-recovery-acceptance.mjs",import.meta.url));
 const explain=spawnSync(process.execPath,[cli,"--explain"],{encoding:"utf8"});
 assert.equal(explain.status,0);assert.match(explain.stdout,/NEVER authorizes production/);
 const missing=spawnSync(process.execPath,[cli,"--assess","/tmp/missing-wave16-fixtures"],{encoding:"utf8",env:{
  ...process.env,ETERNYX_STAGING_PROJECT_REF:stage,ETERNYX_RECOVERY_PROJECT_REF:recovery,
  ETERNYX_PRODUCTION_PROJECT_REF:production
 }});
 assert.equal(missing.status,1);assert.equal(missing.stdout,"");
 const fixture=localDir({[FILES.plan]:JSON.stringify(plan(false))});
 try{
  const result=spawnSync(process.execPath,[cli,"--assess",fixture.folder],{encoding:"utf8",env:{
   ...process.env,ETERNYX_STAGING_PROJECT_REF:stage,ETERNYX_RECOVERY_PROJECT_REF:recovery,
   ETERNYX_PRODUCTION_PROJECT_REF:production
  }});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).metrics.rtoSeconds,null);
  assert.match(result.stderr,/production BLOCKED/);
 }finally{fixture.clear();}
});
test("UI never grants production authorization and remains consistent with read-only evidence import",()=>{
 const page=readFileSync(new URL("../src/pages/SecurityReleaseReadiness.tsx",import.meta.url),"utf8");
 assert.match(page,/parseRecoveryPacketJson/);
 assert.match(page,/Isolated restore and recovery evidence/);
 assert.match(page,/Operator-supplied, unsigned recovery evidence/);
 assert.match(page,/Production release: BLOCKED/);
 assert.doesNotMatch(page,/supabase\.from|createClient\(|apply_migration/);
});
