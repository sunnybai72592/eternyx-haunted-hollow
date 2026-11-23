// Cybersecurity Universe Wave 13: real authenticated REST/Storage observations
// before/after operator-driven staging engagement revocation. GET-only; no mutations.
// No JWT/session revocation guarantee, writes, production unlock, or covert automation.
import { createHmac } from "node:crypto";
import { REQUIRED_STAGING_TABLES, validateSecurityStagingConfig } from "./securityStagingReadiness.mjs";

export const HTTP_REVOCATION_SCHEMA="eternyx.cybersecurity.http-revocation.v1";
export const HTTP_REVOCATION_CHECKS=Object.freeze([
 "distinct-real-jwt-identities","owned-and-revocable-engagements",
 ...REQUIRED_STAGING_TABLES.map(t=>"owned-and-cross-owner:"+t),
 ...REQUIRED_STAGING_TABLES.map(t=>"anonymous-denial:"+t),
 "owned-private-storage","cross-account-storage-denial",
 "authorization-state","revocation-audit","phase-linked-identities",
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const MAX_AGE=24*60*60*1000;
function requireOk(ok,why){if(!ok)throw new Error(why);}
function obj(v){return v!==null&&typeof v==="object"&&!Array.isArray(v);}
function exact(v,keys,label){
 requireOk(obj(v)&&Object.keys(v).length===keys.length&&
   keys.every(k=>Object.hasOwn(v,k)),label+" schema is invalid.");
}
function hmac(secret,label,raw){return createHmac("sha256",secret).update(label+"\x00"+raw).digest("hex");}
function verifyOpts(opts){
 requireOk(obj(opts)&&["baseline","revoked"].includes(opts.phase),"A known phase is required.");
 requireOk(typeof opts.secret==="string"&&opts.secret.length>=32&&opts.secret.length<=256,
   "An independent ephemeral 32–256 character run secret is required.");
 requireOk(typeof opts.engagementA==="string"&&uuid.test(opts.engagementA),"A engagement UUID invalid.");
 requireOk(typeof opts.engagementB==="string"&&uuid.test(opts.engagementB),"B engagement UUID invalid.");
 requireOk(opts.engagementA!==opts.engagementB,"Engagement fixtures must be distinct.");
 const now=opts.now?Date.parse(opts.now):Date.now();
 requireOk(Number.isFinite(now),"Operator timestamp invalid.");
 return now;
}
export function validateHttpRevocationConfig(env) {
 const base=validateSecurityStagingConfig(env);
 const extras=["ETERNYX_STAGING_HTTP_PHASE","ETERNYX_STAGING_HTTP_ENGAGEMENT_A",
   "ETERNYX_STAGING_HTTP_ENGAGEMENT_B","ETERNYX_STAGING_HTTP_RUN_SECRET"];
 const missing=extras.filter(k=>typeof env[k]!=="string"||!env[k].trim());
 requireOk(!missing.length,"Missing HTTP revocation staging variables: "+missing.join(", "));
 const phase=env.ETERNYX_STAGING_HTTP_PHASE;
 requireOk(["baseline","revoked"].includes(phase),"Use baseline or revoked phase.");
 const options={phase,engagementA:env.ETERNYX_STAGING_HTTP_ENGAGEMENT_A,
   engagementB:env.ETERNYX_STAGING_HTTP_ENGAGEMENT_B,
   secret:env.ETERNYX_STAGING_HTTP_RUN_SECRET};
 verifyOpts(options);
 return {config:base,options};
}
function safeStoragePath(row){
 const prefix=row.owner_id+"/"+row.engagement_id+"/";
 requireOk(typeof row.storage_path==="string"&&row.storage_path.startsWith(prefix),
   "Staging private object path does not match verified owner/engagement.");
 const suffix=row.storage_path.slice(prefix.length);
 requireOk(suffix.length>0&&suffix.length<=500&&!suffix.includes("..")&&
   !suffix.includes("\\")&&!suffix.includes("\0"),"Private object key is unsafe.");
 return "/storage/v1/object/authenticated/pentest-evidence/"+
   row.storage_path.split("/").map(encodeURIComponent).join("/");
}
function asArray(r,label){
 requireOk(r.status===200&&r.isJson&&Array.isArray(r.data),label+" returned invalid or inaccessible Data API response.");
 return r.data;
}
function one(rows,owner,id,label){
 requireOk(rows.length===1&&rows[0].id===id&&rows[0].owner_id===owner,
   label+" fixture is missing or unowned.");
 return rows[0];
}
function oneId(rows,owner,label){
 requireOk(rows.length===1&&uuid.test(rows[0]?.id)&&rows[0].owner_id===owner,
   label+" requires exactly one owned fixture row.");
 return rows[0];
}
function passed(checks,id){checks.push({id,status:"pass"});}
export function validateHttpRevocationReport(raw,phase=null) {
 exact(raw,["schema","phase","stagingRef","productionRef","observedAt","subjects","checks","summary","limitations"],"Revocation report");
 requireOk(raw.schema===HTTP_REVOCATION_SCHEMA&&["baseline","revoked"].includes(raw.phase)&&
   (!phase||raw.phase===phase),"Unknown HTTP revocation report version or phase.");
 requireOk(/^[a-z0-9]{8,32}$/.test(raw.stagingRef)&&
   /^[a-z0-9]{8,32}$/.test(raw.productionRef)&&raw.stagingRef!==raw.productionRef,
   "Report must be scoped to distinct staging and production refs.");
 requireOk(typeof raw.observedAt==="string"&&Number.isFinite(Date.parse(raw.observedAt)),
   "Invalid report time.");
 exact(raw.subjects,["a","b","engagementA","engagementB","run"],"Report identity bindings");
 requireOk(Object.values(raw.subjects).every(v=>typeof v==="string"&&hex.test(v)),
   "Missing HMAC-bound staging identities.");
 requireOk(Array.isArray(raw.checks)&&raw.checks.length===HTTP_REVOCATION_CHECKS.length&&
   HTTP_REVOCATION_CHECKS.every((name,i)=>{
     const c=raw.checks[i];
     const deferred=raw.phase==="baseline"&&["revocation-audit","phase-linked-identities"].includes(name);
     return obj(c)&&Object.keys(c).length===2&&c.id===name&&
       c.status===(deferred?"deferred":"pass");
   }),"Report has missing or failed HTTP checks.");
 exact(raw.summary,["accounts","tables","remoteWrites","authMode","engagementState","independentApproval"],"Report summary");
 requireOk(raw.summary.accounts===2&&raw.summary.tables===REQUIRED_STAGING_TABLES.length&&
   raw.summary.remoteWrites===0&&raw.summary.authMode==="live-user-JWT"&&
   raw.summary.engagementState===(raw.phase==="baseline"?"attested":"revoked")&&
   raw.summary.independentApproval===false,"Report summary overstates its proof.");
 requireOk(Array.isArray(raw.limitations)&&raw.limitations.length===3&&raw.limitations.every(s=>typeof s==="string"&&s.length>=12&&s.length<=230),
  "Unsigned report limitations missing.");
 return raw;
}
function checkBaselinePair(current,previous,now){
 validateHttpRevocationReport(previous,"baseline");
 requireOk(previous.stagingRef===current.stagingRef&&previous.productionRef===current.productionRef,
   "Revocation phase does not match baseline project refs.");
 for(const k of ["a","b","engagementA","engagementB","run"]){
  requireOk(previous.subjects[k]===current.subjects[k],
   "Revocation baseline is for a different identity, fixture, or secret.");
 }
 const first=Date.parse(previous.observedAt);
 requireOk(first<=now&&now-first<=MAX_AGE,
   "Baseline is older than 24 hours or captured after revocation.");
}
export async function runSecurityHttpRevocation(config,opts,fetchImpl=globalThis.fetch){
 const now=verifyOpts(opts);
 requireOk(config&&typeof config.url==="string"&&typeof fetchImpl==="function","Validated staging transport required.");
 const root=new URL(config.url);
 requireOk(root.protocol==="https:"&&root.pathname==="/"&&
   root.hostname===config.stagingRef+".supabase.co"&&config.stagingRef!==config.productionRef,
   "HTTP requests must target the exact isolated staging project.");
 let requestCount=0;
 async function get(path,token,query=null){
  const url=new URL(path,config.url);
  if(query)for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
  requireOk(url.origin===root.origin&&url.pathname.startsWith("/rest/v1/")||
    url.origin===root.origin&&url.pathname.startsWith("/auth/v1/")||
    url.origin===root.origin&&url.pathname.startsWith("/storage/v1/object/authenticated/"),
    "Request escaped allowed staging API routes.");
  const headers={apikey:config.publishableKey,Accept:"application/json",
    "Cache-Control":"no-store",Pragma:"no-cache"};
  if(token)headers.Authorization="Bearer "+token;
  const response=await fetchImpl(url.toString(),{
    method:"GET",redirect:"error",cache:"no-store",headers,
    signal:AbortSignal.timeout(15000)
  });
  requestCount++;
  const type=response.headers?.get?.("content-type")||"";
  // Never parse or hold actual private evidence JSON bytes; only status is inspected.
  const isStorage=url.pathname.startsWith("/storage/v1/object/authenticated/");
  const isJson=!isStorage&&response.ok&&type.includes("application/json");
  let data=null;
  if(isJson)data=await response.json();
  else if(response.body?.cancel)await response.body.cancel();
  return {status:response.status,isJson,data};
 }
 const [authA,authB]=await Promise.all([
  get("/auth/v1/user",config.tokenA),get("/auth/v1/user",config.tokenB)
 ]);
 requireOk(authA.status===200&&authA.isJson&&uuid.test(authA.data?.id)&&
   authB.status===200&&authB.isJson&&uuid.test(authB.data?.id)&&
   authA.data.id!==authB.data.id,"Two live distinct staging JWT identities required.");
 const ownerA=authA.data.id,ownerB=authB.data.id;
 const subjects={
  a:hmac(opts.secret,"user-a",ownerA),b:hmac(opts.secret,"user-b",ownerB),
  engagementA:hmac(opts.secret,"engagement-a",opts.engagementA),
  engagementB:hmac(opts.secret,"engagement-b",opts.engagementB),
  run:hmac(opts.secret,"run",config.stagingRef),
 };
 const report={
  schema:HTTP_REVOCATION_SCHEMA,phase:opts.phase,
  stagingRef:config.stagingRef,productionRef:config.productionRef,
  observedAt:new Date(now).toISOString(),subjects,
  checks:[],summary:{accounts:2,tables:REQUIRED_STAGING_TABLES.length,
    remoteWrites:0,authMode:"live-user-JWT",
    engagementState:opts.phase==="baseline"?"attested":"revoked",independentApproval:false},
  limitations:[
   "Unsigned local HMAC-bound report; it does not authenticate the report creator.",
   "Engagement attestation revocation is not JWT/session revocation; owned history remains readable.",
   "No HTTP writes, migration deployment, realtime tests or production authorization were performed.",
  ],
 };
 passed(report.checks,"distinct-real-jwt-identities");
 const [rA,rB]=await Promise.all([
  get("/rest/v1/pentest_engagements",config.tokenA,{select:"id,owner_id,status,authorization_attested,authorization_attested_at,scope_targets,excluded_targets",
    id:"eq."+opts.engagementA,limit:"2"}),
  get("/rest/v1/pentest_engagements",config.tokenB,{select:"id,owner_id,status,authorization_attested,authorization_attested_at,scope_targets,excluded_targets",
    id:"eq."+opts.engagementB,limit:"2"}),
 ]);
 const a=one(asArray(rA,"A engagement"),ownerA,opts.engagementA,"A engagement");
 const b=one(asArray(rB,"B engagement"),ownerB,opts.engagementB,"B engagement");
 const allowed=(v)=>v.authorization_attested===true&&v.authorization_attested_at&&
   ["authorized","in_progress","on_hold","completed"].includes(v.status)&&
   Array.isArray(v.scope_targets)&&v.scope_targets.length>0&&
   Array.isArray(v.excluded_targets)&&v.scope_targets.some(t=>!v.excluded_targets.includes(t));
 requireOk(allowed(b),"Account B must remain currently attested and active.");
 if(opts.phase==="baseline")requireOk(allowed(a),"Account A must be attested before operator revocation.");
 else requireOk(a.authorization_attested===false&&["draft","cancelled"].includes(a.status),
   "Account A must have a revoked/draft engagement after operator intervention.");
 passed(report.checks,"owned-and-revocable-engagements");
 // Real owner-access, opposite owner deny, and anonymous denial across all seven tables.
 const scoped={};
 const anonymousResults=[];
 for(const table of REQUIRED_STAGING_TABLES){
  const select=table==="pentest_evidence"?"id,owner_id,engagement_id,storage_path":"id,owner_id,engagement_id";
  const fixtureA=table==="pentest_engagements"?a:
    oneId(asArray(await get("/rest/v1/"+table,config.tokenA,{select,
      engagement_id:"eq."+opts.engagementA,owner_id:"eq."+ownerA,limit:1}),table+" A"),
      ownerA,table+" A");
  const fixtureB=table==="pentest_engagements"?b:
    oneId(asArray(await get("/rest/v1/"+table,config.tokenB,{select,
      engagement_id:"eq."+opts.engagementB,owner_id:"eq."+ownerB,limit:1}),table+" B"),
      ownerB,table+" B");
  // Non-engagement table fixture count/id are validated separately because they are generated UUIDs.
  if(table!=="pentest_engagements"){
   requireOk(uuid.test(fixtureA.id)&&fixtureA.engagement_id===opts.engagementA&&
     uuid.test(fixtureB.id)&&fixtureB.engagement_id===opts.engagementB,
      table+" fixture engagement mismatch.");
  }
  const cross=await Promise.all([
   get("/rest/v1/"+table,config.tokenA,{select:"id,owner_id",id:"eq."+fixtureB.id,limit:2}),
   get("/rest/v1/"+table,config.tokenB,{select:"id,owner_id",id:"eq."+fixtureA.id,limit:2}),
  ]);
  requireOk(cross.every((r,i)=>asArray(r,table+" foreign "+i).length===0),
    table+" cross-account RLS leaked a private row.");
  scoped[table]={fixtureA,fixtureB};
  passed(report.checks,"owned-and-cross-owner:"+table);
  const unauth=await get("/rest/v1/"+table,null,{select:"id,owner_id",id:"eq."+fixtureA.id,limit:2});
  requireOk(([401,403,404].includes(unauth.status))||
    (unauth.status===200&&unauth.isJson&&Array.isArray(unauth.data)&&unauth.data.length===0),
    "Unauthenticated request exposed "+table+" row.");
  anonymousResults.push("anonymous-denial:"+table);
 }
 for(const id of anonymousResults)passed(report.checks,id);
 const ea=scoped.pentest_evidence.fixtureA,eb=scoped.pentest_evidence.fixtureB;
 const pathA=safeStoragePath(ea),pathB=safeStoragePath(eb);
 const owned=await Promise.all([get(pathA,config.tokenA),get(pathB,config.tokenB)]);
 requireOk(owned.every(x=>x.status===200||x.status===206),
  "Owned private evidence object could not be read.");
 passed(report.checks,"owned-private-storage");
 const crossStorage=await Promise.all([get(pathA,config.tokenB),get(pathB,config.tokenA)]);
 requireOk(crossStorage.every(x=>[401,403,404].includes(x.status)),
  "Cross-account private evidence object was exposed.");
 passed(report.checks,"cross-account-storage-denial");
 passed(report.checks,"authorization-state");
 if(opts.phase==="revoked"){
  requireOk(obj(opts.baseline),"Revocation report must link a valid baseline.");
  checkBaselinePair(report,opts.baseline,now);
  const audited=asArray(await get("/rest/v1/pentest_audit_events",config.tokenA,{
   select:"id,owner_id,engagement_id,event_type,details,created_at",
   engagement_id:"eq."+opts.engagementA,event_type:"eq.engagement_updated",
   created_at:"gte."+opts.baseline.observedAt,order:"created_at.desc",limit:20,
  }),"Revocation audit");
  requireOk(audited.some(event=>uuid.test(event.id)&&event.owner_id===ownerA&&
    event.engagement_id===opts.engagementA&&event.event_type==="engagement_updated"&&
    Number.isFinite(Date.parse(event.created_at))&&
    Date.parse(event.created_at)>=Date.parse(opts.baseline.observedAt)&&
    Array.isArray(event.details?.changed_fields)&&
    event.details.changed_fields.includes("authorization_attested")),
    "Missing post-baseline owner-scoped engagement authorization revocation audit event.");
 }
 if(opts.phase==="baseline"){
  report.checks.push({id:"revocation-audit",status:"deferred"});
  report.checks.push({id:"phase-linked-identities",status:"deferred"});
 }else{
  passed(report.checks,"revocation-audit");
  passed(report.checks,"phase-linked-identities");
 }
 validateHttpRevocationReport(report);
 // Every request was GET and no raw user identifiers, paths or tokens are in the report.
 return {report,requestCount};
}
