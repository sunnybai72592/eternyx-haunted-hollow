import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CASE_MARKER, createCaseSnapshot } from "../src/lib/securityCaseSnapshot.mjs";
import { INVESTIGATION_MARKER, createInvestigation } from "../src/lib/securityInvestigationUtils.mjs";
import { inspectUnifiedEvidence, validateUnifiedCaseDownload, groupValidatedCases,
  summarizeUnifiedCases, unifiedCaseReport, UNIFIED_REVIEW_BATCH } from "../src/lib/securityUnifiedCases.mjs";

const owner = "11111111-1111-4111-8111-111111111111";
const engagement = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: owner,
  status: "authorized", authorization_attested: true,
  authorization_attested_at: "2026-11-23T10:00:00Z",
  scope_targets: ["scope.example.test", "excluded.example.test"],
  excluded_targets: ["excluded.example.test"],
};
const finding = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "Missing restrictive CSP", severity: "high",
  evidence: "Header absent in recorded staging response.",
  recommendation: "Set a restrictive CSP header.", owner: "Platform",
  dueDate: "2026-11-20", status: "open", retestNote: "", riskAcceptanceNote: "",
};
const action = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  title: "Configure security header", owner: "Platform",
  dueDate: "2026-11-21", status: "open",
};
const assessment = (date, findings=[finding]) => createCaseSnapshot({
  engagement, ownerId: owner, assessmentName: "Private security assessment",
  asset: { target:"scope.example.test",criticality:"high",steward:"Platform",notes:"" },
  findings, capturedAt: date,
});
const investigation = (target="scope.example.test") => createInvestigation({
  target,title:"Private incident investigation",summary:"Manual review",
  investigator:"Platform",status:"investigating",priority:"high",
  closureNote:"",createdAt:"2026-11-20T10:00:00Z",timeline:[],
  actions:[action],evidenceIds:[],
}, {...engagement, scope_targets:[...engagement.scope_targets,target]},owner,[]);
const metadata = (id, marker) => ({
  id, owner_id:owner,engagement_id:engagement.id,
  description:marker,mime_type:"application/json",file_size:1000,
  storage_path:owner+"/"+engagement.id+"/"+id+".json",
  created_at:"2026-11-23T10:00:00Z",
});
const first=metadata("dddddddd-dddd-4ddd-8ddd-dddddddddddd",CASE_MARKER);
const second=metadata("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",INVESTIGATION_MARKER);
const parsed=(record,snapshot,eng=engagement) =>
  validateUnifiedCaseDownload(JSON.stringify(snapshot),record,eng,owner);

test("strict private metadata boundary rejects cross-owner, cross-engagement, wrong path and oversized files",()=>{
  assert.equal(inspectUnifiedEvidence(first,engagement,owner).kind,"assessment");
  assert.equal(inspectUnifiedEvidence(second,engagement,owner).kind,"investigation");
  assert.equal(inspectUnifiedEvidence({...first,description:"Unrecognized"},engagement,owner),null);
  assert.throws(()=>inspectUnifiedEvidence({...first,owner_id:"22222222-2222-4222-8222-222222222222"},engagement,owner),/does not belong/);
  assert.throws(()=>inspectUnifiedEvidence({...first,storage_path:"another/path"},engagement,owner),/invalid size/);
  assert.throws(()=>inspectUnifiedEvidence({...first,file_size:9999999},engagement,owner),/invalid size/);
});
test("private case parse revalidates current declared scope, type and attestation",()=>{
  const value=parsed(first,assessment("2026-11-22T10:00:00Z"));
  assert.equal(value.kind,"assessment");
  assert.equal(value.target,"scope.example.test");
  assert.throws(()=>parsed(first,assessment("2026-11-22T10:00:00Z"),
    {...engagement,scope_targets:["another.test"]}),/scope/i);
  assert.throws(()=>parsed(first,assessment("2026-11-22T10:00:00Z"),
    {...engagement,authorization_attested:false}),/attested/i);
  assert.throws(()=>parsed(first,investigation()),/version/i);
});
test("latest validated assessment only prevents double-counting historical findings",()=>{
  const old=parsed(first,assessment("2026-11-20T10:00:00Z"));
  const recent=parsed({...first,id:"fffae200-0000-4000-8000-aaaaaaaaaaaa"},assessment("2026-11-23T10:00:00Z"));
  const incident=parsed(second,investigation());
  const groups=groupValidatedCases([old,recent,incident],"2026-11-23");
  assert.equal(groups.length,1);
  assert.equal(groups[0].assessment.id,recent.id);
  assert.equal(groups[0].versionsReviewed,3);
  assert.equal(groups[0].sharedTargetOnly,true);
  assert.equal(groups[0].unresolvedFindings,1);
  assert.equal(groups[0].overdueFindings,1);
  assert.equal(groups[0].pendingActions,1);
  assert.equal(groups[0].overdueActions,1);
  assert.equal(UNIFIED_REVIEW_BATCH,6);
});
test("unreviewed metadata never implies complete security coverage",()=>{
  const groups=groupValidatedCases([parsed(first,assessment("2026-11-23T10:00:00Z"))],"2026-11-23");
  const result=summarizeUnifiedCases(groups,12,1);
  assert.equal(result.reviewedTargets,1);
  assert.equal(result.unreviewedCandidates,11);
  assert.equal(result.sharedTargetPairs,0);
});
test("two different declared targets never become a fabricated linked incident",()=>{
  const expanded={...engagement,scope_targets:["scope.example.test","api.example.test"]};
  const other=parsed(second,investigation("api.example.test"),expanded);
  const groups=groupValidatedCases([parsed(first,assessment("2026-11-23T10:00:00Z")),other],"2026-11-23");
  assert.equal(groups.length,2);
  assert.equal(groups.every(g=>!g.sharedTargetOnly),true);
});
test("export excludes raw observations and private storage paths",()=>{
  const record=parsed(first,assessment("2026-11-23T10:00:00Z"));
  record.snapshot.findings[0].evidence="SECRET_VALUE_NOT_FOR_EXPORT";
  const groups=groupValidatedCases([record],"2026-11-23");
  const report=unifiedCaseReport(groups,summarizeUnifiedCases(groups,1,1),"## Synthetic Client");
  assert.match(report,/\\#\\# Synthetic Client/);
  assert.match(report,/not establish a formal case link/i);
  assert.doesNotMatch(report,/SECRET_VALUE_NOT_FOR_EXPORT|storage_path|pentest-evidence/);
});
test("protected route, private evidence download, owner lookups and stale-result guards are integrated",async()=>{
  const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
  const [page,app,hub]=await Promise.all([
    read("src/pages/SecurityUnifiedCaseWorkspace.tsx"),read("src/App.tsx"),read("src/pages/CybersecurityHub.tsx")
  ]);
  assert.match(app,/path="\/cybersecurity\/unified-cases" element={<RequireAuth><SecurityUnifiedCaseWorkspace \/><\/RequireAuth>}/);
  assert.match(hub,/href: "\/cybersecurity\/unified-cases"/);
  assert.match(page,/from\("pentest_engagements"\)/);
  assert.match(page,/from\("pentest_evidence"\)/);
  assert.match(page,/from\("pentest_audit_events"\)/);
  assert.match(page,/from\("pentest-evidence"\)\.download/);
  assert.match(page,/\.range\(start, start \+ PAGE_SIZE - 1\)/);
  assert.match(page,/\.in\("id", parsed\.snapshot\.evidenceIds\)/);
  assert.match(page,/loadRequestToken\.current/);
  assert.match(page,/reviewRequestToken\.current/);
  assert.match(page,/validateUnifiedCaseDownload/);
  assert.match(page,/Load older private versions/);
  assert.match(page,/unifiedCaseReport/);
  assert.doesNotMatch(page,/service_role|SERVICE_ROLE_KEY|VITE_SUPABASE_SECRET/);
});
