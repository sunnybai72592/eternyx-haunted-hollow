import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
export const STAGING_URL="https://mhodwvypfbxafamkrgsk.supabase.co";
const APPROVAL="APPROVE_ONE_SYNTHETIC_CHAT_AND_ISOLATION_PROBES";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const claim=(token)=>{try{return JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString("utf8"));}catch{return null;}};
function configError(){throw Error("Invalid staging acceptance configuration");}
export function config(env,mode){
 if(!["--check-config","--negative","--run-one"].includes(mode))configError();
 if(env.AI_CHAT_STAGING_URL!==STAGING_URL)configError();
 const key=env.AI_CHAT_STAGING_PUBLIC_KEY??"";
 const publicJwt=claim(key);
 if(!(key.startsWith("sb_publishable_")||(publicJwt?.role==="anon"&&publicJwt?.ref==="mhodwvypfbxafamkrgsk")))configError();
 const a=env.AI_CHAT_STAGING_USER_A_JWT??"",b=env.AI_CHAT_STAGING_USER_B_JWT??"";
 for(const token of [a,b]){
   const c=claim(token);
   if(c?.role!=="authenticated"||!uuid.test(c.sub??"")||c.iss!==STAGING_URL+"/auth/v1"||!Number.isFinite(c.exp)||c.exp<=Date.now()/1000+90)configError();
 }
 if(claim(a).sub===claim(b).sub)configError();
 if(mode==="--run-one"&&env.AI_CHAT_STAGING_APPROVAL!==APPROVAL)configError();
 return {mode,key,a,b};
}
export async function runAcceptance(c,fetcher=fetch,log=console.log){
 const ask=async(path,token,body)=>{
   const response=await fetcher(STAGING_URL+path,{method:body===undefined?"GET":"POST",headers:{apikey:c.key,...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"error",signal:AbortSignal.timeout(45000)});
   let data=null;try{data=await response.json();}catch{}
   return {status:response.status,data};
 };
 const check=(ok,label)=>{if(!ok)throw Error("Acceptance blocked: "+label);log("PASS "+label);};
 const authA=await ask("/auth/v1/user",c.a),authB=await ask("/auth/v1/user",c.b);
 check(authA.status===200&&authA.data?.id===claim(c.a).sub&&authB.status===200&&authB.data?.id===claim(c.b).sub&&authA.data.id!==authB.data.id,"fresh distinct authenticated staging accounts");
 const endpoint="/functions/v1/eternyx-ai-chat";
 const payload={message:"",requestId:randomUUID()};
 check((await ask(endpoint,null,payload)).status===401,"anonymous rejected");
 check((await ask(endpoint,c.a,payload)).status===400,"empty prompt rejected");
 check((await ask(endpoint,c.a,{message:"test",requestId:"bad"})).status===400,"invalid request ID rejected");
 if(c.mode!=="--run-one")return {positive:false};
 const requestId=randomUUID();
 const marker="ETERNYX-STAGING-"+randomUUID();
 const message="Return this exact synthetic marker and nothing else: "+marker;
 log("Reconciliation request ID: "+requestId);
 const response=await ask(endpoint,c.a,{message,requestId});
 check(response.status===200&&response.data?.success===true&&uuid.test(response.data?.sessionId??"")&&typeof response.data?.response==="string"&&response.data.response.includes(marker),"real synthetic prompt returned marker");
 const sessionId=response.data.sessionId;
 const suffix="?session_id=eq."+sessionId+"&select=role,content";
 const own=await ask("/rest/v1/chat_history"+suffix,c.a);
 check(own.status===200&&Array.isArray(own.data)&&own.data.length===2&&own.data.some(x=>x.role==="user"&&x.content===message)&&own.data.some(x=>x.role==="assistant"&&x.content===response.data.response),"owner can recover exact persisted message pair");
 const other=await ask("/rest/v1/chat_history"+suffix,c.b);
 check(other.status===200&&Array.isArray(other.data)&&other.data.length===0,"second account cannot read owner history");
 const otherSession=await ask("/rest/v1/conversation_sessions?id=eq."+sessionId+"&select=id",c.b);
 check(otherSession.status===200&&Array.isArray(otherSession.data)&&otherSession.data.length===0,"second account cannot read owner session");
 const replay=await ask(endpoint,c.a,{message,requestId});
 check(replay.status===409&&replay.data?.code==="REQUEST_ALREADY_PROCESSED","duplicate request rejected");
 const cross=await ask(endpoint,c.b,{message:"Synthetic isolation probe",requestId:randomUUID(),sessionId});
 check(cross.status===404,"cross-account conversation rejected");
 const final=await ask("/rest/v1/chat_history"+suffix,c.a);
 check(final.status===200&&Array.isArray(final.data)&&final.data.length===2,"negative probes did not add owner messages");
 log("Provider and credit ledger reconciliation still required; this script does not inspect provider billing.");
 return {positive:true,requestId,sessionId};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
   const c=config(process.env,process.argv[2]??"--check-config");
   if(c.mode==="--check-config")console.log("PASS staging configuration shape; no network or provider call.");
   else await runAcceptance(c);
 }catch(error){
   // Never print upstream bodies, headers, tokens, prompts or stacks.
   console.error(error instanceof Error&&error.message.startsWith("Acceptance blocked: ")?error.message:"Acceptance stopped; verify staging configuration/history and credit reconciliation before retrying.");
   process.exitCode=1;
 }
}
