import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {config,runAcceptance,STAGING_URL} from "../scripts/ai-chat-staging-acceptance.mjs";
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const token=(sub)=>"header."+Buffer.from(JSON.stringify({role:"authenticated",iss:STAGING_URL+"/auth/v1",exp:Math.floor(Date.now()/1000)+600,sub})).toString("base64url")+".signature";
const env={AI_CHAT_STAGING_URL:STAGING_URL,AI_CHAT_STAGING_PUBLIC_KEY:"sb_publishable_fixture",AI_CHAT_STAGING_USER_A_JWT:token(A),AI_CHAT_STAGING_USER_B_JWT:token(B)};
test("configuration rejects production, secret keys, duplicate identities and unapproved positive requests",()=>{
 assert.throws(()=>config({...env,AI_CHAT_STAGING_URL:"https://production.supabase.co"},"--negative"));
 assert.throws(()=>config({...env,AI_CHAT_STAGING_PUBLIC_KEY:"sb_secret_fixture"},"--negative"));
 assert.throws(()=>config({...env,AI_CHAT_STAGING_USER_B_JWT:env.AI_CHAT_STAGING_USER_A_JWT},"--negative"));
 assert.throws(()=>config(env,"--run-one"));
 assert.equal(config(env,"--check-config").mode,"--check-config");
});
test("negative-only runner verifies two identities and never sends valid generation payload",async()=>{
 const c=config(env,"--negative");let calls=0;
 const statuses=[200,200,401,400,400];
 const result=await runAcceptance(c,async(url,options)=>{
   const i=calls++;
   assert.ok(url.startsWith(STAGING_URL+"/"));
   if(i>=2){const b=JSON.parse(options.body);assert.ok(!b.message||b.requestId==="bad");}
   return new Response(JSON.stringify(i===0?{id:A}:i===1?{id:B}:{}),{status:statuses[i]});
 },()=>{});
 assert.equal(calls,5);assert.equal(result.positive,false);
});
test("unexpected anonymous acceptance stops before subsequent calls",async()=>{
 const c=config(env,"--negative");let calls=0;
 await assert.rejects(()=>runAcceptance(c,async()=>{
   const i=calls++;
   return new Response(JSON.stringify(i===0?{id:A}:i===1?{id:B}:{}),{status:200});
 },()=>{}),/anonymous rejected/);
 assert.equal(calls,3);
});
test("approved synthetic flow checks actual output, owner recovery, replay and isolation",async()=>{
 const c=config({...env,AI_CHAT_STAGING_APPROVAL:"APPROVE_ONE_SYNTHETIC_CHAT_AND_ISOLATION_PROBES"},"--run-one");
 let calls=0,message,requestId,answer;
 const sessionId="33333333-3333-4333-8333-333333333333";
 const result=await runAcceptance(c,async(url,options)=>{
   const i=calls++;
   assert.ok(url.startsWith(STAGING_URL+"/"));
   let data={},status=200;
   if(i===0)data={id:A};else if(i===1)data={id:B};else if(i===2)status=401;else if(i===3||i===4)status=400;
   else if(i===5){({message,requestId}=JSON.parse(options.body));answer=message.split(": ").at(-1);data={success:true,sessionId,response:answer};}
   else if(i===6||i===11)data=[{role:"user",content:message},{role:"assistant",content:answer}];
   else if(i===7||i===8)data=[];
   else if(i===9){assert.deepEqual(JSON.parse(options.body),{message,requestId});status=409;data={code:"REQUEST_ALREADY_PROCESSED"};}
   else if(i===10){assert.equal(JSON.parse(options.body).sessionId,sessionId);status=404;}
   else assert.fail("Unexpected request");
   return new Response(JSON.stringify(data),{status});
 },()=>{});
 assert.equal(calls,12);assert.equal(result.positive,true);
});
test("handler and UI preserve precharge checks, atomic history and explicit consent",async()=>{
 const edge=await readFile(new URL("../supabase/functions/eternyx-ai-chat/index.ts",import.meta.url),"utf8");
 const provider=await readFile(new URL("../supabase/functions/_shared/ai-provider.ts",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/pages/EternyxAI.tsx",import.meta.url),"utf8");
 assert.ok(edge.indexOf("assertChatProviderConfigured();")<edge.indexOf("await consumeToolCredits(supabase"));
 assert.match(edge,/historyError\s*}\s*=\s*await supabase\.from\("chat_history"\)\.insert\(\[/);
 assert.match(edge,/RESULT_PERSISTENCE_UNCERTAIN/);
 assert.match(provider,/AbortSignal\.timeout\(PROVIDER_TIMEOUT_MS\)/);
 assert.match(provider,/MAX_PROVIDER_RESPONSE_BYTES/);
 assert.match(ui,/window\.confirm\('Send this message/);
 assert.match(ui,/no automatic retry was made/);
});
