import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,link,mkdtemp,readFile,rm,symlink,writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyStableOfflineCaseSnapshot} from
  "../infrastructure/cyber-range/provider/firecracker-case-snapshot.mjs";
import {OFFLINE_STAGE_PREFIX} from
  "../infrastructure/cyber-range/provider/firecracker-offline-atomic-publish.mjs";

const owner=process.getuid?.()??0;
const MODE=["guest-vsock","watchdog-900","guest-and-watchdog"];
const BASE=[
  "operator-report.json","operator-public.pem",
  "host-preflight.json","image-provenance.json",
  "supervisor-journal.txt","cgroup-death.txt",
];
const guest="guest-challenge.txt",expiry="timeout-result.txt";
async function caseFolder(callback){
  const folder=await mkdtemp(join(tmpdir(),"eternyx-case-snapshot-"));
  try{
    await chmod(folder,0o700);
    return await callback(folder);
  }finally{await rm(folder,{recursive:true,force:true});}
}
const required=mode=>[
  ...BASE,
  ...(mode.includes("guest")?[guest]:[]),
  ...(mode.includes("watchdog")?[expiry]:[]),
];
async function populate(folder,mode,extras={}){
  const expectedFiles={};
  for(const name of required(mode)){
    expectedFiles[name]=Buffer.from("FIXTURE ONLY: "+name+"\n");
  }
  Object.assign(expectedFiles,extras);
  for(const [name,raw] of Object.entries(expectedFiles))
    await writeFile(join(folder,name),raw,{mode:0o600,flag:"wx"});
  return expectedFiles;
}
const audit=(folder,mode,expectedFiles,other={})=>
  verifyStableOfflineCaseSnapshot({folder,owner,mode,expectedFiles,...other});

test("all three proof modes are stable across complete two-pass case reads",async()=>{
  for(const mode of MODE){
    await caseFolder(async folder=>{
      const expected=await populate(folder,mode);
      const original=Object.fromEntries(Object.entries(expected)
        .map(([name,data])=>[name,Buffer.from(data)]));
      const status=await audit(folder,mode,original);
      assert.equal(status.stableAcrossSecondPass,true);
      assert.equal(status.verifiedSourceFiles,required(mode).length);
      assert.equal(status.checkedPrivateDirectory,true);
      assert.equal(status.noStagingRemnants,true);
      assert.equal(status.productionReady,false);
      assert.equal(status.publicLabsEnabled,false);
      assert.equal(status.physicalHostAttested,false);
      assert.equal(status.independentSourceAuthenticityVerified,false);
    });
  }
});
test("complete reviewer chain, importer journal and mode sidecars can be rechecked",async()=>{
  await caseFolder(async folder=>{
    const extras={
      ".operator-import.pending.json":Buffer.from("PENDING\n"),
      ".operator-import.committed.json":Buffer.from("COMMITTED\n"),
      "review-verdict.json":Buffer.from("signed-review\n"),
      "review-disposition.json":Buffer.from("signed-disposition\n"),
      "case-checkpoint.json":Buffer.from("checkpoint\n"),
      "runtime-supervisor.json":Buffer.from("supervisor\n"),
      "runtime-cgroup.json":Buffer.from("cgroup\n"),
      "runtime-guest.json":Buffer.from("guest\n"),
      "runtime-timeout.json":Buffer.from("timeout\n"),
      "review-runtime-addendum.json":Buffer.from("addendum\n"),
    };
    const files=await populate(folder,"guest-and-watchdog",extras);
    const verified=await audit(folder,"guest-and-watchdog",files);
    assert.equal(verified.verifiedSourceFiles,BASE.length+2+Object.keys(extras).length);
    const tampered={...files};
    tampered["review-disposition.json"]=Buffer.from("unexpected edit\n");
    await assert.rejects(audit(folder,"guest-and-watchdog",tampered),
      /changed across review snapshot/);
  });
});
test("same-sized modifications between first collection and second read fail",async()=>{
  await caseFolder(async folder=>{
    const expected=await populate(folder,"guest-and-watchdog");
    for(const file of required("guest-and-watchdog")){
      const original=expected[file];
      const mutated=Buffer.from(original);
      mutated[0]=mutated[0]===0x46?0x58:0x46;
      await writeFile(join(folder,file),mutated);
      await assert.rejects(audit(folder,"guest-and-watchdog",expected),
        /changed across review snapshot/);
      await writeFile(join(folder,file),original);
    }
  });
});
test("missing signed source, unsupported names and wrong proof modes fail before reading",async()=>{
  await caseFolder(async folder=>{
    const originals=await populate(folder,"guest-vsock");
    const missing={...originals};
    delete missing["operator-public.pem"];
    await assert.rejects(audit(folder,"guest-vsock",missing),
      /Missing or unexpected/);
    const wrongMode={...originals,"timeout-result.txt":Buffer.from("bad\n")};
    await assert.rejects(audit(folder,"guest-vsock",wrongMode),
      /Missing or unexpected/);
    await assert.rejects(audit(folder,"bogus",originals),/Unsupported/);
    const unsafe={...originals,"../operator-private.pem":Buffer.from("secret\n")};
    await assert.rejects(audit(folder,"guest-vsock",unsafe),/Missing or unexpected/);
    const oversized={...originals,"runtime-guest.json":Buffer.alloc(4097)};
    await assert.rejects(audit(folder,"guest-vsock",oversized),
      /Missing or unexpected/);
    const nonbinary={...originals,"review-verdict.json":"signed text"};
    await assert.rejects(audit(folder,"guest-vsock",nonbinary),
      /Missing or unexpected/);
  });
});
test("symlink or hardlink replacement is refused even if bytes match",async()=>{
  await caseFolder(async folder=>{
    const originals=await populate(folder,"watchdog-900");
    const item=join(folder,"supervisor-journal.txt");
    const replacement=join(folder,"replacement");
    await writeFile(replacement,originals["supervisor-journal.txt"],{mode:0o600});
    await rm(item);
    await symlink(replacement,item);
    await assert.rejects(audit(folder,"watchdog-900",originals),
      /Unsafe|changed|Untrusted/);
    await rm(item);
    await link(replacement,item);
    await assert.rejects(audit(folder,"watchdog-900",originals),
      /Unsafe|changed|Untrusted/);
    assert.deepEqual(await readFile(replacement),originals["supervisor-journal.txt"]);
  });
});
test("leftover staging names block snapshots and remain untouched for investigation",async()=>{
  await caseFolder(async folder=>{
    const originals=await populate(folder,"guest-vsock");
    const path=join(folder,OFFLINE_STAGE_PREFIX+"b".repeat(32)+".tmp");
    await writeFile(path,"secret interrupted bytes",{mode:0o600});
    await assert.rejects(audit(folder,"guest-vsock",originals),
      /Interrupted offline evidence staging/);
    assert.equal((await readFile(path)).toString(),"secret interrupted bytes");
  });
});
test("case folder permissions and owner are bounded; optional records require exact proof mode",async()=>{
  await caseFolder(async folder=>{
    const originals=await populate(folder,"watchdog-900");
    await assert.rejects(audit(folder,"watchdog-900",originals,{owner:owner+1}),
      /Untrusted/);
    await chmod(folder,0o755);
    await assert.rejects(audit(folder,"watchdog-900",originals),
      /Untrusted/);
  });
  await caseFolder(async folder=>{
    const originals=await populate(folder,"watchdog-900");
    await assert.rejects(audit(folder,"watchdog-900",{
      ...originals,"runtime-guest.json":Buffer.from("{}\n"),
    }),/Missing or unexpected/);
  });
});
test("original source bytes remain untouched after successful snapshot",async()=>{
  await caseFolder(async folder=>{
    const originals=await populate(folder,"guest-vsock");
    const before=Object.fromEntries(await Promise.all(
      Object.keys(originals).map(async n=>[n,await readFile(join(folder,n))])));
    await audit(folder,"guest-vsock",originals);
    for(const [name,expected] of Object.entries(before))
      assert.deepEqual(await readFile(join(folder,name)),expected);
  });
});
test("file-backed review paths enforce rechecks before each immutable signature or seal",async()=>{
  const file=new URL("../infrastructure/cyber-range/provider/firecracker-independent-review.mjs",
    import.meta.url);
  const [source,workflow,guard]=await Promise.all([
    readFile(file,"utf8"),
    readFile(new URL(
      "../.github/workflows/ctf-firecracker-hardware-acceptance.yml",
      import.meta.url),"utf8"),
    readFile(new URL("../infrastructure/cyber-range/provider/firecracker-case-snapshot.mjs",
      import.meta.url),"utf8"),
  ]);
  assert.match(source,/verifyStableOfflineCaseSnapshot/);
  assert.match(source,/recheckCaseSourceFiles\(source,owner\)/);
  assert.match(source,/recheckReviewerKeys\(keys,\{owner,privateRequired:true\}\)/);
  assert.match(source,/review-disposition\.json":reviewBytes/);
  assert.match(source,/caseSnapshot/);
  assert.match(source,/await recheckCaseSourceFiles/);
  assert.match(source,/await recheckReviewerKeys\(data\.keys/);
  assert.match(workflow,/ctf-firecracker-case-snapshot.test.mjs/);
  assert.doesNotMatch(guard,/createServer|https?:\/\/|fetch\(|startInstance/);
});
