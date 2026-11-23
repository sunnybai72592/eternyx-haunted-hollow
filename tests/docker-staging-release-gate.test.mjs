import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {verifiedDockerOwnerId}
 from "../supabase/functions/_shared/docker-owner-guard.mjs";
import {auditDockerDeploymentConfig}
 from "../supabase/functions/_shared/docker-deployment-gate.mjs";
import {DOCKER_STAGING_EVIDENCE_CHECKS,validateDockerStagingStatement,
 signDockerStagingStatement,verifyDockerStagingEnvelope}
 from "../src/lib/dockerStagingEvidence.mjs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const inputs=()=>({
 config:file("supabase/config.toml"),
 ownerControl:file("supabase/functions/docker-control/index.ts"),
 enrollment:file("supabase/functions/docker-enrollment/index.ts"),
 authHelper:file("supabase/functions/_shared/user-auth.ts"),
 ownerGuard:file("supabase/functions/_shared/docker-owner-guard.mjs"),
 dispatch:file("supabase/functions/docker-command-dispatch/index.ts"),
 dispatchHandler:file("supabase/functions/_shared/docker-dispatch-handler.mjs"),
 heartbeat:file("supabase/functions/docker-heartbeat/index.ts"),
 agent:file("scripts/docker-lab-agent.mjs")
});
const now=Date.parse("2026-11-23T12:30:00.000Z");
const owner="33333333-3333-4333-8333-333333333333";
const manifest=(checks=DOCKER_STAGING_EVIDENCE_CHECKS.map(id=>({
 id,status:"passed",evidenceSha256:"a".repeat(64)
})))=>({
 schema:"eternyx-docker-staging-operator-v1",
 environment:"isolated_staging",
 commitSha:"f".repeat(40),
 observedAt:new Date(now).toISOString(),
 checks
});
test("repository policy audit passes actual explicit Docker routing and truthful execution gate",()=>{
 const report=auditDockerDeploymentConfig(inputs());
 assert.equal(report.passed,true,JSON.stringify(report.checks.filter(c=>!c.passed)));
 assert.equal(report.independentStagingVerified,false);
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.stagingExecutionAuthorized,false);
 assert.equal(report.manualApprovalRequired,true);
 assert.ok(report.checks.length>=12);
});
test("missing/duplicate/invalid Docker JWT settings are blocked, never treated as default safe",()=>{
 const cfg=inputs();
 const without=cfg.config.replace(
  "[functions.docker-enrollment]\nverify_jwt = true\n","");
 assert.equal(auditDockerDeploymentConfig({...cfg,config:without}).passed,false);
 const switched=cfg.config.replace(
  "[functions.docker-control]\nverify_jwt = true",
  "[functions.docker-control]\nverify_jwt = false");
 assert.equal(auditDockerDeploymentConfig({...cfg,config:switched}).passed,false);
 const agentGate=cfg.config.replace(
  "[functions.docker-command-dispatch]\nverify_jwt = false",
  "[functions.docker-command-dispatch]\nverify_jwt = true");
 assert.equal(auditDockerDeploymentConfig({...cfg,config:agentGate}).passed,false);
 const repeated=cfg.config+"\n[functions.docker-control]\nverify_jwt = false\n";
 assert.equal(auditDockerDeploymentConfig({...cfg,config:repeated}).passed,false);
 const invalid=cfg.config.replace(
  "[functions.docker-control]\nverify_jwt = true",
  "[functions.docker-control]\nverify_jwt = maybe");
 assert.equal(auditDockerDeploymentConfig({...cfg,config:invalid}).passed,false);
});
test("owner authentication must derive ID from verified server-auth context, not JSON",()=>{
 const db={from:()=>({})};
 assert.equal(verifiedDockerOwnerId({id:owner,is_anonymous:false},db),owner);
 assert.equal(verifiedDockerOwnerId({id:owner},db),owner);
 for(const user of [
  null,{id:owner,is_anonymous:true},{id:"../../private"},{id:123},
  {id:"bad"},{id:null},{id:owner,is_anonymous:true,role:"authenticated"}
 ])assert.equal(verifiedDockerOwnerId(user,db),null);
 assert.equal(verifiedDockerOwnerId({id:owner,is_anonymous:false},null),null);
 const cfg=inputs();
 assert.equal(auditDockerDeploymentConfig({...cfg,
  ownerControl:cfg.ownerControl.replace("authenticateUser(req)","JSON.parse(req.body)")}).passed,false);
 assert.equal(auditDockerDeploymentConfig({...cfg,
  authHelper:cfg.authHelper.replace("supabase.auth.getUser(match[1])","supabase.auth.getSession()")}).passed,false);
});
test("default-disabled, signature, nonce, and opt-in protections cannot be removed silently",()=>{
 const cfg=inputs();
 for(const patch of [
  {dispatch:cfg.dispatch.replace('Deno.env.get("DOCKER_REMOTE_LAB_ENABLED")==="true"','true')},
  {dispatchHandler:cfg.dispatchHandler.replace("isEnabled()!==true","false")},
  {heartbeat:cfg.heartbeat.replace("crypto.subtle.verify(","crypto.subtle.digest(")},
  {agent:cfg.agent.replace('process.argv[5]==="--execute-lab"',"true")},
  {ownerControl:cfg.ownerControl+" Deno.Command "}
 ]){
  assert.equal(auditDockerDeploymentConfig({...cfg,...patch}).passed,false);
 }
});
test("operator statement strictly requires real staging evidence IDs, hashes and no additional fields",()=>{
 const good=manifest();
 assert.equal(validateDockerStagingStatement(good).checks.length,10);
 for(const change of [
  {...good,environment:"production"},
  {...good,commitSha:"not-a-commit"},
  {...good,secret:"cannot include credentials"},
  {...good,checks:good.checks.slice(1)},
  {...good,checks:[...good.checks.slice(0,-1),{...good.checks[9],id:good.checks[0].id}]},
  {...good,checks:good.checks.map((c,i)=>i===0?{...c,evidenceSha256:"missing"}:c)},
  {...good,observedAt:"tomorrow"}
 ])assert.throws(()=>validateDockerStagingStatement(change));
});
test("real Ed25519 signed operator staging report verifies but NEVER authorizes production",()=>{
 const pair=generateKeyPairSync("ed25519");
 const evidence=signDockerStagingStatement(manifest(),pair.privateKey);
 const result=verifyDockerStagingEnvelope(evidence,pair.publicKey,now+1000);
 assert.equal(result.signatureVerified,true);
 assert.equal(result.classification,"operator_attested_review_candidate");
 assert.equal(result.stagingAssertionsComplete,true);
 assert.equal(result.evidenceFresh,true);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.stagingDockerExecutionAuthorized,false);
 assert.equal(result.actualStagingTestsIndependentlyVerified,false);
 assert.equal(result.manualSecurityReviewRequired,true);
});
test("missing checks or stale/future operator notes cannot be mistaken for release approval",()=>{
 const pair=generateKeyPairSync("ed25519");
 const checks=manifest().checks.map((c,i)=>i===3?{id:c.id,status:"not_run",evidenceSha256:null}:c);
 const incomplete=signDockerStagingStatement(manifest(checks),pair.privateKey);
 const state=verifyDockerStagingEnvelope(incomplete,pair.publicKey,now);
 assert.equal(state.classification,"incomplete_or_stale");
 assert.ok(state.missingChecks.includes("agent_signature_and_revocation"));
 const old=signDockerStagingStatement(manifest(),pair.privateKey);
 assert.equal(verifyDockerStagingEnvelope(old,pair.publicKey,now+86400001).evidenceFresh,false);
 assert.equal(verifyDockerStagingEnvelope(old,pair.publicKey,now-300001).evidenceFresh,false);
});
test("tampered report content, digest, signature and substituted signer key are rejected",()=>{
 const first=generateKeyPairSync("ed25519"),other=generateKeyPairSync("ed25519");
 const proof=signDockerStagingStatement(manifest(),first.privateKey);
 assert.throws(()=>verifyDockerStagingEnvelope(proof,other.publicKey,now));
 assert.throws(()=>verifyDockerStagingEnvelope({...proof,sha256:"0".repeat(64)},first.publicKey,now));
 assert.throws(()=>verifyDockerStagingEnvelope({...proof,signature:"A".repeat(86)},first.publicKey,now));
 assert.throws(()=>verifyDockerStagingEnvelope({...proof,statement:{...proof.statement,
   commitSha:"1".repeat(40)}},first.publicKey,now));
 assert.throws(()=>verifyDockerStagingEnvelope({...proof,additional:true},first.publicKey,now));
});
test("CLI inspects repo, signs and verifies local evidence in real subprocesses",()=>{
 const root=mkdtempSync(join(tmpdir(),"eternyx-docker-staging-"));
 try{
  const cli=fileURLToPath(new URL("../scripts/docker-staging-release-gate.mjs",import.meta.url));
  const run=args=>spawnSync(process.execPath,[cli,...args],{
   encoding:"utf8",timeout:10000});
  const inspect=run(["inspect"]);
  assert.equal(inspect.status,0,inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).passed,true);
  const pair=generateKeyPairSync("ed25519");
  const statementPath=join(root,"statement.json"),secretPath=join(root,"operator.pem"),
   pinnedPath=join(root,"operator.pub"),envelopePath=join(root,"envelope.json");
  // Tests use current wall-clock time to satisfy the CLI's freshness window.
  const value={...manifest(),observedAt:new Date().toISOString()};
  writeFileSync(statementPath,JSON.stringify(value),{mode:0o600});
  writeFileSync(secretPath,pair.privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
  chmodSync(secretPath,0o600);
  writeFileSync(pinnedPath,pair.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"),{mode:0o600});
  const signed=run(["sign",statementPath,secretPath]);
  assert.equal(signed.status,0,signed.stderr);
  assert.equal(JSON.parse(signed.stdout).statement.schema,value.schema);
  writeFileSync(envelopePath,signed.stdout,{mode:0o600});
  const verified=run(["verify",envelopePath,pinnedPath]);
  assert.equal(verified.status,0,verified.stderr);
  assert.equal(JSON.parse(verified.stdout).productionDeploymentAuthorized,false);
  const attacker=generateKeyPairSync("ed25519");
  writeFileSync(pinnedPath,attacker.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64url"));
  assert.equal(run(["verify",envelopePath,pinnedPath]).status,1);
  assert.equal(run(["verify","./relative/evidence.json",pinnedPath]).status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("release gate contains no network, Docker execution or automatic deployment calls",()=>{
 const source=file("scripts/docker-staging-release-gate.mjs");
 assert.doesNotMatch(source,/fetch\(|docker\.sock|execFileSync|spawnSync|Deno\.Command|supabase functions deploy/);
 assert.match(source,/productionDeploymentAuthorized/);
});
