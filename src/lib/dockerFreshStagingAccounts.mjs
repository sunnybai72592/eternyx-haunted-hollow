// ETERNYX: short-lived staging Auth sessions for the OPTIONAL Docker acceptance.
// Creates staging Auth sessions ONLY after release manifest/Edge metadata pass.
// The management read and Docker action:list checks remain unchanged.
// No browser storage, signup, refresh, admin key, token logging or production call.
import {createClient} from "@supabase/supabase-js";
import {validateDockerHostedProbeContext,validateDockerHostedProbeConfig}
 from "./dockerHostedAuthProbe.mjs";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAIL=/^[^\s@]{1,64}@[^\s@]{2,190}$/;
export function validateFreshDockerAccounts(probe,accounts){
 const context=validateDockerHostedProbeContext(probe);
 if(probe.ownerAJwt!==undefined||probe.ownerBJwt!==undefined)
  throw Error("Fresh Auth runner cannot accept long-lived user JWT overrides.");
 if(!accounts||typeof accounts!=="object"||Array.isArray(accounts))
  throw Error("Two pre-existing staging accounts are required.");
 const {ownerA,ownerB}=accounts;
 for(const account of [ownerA,ownerB]){
  if(!account||typeof account!=="object"||Array.isArray(account)||
    Object.keys(account).sort().join(",")!=="email,password,userId"||
    !UUID.test(account.userId||"")||typeof account.email!=="string"||
    account.email.length>255||!MAIL.test(account.email)||
    account.email!==account.email.toLowerCase()||
    typeof account.password!=="string"||account.password.length<8||
    account.password.length>256||/[\u0000-\u001f\u007f]/.test(account.password))
   throw Error("Staging account must have its pinned user UUID, email and private password.");
 }
 if(ownerA.userId===ownerB.userId||ownerA.email===ownerB.email)
  throw Error("Two genuinely distinct staging test accounts are required.");
 return context;
}
function decodeTokenPayload(token){
 if(typeof token!=="string"||token.length>8192||!JWT.test(token))
  throw Error("Staging Auth did not issue a bounded access JWT.");
 const fields=token.split(".");
 const encoded=fields[1];
 if(encoded.length>6000)throw Error("Oversized staging JWT claims.");
 try{
  const text=Buffer.from(encoded,"base64url").toString("utf8");
  const value=JSON.parse(text);
  if(!value||typeof value!=="object"||Array.isArray(value))
   throw Error("Invalid JWT claims");
  return value;
 }catch{throw Error("Invalid staging Auth token claims.");}
}
export function verifyFreshDockerSession(result,expectedId,origin,nowSec){
 if(!UUID.test(expectedId||"")||!Number.isFinite(nowSec))
  throw Error("Invalid independently pinned user or trusted time.");
 const data=result?.data;
 if(result?.error||data?.user?.id!==expectedId||
    data?.session?.user?.id!==expectedId||data.user.is_anonymous===true)
  throw Error("Authenticated staging identity does not match independently pinned account.");
 const token=data.session.access_token;
 const claims=decodeTokenPayload(token);
 const validIssuer=claims.iss===origin+"/auth/v1";
 const validAudience=claims.aud==="authenticated"||
    Array.isArray(claims.aud)&&claims.aud.includes("authenticated");
 if(!validIssuer||!validAudience||claims.sub!==expectedId||
    claims.role!=="authenticated"||!Number.isInteger(claims.iat)||
    !Number.isInteger(claims.exp)||claims.iat>nowSec+30||
    claims.exp<=nowSec+120||claims.exp>nowSec+7200||
    claims.exp<=claims.iat)
  throw Error("Fresh staging access token has wrong identity, scope, issuer, or lifetime.");
 return token;
}
export function createStrictStagingPasswordGrantFetch(origin,fetcher=globalThis.fetch){
 if(typeof fetcher!=="function")throw Error("Staging Auth fetch unavailable.");
 return async(url,init={})=>{
  const u=new URL(typeof url==="string"?url:url?.url);
  if(u.origin!==origin||u.pathname!=="/auth/v1/token"||
    u.searchParams.size!==1||u.searchParams.get("grant_type")!=="password"||
    String(init.method||"").toUpperCase()!=="POST")
   throw Error("Only password login to pinned staging Auth is permitted.");
  const result=await fetcher(u.toString(),{
    ...init,redirect:"error",cache:"no-store",
    signal:AbortSignal.timeout(10000)
  });
  if(!result||result.redirected===true||
   (typeof result.url==="string"&&result.url&&
    result.url!==u.toString()))
   throw Error("Staging Auth response redirected or changed origin.");
  return result;
 };
}
export async function obtainFreshDockerStagingProbe(probe,accounts,{
 clientFactory=createClient,fetcher=globalThis.fetch,now=()=>Date.now()
}={}){
 const ctx=validateFreshDockerAccounts(probe,accounts);
 if(typeof clientFactory!=="function"||typeof now!=="function")
  throw Error("Staging Auth account transport unavailable.");
 const guarded=createStrictStagingPasswordGrantFetch(ctx.origin,fetcher);
 const tokens=[];
 // Sequential sign-in limits sessions and stops immediately if owner A fails.
 for(const account of [accounts.ownerA,accounts.ownerB]){
  const client=clientFactory(ctx.origin,ctx.publishableKey,{
   auth:{autoRefreshToken:false,persistSession:false,
     detectSessionInUrl:false},
   global:{fetch:guarded}
  });
  if(typeof client?.auth?.signInWithPassword!=="function")
   throw Error("Staging Auth client unavailable.");
  let result;
  try{
   result=await client.auth.signInWithPassword({
    email:account.email,password:account.password
   });
  }catch{throw Error("Staging Auth sign-in failed.");}
  tokens.push(verifyFreshDockerSession(result,account.userId,ctx.origin,
    Math.floor(now()/1000)));
 }
 const withTokens={...probe,ownerAJwt:tokens[0],ownerBJwt:tokens[1]};
 validateDockerHostedProbeConfig(withTokens);
 return withTokens;
}
