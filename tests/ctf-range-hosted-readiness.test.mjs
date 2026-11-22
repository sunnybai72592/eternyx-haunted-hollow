import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  validateMicrovmManifest, canonicalHostedQuote, verifySignedHostedQuote,
  quotedMaximumMicros,evaluateHostedSpend,assertNoUnverifiedHostedRuntime,
} from "../infrastructure/cyber-range/provider/hosted-readiness.mjs";
import {
  evaluateMicrovmHostCapabilities,inspectLocalMicrovmHost,
} from "../infrastructure/cyber-range/provider/microvm-host-preflight.mjs";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const session="123e4567-e89b-42d3-a456-426614174001";
const other="223e4567-e89b-42d3-a456-426614174001";
const now=new Date("2026-11-22T19:30:00Z");
const kernel="c".repeat(64),rootfs="d".repeat(64);
const manifest=()=>({
  challengePack:"http-basics-v1",image:"eternyx-http-basics-v1",
  virtualization:"firecracker",kernelSha256:kernel,rootfsSha256:rootfs,
  vcpus:1,memoryMiB:256,maxRuntimeSeconds:900,
  egressPolicy:"deny-all",metadataAccess:"blocked",
  networkIngress:"vsock-only",rootfsReadOnly:true,
  jailerEnabled:true,snapshotting:"disabled",
});
const quote=()=>({
  currency:"USD",image:"eternyx-http-basics-v1",
  sessionId:session,nonce:"b".repeat(32),
  issuedAt:"2026-11-22T19:29:30Z",expiresAt:"2026-11-22T19:32:00Z",
  fixedMicros:2_000,vCpuMicrosPerHour:50_000,
  vmMemoryMicrosPerGiBHour:20_000,
  storageMicrosPerGiBHour:1_000,
  egressMicrosPerGiB:20_000,
});
const keyPair=generateKeyPairSync("ed25519");
const pub=keyPair.publicKey.export({type:"spki",format:"pem"}).toString();
const fingerprint=createHash("sha256").update(keyPair.publicKey.export({type:"spki",format:"der"})).digest("hex");
const signed=q=>sign(null,canonicalHostedQuote(q),keyPair.privateKey).toString("base64");
const approvedBudget={singleSessionMicros:50_000,rolling24hMicros:100_000};
const ledger={spent24hMicros:10_000,reserved24hMicros:20_000};
const evaluate=(options={})=>{
  const q=options.quote??quote();
  return evaluateHostedSpend({
    quote:q,manifest:manifest(),sessionId:session,
    publicKeyPem:pub,trustedKeyFingerprintSha256:fingerprint,signatureBase64:signed(q),now,
    budget:approvedBudget,ledger,...options,
  });
};
const caps=()=>({
  linuxHost:true,archSupported:true,cpuVirtAvailable:true,
  kvmReadWrite:true,cgroupV2Available:true,
  firecrackerExecutable:true,jailerExecutable:true,
});

test("pinned immutable microVM profile accepts exactly one safe 900-second workload",()=>{
  assert.deepEqual(validateMicrovmManifest(manifest()),{
    image:"eternyx-http-basics-v1",challengePack:"http-basics-v1",
    hypervisor:"firecracker",maxRuntimeSeconds:900,vcpus:1,memoryMiB:256,
    egressAllowed:false,hostPublicPorts:0,dedicatedKernelRequired:true,
    readonlyRootfs:true,jailerRequired:true,
  });
});

test("microVM profile rejects unknown image, zero or forged hashes, extra and missing fields",()=>{
  const mutations=[
    m=>m.challengePack="arbitrary",
    m=>m.image="external-docker-image",
    m=>m.virtualization="docker",
    m=>m.kernelSha256="unverified",
    m=>m.rootfsSha256=m.kernelSha256,
    m=>m.extraArguments="console=ttyS0",
    m=>delete m.networkIngress,
    m=>m.vcpus=2,
    m=>m.memoryMiB=4096,
    m=>m.maxRuntimeSeconds=1800,
    m=>m.egressPolicy="allow-all",
    m=>m.metadataAccess="enabled",
    m=>m.networkIngress="host-tcp",
    m=>m.rootfsReadOnly=false,
    m=>m.jailerEnabled=false,
    m=>m.snapshotting="enabled",
  ];
  for(const change of mutations){
    const m=manifest();change(m);
    assert.throws(()=>validateMicrovmManifest(m),/not approved/);
  }
});

test("canonical provider quote is signed and exactly bound to a UUID and pinned image",()=>{
  const q=quote(),signature=signed(q);
  assert.equal(signature.length,88);
  assert.equal(verifySignedHostedQuote({
    quote:q,signatureBase64:signature,publicKeyPem:pub,trustedKeyFingerprintSha256:fingerprint,sessionId:session,now,
  }),true);
  assert.ok(Buffer.isBuffer(canonicalHostedQuote(q)));
});

test("signature rejects tampered price, target, freshness, nonce, currency and extra fields",()=>{
  const q=quote(),original=signed(q);
  const changes=[
    x=>x.egressMicrosPerGiB+=1,
    x=>x.fixedMicros+=1,
    x=>x.image="evil-image",
    x=>x.sessionId=other,
    x=>x.nonce="c".repeat(32),
    x=>x.currency="EUR",
    x=>x.expiresAt="2026-11-23T19:30:00Z",
    x=>x.extra=1,
  ];
  for(const mutate of changes) {
    const altered=quote();mutate(altered);
    assert.throws(()=>verifySignedHostedQuote({
      quote:altered,signatureBase64:original,
      publicKeyPem:pub,trustedKeyFingerprintSha256:fingerprint,sessionId:session,now,
    }));
  }
});

test("quote verifier rejects wrong key, malformed signatures and wrong session binding",()=>{
  const q=quote(),signature=signed(q);
  const stranger=generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString();
  for(const tweak of [
    {signatureBase64:"bad"},
    {publicKeyPem:stranger},
    {sessionId:other},
    {publicKeyPem:"not-a-key"},
  ])assert.throws(()=>verifySignedHostedQuote({
    quote:q,signatureBase64:signature,publicKeyPem:pub,trustedKeyFingerprintSha256:fingerprint,sessionId:session,now,
    ...tweak,
  }));
});

test("quote verifier rejects stale, future, expired or overly long 5m lifespan",()=>{
  const base=quote();
  const bad=[
    {...base,issuedAt:"2026-11-22T19:27:00Z"},
    {...base,issuedAt:"2026-11-22T19:30:01Z"},
    {...base,expiresAt:"2026-11-22T19:30:00Z"},
    {...base,expiresAt:"2026-11-22T20:00:00Z"},
    {...base,issuedAt:"2026-11-22T19:29:30Z",expiresAt:"2026-11-22T19:40:00Z"},
  ];
  for(const q of bad)assert.throws(()=>verifySignedHostedQuote({
    quote:q,signatureBase64:signed(q),publicKeyPem:pub,trustedKeyFingerprintSha256:fingerprint,
    sessionId:session,now,
  }),/expired|freshness/);
});

test("price quote rejects negative, fractional, infinite and unsafe numbers",()=>{
  for(const value of [-1,0.2,Infinity,NaN,Number.MAX_SAFE_INTEGER,"1200",null]){
    const q=quote();q.vCpuMicrosPerHour=value;
    assert.throws(()=>canonicalHostedQuote(q),/not valid/);
  }
});

test("worst-case quote uses integer ceil for 900 seconds CPU + memory + storage + 64MiB egress",()=>{
  const q=quote();
  // 50_000*0.25=12_500, 20_000*0.25GiB*0.25h=1250,
  // 1_000*0.25GiB*0.25h=63, egress 20_000*0.0625=1250,
  // one-time 2000 => 17063 microUSD.
  assert.equal(quotedMaximumMicros(q),17063);
  assert.equal(evaluate().quotedMicros,17063);
});

test("default zero budgets prevent ANY hosted quote authorization",()=>{
  const result=evaluate({budget:{singleSessionMicros:0,rolling24hMicros:0}});
  assert.deepEqual(result,{
    approved:false,reason:"hosted_budget_disabled",quotedMicros:0,
  });
});

test("quote can pass preflight only as NON-deploying reservation-required result",()=>{
  const result=evaluate();
  assert.equal(result.approved,true);
  assert.equal(result.quotedMicros,17063);
  assert.equal(result.reservationRequired,true);
  assert.equal(result.providerHardLimitVerified,false);
  assert.equal(result.cloudProvisioningAllowed,false);
});

test("exact maximum spend and cumulative reserved+spent are included",()=>{
  assert.equal(evaluate({
    budget:{singleSessionMicros:17063,rolling24hMicros:47063},
  }).approved,true);
  assert.deepEqual(evaluate({
    budget:{singleSessionMicros:17062,rolling24hMicros:100000},
  }),{approved:false,reason:"hosted_budget_exhausted",quotedMicros:17063});
  assert.deepEqual(evaluate({
    budget:{singleSessionMicros:50000,rolling24hMicros:47062},
  }),{approved:false,reason:"hosted_budget_exhausted",quotedMicros:17063});
});

test("budget snapshots reject negative, fractional, enormous, missing or untrusted fields",()=>{
  const invalid=[
    {budget:{singleSessionMicros:-1,rolling24hMicros:100000}},
    {budget:{singleSessionMicros:1.5,rolling24hMicros:100000}},
    {budget:{singleSessionMicros:Infinity,rolling24hMicros:100000}},
    {budget:{singleSessionMicros:100000,rolling24hMicros:100000,allowDebt:true}},
    {ledger:{spent24hMicros:NaN,reserved24hMicros:0}},
    {ledger:{spent24hMicros:0}},
    {ledger:{spent24hMicros:100, reserved24hMicros:500000000}},
  ];
  for(const props of invalid)assert.throws(()=>evaluate(props));
});

test("hosted-cloud execution never silently falls back to Docker",()=>{
  assert.equal(assertNoUnverifiedHostedRuntime({}),"local-docker");
  assert.equal(assertNoUnverifiedHostedRuntime({
    ETERNYX_RANGE_RUNTIME:"local-docker",
  }),"local-docker");
  for(const variant of [
    "firecracker","cloud","microvm","mock","aws","undefined","",null,
  ]){
    assert.throws(()=>assertNoUnverifiedHostedRuntime({
      ETERNYX_RANGE_RUNTIME:variant,
    }),/not deployed/);
  }
});

test("host microVM capabilities must include KVM, cgroup v2, executables and CPU virtualization",()=>{
  const valid=evaluateMicrovmHostCapabilities(caps());
  assert.equal(valid.basicHostSupported,true);
  assert.equal(valid.readyForPublicHostedLabs,false);
  assert.equal(valid.providerCostEnforcementAttested,false);
  assert.equal(valid.networkEgressPolicyAttested,false);
  for(const key of Object.keys(caps())){
    const c=caps();c[key]=false;
    assert.equal(evaluateMicrovmHostCapabilities(c).basicHostSupported,false,key);
  }
});

test("capability snapshot fails closed on missing, forged and unexpected fields",()=>{
  assert.throws(()=>evaluateMicrovmHostCapabilities(null));
  assert.throws(()=>evaluateMicrovmHostCapabilities({linuxHost:true}));
  const altered=caps();altered.fake=true;
  assert.throws(()=>evaluateMicrovmHostCapabilities(altered));
  const bad=caps();bad.kvmReadWrite="probably";
  assert.throws(()=>evaluateMicrovmHostCapabilities(bad));
});

test("non-destructive OS probe uses only read and access calls with injectable filesystem",async()=>{
  const accesses=[];
  const files={
    async readFile(path){
      if(path==="/proc/cpuinfo")return "flags : fpu mmx vmx sse2\n";
      if(path==="/sys/fs/cgroup/cgroup.controllers")return "cpu memory pids\n";
      throw Error("No other files may be read");
    },
    async access(path,mode){
      accesses.push([path,mode]);
      if(["/dev/kvm","/usr/local/bin/firecracker","/usr/local/bin/jailer"].includes(path))
        return;
      throw Error("Missing access");
    },
  };
  const result=await inspectLocalMicrovmHost({platform:"linux",arch:"x64",files});
  assert.equal(result.basicHostSupported,true);
  assert.equal(result.readyForPublicHostedLabs,false);
  assert.equal(accesses.length,3);
  assert.ok(accesses.some(x=>x[0]==="/dev/kvm"));
  assert.equal((await inspectLocalMicrovmHost({
    platform:"win32",arch:"x64",files,
  })).basicHostSupported,false);
});

test("KVM probe handles inaccessible device or binaries conservatively",async()=>{
  const files={
    async readFile(){return ""},
    async access(){throw Error("access denied")},
  };
  const result=await inspectLocalMicrovmHost({platform:"linux",arch:"x64",files});
  assert.equal(result.basicHostSupported,false);
  assert.equal(result.kvmReadWrite,false);
  assert.equal(result.firecrackerExecutable,false);
});

test("provider CLI, Docker runtime, and preflight preserve default-disabled hosted mode",async()=>{
  const provider=await read("scripts/cyber-range-provider.mjs");
  const docker=await read("infrastructure/cyber-range/provider/docker-runtime.mjs");
  const preflight=await read("scripts/cyber-range-microvm-preflight.mjs");
  const pkg=JSON.parse(await read("package.json"));
  assert.match(provider,/assertNoUnverifiedHostedRuntime\(process\.env\)/);
  assert.match(docker,/assertNoUnverifiedHostedRuntime\(process\.env\)/);
  assert.match(preflight,/inspectLocalMicrovmHost/);
  assert.match(preflight,/readyForPublicHostedLabs|basicHostSupported/);
  assert.equal(pkg.scripts["range:microvm:preflight"],
    "node scripts/cyber-range-microvm-preflight.mjs");
  assert.doesNotMatch(preflight,/spawnSync|execSync|curl |apt install|docker run|--deploy/);
});
