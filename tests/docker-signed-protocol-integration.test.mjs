import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,randomBytes,sign,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {agentActionMessage,labPermitMessage,parseLabPermit}
 from "../supabase/functions/_shared/docker-command-contract.mjs";
import {verifySignedDockerAgentAction}
 from "../supabase/functions/_shared/docker-action-verifier.mjs";
import {verifyPinnedDockerLabPermit} from "../src/lib/dockerLabPermitGuard.mjs";
import {validateDockerReceiptAcknowledgement} from "../src/lib/dockerLabReceiptGuard.mjs";
const agentId="33333333-3333-4333-8333-333333333333";
const claimId="44444444-4444-4444-8444-444444444444";
const requestId="55555555-5555-4555-8555-555555555555";
const otherId="66666666-6666-4666-8666-666666666666";
const now=Date.parse("2026-11-22T20:00:10.000Z"),at="2026-11-22T20:00:10.000Z";
const pub=key=>Buffer.from(key.export({type:"spki",format:"der"})).subarray(12).toString("base64url");
function setup(){
 const pair=generateKeyPairSync("ed25519");
 return {pair,identity:{id:agentId,status:"key_verified",revoked_at:null,public_key:pub(pair.publicKey)}};
}
function action(kind,privateKey){
 const raw={kind,agentId,signedAt:at,nonce:randomBytes(32).toString("base64url"),
   claimId:kind==="claim"?null:claimId,
   outcome:kind==="receipt"?"completed":null,signature:"A".repeat(86)};
 raw.signature=sign(null,Buffer.from(agentActionMessage(raw)),privateKey).toString("base64url");
 return raw;
}
function permit(overrides={}){
 return {agentId,claimId,requestId,operation:"stop",containerId:"a".repeat(64),
   issuedAt:"2026-11-22T20:00:05.000Z",expiresAt:"2026-11-22T20:00:20.000Z",...overrides};
}
function signedPermit(privateKey,overrides={}){
 const result=permit(overrides);
 return {permit:result,signature:sign(null,Buffer.from(labPermitMessage(result)),privateKey).toString("base64url")};
}
const expected=p=>Object.fromEntries(["agentId","claimId","requestId","operation","containerId"].map(k=>[k,p[k]]));
test("Node WebCrypto verifies actual Ed25519 signed claim, authorize and receipt actions",async()=>{
 const {pair,identity}=setup();
 for(const kind of ["claim","authorize","receipt"]){
  const result=await verifySignedDockerAgentAction(action(kind,pair.privateKey),identity,now,webcrypto);
  assert.equal(result.ok,true,kind);assert.equal(result.action.kind,kind);
 }
});
test("signature binds action, identity, claim, nonce, outcome and timestamp",async()=>{
 const {pair,identity}=setup(),raw=action("receipt",pair.privateKey);
 for(const modification of [
  {agentId:otherId},{claimId:otherId},{kind:"authorize",outcome:null},
  {nonce:randomBytes(32).toString("base64url")},{outcome:"failed"},
  {signedAt:"2026-11-22T20:00:09.000Z"},{signature:"A".repeat(86)}
 ])assert.equal((await verifySignedDockerAgentAction({...raw,...modification},identity,now,webcrypto)).ok,false);
});
test("pending, revoked, substituted and malformed identities fail closed",async()=>{
 const {pair,identity}=setup(),raw=action("claim",pair.privateKey);
 const swapped=setup();
 for(const alt of [
  {...identity,status:"pending"},{...identity,status:"revoked",revoked_at:at},
  {...identity,revoked_at:at},{...identity,id:otherId},
  {...identity,public_key:swapped.identity.public_key},{...identity,public_key:"invalid"},null
 ])assert.equal((await verifySignedDockerAgentAction(raw,alt,now,webcrypto)).ok,false);
 for(const modification of [
  {extra:"shell"},{signature:raw.signature+"="},{nonce:raw.nonce+"="}
 ])assert.equal((await verifySignedDockerAgentAction({...raw,...modification},identity,now,webcrypto)).ok,false);
});
test("signed action skew and expiry bounds reject stale and future credentials",async()=>{
 const {pair,identity}=setup(),raw=action("claim",pair.privateKey);
 assert.equal((await verifySignedDockerAgentAction(raw,identity,now+45000,webcrypto)).ok,true);
 assert.equal((await verifySignedDockerAgentAction(raw,identity,now+45001,webcrypto)).reason,"action_expired");
 assert.equal((await verifySignedDockerAgentAction(raw,identity,now-30000,webcrypto)).ok,true);
 assert.equal((await verifySignedDockerAgentAction(raw,identity,now-30001,webcrypto)).reason,"action_expired");
});
test("server signing key and exact pinned permit verification work with real Ed25519",()=>{
 const server=generateKeyPairSync("ed25519"),p=permit();
 assert.deepEqual(verifyPinnedDockerLabPermit(signedPermit(server.privateKey),expected(p),server.publicKey,now),p);
});
test("pinned permit rejects wrong signing key, identity, operation, target, signature and clock",()=>{
 const server=generateKeyPairSync("ed25519"),wrong=generateKeyPairSync("ed25519"),p=permit(),signed=signedPermit(server.privateKey);
 assert.throws(()=>verifyPinnedDockerLabPermit(signed,expected(p),wrong.publicKey,now));
 for(const modification of [{agentId:otherId},{claimId:otherId},{requestId:otherId},
  {operation:"restart"},{containerId:"b".repeat(64)}])
  assert.throws(()=>verifyPinnedDockerLabPermit(signed,{...expected(p),...modification},server.publicKey,now));
 assert.throws(()=>verifyPinnedDockerLabPermit(signed,expected(p),server.publicKey,Date.parse(p.expiresAt)));
 assert.throws(()=>verifyPinnedDockerLabPermit(signed,expected(p),server.publicKey,Date.parse(p.issuedAt)-5001));
 for(const modified of ["A".repeat(86),signed.signature+"="])
  assert.throws(()=>verifyPinnedDockerLabPermit({...signed,signature:modified},expected(p),server.publicKey,now));
 assert.equal(parseLabPermit(permit({expiresAt:"2026-11-22T20:00:22.000Z"})),null);
});
test("receipt acknowledgement refuses mismatched claim, outcome or fake independent verification",()=>{
 const receipt={accepted:true,claimId,status:"reported_completed",
  alreadyRecorded:false,verification:"agent_signature_only",independentExecutionAudit:false};
 assert.equal(validateDockerReceiptAcknowledgement(receipt,claimId,"completed").independentlyVerified,false);
 assert.equal(validateDockerReceiptAcknowledgement({...receipt,alreadyRecorded:true},claimId,"completed").alreadyRecorded,true);
 for(const changed of [{claimId:otherId},{status:"reported_failed"},{accepted:false},
  {alreadyRecorded:"yes"},{verification:"independent"},{independentExecutionAudit:true}])
  assert.throws(()=>validateDockerReceiptAcknowledgement({...receipt,...changed},claimId,"completed"));
 assert.throws(()=>validateDockerReceiptAcknowledgement(receipt,claimId,"executed"));
});
test("production Edge verifies actual signature BEFORE consuming a signed nonce",()=>{
 const edge=readFileSync(new URL("../supabase/functions/docker-command-dispatch/index.ts",import.meta.url),"utf8");
 const handler=readFileSync(new URL("../supabase/functions/_shared/docker-dispatch-handler.mjs",import.meta.url),"utf8");
 assert.match(edge,/createDockerDispatchHandler/);
 assert.ok(handler.indexOf("verifySignedDockerAgentAction(input,agent,clock,crypt)")>=0);
 assert.ok(handler.indexOf("verifySignedDockerAgentAction(input,agent,clock,crypt)")<
   handler.indexOf('context.rpc("docker_command_consume_nonce"'));
 assert.match(edge,/DOCKER_REMOTE_LAB_ENABLED/);
 assert.doesNotMatch(edge,/Deno\.Command|docker\.sock|spawnSync/);
});
test("operator refuses unmatched permit before claim reservation, and unmatched receipt before ack event",()=>{
 const agent=readFileSync(new URL("../scripts/docker-lab-agent.mjs",import.meta.url),"utf8");
 assert.ok(agent.indexOf("verifyPinnedDockerLabPermit(authorized,")<
   agent.indexOf("reserveLabClaim({agentId"));
 assert.ok(agent.indexOf("validateDockerReceiptAcknowledgement(ack,journal.claimId,journal.outcome)")<
   agent.indexOf('appendLabEvent(journal.claimId,"receipt_accepted")'));
 assert.ok(agent.indexOf("validateDockerReceiptAcknowledgement(receipt,permit.claimId,outcome)")<
   agent.indexOf('appendLabEvent(permit.claimId,"receipt_accepted")'));
 assert.match(agent,/const context=executeLab\?localContext\(\):null/);
 assert.doesNotMatch(agent,/shell:true/);
});
