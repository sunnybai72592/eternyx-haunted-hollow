import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_FUNCTIONS,parseJwtPolicies,inspectSources,checkFunctions,
  checkMigrations,readLiveFunctionInventory,buildReport,
} from "../scripts/automation-runtime-readiness.mjs";

const ref="wcncuarekaofmfurbtbh";
const funcs=()=>Object.entries(REQUIRED_FUNCTIONS).map(([slug,verify_jwt],i)=>({
  slug,verify_jwt,status:"ACTIVE",version:15+i,
}));
const source=()=>({migrations:[
  "20261122220000_automation_manual_control_plane.sql",
  "20261123170000_automation_audit_handoff.sql",
],problems:[]});
const evidence=(s=source())=>({
  projectRef:ref,source:"operator_supplied_migration_list",
  capturedAt:"2026-11-23T14:59:00Z",
  appliedVersions:s.migrations.map(x=>x.slice(0,14)),
});
const now=new Date("2026-11-23T15:00:00Z");

test("repo holds exact core source, migration baseline and explicit JWT settings",async()=>{
  const found=await inspectSources();
  assert.equal(found.problems.length,0,JSON.stringify(found.problems));
  assert.ok(found.migrations.length>=20);
  assert.ok(found.migrations.some(x=>x.includes("audit_handoff")));
});
test("gateway auth intent is explicit and rejects missing/duplicate/insecure blocks",()=>{
  const input=Object.entries(REQUIRED_FUNCTIONS).map(([slug,verify_jwt])=>
    "[functions."+slug+"]\nverify_jwt = "+verify_jwt).join("\n");
  const parsed=parseJwtPolicies(input);
  for(const [slug,jwt] of Object.entries(REQUIRED_FUNCTIONS)){
    assert.equal(parsed.get(slug),jwt);
  }
  assert.throws(()=>parseJwtPolicies("[functions.automation-control]\nverify_jwt = true\n[functions.automation-control]\nverify_jwt = false"));
  assert.throws(()=>parseJwtPolicies("[functions.automation-control]\nverify_jwt = maybe"));
  assert.throws(()=>parseJwtPolicies("[functions.automation-control]\nverify_jwt = true\nverify_jwt = false"));
});
test("healthy inventory is still NOT a production execution or release certificate",()=>{
  const inventory=checkFunctions(funcs());
  const migr=checkMigrations(evidence(),source().migrations,ref,now);
  const report=buildReport(source(),inventory,migr,"management_api_read_only");
  assert.equal(report.status,"inventory_checks_passed");
  assert.deepEqual(report.missingFunctions,[]);
  assert.equal(report.productionReady,false);
  assert.equal(report.releaseAuthorized,false);
  assert.equal(report.liveExecutionVerified,false);
  assert.equal(report.externalExecutionTriggered,false);
  assert.equal(report.migrationReceiptIsIndependentProof,false);
});
test("fail-closed inventory spots the absent runtime functions and mismatched JWT",()=>{
  const absent=checkFunctions(funcs().filter(x=>![
    "automation-control","automation-webhook","automation-scheduler-worker",
  ].includes(x.slug)));
  assert.deepEqual(absent.missing,[
    "automation-control","automation-webhook","automation-scheduler-worker",
  ]);
  assert.equal(absent.problems.filter(x=>x.code==="function_not_deployed").length,3);
  const wrong=funcs();
  wrong[0].verify_jwt=false;
  wrong[1].status="INACTIVE";
  wrong[2].version=0;
  const issues=checkFunctions(wrong).problems.map(x=>x.code);
  assert.ok(issues.includes("deployed_jwt_mismatch"));
  assert.ok(issues.includes("function_not_active"));
  assert.ok(issues.includes("function_version_unverified"));
});
test("reject malformed or duplicate hosted inventory without assuming readiness",()=>{
  assert.throws(()=>checkFunctions({functions:{}}));
  assert.throws(()=>checkFunctions([{slug:"x"},{slug:"x"}]));
  assert.throws(()=>checkFunctions([{slug:"../../etc/passwd"}]));
  assert.throws(()=>checkFunctions([{slug:null}]));
  assert.throws(()=>checkFunctions(null));
});
test("migration source is not deployment; missing and stale operator receipts block",()=>{
  const s=source();
  assert.equal(checkMigrations(null,s.migrations,ref,now).evidenced,false);
  const partial={...evidence(),appliedVersions:[s.migrations[0].slice(0,14)]};
  const missing=checkMigrations(partial,s.migrations,ref,now);
  assert.equal(missing.missing.length,1);
  assert.equal(missing.problems[0].code,"migration_not_evidenced");
  assert.throws(()=>checkMigrations({...evidence(),projectRef:"aaaaaaaaaaaaaaaaaaaa"},s.migrations,ref,now));
  assert.throws(()=>checkMigrations({...evidence(),capturedAt:"2026-11-22T00:00:00Z"},s.migrations,ref,now));
  assert.throws(()=>checkMigrations({...evidence(),capturedAt:"2026-11-23T16:00:00Z"},s.migrations,ref,now));
  assert.throws(()=>checkMigrations({...evidence(),appliedVersions:["not-a-version"]},s.migrations,ref,now));
  assert.throws(()=>checkMigrations({...evidence(),appliedVersions:[evidence().appliedVersions[0],evidence().appliedVersions[0]]},s.migrations,ref,now));
});
test("live probe sends one GET to the fixed management endpoint, not a mutation",async()=>{
  const token="test-token-not-a-real-secret-value";
  let count=0;
  const received=await readLiveFunctionInventory(ref,token,async(url,options)=>{
    count++;
    assert.equal(url,"https://api.supabase.com/v1/projects/"+ref+"/functions");
    assert.equal(options.method,"GET");
    assert.equal(options.headers.Authorization,"Bearer "+token);
    assert.equal(options.redirect,"error");
    return {ok:true,json:async()=>funcs()};
  });
  assert.equal(count,1);
  assert.equal(checkFunctions(received).problems.length,0);
  assert.equal(checkFunctions(received.map(x=>({...x,verify_jwt:"true"}))).problems.filter(x=>x.code==="deployed_jwt_mismatch").length,Object.keys(REQUIRED_FUNCTIONS).length);
});
test("live probe masks HTTP auth failures and rejects invalid project refs",async()=>{
  const token="test-token-not-a-real-secret-value";
  await assert.rejects(readLiveFunctionInventory(ref,token,async()=>({ok:false,status:403})),
    /Function inventory unavailable \(HTTP 403\)/);
  await assert.rejects(readLiveFunctionInventory("https://evil.example",token,async()=>{throw Error("must not call");}),
    /Invalid Supabase project reference/);
  await assert.rejects(readLiveFunctionInventory(ref,"",async()=>{throw Error("must not call");}),
    /Missing management read token/);
});
test("without live or migration evidence, output is blocked and never pretends deployment",()=>{
  const report=buildReport(source(),null,checkMigrations(null,source().migrations,ref,now),"source_only");
  assert.equal(report.status,"blocked");
  assert.equal(report.productionReady,false);
  assert.ok(report.checks.some(x=>x.code==="function_inventory_unavailable"));
  assert.ok(report.checks.some(x=>x.code==="migration_evidence_unavailable"));
});
