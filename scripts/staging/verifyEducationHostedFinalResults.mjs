/**
 * Manual, staging-only read acceptance with actual Supabase Auth JWTs.
 * Does NOT create Auth accounts, mutate any row, publish grades, or call the
 * trusted finalizer. Never print UUIDs, emails, credentials, tokens or results.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  validateEducationResultsReadConfig, RESULTS_CASES,
} from "./educationHostedResultsConfig.mjs";

const reportPath = "test-results/education-hosted-final-results.json";
const cases = [];
let configured = false;
let usersVerified = false;
let signedOut = false;
let a, b, anon;
const record = (name, ok) => {
  cases.push({ case:name, result:ok?"passed":"failed" });
  process.stdout.write((ok?"PASS ":"FAIL ")+name+"\n");
};
function must(condition) { assert.equal(Boolean(condition),true); }
function denied(response) {
  const code = String(response?.error?.code || "");
  const msg = String(response?.error?.message || "");
  return Boolean(response?.error && (code === "42501" ||
    /permission denied|not authorized|authenticated attempt id required|attempt unavailable/i.test(msg)));
}
function client(config) {
  return createClient(config.url,config.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{"X-ETERNYX-EDUCATION-STAGING":"read-only-final-results"}},
  });
}
async function scenario(name,fn) {
  try { await fn(); record(name,true); }
  catch { record(name,false); }
}
const fields = ["attempt_id","grade_status","score","max_score","finalized_at"].sort();
function minimal(receipt) {
  must(receipt && typeof receipt === "object" && !Array.isArray(receipt));
  must(JSON.stringify(Object.keys(receipt).sort()) === JSON.stringify(fields));
}
function checkFinal(response,id,score,max) {
  must(!response.error);
  const r=response.data;
  minimal(r);
  must(r.attempt_id===id && r.grade_status==="finalized");
  must(Number.isSafeInteger(r.score) && r.score===score);
  must(Number.isSafeInteger(r.max_score) && r.max_score===max);
  must(typeof r.finalized_at==="string" && Number.isFinite(Date.parse(r.finalized_at)));
}
function checkUnscored(response,id,status) {
  must(!response.error);
  const r=response.data;
  minimal(r);
  must(r.attempt_id===id && r.grade_status===status);
  must(r.score===null && r.max_score===null && r.finalized_at===null);
}
const read = (c,id) => c.rpc("education_student_verified_result",{p_attempt_id:id});
function report() {
  mkdirSync("test-results",{recursive:true});
  // No endpoint, identifiers, accounts, answers or numeric grades in evidence.
  writeFileSync(reportPath,JSON.stringify({
    schema:1,suite:"education-hosted-final-results",
    environment:"isolated-supabase-staging",
    configured,distinct_authenticated_students:usersVerified,
    expected_cases:RESULTS_CASES.length,
    attempted_cases:cases.length,
    passed_cases:cases.filter(c=>c.result==="passed").length,
    results:cases,
    staged_sql_deployed_by_test:false,
    writes_performed:false,
    production_tested:false,
    production_certified:false,
    sessions_signed_out:signedOut,
  },null,2)+"\n");
}
async function main() {
  const config = validateEducationResultsReadConfig(process.env);
  configured = true;
  const {finalA,finalB,pendingA,runningA,legacyA}=config.fixture;
  a=client(config);b=client(config);anon=client(config);
  const identities=[];
  for(const [index,c] of [a,b].entries()){
    const auth=await c.auth.signInWithPassword(config.accounts[index]);
    must(!auth.error && auth.data?.user?.id);
    const current=await c.auth.getUser();
    must(!current.error && current.data?.user?.id===auth.data.user.id);
    identities.push(auth.data.user.id);
  }
  must(identities[0]!==identities[1]);
  usersVerified=true;
  record("two-independent-authenticated-students",true);

  for(const [label,c] of [
    ["student-a-non-admin",a],["student-b-non-admin",b],
  ]){
    await scenario(label,async()=>{
      const r=await c.rpc("is_admin");
      must(!r.error && r.data===false);
    });
  }
  let aReceipt;
  await scenario("student-a-own-final-grade",async()=>{
    aReceipt=await read(a,finalA);
    checkFinal(aReceipt,finalA,config.marks.aScore,config.marks.aMax);
  });
  await scenario("student-a-expected-mark",async()=>{
    checkFinal(await read(a,finalA),finalA,config.marks.aScore,config.marks.aMax);
  });
  await scenario("student-a-receipt-minimal",async()=>{
    minimal((await read(a,finalA)).data);
  });
  await scenario("student-b-denied-a-final",async()=>must(denied(await read(b,finalA))));
  await scenario("anonymous-denied-a-final",async()=>must(denied(await read(anon,finalA))));

  await scenario("student-b-own-final-grade",async()=>{
    checkFinal(await read(b,finalB),finalB,config.marks.bScore,config.marks.bMax);
  });
  await scenario("student-b-expected-mark",async()=>{
    checkFinal(await read(b,finalB),finalB,config.marks.bScore,config.marks.bMax);
  });
  await scenario("student-b-receipt-minimal",async()=>{
    minimal((await read(b,finalB)).data);
  });
  await scenario("student-a-denied-b-final",async()=>must(denied(await read(a,finalB))));
  await scenario("anonymous-denied-b-final",async()=>must(denied(await read(anon,finalB))));

  await scenario("student-a-pending-no-score",async()=>{
    checkUnscored(await read(a,pendingA),pendingA,"pending_review");
  });
  await scenario("student-b-denied-a-pending",async()=>must(denied(await read(b,pendingA))));
  await scenario("student-a-in-progress-no-score",async()=>{
    checkUnscored(await read(a,runningA),runningA,"in_progress");
  });
  await scenario("student-b-denied-a-in-progress",async()=>must(denied(await read(b,runningA))));
  await scenario("student-a-legacy-no-score",async()=>{
    checkUnscored(await read(a,legacyA),legacyA,"pending_review");
  });
  await scenario("student-b-denied-a-legacy",async()=>must(denied(await read(b,legacyA))));

  // Never guess existing customer IDs; this zero UUID is reserved and must
  // not be issued to a synthetic staging Auth user or attempt.
  const unknown="00000000-0000-4000-8000-000000000000";
  await scenario("student-a-denied-unknown-attempt",async()=>must(denied(await read(a,unknown))));
  await scenario("student-b-denied-unknown-attempt",async()=>must(denied(await read(b,unknown))));
  await scenario("anonymous-rpc-denied",async()=>must(denied(await read(anon,unknown))));

  // A SELECT error is required: an empty result is NOT sufficient evidence
  // that the private ledger lacks browser column/table privileges.
  for(const [label,c] of [
    ["student-a-direct-ledger-denied",a],
    ["student-b-direct-ledger-denied",b],
    ["anonymous-direct-ledger-denied",anon],
  ]){
    await scenario(label,async()=>{
      must(denied(await c.from("education_final_grades")
        .select("attempt_id,score,max_score").eq("attempt_id",finalA)));
    });
  }
}
try {
  await main();
} catch {
  if(!cases.some(c=>c.case==="two-independent-authenticated-students"))
    record("two-independent-authenticated-students",false);
} finally {
  let allSigned=true;
  for(const c of [a,b].filter(Boolean)){
    try{
      const r=await c.auth.signOut();
      if(r.error)allSigned=false;
    } catch { allSigned=false; }
  }
  signedOut=usersVerified && allSigned;
  record("both-authenticated-sessions-signed-out",signedOut);
  report();
}
if(!configured || !usersVerified || !signedOut ||
   cases.length!==RESULTS_CASES.length ||
   RESULTS_CASES.some((name,i)=>cases[i]?.case!==name ||
     cases[i]?.result!=="passed")) process.exitCode=1;
