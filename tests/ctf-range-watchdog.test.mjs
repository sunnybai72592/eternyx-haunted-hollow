import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sessionFromProject, verifyManagedContainer, planVerifiedCleanup, runOrphanSweep,
  RANGE_MAX_AGE_SECONDS, RANGE_CLEANUP_GRACE_SECONDS,
} from "../infrastructure/cyber-range/provider/orphan-watchdog.mjs";
import {
  assertLocalLaunchAllowed, engageLocalHostHalt,
} from "../infrastructure/cyber-range/provider/local-kill-switch.mjs";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const a = "123e4567-e89b-42d3-a456-426614174001";
const b = "223e4567-e89b-42d3-a456-426614174001";
const pa = "cr-" + a.replaceAll("-","");
const pb = "cr-" + b.replaceAll("-","");
const now = new Date("2026-11-22T12:00:00.000Z");

function container(project, service, ageSec, id, patch = {}) {
  return {
    Id: id.repeat(64),
    Created: new Date(now.getTime() - ageSec*1000).toISOString(),
    Config: { Labels: {
      "com.docker.compose.project": project,
      "com.docker.compose.service": service,
      "org.eternyx.range.managed": "v1",
      "org.eternyx.range.ttl_seconds": "900",
      ...(patch.labels || {}),
    }},
    ...(patch.extra || {}),
  };
}
function makeRuntime(items, {changeOnSecondScan=false,stopFails=false}={}) {
  let scans=0;
  const stopped=[];
  return {
    stopped,
    async listVerifiedManagedProjects() {
      scans++;
      if(scans === 2 && changeOnSecondScan) {
        return items.map((x,i)=>i===0 ? {...x,Id:"f".repeat(64)} : x);
      }
      return items;
    },
    async stop(sessionId) {
      stopped.push(sessionId);
      if (stopFails) throw Error("Docker stop failed");
      return true;
    },
  };
}

test("managed project IDs reconstruct validated v4 UUIDs and reject suspicious strings",()=>{
  assert.equal(sessionFromProject(pa),a);
  assert.equal(sessionFromProject(pb),b);
  for(const bad of [
    "",null,"cr-","cr-"+"e".repeat(32),"cr-"+"a".repeat(32),
    "other-"+a.replaceAll("-",""),pa+"-extra",pa.toUpperCase(),
    "cr-"+"12345678901212340123123456789012",
  ]) assert.equal(sessionFromProject(bad),null);
});

test("Docker inspection accepts only expected managed project, service, TTL and creation date",()=>{
  const good=container(pa,"gateway",1100,"a");
  assert.deepEqual(verifyManagedContainer(good),{
    id:"a".repeat(64),project:pa,service:"gateway",sessionId:a,createdAt:good.Created,
  });
  for(const bad of [
    container(pa,"database",1100,"a"),
    container(pa,"gateway",1100,"a",{labels:{"org.eternyx.range.managed":"other"}}),
    container(pa,"http-range",1100,"a",{labels:{"org.eternyx.range.ttl_seconds":"3600"}}),
    container("demo", "gateway",1100,"a"),
    {...good,Id:"not-a-real-docker-id"},
    {...good,Created:"yesterday"},
    {...good,Config:{Labels:{}}},
    {...good,Config:null},
  ]) assert.throws(()=>verifyManagedContainer(bad),/cleanup refused/);
});

test("watchdog waits through 15-minute workload lifetime plus 120-second grace",()=>{
  const items=[
    container(pa,"gateway",1020,"a"),container(pa,"http-range",1060,"b"),
    container(pb,"gateway",920,"c"),container(pb,"http-range",950,"d"),
  ];
  const plan=planVerifiedCleanup(items,now);
  assert.equal(RANGE_MAX_AGE_SECONDS,900);
  assert.equal(RANGE_CLEANUP_GRACE_SECONDS,120);
  assert.equal(plan.find(x=>x.project===pa).cleanupEligible,true);
  assert.equal(plan.find(x=>x.project===pb).cleanupEligible,false);
  assert.equal(plan.find(x=>x.project===pa).containerCount,2);
  assert.deepEqual(plan.map(x=>x.project),[pa,pb]);
  const emergency=planVerifiedCleanup(items,now,true);
  assert.ok(emergency.every(x=>x.cleanupEligible));
});

test("watchdog is read-only by default, with eligible plans but no Docker stop",async()=>{
  const runtime=makeRuntime([
    container(pa,"gateway",1100,"a"),container(pa,"http-range",1100,"b"),
    container(pb,"gateway",100,"c"),container(pb,"http-range",100,"d"),
  ]);
  const {outcome,plan}=await runOrphanSweep({runtime,now});
  assert.deepEqual(outcome,{
    scannedProjects:2,eligible:1,removed:0,dryRun:true,emergency:false,
  });
  assert.equal(plan.length,2);
  assert.deepEqual(runtime.stopped,[]);
});

test("real cleanup is refused without explicit local operator approval",async()=>{
  const runtime=makeRuntime([container(pa,"gateway",2000,"a")]);
  await assert.rejects(runOrphanSweep({runtime,now,apply:true}),/Explicit local operator approval/);
  assert.deepEqual(runtime.stopped,[]);
});

test("approved cleanup touches only an expired verified project",async()=>{
  const runtime=makeRuntime([
    container(pa,"gateway",1200,"a"),container(pa,"http-range",1200,"b"),
    container(pb,"gateway",100,"c"),container(pb,"http-range",100,"d"),
  ]);
  const {outcome}=await runOrphanSweep({runtime,now,apply:true,approved:true});
  assert.equal(outcome.removed,1);
  assert.deepEqual(runtime.stopped,[a]);
});

test("emergency cleanup stops all verified projects but never an unmanaged one",async()=>{
  const runtime=makeRuntime([
    container(pa,"gateway",5,"a"),container(pa,"http-range",5,"b"),
    container(pb,"gateway",1,"c"),container(pb,"http-range",1,"d"),
  ]);
  const {outcome}=await runOrphanSweep({
    runtime,now,apply:true,approved:true,emergency:true,
  });
  assert.equal(outcome.removed,2);
  assert.deepEqual(runtime.stopped,[a,b]);
});

test("Docker inventory changes after initial verification abort the cleanup",async()=>{
  const runtime=makeRuntime([container(pa,"gateway",2000,"a")],
    {changeOnSecondScan:true});
  await assert.rejects(runOrphanSweep({runtime,now,apply:true,approved:true}),
    /project changed/);
  assert.deepEqual(runtime.stopped,[]);
});

test("unverified/project-mixed inventory fails closed without touching containers",async()=>{
  const runtime=makeRuntime([
    container(pa,"gateway",4000,"a"),
    container("outside-project","http-range",4000,"b"),
  ]);
  await assert.rejects(runOrphanSweep({runtime,now,apply:true,approved:true}),
    /cleanup refused/);
  assert.deepEqual(runtime.stopped,[]);
  assert.throws(()=>planVerifiedCleanup([
    container(pa,"gateway",4000,"a"),container(pa,"gateway",4000,"b"),
  ],now),/Duplicate Compose service/);
});

test("watchdog errors do not pretend cleanup worked",async()=>{
  const runtime=makeRuntime([container(pa,"gateway",4000,"a")],{stopFails:true});
  await assert.rejects(runOrphanSweep({runtime,now,apply:true,approved:true}),
    /Docker stop failed/);
  assert.deepEqual(runtime.stopped,[a]);
});

test("clock anomalies reject cleanup, never fast-forward expiry",()=>{
  assert.throws(()=>planVerifiedCleanup([
    container(pa,"gateway",-3600,"a"),
  ],now),/clock inconsistent/);
  assert.throws(()=>planVerifiedCleanup(Array(101).fill(
    container(pa,"gateway",1900,"a")),now),/Invalid watchdog inventory/);
});

test("local emergency halt is durable, idempotent, and blocks new starts",async(t)=>{
  const folder=await mkdtemp(join(tmpdir(),"eternyx-watchdog-test-"));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const marker=join(folder,"operator-stop");
  assert.equal(await assertLocalLaunchAllowed(marker),true);
  assert.equal(await engageLocalHostHalt(marker),true);
  assert.equal(await engageLocalHostHalt(marker),false);
  await assert.rejects(assertLocalLaunchAllowed(marker),/emergency stop active/);
  const contents=await readFile(marker,"utf8");
  assert.match(contents,/Operator review required/);
});

test("managed Compose services are labeled and runtime does not inherit Supabase secrets",async()=>{
  const compose=await read("infrastructure/cyber-range/compose.managed.yaml");
  const runtime=await read("infrastructure/cyber-range/provider/docker-runtime.mjs");
  const cli=await read("scripts/cyber-range-watchdog.mjs");
  const pkg=JSON.parse(await read("package.json"));
  assert.equal((compose.match(/org\.eternyx\.range\.managed: "v1"/g)||[]).length,2);
  assert.equal((compose.match(/org\.eternyx\.range\.ttl_seconds: "900"/g)||[]).length,2);
  assert.match(runtime,/listVerifiedManagedProjects/);
  assert.match(runtime,/assertLocalLaunchAllowed/);
  assert.match(runtime,/--filter","label=/);
  assert.match(cli,/--emergency-stop/);
  assert.match(cli,/engageLocalHostHalt\(\)/);
  assert.match(cli,/runOrphanSweep/);
  assert.equal(pkg.scripts["range:watchdog"],"node scripts/cyber-range-watchdog.mjs");
  assert.doesNotMatch(compose,/docker\.sock|privileged:\s*true/);
});
