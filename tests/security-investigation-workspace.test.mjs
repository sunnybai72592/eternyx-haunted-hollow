import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  INVESTIGATION_MARKER, INVESTIGATION_SCHEMA, INVESTIGATION_MAX_BYTES,
  createInvestigation, parseInvestigation, investigationReport, investigationTriage,
} from "../src/lib/securityInvestigationUtils.mjs";
const read = async (path) => readFile(new URL("../"+path,import.meta.url),"utf8");
const owner="11111111-1111-4111-8111-111111111111";
const engagement={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner_id:owner,
 authorization_attested:true,authorization_attested_at:"2026-11-23T10:00:00Z",
 status:"authorized",scope_targets:["scope.example.test","excluded.example.test"],
 excluded_targets:["excluded.example.test"]};
const evidenceId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const eventId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const actionId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const base={target:"scope.example.test",title:"Authorized incident review",summary:"Manual observation",
 investigator:"Response team",priority:"high",status:"investigating",closureNote:"",
 createdAt:"2026-11-23T10:00:00Z",timeline:[],actions:[],evidenceIds:[]};
const build=(overrides={},eng=engagement,who=owner,known=[])=>createInvestigation({...base,...overrides},eng,who,known);

test("owned attested in-scope investigation can be safely serialized and restored",()=>{
 const result=build();
 assert.equal(result.schema,INVESTIGATION_SCHEMA);
 assert.equal(result.target,"scope.example.test");
 assert.equal(parseInvestigation(JSON.stringify(result),engagement,owner).ownerId,owner);
 assert.match(investigationReport(result),/not independently validated/i);
});
test("foreign user, foreign engagement, excluded and undeclared targets are denied",()=>{
 assert.throws(()=>build({},engagement,"22222222-2222-4222-8222-222222222222"),/ownership/i);
 assert.throws(()=>build({}, {...engagement,owner_id:"22222222-2222-4222-8222-222222222222"}),/ownership/i);
 assert.throws(()=>build({target:"excluded.example.test"}),/scope/i);
 assert.throws(()=>build({target:"unknown.example.test"}),/scope/i);
 assert.throws(()=>build({}, {...engagement,authorization_attested:false}),/attested/i);
 assert.throws(()=>build({}, {...engagement,status:"draft"}),/attested/i);
});
test("case completion requires linked owned evidence, a documented closure and a decision/retest",()=>{
 assert.throws(()=>build({status:"closed"}),/Resolution requires/i);
 const timeline=[{id:eventId,type:"retest",description:"Manually checked resolved state",actor:"Reviewer",occurredAt:"2026-11-23T11:00:00Z"}];
 assert.throws(()=>build({status:"resolved",timeline,closureNote:"Documented mitigation has been reviewed",evidenceIds:[evidenceId]}),/Evidence reference/i);
 const resolved=build({status:"resolved",timeline,closureNote:"Documented mitigation has been reviewed",evidenceIds:[evidenceId]},engagement,owner,[evidenceId]);
 assert.equal(resolved.status,"resolved");
 const action={id:actionId,title:"Owner review",status:"open",dueDate:"2026-11-30",owner:"AppSec"};
 assert.throws(()=>build({...resolved,status:"closed",actions:[action]},engagement,owner,[evidenceId]),/outstanding actions/i);
 assert.equal(build({...resolved,status:"closed",actions:[{...action,status:"done"}]},engagement,owner,[evidenceId]).status,"closed");
});
test("private evidence must have unique owned references, and timeline/action IDs must be distinct",()=>{
 assert.throws(()=>build({evidenceIds:[evidenceId,evidenceId]},engagement,owner,[evidenceId]),/unique/i);
 const timeline={id:eventId,type:"observation",description:"Observed from reviewed logs",actor:"Team",occurredAt:"2026-11-23T11:00:00Z"};
 assert.throws(()=>build({timeline:[timeline,timeline]}),/unique/i);
 assert.throws(()=>build({actions:[{id:actionId,title:"x",owner:"",status:"open",dueDate:"2026-02-31"}]}),/real YYYY-MM-DD/i);
});
test("oversized JSON, malformed schema and invalid enumerations are rejected",()=>{
 const result=build();
 assert.throws(()=>parseInvestigation("{",engagement,owner),/cannot be parsed/i);
 assert.throws(()=>parseInvestigation("x".repeat(INVESTIGATION_MAX_BYTES+1),engagement,owner),/oversized/i);
 assert.throws(()=>parseInvestigation(JSON.stringify({...result,schema:"fake"}),engagement,owner),/schema/i);
 assert.throws(()=>build({priority:"made-up"}),/priority/i);
});
test("analyst report avoids markdown heading injection, and triage respects overdue deadlines",()=>{
 const result=build({title:"# Sensitive heading",actions:[{id:actionId,title:"Investigation response",owner:"AppSec",dueDate:"2026-11-20",status:"open"}]});
 const md=investigationReport(result);
 assert.match(md,/\\# Sensitive heading/);
 assert.match(md,/not independently validated/i);
 assert.equal(investigationTriage(result,"2026-11-23").overdue,1);
 assert.equal(investigationTriage(result,"2026-11-19").overdue,0);
});
test("workspace uses real owner-scoped engagements, private storage, audited evidence and authenticated route",async()=>{
 const [page,app,hub,migration]=await Promise.all([
 read("src/pages/SecurityInvestigationWorkspace.tsx"),read("src/App.tsx"),
 read("src/pages/CybersecurityHub.tsx"),read("supabase/migrations/20261111220000_pentest_evidence_and_audit.sql")]);
 assert.match(app,/path="\/cybersecurity\/investigations" element={<RequireAuth><SecurityInvestigationWorkspace \/><\/RequireAuth>}/);
 assert.match(hub,/href: "\/cybersecurity\/investigations"/);
 assert.match(hub,/mode: "Account workspace"/);
 assert.match(page,/from\("pentest_engagements"\)/);
 assert.match(page,/from\("pentest_evidence"\)/);
 assert.match(page,/from\("pentest_audit_events"\)/);
 assert.match(page,/from\("pentest-evidence"\)\.upload/);
 assert.match(page,/from\("pentest-evidence"\)\.download/);
 assert.match(page,/from\("pentest-evidence"\)\.remove/);
 assert.match(page,/owner_id: userId, engagement_id: selected\.id/);
 assert.match(page,/verifyEvidenceOwnership/);
 assert.match(page,/\\.range\(offset, offset \+ PAGE_SIZE - 1\)/);
 assert.match(page,/loadToken\.current/);
 assert.match(page,/INVESTIGATION_MARKER/);
 assert.match(page,/if \(registered\.error\)/);
 assert.match(migration,/pentest_evidence ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/CREATE POLICY "Engagement owners can read private pentest evidence"/);
 assert.doesNotMatch(page,/service_role|SERVICE_ROLE_KEY|VITE_SUPABASE_SECRET/);
});
