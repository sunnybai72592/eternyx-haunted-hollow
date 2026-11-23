import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  CORE,validateTarget,parseCatalog,validateCatalogReport,
  validateStageProbe,inspectStageProject,verifyDeployedCore,
  inspectCoreSources,fetchStageManagement,
} from "../scripts/automation-staging-core-release.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const production="wcncuarekaofmfurbtbh",stage="abcdefghijklmnopqrst";
const env=(extra={})=>({
  ETERNYX_AUTOMATION_STAGING_REF:stage,
  ETERNYX_AUTOMATION_PRODUCTION_REF:production,
  ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+stage+".supabase.co",
  ETERNYX_AUTOMATION_STAGING_PGUSER:"postgres",
  ETERNYX_AUTOMATION_STAGING_PGPORT:"5432",
  ETERNYX_AUTOMATION_STAGING_PGDATABASE:"postgres",
  ...extra,
});
const catalog=[
  "automation_rpc_catalog_present=true",
  "automation_rls_enabled=true",
  "automation_schema_present=true",
].join("\n");
const db=()=>({
  schema:"eternyx-automation-staging-db-probe-result-v1",
  historySource:"independent_staging_readonly_database_query",
  observed:{
    connection_ok:true,transaction_read_only:true,
    migration_history_present:true,automation_workflows_present:true,
    automation_runs_present:true,automation_webhooks_present:true,
    automation_schedules_present:true,
  },
  databaseWritesPerformed:false,releaseAuthorized:false,
  whichCollidedSqlExecuted:"unknown",
});
test("three critical missing function slugs and JWT policies are source-validated",async()=>{
  assert.deepEqual(CORE,["automation-control","automation-webhook","automation-scheduler-worker"]);
  const result=await inspectCoreSources(root);
  assert.equal(result.sourceValidated,true);
  assert.equal(result.productionDeployAllowed,false);
  assert.equal(result.functions.length,3);
  assert.deepEqual(result.functions.map(x=>x.verifyJwt),[true,false,false]);
  for(const f of result.functions)assert.match(f.sha256,/^[0-9a-f]{64}$/);
});
test("production target cannot be disguised by a staging-ref override or custom database hostname",()=>{
  const good=validateTarget(env());
  assert.equal(good.stagingRef,stage);
  assert.equal(good.targetBound,true);
  assert.equal(good.productionReady,false);
  for(const change of [
    {ETERNYX_AUTOMATION_STAGING_REF:production,
      ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+production+".supabase.co"},
    {ETERNYX_AUTOMATION_PRODUCTION_REF:stage},
    {ETERNYX_AUTOMATION_STAGING_PGHOST:"db."+production+".supabase.co"},
    {ETERNYX_AUTOMATION_STAGING_PGHOST:"127.0.0.1"},
    {ETERNYX_AUTOMATION_STAGING_PGHOST:"https://db."+stage+".supabase.co"},
  ])assert.throws(()=>validateTarget(env(change)));
});
test("actual catalog parser rejects any failed RLS/RPC/DB prerequisite or extra output",()=>{
  const result=parseCatalog(catalog);
  assert.equal(result.automation_rpc_catalog_present,true);
  assert.equal(result.automation_rls_enabled,true);
  assert.equal(result.automation_schema_present,true);
  assert.equal(result.releaseAuthorized,false);
  assert.equal(result.remoteMigrationHistoryReconciled,false);
  assert.equal(validateCatalogReport(result),true);
  for(const bad of [
    catalog.replace("automation_rpc_catalog_present=true","automation_rpc_catalog_present=false"),
    catalog.replace("automation_rls_enabled=true","automation_rls_enabled=false"),
    catalog.replace("automation_schema_present=true","automation_schema_present=false"),
    catalog.replace("automation_rls_enabled=true","automation_rls_enabled=TRUE"),
    catalog+"\npassword=stolen",
    "automation_schema_present=true\n"+catalog,
    "ERROR: password authentication failed",
  ])assert.throws(()=>parseCatalog(bad));
  assert.throws(()=>validateCatalogReport({...result,releaseAuthorized:true}));
  assert.throws(()=>validateCatalogReport({...result,automation_rls_enabled:false}));
});
test("read-only isolated stage probe must show present Automation tables and migration history",()=>{
  assert.equal(validateStageProbe(db(),validateTarget(env())),true);
  for(const property of [
    "connection_ok","transaction_read_only","migration_history_present",
    "automation_workflows_present","automation_runs_present",
    "automation_webhooks_present","automation_schedules_present",
  ]){
    const altered=db();altered.observed[property]=false;
    assert.throws(()=>validateStageProbe(altered,validateTarget(env())),property);
  }
  assert.throws(()=>validateStageProbe({...db(),databaseWritesPerformed:true},validateTarget(env())));
  assert.throws(()=>validateStageProbe({...db(),whichCollidedSqlExecuted:"verified"},validateTarget(env())));
  assert.throws(()=>validateStageProbe(db(),{targetBound:false}));
});
test("management API project proof rejects wrong org, project, unhealthy status and production ref",()=>{
  const healthy={id:stage,ref:stage,organization_id:"xnhopzufalyhswuwvqmo",status:"ACTIVE_HEALTHY"};
  assert.equal(inspectStageProject(healthy,stage).hostedStageChecked,true);
  for(const attempt of [
    {...healthy,id:production},
    {...healthy,ref:production},
    {...healthy,organization_id:"other-organization"},
    {...healthy,status:"INACTIVE"},
    {...healthy,status:"ACTIVE_UNHEALTHY"},
  ])assert.throws(()=>inspectStageProject(attempt,stage));
  assert.throws(()=>inspectStageProject(healthy,production));
});
test("post-deployment inventory only passes three active functions with exact JWT mode",()=>{
  const base=[
    {slug:"automation-control",status:"ACTIVE",version:1,verify_jwt:true},
    {slug:"automation-webhook",status:"ACTIVE",version:2,verify_jwt:false},
    {slug:"automation-scheduler-worker",status:"ACTIVE",version:3,verify_jwt:false},
  ];
  assert.deepEqual(verifyDeployedCore({functions:base}).map(x=>x.slug),CORE);
  for(const [i,key,value] of [[0,"status","INACTIVE"],[1,"verify_jwt",true],
    [2,"version",0],[0,"verify_jwt",false]]){
    const x=structuredClone(base);x[i][key]=value;
    assert.throws(()=>verifyDeployedCore({functions:x}));
  }
  assert.throws(()=>verifyDeployedCore({functions:base.slice(0,2)}));
  assert.throws(()=>verifyDeployedCore({functions:[...base,base[1]]}));
  assert.throws(()=>verifyDeployedCore({functions:[]}));
});
test("management requests are GET-only, no redirect, target-ref bound, with limited results",async()=>{
  const target="https://api.supabase.com/v1/projects/"+stage;
  let called=0;
  const body={id:stage,ref:stage,organization_id:"xnhopzufalyhswuwvqmo",status:"ACTIVE_HEALTHY"};
  const raw=await fetchStageManagement(target,"a".repeat(24),async (url,options)=>{
    assert.equal(url,target);
    assert.equal(options.method,"GET");
    assert.equal(options.redirect,"error");
    assert.match(options.headers.Authorization,/^Bearer /);
    called++;
    return {ok:true,json:async()=>body};
  });
  assert.equal(called,1);
  assert.equal(inspectStageProject(raw,stage).productionExcluded,true);
  await assert.rejects(fetchStageManagement(target,"short",async()=>({ok:true})));
  await assert.rejects(fetchStageManagement(target+"/secret_path","a".repeat(24),async()=>({ok:true})));
  await assert.rejects(fetchStageManagement(target,"a".repeat(24),async()=>({ok:false,status:503})));
});
test("approved staging workflow is manual-only, main-only, protected, source/JWT bound and never prunes",async()=>{
  const w=await readFile(path.join(root,".github/workflows/automation-staging-core-release.yml"),"utf8");
  assert.match(w,/workflow_dispatch:/);
  assert.doesNotMatch(w,/^\s+(push|pull_request|schedule):/m);
  assert.match(w,/github\.ref == 'refs\/heads\/main'/);
  assert.match(w,/I_APPROVE_STAGING_CORE_FUNCTION_RELEASE/);
  assert.match(w,/STAGING_SCHEMA_SECRETS_AND_ROLLBACK_REVIEWED/);
  assert.match(w,/environment: automation-staging/);
  assert.match(w,/scripts\/automation-staging-db-readonly\.sh/);
  assert.match(w,/scripts\/automation-staging-functions-catalog\.sh/);
  assert.match(w,/validateStageProbe/);
  assert.match(w,/validateCatalogReport/);
  assert.match(w,/inspectStageProject/);
  assert.match(w,/verifyDeployedCore/);
  for(const name of CORE)assert.match(w,new RegExp("supabase functions deploy "+name+" --remote="));
  assert.match(w,/automation-webhook --remote="\$target" --yes --no-verify-jwt/);
  assert.match(w,/automation-scheduler-worker --remote="\$target" --yes --no-verify-jwt/);
  assert.doesNotMatch(w,/supabase db push|migration repair|functions deploy --prune|functions deploy --remote|supabase secrets set|SUPABASE_DB_PASSWORD/);
  assert.match(w,/secrets\.ETERNYX_AUTOMATION_STAGING_MANAGEMENT_TOKEN/);
  assert.doesNotMatch(w,/SUPABASE_ACCESS_TOKEN: "\$\{\{ vars\./);
});
test("fixed catalog SQL is only SELECT in a read-only transaction and covers 7 RPCs and 4 RLS tables",async()=>{
  const sql=await readFile(path.join(root,"scripts/sql/automation-staging-functions-catalog.sql"),"utf8");
  const body=sql.replace(/--[^\n]*/g,"");
  assert.match(body,/BEGIN READ ONLY;/);
  assert.match(body,/SET LOCAL statement_timeout = '5s';/);
  assert.match(body,/pg_catalog\.pg_proc/);
  assert.match(body,/pg_catalog\.pg_class/);
  assert.match(body,/bool_and\(c\.relrowsecurity\)/);
  assert.match(body,/count\(\*\)=7/);
  assert.match(body,/count\(\*\)=4/);
  assert.doesNotMatch(body,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|CALL|DO|COPY)\b/i);
});
test("catalog shell runner pins verify-full TLS, denies inherited hostaddr and never prints SQL output",async()=>{
  const sh=await readFile(path.join(root,"scripts/automation-staging-functions-catalog.sh"),"utf8");
  assert.match(sh,/PGHOSTADDR/);
  assert.match(sh,/PGSSLMODE="verify-full"/);
  assert.match(sh,/default_transaction_read_only=on/);
  assert.match(sh,/scripts\/sql\/automation-staging-functions-catalog\.sql/);
  assert.match(sh,/parseCatalog/);
  assert.match(sh,/trap cleanup EXIT/);
});
