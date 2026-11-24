import test from "node:test";
import assert from "node:assert/strict";
import {APPROVAL,runDormantHttpAcceptance} from "../scripts/labs-staging-dormant-http.mjs";
const env={ETERNYX_LABS_DORMANT_HTTP_CONSENT:APPROVAL,ETERNYX_LABS_STAGING_REF:"mhodwvypfbxafamkrgsk",ETERNYX_LABS_PRODUCTION_REF:"wcncuarekaofmfurbtbh"};
const replies=[
 [405,{error:"Method not allowed"}],[503,{error:"Range worker endpoint is disabled"}],
 [405,{authorized:false}],[503,{authorized:false}],[401,{message:"Missing authorization header"}]
];
const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
test("five exact staging probes send no credentials or valid mutation payload",async()=>{
 let count=0;
 const result=await runDormantHttpAcceptance(env,async(url,opt)=>{
  assert.match(url,/^https:\/\/mhodwvypfbxafamkrgsk\.supabase\.co\/functions\/v1\/ctf-range-(?:worker|access-check|access)$/);
  assert.equal(opt.credentials,"omit");assert.equal(opt.redirect,"error");
  assert.deepEqual(Object.keys(opt.headers).sort(),opt.method==="POST"?["Accept","Content-Type"]:["Accept"]);
  assert.equal(opt.body,opt.method==="POST"?"{}":undefined);
  return json(...replies[count++]);
 });
 assert.equal(count,5);assert.equal(result.checks.length,5);
 assert.equal(result.issuerAuthenticatedLockVerified,false);assert.equal(result.releaseAuthorized,false);
});
test("unapproved or production target never reaches network",async()=>{
 for(const patch of [{ETERNYX_LABS_DORMANT_HTTP_CONSENT:"DENY"},{ETERNYX_LABS_STAGING_REF:"wcncuarekaofmfurbtbh"}]){
  let calls=0;await assert.rejects(runDormantHttpAcceptance({...env,...patch},async()=>{calls++;}),/approval_or_target/);assert.equal(calls,0);
 }
});
test("generic failure, extra fields, redirect and excessive response are not acceptance",async()=>{
 for(const bad of [()=>json(500,{error:"Method not allowed"}),()=>json(405,{error:"Method not allowed",extra:true}),
  ()=>json(405,{error:"Method not allowed"},{"cache-control":"public"}),()=>json(302,{},{"location":"https://example.invalid"}),
  ()=>json(405,{error:"x".repeat(3000)})]){
  await assert.rejects(runDormantHttpAcceptance(env,async()=>bad()));
 }
});
test("issuer rejection is not proof of authenticated source lock",async()=>{
 let count=0;await assert.rejects(runDormantHttpAcceptance(env,async()=>++count===5?json(503,{error:"Hosted cyber range access is not enabled"}):json(...replies[count-1])),/issuer_gateway_denial/);
});
