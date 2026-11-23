import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {
  chmod,mkdtemp,readFile,rm,symlink,writeFile,lstat,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  IMPORT_PENDING,IMPORT_COMMITTED,commitHandoffImport,
  auditHandoffImport,assertNoUnfinishedHandoff,
} from "../infrastructure/cyber-range/provider/firecracker-handoff-import-journal.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const sha=x=>createHash("sha256").update(x).digest("hex");
const operatorSignerFingerprint="a".repeat(64);
const transportSha256="b".repeat(64);
const owner=process.getuid();
const receiptBytes=Buffer.from('{"signed":"offline-fixture-only","mode":"guest-vsock"}\n');
const publicPemBytes=Buffer.from(
  "-----BEGIN PUBLIC KEY-----\nOFFLINE_FAKE_FIXTURE\n-----END PUBLIC KEY-----\n");
function input(folder,other={}){
  return {folder,owner,sessionId,operatorSignerFingerprint,
    transportSha256,receiptBytes,publicPemBytes,...other};
}
async function caseDir(run){
  const folder=await mkdtemp(join(tmpdir(),"eternyx-import-journal-"));
  try{
    await chmod(folder,0o700);
    return await run(folder);
  }finally{
    await rm(folder,{recursive:true,force:true});
  }
}
test("a normal import ends with two private files and matching immutable journal",async()=>{
  await caseDir(async folder=>{
    const a=await commitHandoffImport(input(folder));
    assert.equal(a.state,"committed");
    assert.equal(a.verified,true);
    assert.equal(a.sourceFiles,2);
    assert.deepEqual(a.pendingFiles,[]);
    assert.equal((await readFile(join(folder,"operator-report.json"))).toString(),
      receiptBytes.toString());
    assert.equal((await readFile(join(folder,"operator-public.pem"))).toString(),
      publicPemBytes.toString());
    assert.equal((await lstat(join(folder,IMPORT_PENDING))).mode&0o077,0);
    assert.equal((await lstat(join(folder,IMPORT_COMMITTED))).mode&0o077,0);
    assert.deepEqual(await assertNoUnfinishedHandoff(folder,owner),
      {importCommitted:true});
    await assert.rejects(commitHandoffImport(input(folder)),/already attempted/);
    await assert.rejects(commitHandoffImport(input(folder,{resume:true})),
      /No unfinished/);
  });
});
test("separately approved resume recovers an interrupted second file without overwriting first",async()=>{
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    const preserved=join(folder,"operator-report.json");
    const before=await lstat(preserved);
    // Simulate a crash immediately before writing the second file and
    // durable commit marker. Only the TEST deletes throwaway files.
    await rm(join(folder,IMPORT_COMMITTED));
    await rm(join(folder,"operator-public.pem"));
    await assert.rejects(assertNoUnfinishedHandoff(folder,owner),/Unfinished/);
    const partial=await auditHandoffImport(input(folder));
    assert.equal(partial.state,"pending");
    assert.deepEqual(partial.pendingFiles,["operator-public.pem"]);
    assert.equal(partial.verified,false);
    await assert.rejects(commitHandoffImport(input(folder)),
      /already attempted/);
    const result=await commitHandoffImport(input(folder,{resume:true}));
    assert.equal(result.state,"committed");
    assert.equal(result.verified,true);
    const after=await lstat(preserved);
    assert.equal(after.ino,before.ino);
    assert.equal(after.mtimeMs,before.mtimeMs);
    assert.deepEqual(await assertNoUnfinishedHandoff(folder,owner),
      {importCommitted:true});
  });
});
test("altered existing input can NEVER be overwritten on recovery",async()=>{
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    await rm(join(folder,IMPORT_COMMITTED));
    await writeFile(join(folder,"operator-report.json"),"tampered\n");
    await assert.rejects(commitHandoffImport(input(folder,{resume:true})),
      /Conflicting reviewer|differs|changed/);
    await assert.rejects(assertNoUnfinishedHandoff(folder,owner),/Unfinished/);
    await assert.rejects(auditHandoffImport(input(folder)),/differs/);
    await assert.rejects(lstat(join(folder,IMPORT_COMMITTED)),
      {code:"ENOENT"});
  });
});
test("recovery cannot reuse a journal for a new session, signer or transport hash",async()=>{
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    await rm(join(folder,IMPORT_COMMITTED));
    for(const bad of [
      {sessionId:"c726a7dc-4e18-4113-bf51-d7147c581002"},
      {operatorSignerFingerprint:"c".repeat(64)},
      {transportSha256:"d".repeat(64)},
      {receiptBytes:Buffer.from("new unrelated receipt")},
    ]){
      await assert.rejects(commitHandoffImport(input(folder,{
        ...bad,resume:true,
      })),/mismatch|differ/);
    }
  });
});
test("foreign pre-existing files block first import before journaling",async()=>{
  await caseDir(async folder=>{
    await writeFile(join(folder,"operator-report.json"),receiptBytes,{
      mode:0o600,
    });
    await assert.rejects(commitHandoffImport(input(folder)),
      /Existing reviewer input/);
    await assert.rejects(lstat(join(folder,IMPORT_PENDING)),
      {code:"ENOENT"});
  });
});
test("committed marker without pending marker and malformed or altered journal are unsafe",async()=>{
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    await rm(join(folder,IMPORT_PENDING));
    await assert.rejects(auditHandoffImport(input(folder)),/missing its start/);
  });
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    await writeFile(join(folder,IMPORT_PENDING),"bad json\n");
    await assert.rejects(auditHandoffImport(input(folder)));
    await assert.rejects(assertNoUnfinishedHandoff(folder,owner));
  });
});
test("reviewer must refuse completed journals whose files changed or disappeared",async()=>{
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    await rm(join(folder,"operator-public.pem"));
    await assert.rejects(assertNoUnfinishedHandoff(folder,owner),/missing|differ/);
    await assert.rejects(auditHandoffImport(input(folder)),/missing/);
  });
  await caseDir(async folder=>{
    await commitHandoffImport(input(folder));
    await chmod(join(folder,"operator-public.pem"),0o666);
    await assert.rejects(auditHandoffImport(input(folder)),/Unsafe|Untrusted/);
  });
});
test("symlinked case, symlinked journal and writable directory cannot be accepted",async()=>{
  await caseDir(async folder=>{
    const alias=folder+"-symlink";
    try{
      await symlink(folder,alias);
      await assert.rejects(commitHandoffImport(input(alias)),/not privately owned/);
    }finally{await rm(alias,{force:true});}
    await chmod(folder,0o777);
    await assert.rejects(commitHandoffImport(input(folder)),/not privately owned/);
  });
  await caseDir(async folder=>{
    await writeFile(join(folder,"fake-marker"),"payload");
    await symlink(join(folder,"fake-marker"),join(folder,IMPORT_PENDING));
    await assert.rejects(auditHandoffImport(input(folder)),/Unsafe/);
  });
});
test("legacy manually staged review cases remain allowed but cannot claim import verification",async()=>{
  await caseDir(async folder=>{
    const x=await assertNoUnfinishedHandoff(folder,owner);
    assert.deepEqual(x,{legacyManual:true});
    await assert.rejects(auditHandoffImport(input(folder)),/no transaction journal/);
    const legacy=await auditHandoffImport(input(folder,{allowLegacy:true}));
    assert.equal(legacy.state,"legacy-manual-no-journal");
    assert.equal(legacy.verified,false);
  });
});
test("manual recovery requires a different root approval, and CI stays entirely offline",async()=>{
  const script=new URL("../scripts/cyber-range-operator-handoff.mjs",import.meta.url);
  for(const mode of [
    ["--resume-import","--confirm-import-recovery"],
    ["--import","--confirm-offline-receipt"],
  ]){
    const c=spawnSync(process.execPath,[script.pathname,...mode,
      "--session",sessionId,
      "--operator-sha",operatorSignerFingerprint,
      "--transport-sha",transportSha256,
    ],{env:{PATH:process.env.PATH},encoding:"utf8"});
    assert.equal(c.status,1);
    assert.match(c.stderr,/Offline signed receipt handoff refused/);
  }
  const source=await readFile(script,"utf8");
  const workflow=await readFile(new URL(
    "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
    import.meta.url),"utf8");
  assert.match(source,/--resume-import/);
  assert.match(source,/--audit-import/);
  assert.match(source,/I_APPROVE_OFFLINE_REVIEWER_IMPORT_RECOVERY/);
  assert.match(workflow,/ctf-firecracker-handoff-import-journal.test.mjs/);
  assert.doesNotMatch(source,/createServer|fetch\(|https?:\/\/|startInstance/);
});
