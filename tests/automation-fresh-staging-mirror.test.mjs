import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,stat,mkdir,mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {
  resolveUniqueVersions,inspectRehearsalSource,createRehearsalMirror,
  verifySourceBaseline,
} from "../scripts/automation-fresh-staging-mirror.mjs";
import {gitBlobSha} from "../scripts/automation-migration-collision-forensics.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const name=s=>"20261123050000_"+s+".sql";

test("historical repository can be modeled as a deterministic, source-pinned fresh staging mirror",async()=>{
  const info=await inspectRehearsalSource();
  assert.equal(info.schema,"eternyx-fresh-staging-migration-mirror-v1");
  assert.ok(info.sourceFileCount>=108);
  assert.equal(info.originalCollisionVersions,11);
  assert.equal(info.originalCollisionFiles,25);
  assert.equal(info.locallyReversionedFiles,14);
  assert.equal(info.proposedRenames.length,14);
  assert.equal(info.sourceBaselineValid,true);
  assert.equal(info.allMirrorTimestampsUnique,true);
  assert.equal(info.productionDeploymentAllowed,false);
  assert.equal(info.remoteMigrationsReconciled,false);
  assert.equal(info.remoteExecutionOccurred,false);
  const newer=new Set();
  for(const item of info.proposedRenames){
    assert.match(item.mirror,/^20\d{12}_.+\.sql$/);
    assert.notEqual(item.original,item.mirror);
    assert.equal(item.original.slice(0,12),item.mirror.slice(0,12));
    assert.ok(!newer.has(item.mirror.slice(0,14)));
    newer.add(item.mirror.slice(0,14));
  }
});
test("same-second duplicates receive deterministic +1/+2/+3 staging-only seconds",()=>{
  const mapping=resolveUniqueVersions([name("z"),name("b"),name("a"),name("m")]);
  assert.deepEqual(mapping.map(x=>[x.original,x.mirror]),[
    [name("a"),name("a")],
    [name("b"),"20261123050001_b.sql"],
    [name("m"),"20261123050002_m.sql"],
    [name("z"),"20261123050003_z.sql"],
  ]);
  assert.equal(mapping.filter(x=>x.changed).length,3);
});
test("no overwrite or silent skipping if a proposed second already exists",()=>{
  const already="20261123050001_existing.sql";
  assert.throws(()=>resolveUniqueVersions([name("a"),name("b"),already]),/rehearsal_existing_timestamp_conflict/);
  assert.throws(()=>resolveUniqueVersions([
    "20261123050059_a.sql","20261123050059_b.sql",
  ]),/rehearsal_minute_overflow/);
  assert.throws(()=>resolveUniqueVersions([name("a"),name("a")]),/rehearsal_invalid_source_names/);
  assert.throws(()=>resolveUniqueVersions(["../../escape.sql"]),/rehearsal_invalid_source_names/);
  assert.throws(()=>resolveUniqueVersions(["20261123050000_a.js"]),/rehearsal_invalid_source_names/);
});
test("source baseline detects any historical SQL byte mutation before generating mirrors",()=>{
  const original="20261123040000_docker_x.sql";
  const other="20261123040000_automation_y.sql";
  const rows=[{name:original,gitBlobSha:gitBlobSha("a")},
    {name:other,gitBlobSha:gitBlobSha("b")}];
  const baseline={schema:"eternyx-migration-collision-baseline-v1",
    duplicateVersions:[{version:"20261123040000",files:rows}]};
  assert.equal(verifySourceBaseline(rows,baseline).sourceBaselineValid,true);
  const changed=rows.map(x=>x.name===original?{...x,gitBlobSha:gitBlobSha("tampered")}:x);
  assert.throws(()=>verifySourceBaseline(changed,baseline),/rehearsal_baseline_drift/);
  assert.throws(()=>verifySourceBaseline([{name:"../../escape.sql",gitBlobSha:gitBlobSha("a")}],baseline),
    /rehearsal_nonstandard_sql_filename/);
});
test("fresh mirror copies all actual SQL bytes into a new isolated local directory; original files remain untouched",async()=>{
  const parent=await mkdtemp(path.join(tmpdir(),"eternyx-local-mirror-"));
  const output=path.join(parent,"fresh-staging-sql-only");
  try{
    const report=await createRehearsalMirror({output,explicitConsent:true});
    assert.equal(report.localMirrorGenerated,true);
    assert.equal(report.databaseExecuted,false);
    assert.equal(report.productionDatabaseChanged,false);
    assert.equal(report.stagingDatabaseChanged,false);
    assert.equal(report.releaseAuthorized,false);
    const manifest=JSON.parse(await readFile(path.join(output,"REHEARSAL_ONLY.json"),"utf8"));
    assert.equal(manifest.files.length,report.sourceFileCount);
    assert.equal(manifest.sourceSqlBytesChanged,false);
    assert.equal(manifest.migrationsPushed,false);
    assert.equal(manifest.schemaApplied,false);
    const versions=new Set();
    for(const row of manifest.files){
      const source=await readFile(path.join(root,"supabase/migrations",row.original));
      const mirror=await readFile(path.join(output,"supabase/migrations",row.mirror));
      assert.deepEqual(mirror,source,row.original);
      assert.equal(row.contentSha256,sha(source));
      assert.equal(row.sourceGitBlob,gitBlobSha(source));
      assert.ok(!versions.has(row.mirror.slice(0,14)),row.mirror);
      versions.add(row.mirror.slice(0,14));
    }
    assert.equal(versions.size,report.sourceFileCount);
    assert.match(await readFile(path.join(output,"DO_NOT_DEPLOY.txt"),"utf8"),/Never run against a linked/);
    assert.throws(()=>resolveUniqueVersions([]));
    await assert.rejects(createRehearsalMirror({output,explicitConsent:true}),
      /EEXIST|file already exists/);
    assert.ok((await stat(path.join(root,"supabase/migrations"))).isDirectory());
  }finally{await rm(parent,{recursive:true,force:true});}
});
test("destination must be an explicit fresh absolute path outside the source repo",async()=>{
  await assert.rejects(createRehearsalMirror({output:"relative-path",explicitConsent:true}),
    /rehearsal_unsafe_destination/);
  await assert.rejects(createRehearsalMirror({output:"/",explicitConsent:true}),
    /rehearsal_unsafe_destination/);
  await assert.rejects(createRehearsalMirror({output:path.join(root,"unsafe-output"),explicitConsent:true}),
    /rehearsal_destination_overlaps_repository/);
  await assert.rejects(createRehearsalMirror({output:path.dirname(root),explicitConsent:true}),
    /rehearsal_destination_overlaps_repository/);
  await assert.rejects(createRehearsalMirror({output:"/tmp/not-created",explicitConsent:false}),
    /rehearsal_explicit_local_only_consent_required/);
});
test("mirror module cannot deploy, access hosted databases, execute commands or read credentials",async()=>{
  const source=await readFile(path.join(root,"scripts/automation-fresh-staging-mirror.mjs"),"utf8");
  assert.doesNotMatch(source,/\bfetch\s*\(|\bspawn\s*\(|\bexecFile\s*\(|\bexecSync\s*\(|process\.env|supabase\.rpc\(/);
  assert.doesNotMatch(source,/service_role|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/);
  assert.match(source,/remoteMigrationsReconciled:false/);
  assert.match(source,/migrationsPushed:false/);
  assert.match(source,/deploymentAuthorized:false/);
});
