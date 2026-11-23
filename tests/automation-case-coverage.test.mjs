import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest}
  from "../supabase/functions/_shared/automation-control-contract.mjs";
import {verifiedCaseCoveragePage,appendCaseCoverage,caseCoverageCsv}
  from "../src/lib/automationCaseCoverage.mjs";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const key=id=>("00000000-0000-4000-8000-"+String(id).padStart(12,"0"));
function row(index){
  return {incidentId:key(index+1),
    createdAt:new Date(Date.UTC(2026,10,23,12,0,0)-index*60000).toISOString(),
    status:"open",revision:1,consistent:true,findings:[],
    hasPlan:false,planStage:null,evidenceCount:0,
    closureApprovalCurrent:false,reopenApprovalCurrent:false,
    historicalClosedPlanAfterReopen:false};
}
function cursor(r){return {beforeCreatedAt:r.createdAt,beforeId:r.incidentId};}
function makePage(start,count,hasMore,requestedCursor=null){
  const rows=Array.from({length:count},(_,i)=>row(start+i));
  return {
    source:"authenticated_server",coverageSource:"owner_case_coverage_page",
    ordering:"created_at_desc_id_desc",
    scope:"best_effort_multi_request_not_atomic_snapshot",
    checkedAt:"2026-11-23T12:10:00Z",ownerCaseTotalAtRead:45,
    pageSize:20,returned:count,requestedCursor,rows,hasMore,
    nextCursor:hasMore?cursor(rows.at(-1)):null,
    pageInconsistent:0,pageHistoricalClosedAfterReopen:0,
    pageCasesWithNoEvidence:count,
    allOwnerCasesCheckedInSinglePage:!hasMore&&requestedCursor===null,
    transactionallyConsistentAcrossPages:false,
    cryptographicIntegrityVerified:false,workerLivenessVerified:false,
    automatedFailureDetection:false,externalExecutionTriggered:false,
  };
}
test("strict owner page action rejects arbitrary IDs, execution and malformed cursors",()=>{
  assert.deepEqual(parseAutomationControlRequest({action:"incidentCoveragePage"}),
    {ok:true,action:"incidentCoveragePage",pageSize:20,
      beforeCreatedAt:null,beforeId:null});
  assert.equal(parseAutomationControlRequest({
    action:"incidentCoveragePage",pageSize:10,beforeCreatedAt:row(19).createdAt,
    beforeId:row(19).incidentId}).ok,true);
  for(const input of [
    {action:"incidentCoveragePage",pageSize:0},
    {action:"incidentCoveragePage",pageSize:21},
    {action:"incidentCoveragePage",pageSize:"20"},
    {action:"incidentCoveragePage",pageSize:20,beforeId:key(1)},
    {action:"incidentCoveragePage",beforeCreatedAt:row(1).createdAt},
    {action:"incidentCoveragePage",beforeCreatedAt:"yesterday",beforeId:key(1)},
    {action:"incidentCoveragePage",beforeCreatedAt:row(1).createdAt,beforeId:"bad"},
    {action:"incidentCoveragePage",ownerId:key(2)},
    {action:"incidentCoveragePage",includeSecrets:true},
    {action:"incidentCoveragePage",runNow:true},
    {action:"incidentCoveragePage",webhookUrl:"https://site.invalid"},
  ])assert.equal(parseAutomationControlRequest(input).ok,false,JSON.stringify(input));
});
test("real-format owner page validates exact provenance and safe page counts",()=>{
  const v=verifiedCaseCoveragePage(makePage(0,20,true));
  assert.equal(v.returned,20);
  assert.equal(v.nextCursor.beforeId,key(20));
  assert.equal(v.transactionallyConsistentAcrossPages,false);
  assert.equal(v.cryptographicIntegrityVerified,false);
  assert.equal(v.pageCasesWithNoEvidence,20);
  assert.equal(v.rows.length,20);
});
test("45 owner case fixtures combine into three strict nonduplicating keyset pages",()=>{
  const first=makePage(0,20,true);
  const second=makePage(20,20,true,first.nextCursor);
  const third=makePage(40,5,false,second.nextCursor);
  let scan=appendCaseCoverage(null,first);
  assert.equal(scan.scanned,20);
  assert.equal(scan.complete,false);
  scan=appendCaseCoverage(scan,second);
  assert.equal(scan.scanned,40);
  assert.equal(scan.moreToScan,true);
  scan=appendCaseCoverage(scan,third);
  assert.equal(scan.scanned,45);
  assert.equal(scan.pages.length,3);
  assert.equal(scan.complete,true);
  assert.equal(scan.moreToScan,false);
  assert.equal(new Set(scan.rows.map(r=>r.incidentId)).size,45);
  assert.equal(scan.ownerCaseTotalAtStart,45);
  assert.equal(scan.transactionallyConsistentAcrossPages,false);
  assert.equal(caseCoverageCsv(scan),caseCoverageCsv(
    {schema:scan.schema,pages:scan.pages}));
  assert.match(caseCoverageCsv(scan),/"limitations","workerLivenessVerified"/);
  assert.ok(caseCoverageCsv(scan).startsWith("\ufeff"));
});
test("mixed account totals are flagged as changed, never certified a snapshot",()=>{
  const first=makePage(0,20,true);
  const second={...makePage(20,20,true,first.nextCursor),
    ownerCaseTotalAtRead:46};
  const scan=appendCaseCoverage(appendCaseCoverage(null,first),second);
  assert.equal(scan.countChanged,true);
  assert.equal(scan.complete,false);
  assert.equal(scan.ownerCaseTotalAtStart,45);
  assert.equal(scan.ownerCaseTotalAtLastRead,46);
});
test("reject forged counters, inconsistent state and impossible next-cursor edges",()=>{
  const valid=makePage(0,20,true);
  for(const item of [
    {...valid,source:"mock"},
    {...valid,coverageSource:"untrusted"},
    {...valid,scope:"transactional_snapshot"},
    {...valid,ordering:"updated_at_desc"},
    {...valid,transactionallyConsistentAcrossPages:true},
    {...valid,cryptographicIntegrityVerified:true},
    {...valid,workerLivenessVerified:true},
    {...valid,automatedFailureDetection:true},
    {...valid,externalExecutionTriggered:true},
    {...valid,pageSize:1000},
    {...valid,returned:19},
    {...valid,ownerCaseTotalAtRead:-1},
    {...valid,pageInconsistent:12},
    {...valid,pageCasesWithNoEvidence:0},
    {...valid,hasMore:true,nextCursor:null},
    {...valid,allOwnerCasesCheckedInSinglePage:true},
    {...valid,nextCursor:cursor(row(18))},
    {...valid,rows:[...valid.rows.slice(0,19),valid.rows[0]]},
    {...valid,rows:[...valid.rows.slice(0,5),row(1),...valid.rows.slice(6)]},
    {...valid,rows:[{...valid.rows[0],status:"running"},...valid.rows.slice(1)]},
    {...valid,rows:[{...valid.rows[0],findings:["fake_certificate"]},...valid.rows.slice(1)]},
    {...valid,rows:[{...valid.rows[0],consistent:false},...valid.rows.slice(1)]},
    {...valid,rows:[{...valid.rows[0],createdAt:"not-a-date"},...valid.rows.slice(1)]},
  ])assert.throws(()=>verifiedCaseCoveragePage(item));
});
test("reject altered, skipped or duplicated page continuations",()=>{
  const first=makePage(0,20,true);
  const aggregate=appendCaseCoverage(null,first);
  const second=makePage(20,20,true,first.nextCursor);
  for(const input of [
    {...second,requestedCursor:null},
    {...second,requestedCursor:cursor(row(21))},
    {...second,rows:[...second.rows.slice(0,19),first.rows[0]]},
    makePage(20,20,true),
  ])assert.throws(()=>appendCaseCoverage(aggregate,input));
  assert.throws(()=>appendCaseCoverage(aggregate,first));
});
test("export drops unknown server metadata, private notes, credentials and raw text",()=>{
  const page=makePage(0,20,true);
  const withExtras={...page,secret:"sensitive_token",
    rows:page.rows.map(r=>({...r,notes:"personal_secret",rawInput:"raw_input_text"}))};
  const scan=appendCaseCoverage(null,withExtras);
  const json=JSON.stringify(scan);
  const csv=caseCoverageCsv(scan);
  for(const leaked of ["sensitive_token","personal_secret","raw_input_text"]){
    assert.equal(json.includes(leaked),false,leaked);
    assert.equal(csv.includes(leaked),false,leaked);
  }
  assert.match(csv,/"limitations","transactionallyConsistentAcrossPages"/);
});
test("read-only database and authenticated operator integrations have no dispatch controls",async()=>{
  const sql=await read("supabase/migrations/20261123150000_automation_case_coverage.sql");
  const edge=await read("supabase/functions/automation-control/index.ts");
  const ui=await read("src/components/AutomationCaseCoveragePanel.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  for(const re of [
    /CREATE INDEX IF NOT EXISTS automation_incidents_owner_creation_cursor/,
    /ORDER BY i\.created_at DESC,i\.id DESC LIMIT p_page_size\+1/,
    /CREATE OR REPLACE FUNCTION public\.automation_incident_coverage_page/,
    /p_before_created_at IS NULL/,
    /automation_incident_lifecycle_check/,
    /best_effort_multi_request_not_atomic_snapshot/,
    /allOwnerCasesCheckedInSinglePage/,
    /transactionallyConsistentAcrossPages',false/,
    /REVOKE ALL ON FUNCTION public\.automation_incident_coverage_page/,
    /GRANT EXECUTE ON FUNCTION public\.automation_incident_coverage_page/,
  ])assert.match(sql,re);
  assert.doesNotMatch(sql,/SECURITY DEFINER|automation_record_run\(|automation_toggle_schedule\(/);
  assert.doesNotMatch(sql,/INSERT INTO public\.automation|UPDATE public\.automation|DELETE FROM public\.automation/);
  assert.match(edge,/supabase\.rpc\("automation_incident_coverage_page"/);
  assert.match(edge,/p_user_id:user\.id/);
  assert.match(edge,/coverageSource:data\.source/);
  assert.match(ui,/Start new owner scan/);
  assert.match(ui,/Load next 20 cases/);
  assert.match(ui,/Recheck current case/);
  assert.match(ui,/Safe CSV/);
  assert.match(ui,/Partial coverage/);
  assert.match(cloud,/<AutomationCaseCoveragePanel/);
});
