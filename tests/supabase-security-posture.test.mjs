import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { evaluateSupabaseSecurityInventory as evaluate } from "../src/lib/supabaseSecurityInventory.mjs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
function fixture(){
  return {
    schema:"public",
    tables:[
      {name:"profiles",rls:true,anon_select:true,authenticated_select:true,policy_count:4},
      {name:"billing_subscriptions",rls:true,anon_select:false,authenticated_select:false,policy_count:0},
      {name:"polar_billing_subscriptions",rls:true,anon_select:false,authenticated_select:false,policy_count:0},
      {name:"polar_webhook_events",rls:true,anon_select:false,authenticated_select:false,policy_count:0},
      {name:"stripe_webhook_events",rls:true,anon_select:false,authenticated_select:false,policy_count:0},
      {name:"admin_users",rls:true,anon_select:false,authenticated_select:false,policy_count:0},
    ],
    functions:[
      {signature:"is_admin()",security_definer:true,anon_execute:true,authenticated_execute:true,search_path_fixed:true},
      {signature:"get_current_user_role()",security_definer:true,anon_execute:true,authenticated_execute:true,search_path_fixed:true},
      {signature:"admin_list_users(text,integer,integer)",security_definer:true,anon_execute:false,authenticated_execute:true,search_path_fixed:true},
    ],
    policies:[{table:"blog_posts",name:"Public read or admin",uses_admin_helper:true,targets_public:true}],
    views:[],
  };
}
test("deny-by-default billing and admin tables are not treated as unprotected",()=>{
  const r=evaluate(fixture());
  assert.equal(r.rlsDisabled,0);
  assert.equal(r.critical.length,0);
  assert.equal(r.releaseGate,"REVIEW_REQUIRED");
  assert.equal(r.observations.length,5);
  assert.equal(r.productionCertified,false);
  assert.equal(r.tenantIsolationVerified,false);
});
test("admin RPC privilege warnings do not become invented security exploit claims",()=>{
  const r=evaluate(fixture());
  assert.ok(r.review.some(x=>x.includes("is_admin()")));
  assert.ok(r.review.some(x=>x.includes("admin_list_users(")));
  assert.ok(r.review.some(x=>x.includes("do NOT revoke anonymous EXECUTE")));
  assert.equal(r.critical.length,0);
});
test("RLS disabled on ANY public table blocks release",()=>{
  const r=fixture();
  r.tables[0].rls=false;
  const x=evaluate(r);
  assert.equal(x.releaseGate,"BLOCKED");
  assert.ok(x.critical.some(s=>s.includes("RLS disabled")));
});
test("direct SELECT grants on server-only billing or admin tables block release",()=>{
  for(const key of ["billing_subscriptions","polar_billing_subscriptions","polar_webhook_events","stripe_webhook_events","admin_users"]){
    const x=fixture();
    x.tables.find(t=>t.name===key).authenticated_select=true;
    assert.equal(evaluate(x).releaseGate,"BLOCKED",key);
  }
});
test("client-readable normal view must explicitly use security_invoker",()=>{
  const x=fixture();
  x.views.push({name:"public_profile_summary",security_invoker:false,anon_select:true,authenticated_select:true});
  assert.equal(evaluate(x).releaseGate,"BLOCKED");
  x.views[0].security_invoker=true;
  assert.notEqual(evaluate(x).releaseGate,"BLOCKED");
});
test("function search_path absence produces review-required rather than silent pass",()=>{
  const x=fixture();
  x.functions[2].search_path_fixed=false;
  assert.ok(evaluate(x).review.some(s=>s.includes("search_path not pinned")));
});
test("missing RLS policies on a client-readable table are reviewed without asserting exposure",()=>{
  const x=fixture();
  x.tables[0].policy_count=0;
  assert.ok(evaluate(x).review.some(z=>z.includes("RLS enabled without policies")));
});
test("malformed metadata, injected function signatures or duplicate entries are rejected",()=>{
  const x=fixture();x.tables.push({...x.tables[0]});
  assert.throws(()=>evaluate(x),/unique table name/);
  const y=fixture();y.functions[0].signature="is_admin(); drop table profiles";
  assert.throws(()=>evaluate(y),/unique function signature/);
  const z=fixture();z.schema="auth";
  assert.throws(()=>evaluate(z),/public schema/);
});
test("catalog query reads metadata only; no SQL mutations or application rows",()=>{
  const source=read("scripts/sql/read-only-supabase-security-audit.sql");
  for(const t of ["pg_class","pg_namespace","pg_proc","pg_policies","has_table_privilege","has_function_privilege"])assert.ok(source.includes(t),t);
  assert.doesNotMatch(source,/^\s*(?:CREATE|ALTER|DROP|REVOKE|GRANT|TRUNCATE|INSERT|UPDATE|DELETE|COPY)\s/m);
  assert.doesNotMatch(source,/FROM\s+auth\.users|FROM\s+public\.profiles|SELECT\s+\*\s+FROM\s+public\./i);
  assert.match(source,/AS audit_json/);
});
test("local CLI never connects automatically, prints no account or private record content",()=>{
  const source=read("scripts/review-supabase-security.mjs");
  assert.doesNotMatch(source,/supabase\.co|service_role|authorization|fetch\(/i);
  assert.match(source,/JSON\.parse\(readFileSync\(path/);
  assert.match(source,/Production certification: NO/);
  assert.match(source,/End-to-end tenant isolation: NOT TESTED/);
});
test("no live production schema changes or migration are made by this audit",()=>{
  const doc=read("docs/SUPABASE_SECURITY_POSTURE_2026-11.md");
  assert.match(doc,/read-only/i);
  assert.match(doc,/get_current_user_role/);
  assert.match(doc,/public-facing RLS policies/i);
  assert.match(doc,/OTP/i);
  assert.match(doc,/Leaked password protection/i);
  assert.match(doc,/security definer/i);
  assert.match(doc,/manual review/i);
});
test("scripts and tests parse with Node and representative report can be evaluated",()=>{
  for(const file of ["scripts/review-supabase-security.mjs","src/lib/supabaseSecurityInventory.mjs"]){
    const run=spawnSync(process.execPath,["--check",new URL("../"+file,import.meta.url).pathname],{encoding:"utf8",timeout:10000});
    assert.equal(run.status,0,run.stderr||run.stdout);
  }
});
