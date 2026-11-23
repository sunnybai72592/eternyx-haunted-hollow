import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  gitBlobSha,classifyOwner,validateBaseline,auditCollisionGroups,
  inventoryMigrations,reconcileAppliedHistory,readonlyHistoryQuery,generateReport,
} from "../scripts/automation-migration-collision-forensics.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const stage="abcdefghijklmnopqrst", production="wcncuarekaofmfurbtbh";
const now=new Date("2026-11-23T16:00:00Z");
const record=(name,content)=>({name,gitBlobSha:gitBlobSha(content)});
const a=record("20261123030000_automation_issue.sql","create table xyz();");
const b=record("20261123030000_docker_issue.sql","create table qwe();");
const baseline=()=>validateBaseline({schema:"eternyx-migration-collision-baseline-v1",
  duplicateVersions:[{version:"20261123030000",files:[a,b]}]});
const remote=(appliedVersions=[])=>({
  source:"operator_supplied_complete_read_only_history",projectRef:stage,
  complete:true,capturedAt:"2026-11-23T15:59:00Z",appliedVersions,
});

test("actual repository contains exactly 11 pinned versions and 25 distinct conflict files",async()=>{
  const report=await generateReport();
  assert.equal(report.schema,"eternyx-migration-collision-forensics-v1");
  assert.ok(report.sqlFileCount>=108);
  assert.equal(report.collisionVersionCount,11);
  assert.equal(report.collisionFileCount,25);
  assert.equal(report.baselineVersionCount,11);
  assert.deepEqual(report.sourceDefects,[]);
  assert.equal(report.sourceBaselineValid,true);
  assert.equal(report.mode,"source_only");
  assert.equal(report.stagingDeploymentBlocked,true);
  assert.equal(report.productionDeploymentBlocked,true);
  assert.equal(report.deploymentAuthorized,false);
  assert.equal(report.dataMigrated,false);
  assert.equal(report.commandsExecuted,false);
  assert.equal(report.verifiedAppliedMigrationHistory,false);
  assert.ok(report.collisions.every(g=>g.files.length>=2));
  assert.ok(report.collisions.some(g=>g.files.length===4));
  assert.equal(report.operatorHistory.evidence,"unavailable");
  assert.ok(report.operatorHistory.statuses.every(g=>g.classification==="remote_history_unavailable"));
});

test("Git SHA-1 blob identity detects historical content changes, not just filenames",()=>{
  assert.equal(gitBlobSha("hello\n"),"ce013625030ba8dba906f756967f9e9ca394464a");
  assert.notEqual(gitBlobSha("hello\n"),gitBlobSha("hello"));
  assert.notEqual(gitBlobSha("abc"),gitBlobSha("abcd"));
  assert.throws(()=>gitBlobSha({foo:"bar"}));
});
test("baseline rejects duplicated groups, duplicated members, forged hashes, cross-version files",()=>{
  assert.throws(()=>validateBaseline(null));
  assert.throws(()=>validateBaseline({schema:"wrong",duplicateVersions:[]}));
  assert.throws(()=>validateBaseline({schema:"eternyx-migration-collision-baseline-v1",
    duplicateVersions:[{version:"20261123030000",files:[a,a]}]}));
  assert.throws(()=>validateBaseline({schema:"eternyx-migration-collision-baseline-v1",
    duplicateVersions:[{version:"20261123030000",files:[a,{...b,gitBlobSha:"BAD"}]}]}));
  assert.throws(()=>validateBaseline({schema:"eternyx-migration-collision-baseline-v1",
    duplicateVersions:[{version:"20261123030000",files:[a,
      {...b,name:"20261123040000_docker_issue.sql"}]}]}));
});
test("old collision is acknowledged but must never certify the staging database",()=>{
  const r=auditCollisionGroups([a,b],baseline());
  assert.equal(r.sourceBaselineValid,true);
  assert.deepEqual(r.defects,[]);
  assert.equal(r.groups[0].files[0].owner,"Automation");
  assert.equal(r.groups[0].files[1].owner,"Docker");
  assert.equal(r.groups[0].appliedStatus,"unknown_until_independent_staging_db_history");
});
test("adding a brand-new collision version must break the reviewed baseline",()=>{
  const x=record("20261124010000_service_x.sql","x");
  const y=record("20261124010000_docker_x.sql","y");
  const r=auditCollisionGroups([a,b,x,y],baseline());
  assert.equal(r.sourceBaselineValid,false);
  assert.deepEqual(r.defects,[{code:"new_collision_version",version:"20261124010000"}]);
});
test("changed collision membership and changed historical contents both cause review failures",()=>{
  const third=record("20261123030000_service_new.sql","new");
  const changed=record(b.name,"changed");
  const membership=auditCollisionGroups([a,b,third],baseline());
  assert.ok(membership.defects.some(d=>d.code==="collision_membership_changed"));
  const modified=auditCollisionGroups([a,changed],baseline());
  assert.deepEqual(modified.defects,[{
    code:"historical_collision_content_changed",
    version:"20261123030000",file:b.name,
  }]);
  const removed=auditCollisionGroups([a],baseline());
  assert.ok(removed.defects.some(d=>d.code==="historical_collision_removed_without_review"));
});
test("migration scanner fingerprints only collided SQL and accepts UUID-suffixed legacy names",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"eternyx-collision-"));
  try{
    await mkdir(path.join(dir,"supabase/migrations"),{recursive:true});
    const files={
      [a.name]:"create table xyz();",
      [b.name]:"create table qwe();",
      "20250828011106_6b94a803-f5af-4e9c-9dd5-9d8c41a74268.sql":"-- legacy uuid naming",
    };
    for(const [name,content] of Object.entries(files))
      await writeFile(path.join(dir,"supabase/migrations",name),content);
    const result=await inventoryMigrations(dir);
    assert.equal(result.sqlFileCount,3);
    assert.deepEqual(result.observed.map(x=>x.name).sort(),[a.name,b.name].sort());
    assert.deepEqual(result.observed.find(x=>x.name===a.name),a);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("even complete operator-supplied staging evidence cannot prove which collided SQL ran",()=>{
  const groups=auditCollisionGroups([a,b],baseline()).groups;
  const absent=reconcileAppliedHistory(groups,remote(),stage,production,now);
  assert.equal(absent.projectBound,true);
  assert.equal(absent.evidence,"operator_supplied_unverified");
  assert.equal(absent.statuses[0].classification,"not_listed_in_operator_history_still_requires_review");
  const present=reconcileAppliedHistory(groups,remote(["20261123030000"]),stage,production,now);
  assert.equal(present.statuses[0].classification,"applied_version_ambiguous_which_sql_executed");
  const noEvidence=reconcileAppliedHistory(groups,null,null,null,now);
  assert.equal(noEvidence.statuses[0].classification,"remote_history_unavailable");
});
test("foreign project, production target, stale, partial, duplicate and fabricated evidence fail closed",()=>{
  const groups=auditCollisionGroups([a,b],baseline()).groups;
  for(const config of [
    [remote(),production,production],
    [remote(),"https://evil.example",production],
    [{...remote(),projectRef:production},stage,production],
    [{...remote(),complete:false},stage,production],
    [{...remote(),source:"source_only"},stage,production],
    [{...remote(),appliedVersions:["20261123030000","20261123030000"]},stage,production],
    [{...remote(),capturedAt:"2026-11-21T15:59:00Z"},stage,production],
    [{...remote(),capturedAt:"2026-11-23T17:00:00Z"},stage,production],
  ]){
    assert.throws(()=>reconcileAppliedHistory(groups,...config,now));
  }
});
test("query generator uses a finite, validated read-only history selection",()=>{
  const groups=auditCollisionGroups([a,b],baseline()).groups;
  const sql=readonlyHistoryQuery(groups);
  assert.equal(sql,"SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('20261123030000') ORDER BY version;");
  assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|DO \$\$/i);
  assert.throws(()=>readonlyHistoryQuery([{version:"' OR TRUE --"}]));
  assert.throws(()=>readonlyHistoryQuery([]));
});
test("script is exclusively offline: no subprocess, Supabase client, network, SQL mutation or secrets",async()=>{
  const text=await readFile(path.join(root,"scripts/automation-migration-collision-forensics.mjs"),"utf8");
  assert.doesNotMatch(text,/\bfetch\s*\(|\bspawn\s*\(|\bexecFile\s*\(|\bexec\s*\(|process\.env|service_role|supabase\.from\(/);
  const report=await generateReport();
  assert.equal(report.schemaChanged,false);
  assert.equal(report.historiesRepaired,false);
  assert.equal(report.credentialsAccessed,false);
  assert.equal(report.readOnlyQuery.startsWith("SELECT version FROM "),true);
  assert.equal(report.stagingDeploymentBlocked,true);
});
