import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
 MISSING_BACKEND,JWT_POLICIES,parseCtfCatalog,verifyCtfCatalog,
 inspectFourSources,verifyFourInventory,validateFourRelease,
} from "../scripts/eternyx-missing-backend-release.mjs";
import {parseCatalog,inspectStageProject,validateTarget}
  from "../scripts/automation-staging-core-release.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const prod="wcncuarekaofmfurbtbh",stage="abcdefghijklmnopqrst";
const yes=[
 "ctf_verified_solves_present",
 "ctf_verify_rate_present",
 "ctf_verified_solves_rls",
 "ctf_verify_rate_rls",
 "ctf_verification_rpc_present",
 "ctf_rpc_service_only",
 "ctf_solve_table_owner_select_only",
].map(key=>key+"=true").join("\n");
const env=()=>({
 ETERNYX_AUTOMATION_STAGING_REF:stage,
 ETERNYX_AUTOMATION_PRODUCTION_REF:prod,
 ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+stage+".supabase.co",
 ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres",
 ETERNYX_AUTOMATION_STAGING_PGPORT:"5432",
 ETERNYX_AUTOMATION_STAGING_PGDATABASE:"postgres",
});
const project={id:stage,ref:stage,status:"ACTIVE_HEALTHY",organization_id:"xnhopzufalyhswuwvqmo"};
const core=()=>parseCatalog([
 "automation_rpc_catalog_present=true",
 "automation_rls_enabled=true",
 "automation_schema_present=true",
].join("\n"));
const inventory=()=>[
 {slug:"automation-control",status:"ACTIVE",version:1,verify_jwt:true},
 {slug:"automation-webhook",status:"ACTIVE",version:1,verify_jwt:false},
 {slug:"automation-scheduler-worker",status:"ACTIVE",version:1,verify_jwt:false},
 {slug:"ctf-verified",status:"ACTIVE",version:1,verify_jwt:true},
];
test("the fourth missing backend function is CTF verified; all four JWT policies match checked-in source",async()=>{
 assert.deepEqual(MISSING_BACKEND,[
 "automation-control","automation-webhook","automation-scheduler-worker","ctf-verified",
 ]);
 assert.deepEqual(MISSING_BACKEND.map(x=>JWT_POLICIES[x]),[true,false,false,true]);
 const result=await inspectFourSources(root);
 assert.equal(result.functions.length,4);
 assert.equal(result.sourceValidated,true);
 assert.equal(result.ctfFlagSecretChecked,false);
 assert.equal(result.stagingOnly,true);
 assert.equal(result.productionDeploymentAuthorized,false);
 for(const f of result.functions){
   assert.match(f.sha256,/^[0-9a-f]{64}$/);
   assert.equal(f.verifyJwt,JWT_POLICIES[f.slug]);
 }
});
test("CTF read-only result parser rejects missing table/RLS/rate or privilege and any extra row",()=>{
 const good=parseCtfCatalog(yes);
 assert.equal(verifyCtfCatalog(good),true);
 assert.equal(good.ctfFlagSecretChecked,false);
 assert.equal(good.productionReady,false);
 for(const name of [
   "ctf_verified_solves_present","ctf_verify_rate_present",
   "ctf_verified_solves_rls","ctf_verify_rate_rls",
   "ctf_verification_rpc_present","ctf_rpc_service_only",
   "ctf_solve_table_owner_select_only",
 ]){
   assert.throws(()=>parseCtfCatalog(yes.replace(name+"=true",name+"=false")),name);
 }
 for(const bad of [
   yes+"\nsecret=never",yes.replace("true","TRUE"),yes.replace("\n","|\n"),
   yes.replace("ctf_verify_rate_present=true\n",""),
   yes.split("\n").reverse().join("\n"),
   "ERROR: password=private",
 ]){
   assert.throws(()=>parseCtfCatalog(bad));
 }
 assert.throws(()=>verifyCtfCatalog({...good,ctfFlagSecretChecked:true}));
 assert.throws(()=>verifyCtfCatalog({...good,deploymentAuthorized:true}));
 assert.throws(()=>verifyCtfCatalog({...good,observed:{...good.observed,ctf_verify_rate_rls:false}}));
});
test("inventory release requires ALL FOUR ACTIVE functions and correct JWT flags, no duplicate or absent service",()=>{
 assert.deepEqual(verifyFourInventory({functions:inventory()}).map(x=>x.slug),MISSING_BACKEND);
 for(const [i,field,bad] of [
   [0,"verify_jwt",false],[1,"verify_jwt",true],
   [2,"verify_jwt",true],[3,"verify_jwt",false],
   [3,"status","INACTIVE"],[3,"version",0],[3,"version","one"],
 ]){
   const list=structuredClone(inventory());
   list[i][field]=bad;
   assert.throws(()=>verifyFourInventory(list));
 }
 assert.throws(()=>verifyFourInventory(inventory().slice(0,3)));
 assert.throws(()=>verifyFourInventory([...inventory(),inventory()[3]]));
 assert.throws(()=>verifyFourInventory({functions:[]}));
});
test("four-function admission denies production, unhealthy project and unverified Automation/CTF catalog",()=>{
 const target=validateTarget(env());
 const ctf=parseCtfCatalog(yes);
 assert.equal(validateFourRelease(target,ctf,core(),project).stagingOnly,true);
 for(const bad of [
   {...project,id:prod},{...project,ref:prod},
   {...project,organization_id:"foreign"},{...project,status:"INACTIVE"},
 ]){
   assert.throws(()=>validateFourRelease(target,ctf,core(),bad));
 }
 assert.throws(()=>validateFourRelease({targetBound:false,stagingRef:stage},ctf,core(),project));
 assert.throws(()=>validateFourRelease(target,ctf,
   {...core(),automation_rls_enabled:false},project));
 assert.throws(()=>validateFourRelease(target,
   {...ctf,observed:{...ctf.observed,ctf_verify_rate_rls:false}},core(),project));
 assert.throws(()=>validateTarget({...env(),ETERNYX_AUTOMATION_STAGING_REF:prod,
  ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+prod+".supabase.co"}));
});
test("CTF catalog SQL only reads pg_catalog, verifies RLS grants and service-only verification RPC",async()=>{
 const sql=await readFile(path.join(root,"scripts/sql/eternyx-staging-ctf-catalog.sql"),"utf8");
 const body=sql.replace(/--[^\n]*/g,"");
 assert.match(body,/BEGIN READ ONLY;/);
 assert.match(body,/SET LOCAL statement_timeout/);
 assert.match(body,/ctf_verified_solves/);
 assert.match(body,/ctf_verify_rate/);
 assert.match(body,/ctf_claim_verification_attempt\(uuid,text\)/);
 assert.match(body,/has_function_privilege\('service_role'/);
 assert.match(body,/NOT pg_catalog\.has_function_privilege\('anon'/);
 assert.match(body,/NOT pg_catalog\.has_function_privilege\('authenticated'/);
 assert.match(body,/has_table_privilege\('authenticated'.*'SELECT'/);
 assert.match(body,/pg_catalog\.pg_policies/);
 assert.match(body,/relrowsecurity/);
 assert.doesNotMatch(body,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO|CALL|COPY)\b/i);
});
test("live staging runner reuses verify-full TLS and strict project binding and never performs writes",async()=>{
 const s=await readFile(path.join(root,"scripts/eternyx-staging-ctf-catalog.sh"),"utf8");
 for(const required of [
   "I_APPROVE_READONLY_ISOLATED_STAGING","PGHOSTADDR",
   'PGSSLMODE="verify-full"',"default_transaction_read_only=on",
   "eternyx-staging-ctf-catalog.sql","parseCtfCatalog",
   "trap cleanup EXIT",
 ]){
   assert.ok(s.includes(required),required);
 }
 assert.doesNotMatch(s,/supabase functions deploy|db push|migration repair|SUPABASE_ACCESS_TOKEN/);
});
test("protected staging action requires separate CTF secret review, separate database proofs, exactly four deploys",async()=>{
 const w=await readFile(path.join(root,".github/workflows/automation-staging-core-release.yml"),"utf8");
 assert.match(w,/workflow_dispatch:/);
 assert.doesNotMatch(w,/^\s+(?:push|pull_request|schedule):/m);
 for(const guard of [
  "environment: automation-staging",
  "github.ref == 'refs/heads/main'",
  "I_APPROVE_STAGING_CORE_FUNCTION_RELEASE",
  "STAGING_SCHEMA_SECRETS_AND_ROLLBACK_REVIEWED",
  "STAGING_CTF_FLAG_SECRET_REVIEWED",
  "scripts/eternyx-staging-ctf-catalog.sh",
  "scripts/eternyx-missing-backend-release.mjs --check-source",
  "verifyCtfCatalog","verifyFourInventory","inspectStageProject",
 ]){
   assert.ok(w.includes(guard),guard);
 }
 for(const name of MISSING_BACKEND)
   assert.match(w,new RegExp("supabase functions deploy "+name+" --remote="));
 assert.match(w,/supabase functions deploy ctf-verified --remote="\$target" --yes/);
 assert.doesNotMatch(w,/supabase functions deploy ctf-verified[^\n]*--no-verify-jwt/);
 assert.doesNotMatch(w,/supabase db push|migration repair|supabase secrets set|functions deploy --prune/);
});
test("offline PG17 job applies real CTF migration and proves missing owner RLS blocks release",async()=>{
 const w=await readFile(path.join(root,".github/workflows/automation-staging-db-offline-contract.yml"),"utf8");
 for(const key of [
  "--network none",
  "20261122170000_ctf_verified_missions.sql",
  "scripts/sql/eternyx-staging-ctf-catalog.sql",
  "parseCtfCatalog",
  "ctf_verified_solves DISABLE ROW LEVEL SECURITY",
  "disabled verified CTF owner RLS",
 ])assert.ok(w.includes(key),key);
 assert.doesNotMatch(w,/\$\{\{\s*secrets\.|SUPABASE_ACCESS_TOKEN/);
});
