import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {runDockerLabDrills,DOCKER_DRILL_CASES} from "../src/lib/dockerLabDrills.mjs";
import {signDrillReport,verifyDrillEnvelope} from "../src/lib/dockerLabDrillEvidence.mjs";
import {evaluateDockerLabPreflight} from "../src/lib/dockerLabPreflight.mjs";
function fixture(callback){
 const dir=mkdtempSync(join(tmpdir(),"eternyx-assurance-test-"));
 const secret=join(dir,"agent.pem"),pinned=join(dir,"trusted.pub");
 const pair=generateKeyPairSync("ed25519");
 writeFileSync(secret,pair.privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
 chmodSync(secret,0o600);
 writeFileSync(pinned,pair.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"),{mode:0o600});
 try{return callback({dir,secret,pinned});}finally{rmSync(dir,{recursive:true,force:true});}
}
test("eleven real offline journal, crash and sandbox drills all pass",()=>{
 const report=runDockerLabDrills();
 assert.equal(report.mode,"offline-synthetic-only");
 assert.equal(report.summary.total,DOCKER_DRILL_CASES.length);
 assert.equal(report.summary.total,11);
 assert.equal(report.summary.failed,0);
 assert.ok(report.cases.every(x=>x.result==="pass"));
 assert.equal(report.actualDockerContacted,false);
 assert.equal(report.executionAuthorized,false);
 assert.equal(report.remoteServerVerified,false);
});
test("real Ed25519 signature verifies offline with independently pinned public key",()=>{
 fixture(({secret,pinned})=>{
  const evidence=signDrillReport(runDockerLabDrills(),secret);
  const result=verifyDrillEnvelope(evidence,pinned);
  assert.equal(result.signatureVerified,true);
  assert.equal(result.allDrillsPassed,true);
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.independentHostAttestation,false);
 });
});
test("tampered drill status, timestamp, summary or signature fails verification",()=>{
 fixture(({secret,pinned})=>{
  const evidence=signDrillReport(runDockerLabDrills(),secret);
  assert.throws(()=>verifyDrillEnvelope({...evidence,report:{...evidence.report,mode:"live"}},pinned));
  assert.throws(()=>verifyDrillEnvelope({...evidence,report:{...evidence.report,createdAt:"tomorrow"}},pinned));
  assert.throws(()=>verifyDrillEnvelope({...evidence,report:{...evidence.report,summary:{...evidence.report.summary,failed:1}}},pinned));
  assert.throws(()=>verifyDrillEnvelope({...evidence,signature:"A".repeat(86)},pinned));
  const copy=structuredClone(evidence);
  copy.report.cases[0].result="fail";copy.report.summary.passed--;copy.report.summary.failed++;
  assert.throws(()=>verifyDrillEnvelope(copy,pinned),/digest mismatch/);
 });
});
test("signing key substitution and noncanonical public keys are rejected",()=>{
 fixture(({secret,pinned})=>{
  const evidence=signDrillReport(runDockerLabDrills(),secret);
  const another=generateKeyPairSync("ed25519");
  writeFileSync(pinned,another.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"));
  assert.throws(()=>verifyDrillEnvelope(evidence,pinned),/rejected/);
  writeFileSync(pinned,"A".repeat(43)+"=");
  assert.throws(()=>verifyDrillEnvelope(evidence,pinned));
 });
});
test("preflight fails on unsafe remote connection, flags, overrides, or old Node",()=>{
 const safe=evaluateDockerLabPreflight({env:{},nodeVersion:"22.0.0"});
 assert.equal(safe.passed,true);
 assert.equal(safe.executionAuthorized,false);
 assert.equal(safe.remoteServerVerified,false);
 assert.equal(safe.realDockerEngineChecked,false);
 assert.equal(safe.checks.find(x=>x.id==="local_key_files")?.status,"not_checked");
 for(const env of [
  {DOCKER_HOST:"tcp://198.51.100.12:2375"},{DOCKER_CONTEXT:"prod"},
  {DOCKER_CONFIG:"/tmp/custom-config"},{DOCKER_TLS_VERIFY:"1"},
  {ETERNYX_REMOTE_LAB_ENABLED:"true"},{DOCKER_REMOTE_LAB_ENABLED:"true"}
 ])assert.equal(evaluateDockerLabPreflight({env,nodeVersion:"22.0.0"}).passed,false);
 assert.equal(evaluateDockerLabPreflight({env:{},nodeVersion:"18.0.0"}).passed,false);
});
test("paired agent-private and server-public key preflight rejects absent mate",()=>{
 fixture(({secret,pinned})=>{
  assert.equal(evaluateDockerLabPreflight({env:{},nodeVersion:"22.0.0",agentKeyPath:secret,pinnedServerKeyPath:pinned}).passed,true);
  assert.equal(evaluateDockerLabPreflight({env:{},nodeVersion:"22.0.0",agentKeyPath:secret}).passed,false);
 });
});
test("signed drill, verification and unsafe preflight work in real subprocesses",()=>{
 fixture(({secret,pinned,dir})=>{
  const cli=fileURLToPath(new URL("../scripts/docker-lab-assurance.mjs",import.meta.url));
  const env={...process.env,DOCKER_HOST:"",DOCKER_CONTEXT:"",DOCKER_CONFIG:"",
   DOCKER_TLS_VERIFY:"",DOCKER_CERT_PATH:"",
   ETERNYX_REMOTE_LAB_ENABLED:"false",DOCKER_REMOTE_LAB_ENABLED:"false"};
  const drill=spawnSync(process.execPath,[cli,"drill","--sign-key",secret],{encoding:"utf8",env,timeout:15000});
  assert.equal(drill.status,0,drill.stderr);
  const evidencePath=join(dir,"evidence.json");
  writeFileSync(evidencePath,drill.stdout,{mode:0o600});
  const verified=spawnSync(process.execPath,[cli,"verify",evidencePath,pinned],{encoding:"utf8",env,timeout:15000});
  assert.equal(verified.status,0,verified.stderr);
  assert.equal(JSON.parse(verified.stdout).signatureVerified,true);
  const good=spawnSync(process.execPath,[cli,"preflight"],{encoding:"utf8",env,timeout:15000});
  assert.equal(good.status,0,good.stderr);
  const unsafe=spawnSync(process.execPath,[cli,"preflight"],{encoding:"utf8",
   env:{...env,DOCKER_HOST:"tcp://127.0.0.1:2375"},timeout:15000});
  assert.equal(unsafe.status,1);
 });
});
test("assurance runner and preflight cannot contact Docker or network",()=>{
 const files=["../scripts/docker-lab-assurance.mjs","../src/lib/dockerLabDrills.mjs","../src/lib/dockerLabPreflight.mjs"];
 for(const path of files){
  const source=readFileSync(new URL(path,import.meta.url),"utf8");
  assert.doesNotMatch(source,/spawnSync\(["']docker|execSync|fetch\(|Deno\.Command|docker\.sock/);
 }
});
