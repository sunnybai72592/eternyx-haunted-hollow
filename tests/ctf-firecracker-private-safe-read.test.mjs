import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {
  chmod,link,lstat,mkdtemp,readFile,rm,symlink,writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readPrivateOfflineEvidence} from
  "../infrastructure/cyber-range/provider/firecracker-private-safe-read.mjs";

const owner=process.getuid?.()??0;
async function privateFolder(callback){
  const folder=await mkdtemp(join(tmpdir(),"eternyx-safe-read-"));
  try{
    await chmod(folder,0o700);
    return await callback(folder);
  }finally{await rm(folder,{recursive:true,force:true});}
}
const read=(path,extra={})=>readPrivateOfflineEvidence({
  path,owner,maxBytes:8192,...extra,
});
test("fixed private binary evidence reads without normalization",async()=>{
  await privateFolder(async folder=>{
    const path=join(folder,"review-verdict.json");
    const raw=Buffer.from([0,13,10,255,32,34,92,0]);
    await writeFile(path,raw,{mode:0o600});
    const result=await read(path);
    assert.deepEqual(result,raw);
    assert.notEqual(result,raw);
    const st=await lstat(path);
    assert.equal(st.nlink,1);
    assert.equal(st.mode&0o077,0);
  });
});
test("only optional missing markers return null, never missing signed evidence",async()=>{
  await privateFolder(async folder=>{
    const path=join(folder,".operator-import.pending.json");
    assert.equal(await read(path,{allowMissing:true}),null);
    await assert.rejects(read(path),{code:"ENOENT"});
    await writeFile(path,"PENDING\n",{mode:0o600});
    assert.equal((await read(path,{allowMissing:true})).toString(),"PENDING\n");
  });
});
test("symlink to valid private file and dangling symlink are both rejected",async()=>{
  await privateFolder(async folder=>{
    const real=join(folder,"source");
    await writeFile(real,"SAFE\n",{mode:0o600});
    const linked=join(folder,"review-verdict.json");
    await symlink(real,linked);
    await assert.rejects(read(linked),/Untrusted|Unsafe/);
    await rm(linked);
    await symlink(join(folder,"missing-target"),linked);
    await assert.rejects(read(linked,{allowMissing:true}),/Untrusted|Unsafe/);
  });
});
test("hardlink, world-readable mode and wrong owner cannot be read",async()=>{
  await privateFolder(async folder=>{
    const real=join(folder,"source");
    await writeFile(real,"SECRET\n",{mode:0o600});
    const other=join(folder,"review-verdict.json");
    await link(real,other);
    await assert.rejects(read(other),/Untrusted|Unsafe/);
    await rm(other);
    await chmod(real,0o644);
    await assert.rejects(read(real),/Untrusted|Unsafe/);
    await chmod(real,0o600);
    await assert.rejects(read(real,{owner:owner+1}),/Untrusted|Unsafe/);
    assert.equal((await readFile(real)).toString(),"SECRET\n");
  });
});
test("empty, oversized, directory and non-regular files fail closed",async()=>{
  await privateFolder(async folder=>{
    const empty=join(folder,"empty");
    await writeFile(empty,Buffer.alloc(0),{mode:0o600});
    await assert.rejects(read(empty),/Untrusted|Unsafe/);
    const large=join(folder,"large");
    await writeFile(large,Buffer.alloc(8193,0x61),{mode:0o600});
    await assert.rejects(read(large),/Untrusted|Unsafe/);
    await assert.rejects(read(folder),/Untrusted|Unsafe/);
    if(process.platform==="linux"){
      const fifo=join(folder,"named-pipe");
      const mk=spawnSync("mkfifo",[fifo],{encoding:"utf8",timeout:1500});
      if(mk.status===0)
        await assert.rejects(read(fifo),/Untrusted|Unsafe/);
    }
  });
});
test("configuration bounds refuse unsafe filename types or unbounded input",async()=>{
  await privateFolder(async folder=>{
    const path=join(folder,"source");
    await writeFile(path,"SAFE\n",{mode:0o600});
    for(const change of [
      {path:"relative-file"},{path:null},{owner:-1},
      {maxBytes:0},{maxBytes:128*1024+1},
      {maxBytes:NaN},{allowMissing:"yes"},
    ])await assert.rejects(readPrivateOfflineEvidence({
      path,owner,maxBytes:8192,...change,
    }),/Invalid bounded/);
  });
});
test("read protection is used by reviewer signatures and import journal",async()=>{
  const base=new URL("../infrastructure/cyber-range/provider/",import.meta.url);
  const [reader,reviewer,journal,workflow]=await Promise.all([
    readFile(new URL("firecracker-private-safe-read.mjs",base),"utf8"),
    readFile(new URL("firecracker-independent-review.mjs",base),"utf8"),
    readFile(new URL("firecracker-handoff-import-journal.mjs",base),"utf8"),
    readFile(new URL("../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
  ]);
  assert.match(reader,/O_NOFOLLOW\|constants\.O_NONBLOCK/);
  assert.match(reader,/mtimeNs/);
  assert.match(reader,/ctimeNs/);
  assert.match(reader,/finalPath=await pathStat/);
  assert.match(reviewer,/readPrivateOfflineEvidence/);
  assert.match(journal,/readPrivateOfflineEvidence/);
  assert.match(workflow,/ctf-firecracker-private-safe-read.test.mjs/);
  assert.doesNotMatch(reader,/fetch\(|https?:\/\/|startInstance|createServer/);
});
