import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,link,lstat,mkdtemp,readFile,readdir,rm,symlink,writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  OFFLINE_STAGE_PREFIX,publishOfflineEvidence,assertNoOfflineStageResidue,
} from "../infrastructure/cyber-range/provider/firecracker-offline-atomic-publish.mjs";
import {
  assertNoUnfinishedHandoff,commitHandoffImport,
} from "../infrastructure/cyber-range/provider/firecracker-handoff-import-journal.mjs";
import {readFile as source} from "node:fs/promises";

const owner=process.getuid?.()??-1;
const data=Buffer.from('{"offline":true,"source":"fixture"}\n',"utf8");
async function privateCase(cb){
  const folder=await mkdtemp(join(tmpdir(),"eternyx-atomic-publish-"));
  try{
    await chmod(folder,0o700);
    return await cb(folder);
  }finally{await rm(folder,{recursive:true,force:true});}
}
async function publish(folder,name="review-verdict.json",bytes=data){
  return publishOfflineEvidence({folder,name,data:bytes,owner});
}
const leftovers=async folder=>(await readdir(folder)).filter(
  name=>name.startsWith(OFFLINE_STAGE_PREFIX));
test("private complete visibility and final inode provenance for all seven evidence outputs",async()=>{
  const names=[
    ".operator-import.pending.json",".operator-import.committed.json",
    "operator-report.json","operator-public.pem",
    "review-verdict.json","review-disposition.json",
    "case-checkpoint.json","review-runtime-addendum.json",
  ];
  await privateCase(async folder=>{
    for(const name of names){
      const result=await publish(folder,name);
      assert.equal(result.recorded,true);
      assert.equal(result.immutableDestination,true);
      assert.equal(result.atomicVisibility,true);
      assert.equal(result.publicLabsEnabled,false);
      assert.deepEqual(await readFile(join(folder,name)),data);
      const st=await lstat(join(folder,name));
      assert.ok(st.isFile());assert.equal(st.uid,owner);
      assert.equal(st.mode&0o077,0);
      assert.equal(st.nlink,1);
      assert.equal(st.size,data.length);
      assert.deepEqual(await leftovers(folder),[]);
      await assertNoOfflineStageResidue(folder,owner);
    }
  });
});
test("immutable output is not overwritten or deleted on repeat; no temp inode survives",async()=>{
  await privateCase(async folder=>{
    await publish(folder);
    const before=await lstat(join(folder,"review-verdict.json"));
    await assert.rejects(publish(folder,"review-verdict.json",
      Buffer.from("foreign\n")),/already exists/);
    const after=await lstat(join(folder,"review-verdict.json"));
    assert.equal(after.ino,before.ino);
    assert.equal(after.mtimeMs,before.mtimeMs);
    assert.deepEqual(await readFile(join(folder,"review-verdict.json")),data);
    assert.deepEqual(await leftovers(folder),[]);
  });
});
test("parallel attempts publish exactly one complete payload without clobber",async()=>{
  await privateCase(async folder=>{
    const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>
      publish(folder,"case-checkpoint.json",Buffer.from("payload-"+i+"\n"))));
    assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(attempts.filter(x=>x.status==="rejected").length,7);
    const full=(await readFile(join(folder,"case-checkpoint.json"))).toString();
    assert.match(full,/^payload-[0-7]\n$/);
    assert.equal((await lstat(join(folder,"case-checkpoint.json"))).nlink,1);
    assert.deepEqual(await leftovers(folder),[]);
  });
});
test("existing symlink, hardlink and incomplete final are never followed or replaced",async()=>{
  await privateCase(async folder=>{
    const outside=join(folder,"unrelated-file");
    await writeFile(outside,"untrusted\n",{mode:0o600});
    await symlink(outside,join(folder,"review-verdict.json"));
    await assert.rejects(publish(folder),/already exists/);
    assert.equal((await readFile(outside)).toString(),"untrusted\n");
  });
  await privateCase(async folder=>{
    const outside=join(folder,"unrelated-file");
    await writeFile(outside,"untouched\n",{mode:0o600});
    await link(outside,join(folder,"review-disposition.json"));
    await assert.rejects(publish(folder,"review-disposition.json"),/already exists/);
    assert.equal((await readFile(outside)).toString(),"untouched\n");
  });
  await privateCase(async folder=>{
    await writeFile(join(folder,"case-checkpoint.json"),"truncated",{
      mode:0o600,
    });
    await assert.rejects(publish(folder,"case-checkpoint.json"),/already exists/);
    assert.equal((await readFile(join(folder,"case-checkpoint.json"))).toString(),
      "truncated");
  });
});
test("crash-style leftover private staging blocks publication, import and legacy review",async()=>{
  await privateCase(async folder=>{
    const stage=join(folder,OFFLINE_STAGE_PREFIX+"a".repeat(32)+".tmp");
    await writeFile(stage,"PARTIAL SECRET","utf8");
    await assert.rejects(publish(folder),/Interrupted offline evidence staging/);
    await assert.rejects(assertNoUnfinishedHandoff(folder,owner),
      /Interrupted offline evidence staging/);
    await assert.rejects(commitHandoffImport({
      folder,owner,sessionId:"123e4567-e89b-42d3-a456-426614174001",
      operatorSignerFingerprint:"a".repeat(64),
      transportSha256:"b".repeat(64),
      receiptBytes:Buffer.from("fake signed receipt"),
      publicPemBytes:Buffer.from("fake public key"),
    }),/Interrupted offline evidence staging/);
    assert.equal((await readFile(stage)).toString(),"PARTIAL SECRET");
    await assert.rejects(lstat(join(folder,".operator-import.pending.json")),
      {code:"ENOENT"});
  });
  await privateCase(async folder=>{
    await writeFile(join(folder,OFFLINE_STAGE_PREFIX+"malformed"),"unexpected");
    await assert.rejects(assertNoOfflineStageResidue(folder,owner),
      /Interrupted offline evidence staging/);
  });
});
test("no secret or temporary output can escape allowlist and size controls",async()=>{
  await privateCase(async folder=>{
    for(const name of [
      "../private-key","/etc/shadow","secret.pem",
      "operator-private.pem",".eternyx-stage-deadbeef.tmp",
    ]){
      await assert.rejects(publish(folder,name),/Unsupported or unbounded/);
    }
    await assert.rejects(publish(folder,"review-verdict.json",Buffer.alloc(0)),
      /Unsupported or unbounded/);
    await assert.rejects(publish(folder,"review-verdict.json",
      Buffer.alloc(8193)),/Unsupported or unbounded/);
    assert.deepEqual(await readdir(folder),[]);
  });
});
test("symlinked or loose-permission case paths cannot publish",async()=>{
  await privateCase(async folder=>{
    const alias=folder+"-alias";
    try{
      await symlink(folder,alias);
      await assert.rejects(publish(alias),/Untrusted offline private case directory/);
    }finally{await rm(alias,{force:true});}
    await chmod(folder,0o755);
    await assert.rejects(publish(folder),/Untrusted offline private case directory/);
    assert.deepEqual(await readdir(folder),[]);
  });
});
test("all signer and import writes route through shared atomic publishing helper",async()=>{
  const review=await source(new URL(
    "../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
    import.meta.url),"utf8");
  const journal=await source(new URL(
    "../infrastructure/cyber-range/provider/firecracker-handoff-import-journal.mjs",
    import.meta.url),"utf8");
  const workflow=await source(new URL(
    "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
    import.meta.url),"utf8");
  assert.match(review,/publishOfflineEvidence/);
  assert.match(journal,/publishOfflineEvidence/);
  assert.match(journal,/assertNoOfflineStageResidue/);
  assert.match(workflow,/ctf-firecracker-offline-atomic-publish.test.mjs/);
  assert.doesNotMatch(review,/await file\.writeFile\((?:serialized|addendum\.bytes|checkpoint\.bytes)/);
});
