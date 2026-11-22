import test from "node:test";
import assert from "node:assert/strict";
import {chmod,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readFile as readRepoFile} from "node:fs/promises";
import {approvedHardwareManifest} from
  "../infrastructure/cyber-range/provider/firecracker-hardware-acceptance.mjs";
import {supervisedVmUnit} from
  "../infrastructure/cyber-range/provider/firecracker-systemd-supervisor.mjs";
import {
  createHardwareEvidence,verifyHardwareEvidence,
  saveHardwareEvidence,loadHardwareEvidence,
} from "../infrastructure/cyber-range/provider/firecracker-hardware-evidence.mjs";

const sessionId="123e4567-e89b-42d3-a456-426614174001";
const manifest=approvedHardwareManifest({
  kernelSha256:"a".repeat(64),rootfsSha256:"b".repeat(64),
});
const config={
  sessionId,manifest,uid:22001,gid:22001,
  jailerSha256:"c".repeat(64),firecrackerSha256:"d".repeat(64),
};
const result={
  sessionId,unit:supervisedVmUnit(sessionId),
  accepted:true,bootApiAccepted:true,offlineNetnsAttested:true,
  localKvmGuestObserved:true,teardownVerified:true,
  independentDeadlineSeconds:900,publicLabsEnabled:false,
  cloudProvisioningAllowed:false,providerHardLimitVerified:false,
};
const receipt=()=>createHardwareEvidence({
  config,result,capturedAt:"2026-11-22T20:00:00.000Z",
});
const altered=r=>JSON.parse(JSON.stringify(r));

test("local evidence binds exact session, runtime, pins and teardown claims",()=>{
  const r=receipt();
  assert.equal(r.payload.unit,supervisedVmUnit(sessionId));
  assert.equal(r.payload.pins.kernelSha256,manifest.kernelSha256);
  assert.deepEqual(verifyHardwareEvidence(r,{expectedSessionId:sessionId}),{
    sessionId,checksum:r.checksum,integrityVerified:true,
    operatorSelfReported:true,guestServiceVerified:false,
    fullExpiryDrillVerified:false,
    independentImageProvenanceVerified:false,productionReady:false,
  });
});
test("receipt creation refuses absent cleanup or any public/cloud overclaim",()=>{
  for(const edits of [
    {teardownVerified:false},{accepted:false},
    {cloudProvisioningAllowed:true},{providerHardLimitVerified:true},
    {independentDeadlineSeconds:899},{unit:"different.service"},
    {bootApiAccepted:false},{localKvmGuestObserved:false},
  ]){
    assert.throws(()=>createHardwareEvidence({config,
      result:{...result,...edits}}),/without verified/);
  }
});
test("receipt creation requires exact pinned image policy and valid identities",()=>{
  assert.throws(()=>createHardwareEvidence({
    config:{...config,manifest:{...manifest,egressPolicy:"allow"}},
    result,
  }));
  assert.throws(()=>createHardwareEvidence({
    config:{...config,uid:0},result,
  }));
  assert.throws(()=>createHardwareEvidence({
    config:{...config,firecrackerSha256:"bad"},result,
  }));
});
test("checksum detects edits; strong integrity does not confer authenticity",()=>{
  for(const mutate of [
    r=>r.payload.observed.teardownVerified=false,
    r=>r.payload.pins.rootfsSha256="f".repeat(64),
    r=>r.payload.notVerified.full900SecondExpiryDrill=true,
    r=>r.payload.guestPolicy.publicLabsEnabled=true,
    r=>r.payload.operatorUid=0,
    r=>r.payload.extra="unapproved",
    r=>r.checksum="f".repeat(64),
  ]){
    const r=altered(receipt());mutate(r);
    assert.throws(()=>verifyHardwareEvidence(r));
  }
  assert.throws(()=>verifyHardwareEvidence(receipt(),
    {expectedSessionId:"c726a7dc-4e18-4113-bf51-d7147c581002"}),/mismatch/);
});
test("read-only verifier and exclusive operator-owned receipt storage",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"eternyx-hardware-evidence-"));
  const expectedUid=process.getuid();
  try{
    await chmod(dir,0o700);
    const r=receipt();
    const saved=await saveHardwareEvidence(r,{dir,expectedUid});
    assert.equal(saved.recorded,true);
    assert.equal(saved.checksum,r.checksum);
    const stored=await readFile(join(dir,sessionId+".json"),"utf8");
    assert.equal(JSON.parse(stored).checksum,r.checksum);
    const check=await loadHardwareEvidence(sessionId,{dir,expectedUid});
    assert.equal(check.integrityVerified,true);
    assert.equal(check.productionReady,false);
    await assert.rejects(saveHardwareEvidence(r,{dir,expectedUid}),
      /EEXIST|exist/i);
    await writeFile(join(dir,sessionId+".json"),
      stored.replace("operator-self-reported","tampered-and-untrusted"));
    await assert.rejects(loadHardwareEvidence(sessionId,{dir,expectedUid}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("symlinked and writable directories are never accepted",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"eternyx-evidence-security-"));
  const alias=dir+"-link";
  const expectedUid=process.getuid();
  try{
    await chmod(dir,0o700);
    await symlink(dir,alias);
    await assert.rejects(saveHardwareEvidence(receipt(),
      {dir:alias,expectedUid}),/private and operator-owned/);
    await chmod(dir,0o777);
    await assert.rejects(saveHardwareEvidence(receipt(),
      {dir,expectedUid}),/private and operator-owned/);
  }finally{
    await rm(alias,{force:true});
    await rm(dir,{recursive:true,force:true});
  }
});
test("CLI evidence mode remains entirely local and no KVM boots in CI",async()=>{
  const cli=await readRepoFile(new URL(
    "../scripts/cyber-range-microvm-hardware-acceptance.mjs",import.meta.url),
    "utf8");
  assert.match(cli,/--save-evidence/);
  assert.match(cli,/--verify-evidence/);
  assert.match(cli,/loadHardwareEvidence/);
  assert.match(cli,/saveHardwareEvidence/);
  assert.doesNotMatch(cli,/createServer|cloudProvisioningAllowed:true/);
});
