import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { SECURITY_STAGING_REPORT_SCHEMA, REQUIRED_STAGING_TABLES, REQUIRED_CHECKS,
 validateSecurityStagingConfig, runSecurityStagingReadOnly, validateSecurityStagingReport,
 evaluateCybersecurityReleaseGate } from "../src/lib/securityStagingReadiness.mjs";

const owners=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"];
const engagements=["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const env={ETERNYX_STAGING_ONLY:"yes",ETERNYX_STAGING_URL:"https://stagingabcd.supabase.co/",
 ETERNYX_STAGING_PROJECT_REF:"stagingabcd",ETERNYX_PRODUCTION_PROJECT_REF:"prodexample",
 ETERNYX_STAGING_PUBLIC_KEY:"staging-test-public",
 ETERNYX_STAGING_JWT_A:"staging-A-test-token-123456789",
 ETERNYX_STAGING_JWT_B:"staging-B-test-token-123456789"};
const config=()=>validateSecurityStagingConfig({...env});
const fixtureId=(index,who)=>index.toString(16).padStart(8,"0")+"-1234-4123-8123-"+(who===0?"aaaaaaaaaaaa":"bbbbbbbbbbbb");
const rows=Object.fromEntries(REQUIRED_STAGING_TABLES.map((table,i)=>[
 table,owners.map((owner_id,who)=>({
  id:table==="pentest_engagements"?engagements[who]:fixtureId(i,who),
  owner_id,engagement_id:engagements[who],
  storage_path:owner_id+"/"+engagements[who]+"/private-proof.txt",
  authorization_attested:true,authorization_attested_at:"2026-11-23T10:00:00Z",
  status:"authorized",scope_targets:["scope.example.test"],excluded_targets:[],
 }))
]));
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json"}});
const denied=(status=404)=>new Response("denied",{status,headers:{"content-type":"text/plain"}});
function simulated({leakTable=null,missingTable=null,leakStorage=false,noAttestation=false}={}){
 const calls=[];
 const mock=async(url,args)=>{
  const u=new URL(url);calls.push({url:u,method:args.method,redirect:args.redirect});
  assert.equal(u.hostname,"stagingabcd.supabase.co");
  assert.equal(args.method,"GET");
  assert.equal(args.redirect,"error");
  const who=args.headers.Authorization==="Bearer "+env.ETERNYX_STAGING_JWT_A?0:1;
  const actor=owners[who];
  if(u.pathname==="/auth/v1/user")return json({id:actor});
  if(u.pathname.startsWith("/rest/v1/")){
   const table=u.pathname.split("/").at(-1);
   if(table===missingTable||!rows[table])return denied();
   const id=u.searchParams.get("id");
   const ownerFilter=u.searchParams.get("owner_id");
   const engagementFilter=u.searchParams.get("engagement_id");
   const filtered=rows[table].filter(r=>(r.owner_id===actor||(leakTable===table&&id))&&
     (!id||id==="eq."+r.id)&&(!ownerFilter||ownerFilter==="eq."+r.owner_id)&&
     (!engagementFilter||engagementFilter==="eq."+r.engagement_id)).slice(0,1).map(row=>
       noAttestation&&table==="pentest_engagements"?{...row,authorization_attested:false}:row);
   return json(filtered);
  }
  if(u.pathname.startsWith("/storage/v1/object/authenticated/pentest-evidence/")){
   const decoded=decodeURIComponent(u.pathname);
   return (decoded.includes("/"+actor+"/")||leakStorage)?
     new Response("private",{status:200,headers:{"content-type":"text/plain"}}):denied(403);
  }
  return denied();
 };
 return {mock,calls};
}
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("config fails closed on no opt-in, same project, bad host, same tokens",()=>{
 assert.equal(config().stagingRef,"stagingabcd");
 for(const overrides of [
  {ETERNYX_STAGING_ONLY:"no"},
  {ETERNYX_PRODUCTION_PROJECT_REF:"stagingabcd"},
  {ETERNYX_STAGING_URL:"https://attacker.test/"},
  {ETERNYX_STAGING_URL:"http://stagingabcd.supabase.co/"},
  {ETERNYX_STAGING_JWT_B:env.ETERNYX_STAGING_JWT_A},
 ])assert.throws(()=>validateSecurityStagingConfig({...env,...overrides}));
});
test("two-account simulated staging probes succeed without writes, exposing evidence or issuing approval",async()=>{
 const {mock,calls}=simulated();
 const report=await runSecurityStagingReadOnly(config(),mock);
 assert.equal(report.schema,SECURITY_STAGING_REPORT_SCHEMA);
 assert.equal(report.status,"pass");
 assert.equal(report.checks.length,REQUIRED_CHECKS.length);
 assert.equal(report.summary.coveredTables,7);
 assert.equal(report.summary.remoteMutations,0);
 assert.equal(validateSecurityStagingReport(report),report);
 assert.ok(calls.length>=30);
 assert.ok(calls.every(x=>x.method==="GET"&&x.redirect==="error"));
 assert.doesNotMatch(JSON.stringify(report),/test-token|private-proof|11111111|22222222|storage_path/);
 assert.equal(evaluateCybersecurityReleaseGate(report).production,"blocked");
 assert.equal(evaluateCybersecurityReleaseGate(report).readOnlyStaging,"reported-pass-unattested");
});
test("real-style RLS foreign row leakage is refused",async()=>{
 await assert.rejects(()=>runSecurityStagingReadOnly(config(),simulated({
  leakTable:"security_case_findings"}).mock),/foreign row leaked/i);
});
test("missing staged ledger schema, revoked engagement or Storage leak fail the release gate",async()=>{
 await assert.rejects(()=>runSecurityStagingReadOnly(config(),simulated({
  missingTable:"security_case_finding_history"}).mock),/missing, inaccessible/i);
 await assert.rejects(()=>runSecurityStagingReadOnly(config(),simulated({
  noAttestation:true}).mock),/attested/i);
 await assert.rejects(()=>runSecurityStagingReadOnly(config(),simulated({
  leakStorage:true}).mock),/Foreign private Storage/i);
});
test("tampered report, duplicate checks or fake production status cannot unlock release",async()=>{
 const passing=await runSecurityStagingReadOnly(config(),simulated().mock);
 for(const bogus of [
  {...passing,status:"fail"},{...passing,checks:passing.checks.slice(1)},
  {...passing,checks:passing.checks.map((x,i)=>i===2?{...x,id:passing.checks[0].id}:x)},
  {...passing,summary:{...passing.summary,remoteMutations:1}},
  {...passing,stagingProjectRef:passing.productionProjectRef},
  {...passing,productionApproved:true},
 ]) {
  assert.throws(()=>validateSecurityStagingReport(bogus));
  assert.equal(evaluateCybersecurityReleaseGate(bogus).production,"blocked");
 }
 assert.equal(evaluateCybersecurityReleaseGate().readOnlyStaging,"not-established");
 assert.ok(evaluateCybersecurityReleaseGate(passing).blockers.length>=5);
});
test("CLI works offline for release explanation and refuses missing staging credentials",()=>{
 const script=new URL("../scripts/security-case-staging-readonly.mjs",import.meta.url).pathname;
 const environment={...process.env,ETERNYX_STAGING_ONLY:""};
 const explain=spawnSync(process.execPath,[script,"--explain"],{encoding:"utf8",env:environment});
 assert.equal(explain.status,0);
 assert.match(explain.stdout,/production promotion: BLOCKED/i);
 for(const command of ["--check-config","--run"]){
  const x=spawnSync(process.execPath,[script,command],{encoding:"utf8",env:environment});
  assert.equal(x.status,2);
  assert.match(x.stderr,/STAGING BLOCKED/i);
 }
});
test("Hub and authenticated route expose local report only, without server writes or release button",async()=>{
 const [page,app,hub,script]=await Promise.all([
  read("src/pages/SecurityReleaseReadiness.tsx"),read("src/App.tsx"),
  read("src/pages/CybersecurityHub.tsx"),read("scripts/security-case-staging-readonly.mjs")
 ]);
 assert.match(app,/path="\/cybersecurity\/release-readiness" element={<RequireAuth><SecurityReleaseReadiness \/><\/RequireAuth>}/);
 assert.match(hub,/href: "\/cybersecurity\/release-readiness"/);
 assert.match(page,/Production release: BLOCKED/);
 assert.match(page,/evaluateCybersecurityReleaseGate/);
 assert.doesNotMatch(page,/supabase\.from|supabase\.storage|apply_migration|service_role/);
 assert.match(script,/runSecurityStagingReadOnly/);
 assert.doesNotMatch(script,/method:\s*["'](POST|PATCH|PUT|DELETE)["']|apply_migration/);
});
