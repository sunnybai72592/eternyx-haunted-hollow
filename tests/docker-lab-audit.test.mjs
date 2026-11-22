import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {generateKeyPairSync} from "node:crypto";
import {reserveLabClaim,appendLabEvent,readLabClaim} from "../src/lib/dockerLabRecovery.mjs";
import {signLabAudit,verifyLabAudit} from "../src/lib/dockerLabAttestation.mjs";
import {reconcileDockerClaim,dockerDispatchOverview} from "../supabase/functions/_shared/docker-dispatch-observability.mjs";
const agentId="33333333-3333-4333-8333-333333333333",claimId="44444444-4444-4444-8444-444444444444";
function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),"eternyx-audit-")),secret=join(dir,"secret.pem"),pub=join(dir,"pub.txt");
 const pair=generateKeyPairSync("ed25519");
 writeFileSync(secret,pair.privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600});chmodSync(secret,0o600);
 writeFileSync(pub,pair.publicKey.export({type:"spki",format:"der"}).subarray(12).toString("base64url"),{mode:0o600});
 try{return fn({dir,secret,pub});}finally{rmSync(dir,{recursive:true,force:true});}
}
function reserve(dir){return reserveLabClaim({agentId,claimId,operation:"stop",containerId:"b".repeat(64)},dir);}
test("pinned Ed25519 audit proof validates real recorded journal bytes",()=>{
 fixture(({dir,secret,pub})=>{
  reserve(dir);appendLabEvent(claimId,"attempted",dir);appendLabEvent(claimId,"completed",dir);
  const proof=signLabAudit(claimId,secret,dir);
  assert.equal(verifyLabAudit(proof,pub,dir).verified,true);
  assert.equal(verifyLabAudit(proof,pub,dir).independentDockerProof,false);
 });
});
test("modifying any journal byte or claimed outcome invalidates proof",()=>{
 fixture(({dir,secret,pub})=>{
  const path=reserve(dir),signed=signLabAudit(claimId,secret,dir);
  writeFileSync(path,readFileSync(path,"utf8").replace("stop","start"));
  assert.throws(()=>verifyLabAudit(signed,pub,dir),/match/);
  assert.throws(()=>verifyLabAudit({...signed,outcome:"completed"},pub,dir));
 });
});
test("a different pinned public key or fake signature cannot verify",()=>{
 fixture(({dir,secret,pub})=>{
  reserve(dir);
  const record=signLabAudit(claimId,secret,dir);
  assert.throws(()=>verifyLabAudit({...record,signature:"A".repeat(86)},pub,dir));
  const other=generateKeyPairSync("ed25519");
  writeFileSync(pub,other.publicKey.export({type:"spki",format:"der"}).subarray(12).toString("base64url"));
  assert.throws(()=>verifyLabAudit(record,pub,dir));
 });
});
test("audit proof is invalidated by later appended event",()=>{
 fixture(({dir,secret,pub})=>{
  reserve(dir);const old=signLabAudit(claimId,secret,dir);
  appendLabEvent(claimId,"attempted",dir);appendLabEvent(claimId,"failed",dir);
  assert.throws(()=>verifyLabAudit(old,pub,dir));
  assert.equal(verifyLabAudit(signLabAudit(claimId,secret,dir),pub,dir).outcome,"failed");
 });
});
test("journal rejects reordered events and unexpected fields",()=>{
 fixture(({dir})=>{
  const path=reserve(dir),r=JSON.parse(readFileSync(path,"utf8").trim());
  writeFileSync(path,[r,{at:r.at,event:"completed"},{at:r.at,event:"attempted"}].map(x=>JSON.stringify(x)).join("\n")+"\n");
  assert.throws(()=>readLabClaim(claimId,dir),/ordering/);
  writeFileSync(path,JSON.stringify({...r,extra:"bad"})+"\n");
  assert.throws(()=>readLabClaim(claimId,dir),/fields/);
 });
});
test("unreceipted claims age into manual reconciliation, never completed",()=>{
 const t=Date.parse("2026-11-22T00:00:00.000Z"),base={state:"claimed",claimed_at:new Date(t).toISOString(),authorized_at:null};
 assert.equal(reconcileDockerClaim(null,t).status,"not_dispatched");
 assert.equal(reconcileDockerClaim(base,t+1000).status,"claim_pending_permit");
 assert.equal(reconcileDockerClaim({...base,authorized_at:base.claimed_at},t+1000).status,"permit_issued_no_receipt");
 assert.equal(reconcileDockerClaim(base,t+46000).status,"receipt_pending");
 assert.equal(reconcileDockerClaim(base,t+301000).status,"reconciliation_required");
 assert.equal(reconcileDockerClaim({...base,state:"reported_completed",reported_at:base.claimed_at},t+301000).status,"agent_reported_completed");
 assert.equal(reconcileDockerClaim({...base,state:"reported_failed",reported_at:base.claimed_at},t+301000).attentionRequired,true);
});
test("bounded dashboard summary never invents live Docker state",()=>{
 const overview=dockerDispatchOverview([
  {reconciliation:{status:"reconciliation_required"}},
  {reconciliation:{status:"agent_reported_completed"}},
  {reconciliation:{status:"not_dispatched"}}
 ]);
 assert.equal(overview.requiresReconciliation,1);
 assert.equal(overview.agentReportedComplete,1);
 assert.equal(overview.notDispatched,1);
 assert.throws(()=>dockerDispatchOverview(Array.from({length:31},()=>({}))));
});
test("audit tool contains no Docker invocation or remote request",()=>{
 const s=readFileSync(new URL("../scripts/docker-lab-audit.mjs",import.meta.url),"utf8");
 assert.match(s,/signLabAudit/);assert.match(s,/verifyLabAudit/);
 assert.doesNotMatch(s,/fetch\(|spawnSync|execSync|docker\.sock/);
});
