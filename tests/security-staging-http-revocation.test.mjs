import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
 HTTP_REVOCATION_SCHEMA,HTTP_REVOCATION_CHECKS,
 validateHttpRevocationConfig,validateHttpRevocationReport,
 runSecurityHttpRevocation
} from "../src/lib/securityStagingHttpRevocation.mjs";
import { REQUIRED_STAGING_TABLES } from "../src/lib/securityStagingReadiness.mjs";

const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const EA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const whenA="2026-11-23T10:00:00.000Z";
const whenB="2026-11-23T10:30:00.000Z";
const secret="synthetic-ephemeral-only-revocation-run-secret-1234";
const env={
 ETERNYX_STAGING_ONLY:"yes",
 ETERNYX_STAGING_URL:"https://stagingabcd.supabase.co/",
 ETERNYX_STAGING_PROJECT_REF:"stagingabcd",
 ETERNYX_PRODUCTION_PROJECT_REF:"prodexample",
 ETERNYX_STAGING_PUBLIC_KEY:"staging-publishable-test",
 ETERNYX_STAGING_JWT_A:"real-actor-A-synthetic-JWT-not-for-network-123456",
 ETERNYX_STAGING_JWT_B:"real-actor-B-synthetic-JWT-not-for-network-123456",
 ETERNYX_STAGING_HTTP_PHASE:"baseline",
 ETERNYX_STAGING_HTTP_ENGAGEMENT_A:EA,
 ETERNYX_STAGING_HTTP_ENGAGEMENT_B:EB,
 ETERNYX_STAGING_HTTP_RUN_SECRET:secret,
};
const configuration=()=>validateHttpRevocationConfig(env);
const fixtureId=(index,b)=>index.toString(16).padStart(8,"0")+"-9999-4999-8999-"+(b?"bbbbbbbbbbbb":"aaaaaaaaaaaa");
function mockStaging({revoked=false,unauthLeak=null,foreignLeak=null,foreignStorage=false,missingAudit=false,
 revokedB=false,changedAccount=false,noAccessTable=null,noStateChange=false}={}){
 const calls=[];
 const rows=Object.fromEntries(REQUIRED_STAGING_TABLES.map((table,i)=>[
  table,[0,1].map(who=>({
   id:table==="pentest_engagements"?(who?EB:EA):fixtureId(i,who),
   owner_id:who?B:A,
   engagement_id:who?EB:EA,
   storage_path:(who?B:A)+"/"+(who?EB:EA)+"/private.txt",
   status:who?(revokedB?"draft":"authorized"):
    (revoked&&!noStateChange?"draft":"authorized"),
   authorization_attested:who?!revokedB:!(revoked&&!noStateChange),
   authorization_attested_at:whenA,
   scope_targets:["owner.test"],excluded_targets:[],
  }))
 ]));
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
 const text=(data,status=403)=>new Response(data,{status,headers:{"content-type":"text/plain"}});
 const impl=async(url,request)=>{
  const u=new URL(url);
  calls.push({url:u,request});
  assert.equal(u.hostname,"stagingabcd.supabase.co");
  assert.equal(request.method,"GET");
  assert.equal(request.cache,"no-store");
  assert.equal(request.redirect,"error");
  assert.equal(request.headers["Cache-Control"],"no-store");
  assert.equal(request.headers.Pragma,"no-cache");
  assert.ok(!request.body);
  const token=request.headers.Authorization;
  const who=token==="Bearer "+env.ETERNYX_STAGING_JWT_A?0:
   token==="Bearer "+env.ETERNYX_STAGING_JWT_B?1:null;
  if(u.pathname==="/auth/v1/user"){
   return json({id:who===0?A:(changedAccount?A:B)});
  }
  if(u.pathname.startsWith("/rest/v1/")){
   const table=u.pathname.split("/").at(-1);
   if(noAccessTable===table)return text("unavailable",404);
   if(!rows[table])throw Error("Mock unhandled table "+table);
   if(table==="pentest_audit_events"&&u.searchParams.has("event_type")){
    if(missingAudit||!revoked)return json([]);
    return json([{id:fixtureId(44,false),owner_id:A,engagement_id:EA,
     event_type:"engagement_updated",created_at:whenB,
     details:{changed_fields:["status","authorization_attested","authorization_attested_at"]}}]);
   }
   const idFilter=u.searchParams.get("id");
   const ownerFilter=u.searchParams.get("owner_id");
   const engFilter=u.searchParams.get("engagement_id");
   const response=rows[table].filter((row)=>{
    const leak=who===null?unauthLeak===table:foreignLeak===table;
    const permitted=who===0?row.owner_id===A:who===1?row.owner_id===B:false;
    return (permitted||leak)&&(!idFilter||idFilter==="eq."+row.id)&&
      (!ownerFilter||ownerFilter==="eq."+row.owner_id)&&
      (!engFilter||engFilter==="eq."+row.engagement_id);
   }).slice(0,Number(u.searchParams.get("limit")||20));
   return json(response);
  }
  if(u.pathname.startsWith("/storage/v1/object/authenticated/pentest-evidence/")){
   const id=decodeURIComponent(u.pathname);
   const own=(who===0&&id.includes("/"+A+"/"))||(who===1&&id.includes("/"+B+"/"));
   return own||foreignStorage?text("private bytes",200):text("blocked",403);
  }
  throw Error("Unhandled mock endpoint "+u.pathname);
 };
 return {impl,calls};
}
async function runPair(options={}){
 const {config,options:original}=configuration();
 const first=await runSecurityHttpRevocation(config,{...original,phase:"baseline",now:whenA},mockStaging().impl);
 const next=await runSecurityHttpRevocation(config,{
  ...original,phase:"revoked",now:"2026-11-23T11:00:00.000Z",baseline:first.report
 },mockStaging({revoked:true,...options}).impl);
 return {first,next};
}

test("config needs real staging identity, unique engagement IDs and ephemeral run secret",()=>{
 const parsed=configuration();
 assert.equal(parsed.config.stagingRef,"stagingabcd");
 assert.equal(parsed.options.phase,"baseline");
 for(const patch of [
  {ETERNYX_STAGING_ONLY:"no"},
  {ETERNYX_STAGING_PROJECT_REF:"prodexample"},
  {ETERNYX_STAGING_HTTP_PHASE:"invalid"},
  {ETERNYX_STAGING_HTTP_ENGAGEMENT_A:EB},
  {ETERNYX_STAGING_HTTP_ENGAGEMENT_A:"not-uuid"},
  {ETERNYX_STAGING_HTTP_RUN_SECRET:"short"},
  {ETERNYX_STAGING_JWT_B:env.ETERNYX_STAGING_JWT_A},
  {ETERNYX_STAGING_URL:"https://untrusted.test/"}
 ]) assert.throws(()=>validateHttpRevocationConfig({...env,...patch}));
});
test("real HTTP contract baseline and revoked phases prove fresh two-user and seven-table owner isolation with no writes",async()=>{
 const {config,options}=configuration();
 const {impl,calls}=mockStaging();
 const baseline=await runSecurityHttpRevocation(config,{...options,now:whenA},impl);
 assert.equal(baseline.report.schema,HTTP_REVOCATION_SCHEMA);
 assert.equal(baseline.report.phase,"baseline");
 assert.equal(baseline.report.checks.length,HTTP_REVOCATION_CHECKS.length);
 assert.equal(baseline.report.summary.remoteWrites,0);
 assert.equal(baseline.report.summary.independentApproval,false);
 assert.equal(validateHttpRevocationReport(baseline.report),baseline.report);
 assert.ok(calls.length>=36);
 assert.ok(calls.every(x=>x.request.method==="GET"&&x.request.cache==="no-store"));
 const {next}=await runPair();
 assert.equal(next.report.phase,"revoked");
 assert.equal(next.report.summary.engagementState,"revoked");
 assert.deepEqual(next.report.subjects,baseline.report.subjects);
 const exported=JSON.stringify(next.report);
 assert.doesNotMatch(exported,/11111111|22222222|aaaa-4aaa|bbbb-4bbb|private\.txt|Bearer |synthetic-ephemeral|authorization_attested_at/);
 assert.equal(next.report.summary.independentApproval,false);
});
test("anonymous or cross-owner row exposure fails without masking a leaked table",async()=>{
 const {config,options}=configuration();
 await assert.rejects(()=>runSecurityHttpRevocation(config,options,mockStaging({
  unauthLeak:"security_case_findings"
 }).impl),/Unauthenticated request exposed/);
 await assert.rejects(()=>runSecurityHttpRevocation(config,options,mockStaging({
  foreignLeak:"security_case_findings"
 }).impl),/cross-account RLS leaked/);
 await assert.rejects(()=>runSecurityHttpRevocation(config,options,mockStaging({
  foreignStorage:true
 }).impl),/Cross-account private evidence/);
 await assert.rejects(()=>runSecurityHttpRevocation(config,options,mockStaging({
  noAccessTable:"security_case_finding_history"
 }).impl),/invalid or inaccessible/);
});
test("no claimed revocation when A remains authorized, B loses attestation or audit is absent",async()=>{
 const {config,options}=configuration();
 const baseline=(await runSecurityHttpRevocation(config,{...options,now:whenA},mockStaging().impl)).report;
 for(const change of [
  {revoked:true,noStateChange:true},
  {revoked:true,revokedB:true},
  {revoked:true,missingAudit:true},
 ]){
  await assert.rejects(()=>runSecurityHttpRevocation(config,{
    ...options,phase:"revoked",now:"2026-11-23T11:00:00Z",baseline
   },mockStaging(change).impl));
 }
});
test("phase binding rejects wrong secret, identity, future baseline, aged report and forged report shape",async()=>{
 const {config,options}=configuration();
 const baseline=(await runSecurityHttpRevocation(config,{...options,now:whenA},mockStaging().impl)).report;
 for(const optionsPatch of [
  {secret:"another-long-ephemeral-only-synthetic-secret-1234"},
  {now:"2026-11-25T12:00:00Z"},
  {baseline:{...baseline,stagingRef:"differentstage"}},
  {baseline:{...baseline,productionApproved:true}},
  {baseline:{...baseline,checks:baseline.checks.slice(1)}},
 ]){
  await assert.rejects(()=>runSecurityHttpRevocation(config,{
    ...options,phase:"revoked",now:"2026-11-23T11:00:00Z",baseline,...optionsPatch
   },mockStaging({revoked:true}).impl));
 }
 assert.throws(()=>validateHttpRevocationReport({...baseline,status:"released"}));
 assert.throws(()=>validateHttpRevocationReport({...baseline,summary:{...baseline.summary,independentApproval:true}}));
});
test("CLI explains workflow offline, refuses network without an explicit staging HTTP acknowledgement",()=>{
 const script=fileURLToPath(new URL("../scripts/security-staging-http-revocation.mjs",import.meta.url));
 const noCredentials={...process.env,ETERNYX_STAGING_ONLY:"",ETERNYX_STAGING_HTTP_ACK:""};
 const info=spawnSync(process.execPath,[script,"--explain"],{env:noCredentials,encoding:"utf8"});
 assert.equal(info.status,0);assert.match(info.stdout,/production release: BLOCKED/i);
 for(const phase of ["--baseline","--revoked"]){
  const denied=spawnSync(process.execPath,[script,phase],{env:noCredentials,encoding:"utf8"});
  assert.equal(denied.status,2);
  assert.match(denied.stderr,/HTTP REVOCATION STAGING BLOCKED/);
 }
 const checked=spawnSync(process.execPath,[script,"--check-config"],{
  env:{...env,ETERNYX_STAGING_HTTP_ACK:""},encoding:"utf8"
 });
 assert.equal(checked.status,0);
 assert.match(checked.stdout,/without network calls/);
});
test("source stage runners do no HTTP mutation, token/logged ID exposures or production unlock",async()=>{
 const source=await readFile(new URL("../scripts/security-staging-http-revocation.mjs",import.meta.url),"utf8");
 const core=await readFile(new URL("../src/lib/securityStagingHttpRevocation.mjs",import.meta.url),"utf8");
 assert.match(core,/method:"GET"/);
 assert.match(core,/cache:"no-store"/);
 assert.match(core,/createHmac/);
 assert.match(core,/authorization_attested/);
 assert.match(core,/engagement_updated/);
 assert.doesNotMatch(core,/method:"POST"|method:"PATCH"|method:"DELETE"/);
 assert.doesNotMatch(source,/apply_migration|service_role/);
 assert.match(source,/No HTTP writes performed/);
});
