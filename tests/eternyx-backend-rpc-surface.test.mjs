import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  SLUGS,extractServiceDependencies,inspectFourRuntimeDependencies,
  inspectSourceCompleteness,buildReadonlySql,parseReadonlyResult,
  verifyCatalogEvidence,
} from "../scripts/eternyx-backend-rpc-surface.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fakeSql=(source,n=source.rpcCount,t=source.tableCount,rls=source.tableCount)=>
  ["rpc_count="+n,"table_count="+t,"rls_table_count="+rls].join("\n")+"\n";

test("all FOUR real Edge Function source bodies provide an exact full RPC and tenant-table inventory",async()=>{
 const s=await inspectFourRuntimeDependencies(root);
 assert.deepEqual(s.slugs,SLUGS);
 assert.equal(s.sourceBound,true);
 assert.ok(s.rpcCount>=60);
 assert.ok(s.tableCount>=7);
 assert.equal(s.rpcs.length,s.rpcCount);
 assert.equal(s.tables.length,s.tableCount);
 assert.equal(new Set(s.rpcs).size,s.rpcCount);
 assert.equal(new Set(s.tables).size,s.tableCount);
 assert.ok(s.rpcs.includes("automation_attest_case_audit_handoff"));
 assert.ok(s.rpcs.includes("automation_complete_scheduled_run"));
 assert.ok(s.rpcs.includes("automation_approve_webhook_execution"));
 assert.ok(s.rpcs.includes("ctf_claim_verification_attempt"));
 assert.ok(s.tables.includes("automation_approval_requests"));
 assert.ok(s.tables.includes("automation_workflows"));
 assert.ok(s.tables.includes("ctf_verified_solves"));
 assert.equal(s.productionReady,false);
 assert.equal(s.deploymentAuthorized,false);
});

test("every RPC referenced by any four checked-in handlers must be defined by a reviewed SQL migration",async()=>{
 const r=await inspectSourceCompleteness(root);
 assert.equal(r.schema,"eternyx-four-backend-source-surface-v1");
 assert.ok(r.sourceMigrationCount>=110);
 assert.equal(r.allRuntimeRpcDefinitionsPresent,true,
   "Undefined RPCs must block staged Function release");
 assert.deepEqual(r.missingSqlDefinitions,[]);
 assert.equal(r.stagingCatalogExecuted,false);
});

test("source-driven SQL is fixed READ ONLY, count-based, bounded and only queries pg_catalog",async()=>{
 const surface=await inspectSourceCompleteness(root);
 const q=buildReadonlySql(surface);
 for(const x of ["BEGIN READ ONLY;","SET LOCAL statement_timeout","pg_catalog.pg_proc",
   "pg_catalog.pg_class","p.proname=required.name","c.relrowsecurity",
   "rpc_count=","table_count=","rls_table_count=","COMMIT;"]){
   assert.ok(q.includes(x),x);
 }
 assert.doesNotMatch(q,/^\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|DO|CALL)\b/im);
 assert.ok(q.length<22000);
 for(const name of surface.rpcs)assert.ok(q.includes("('"+name+"')"));
 for(const name of surface.tables)assert.ok(q.includes("('"+name+"')"));
 assert.equal(q.match(/BEGIN READ ONLY;/g)?.length,1);
});

test("true complete source-bound PostgreSQL read-only proof passes without declaring live readiness",async()=>{
 const source=await inspectSourceCompleteness(root);
 const evidence=parseReadonlyResult(fakeSql(source),source);
 assert.equal(verifyCatalogEvidence(evidence,source),true);
 assert.equal(evidence.rpcCount,source.rpcCount);
 assert.equal(evidence.tableCount,source.tableCount);
 assert.equal(evidence.tenantTablesWithRls,source.tableCount);
 assert.equal(evidence.productionReady,false);
 assert.equal(evidence.deploymentAuthorized,false);
 assert.equal(evidence.serviceSecretsVerified,false);
 assert.equal(evidence.runtimeFlowsVerified,false);
 assert.equal(evidence.stagingDbSource,"operator_approved_readonly_psql");
});

test("missing one RPC, missing one table, or disabled single owner-table RLS is a release blocker",async()=>{
 const source=await inspectSourceCompleteness(root);
 for(const [a,b,c] of [
   [source.rpcCount-1,source.tableCount,source.tableCount],
   [source.rpcCount,source.tableCount-1,source.tableCount-1],
   [source.rpcCount,source.tableCount,source.tableCount-1],
   [0,0,0],
 ])assert.throws(()=>parseReadonlyResult(fakeSql(source,a,b,c),source),/incomplete_remote_schema/);
 for(const malformed of [
   "",fakeSql(source)+"debug=password",
   fakeSql(source).replace("rpc_count=","RPC_COUNT="),
   fakeSql(source).replace("rpc_count=","rpc_count=+"),
   fakeSql(source).replace("table_count=","table_count=xyz"),
   fakeSql(source).split("\n").reverse().join("\n"),
   fakeSql(source).repeat(400),
 ])assert.throws(()=>parseReadonlyResult(malformed,source));
});

test("staged proof rejects changed counts, forged flags, or newly added source RPCs without database evidence",async()=>{
 const source=await inspectSourceCompleteness(root);
 const verified=parseReadonlyResult(fakeSql(source),source);
 for(const change of [
   {productionReady:true},{deploymentAuthorized:true},
   {stagingDbSource:"production"},{allReferencedRpcsPresent:false},
   {allReferencedTablesRlsEnabled:false},
   {tenantTablesWithRls:0},{rpcCount:0},
   {tableCount:0},{sourceBound:false},{serviceSecretsVerified:true},
 ])assert.throws(()=>verifyCatalogEvidence({...verified,...change},source));
 assert.throws(()=>verifyCatalogEvidence(verified,
   {...source,allRuntimeRpcDefinitionsPresent:false}));
});

test("dynamic RPC and table names are not allowed to evade the full source-driven release check",()=>{
 const body=" ".repeat(600);
 for(const extra of [
   '.rpc(variable)',".from(tableName)",
   '.rpc(derivedFunction, {})',
   '.from(getSource())',
 ])assert.throws(()=>extractServiceDependencies(body+
   '.rpc("automation_save_workflow").from("automation_workflows")'+extra),/dynamic_database_access/);
 assert.throws(()=>buildReadonlySql({...{
   schema:"eternyx-four-backend-source-surface-v1",
   sourceBound:true,productionReady:false,databaseChecked:false,deploymentAuthorized:false,
   rpcs:Array.from({length:62},(_,i)=>"rpc_"+String(i).padStart(2,"0")),
   tables:Array.from({length:8},(_,i)=>"table_"+String(i).padStart(2,"0")),
   rpcCount:62,tableCount:8,
 },rpcs:["evil'); DROP TABLE users; --"]}));
});

test("protected staging worker must prove full RPC/table surface before ANY of four function deployments",async()=>{
 const workflow=await readFile(path.join(root,".github/workflows/automation-staging-core-release.yml"),"utf8");
 const spots=[
  "eternyx-backend-rpc-surface.mjs --source",
  "eternyx-staging-backend-rpc-surface.sh",
  "verifyCatalogEvidence",
  "supabase functions deploy automation-control",
 ];
 for(const item of spots)assert.ok(workflow.includes(item),item);
 assert.ok(workflow.indexOf("verifyCatalogEvidence")<
   workflow.indexOf("supabase functions deploy automation-control"));
 for(const name of SLUGS)assert.match(workflow,new RegExp("supabase functions deploy "+name+" --remote="));
 assert.match(workflow,/environment: automation-staging/);
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
 assert.doesNotMatch(workflow,/^\s+(?:push|pull_request|schedule):/m);
});

test("staging read-only runner maintains production-ref hard deny, TLS verification and no database writes",async()=>{
 const runner=await readFile(path.join(root,"scripts/eternyx-staging-backend-rpc-surface.sh"),"utf8");
 for(const item of [
   "I_APPROVE_READONLY_ISOLATED_STAGING",
   "automation-staging-db-readonly.mjs --check-config",
   "PGHOSTADDR","verify-full","default_transaction_read_only=on",
   "eternyx-backend-rpc-surface.mjs --sql",
   "eternyx-backend-rpc-surface.mjs",
   "trap cleanup EXIT",
 ])assert.ok(runner.includes(item),item);
 const code=runner.split("\n").filter(x=>!x.trim().startsWith("#")).join("\n");
 assert.doesNotMatch(code,/supabase functions deploy|db push|migration repair|SUPABASE_ACCESS_TOKEN/);
});

test("real networkless PostgreSQL17 four-pillar integration now checks full source-driven RPC catalog and RLS denial",async()=>{
 const workflow=await readFile(path.join(root,".github/workflows/automation-services-four-pillar-postgres17.yml"),"utf8");
 for(const item of [
   "--network none","20261122170000_ctf_verified_missions.sql",
   "eternyx-backend-rpc-surface.mjs --source",
   "eternyx-backend-rpc-surface.mjs --sql",
   "eternyx-backend-rpc-surface.mjs --parse",
   "automation_workflows DISABLE ROW LEVEL SECURITY",
 ])assert.ok(workflow.includes(item),item);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\.|SUPABASE_ACCESS_TOKEN/);
});
