import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {createEvidence,verifyEvidence,admitEvidence,publicKeyFingerprint,submitLearnerAssessment,transcriptDigest}
  from "../infrastructure/cyber-range/provider/http-assessment-evidence.mjs";
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const trustedFingerprint=publicKeyFingerprint(privateKey);
const now=1700000000000;
const expected={userId:"11111111-1111-4111-8111-111111111111",sessionId:"123e4567-e89b-42d3-a456-426614174001",
  instanceRef:"fixture-a",bundleSha:"a".repeat(64),nonce:"b".repeat(64)};
const responses=[["200 OK",'{"status":"ready"}'],["200 OK",'{"role":"learner","data":"synthetic"}'],
 ["403 Forbidden",'{"error":"forbidden"}'],["404 Not Found",'{"error":"not_found"}'],
 ["405 Method Not Allowed",'{"error":"method_not_allowed"}']].map(([status,body],i)=>Buffer.from(
 "HTTP/1.1 "+status+"\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n"+
 (i===4?"Allow: GET\r\n":"")+"Content-Length: "+Buffer.byteLength(body)+"\r\n\r\n"+body));
const envelope=createEvidence({expected,responses,privateKey,now});
const input={envelope,expected,responses,publicKey,trustedFingerprint,now};
test("actual signature, external key pin and exact workload binding",()=>{
 const result=verifyEvidence(input);
 assert.equal(result.p_instance,expected.instanceRef);
 assert.equal(result.p_nonce,expected.nonce);
 assert.equal(result.p_facts["authorization-denial"],403);
});
test("static transcript digest is unique to session and observation challenge",()=>{
 assert.notEqual(transcriptDigest(expected,responses),transcriptDigest({...expected,nonce:"c".repeat(64)},responses));
});
test("reject every changed identity field, expiry and future observation",()=>{
 for(const [k,v] of Object.entries({userId:"22222222-2222-4222-8222-222222222222",
 sessionId:"123e4567-e89b-42d3-a456-426614174002",instanceRef:"fixture-b",bundleSha:"c".repeat(64),nonce:"d".repeat(64)})){
 assert.throws(()=>verifyEvidence({...input,expected:{...expected,[k]:v}}));
 }
 for(const clock of [now-1,now+30000])assert.throws(()=>verifyEvidence({...input,now:clock}));
});
test("reject foreign signing key, mutation, added fields and altered raw responses",()=>{
 const other=generateKeyPairSync("ed25519");
 for(const change of [{publicKey:other.publicKey},{trustedFingerprint:"f".repeat(64)},
 {envelope:{...envelope,signature:"0".repeat(128)}},{envelope:{...envelope,payload:{...envelope.payload,score:6}}},
 {responses:[Buffer.from("invalid"),...responses.slice(1)]}]){
 assert.throws(()=>verifyEvidence({...input,...change}));
 }
});
test("RPC receives only verified evidence, no call on tampering or false acknowledgement",async()=>{
 const calls=[];const rpc=async(...args)=>{calls.push(args);return {data:true,error:null}};
 await assert.rejects(admitEvidence({...input,now:now+30000,rpc}));
 assert.equal(calls.length,0);
 assert.equal((await admitEvidence({...input,rpc})).recorded,true);
 assert.equal(calls[0][0],"ctf_http_record_observation");
 await assert.rejects(admitEvidence({...input,rpc:async()=>({data:false,error:null})}));
});
const answers={"authorization-denial":403,"unknown-resource":404,"method-restriction":405,
 "allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"};
const body={sessionId:expected.sessionId,accessToken:"rx_"+"1".repeat(64),answers};
const user={id:expected.userId,is_anonymous:false};
test("learner identity exclusively from verified user and grant hash",async()=>{
 let args;const result=await submitLearnerAssessment({user,body,rpc:async(name,p)=>{
 assert.equal(name,"ctf_http_submit_assessment");args=p;
 return {data:{ok:true,sessionId:expected.sessionId,correct:5,total:6,submittedAt:new Date(now).toISOString()},error:null};
 }});
 assert.equal(args.p_user,user.id);assert.match(args.p_grant_hash,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(args).includes(body.accessToken));assert.equal(result.correct,5);
});
test("anonymous, forged score, owner, extra field and wrong response rejected",async()=>{
 let count=0;const rpc=async()=>{count++;return {data:{ok:true,sessionId:"other",correct:6,total:6,submittedAt:new Date(now).toISOString()}}};
 for(const patch of [{user:{...user,is_anonymous:true}},{body:{...body,userId:user.id}},
 {body:{...body,score:6}},{body:{...body,answers:{...answers,score:6}}}]){
 await assert.rejects(submitLearnerAssessment({user,body,rpc,...patch}));
 }
 assert.equal(count,0);
 await assert.rejects(submitLearnerAssessment({user,body,rpc}));assert.equal(count,1);
});
