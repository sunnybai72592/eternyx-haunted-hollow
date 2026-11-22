import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseAutomationControlRequest} from "../supabase/functions/_shared/automation-control-contract.mjs";
import {createTemplateCards,fingerprintPreview} from "../supabase/functions/_shared/automation-template-catalog.mjs";
import {runLocalWorkflow} from "../src/lib/automationWorkflow.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const workflowId="11111111-1111-4111-8111-111111111111";
const key="22222222-2222-4222-8222-222222222222";
const master="a".repeat(64);

test("template catalog and installs use exact input fields and UUID receipt",()=>{
  assert.equal(parseAutomationControlRequest({action:"templates"}).ok,true);
  assert.equal(parseAutomationControlRequest({
    action:"installTemplate",templateId:"clean-lines",requestKey:key,
  }).ok,true);
  for(const req of [
    {action:"templates",steps:[{kind:"eval"}]},
    {action:"installTemplate",templateId:"bad/../template",requestKey:key},
    {action:"installTemplate",templateId:"clean-lines",requestKey:"fake"},
    {action:"installTemplate",templateId:"clean-lines",requestKey:key,
      userId:workflowId},
    {action:"installTemplate",templateId:"clean-lines",requestKey:key,
      steps:[{kind:"script",value:"process.env"}]},
    {action:"installTemplate",templateId:"clean-lines",requestKey:key,
      destination:"https://127.0.0.1"},
  ])assert.equal(parseAutomationControlRequest(req).ok,false,JSON.stringify(req));
});

test("server preview is restricted to exact owner workflow, input bytes and UUID",()=>{
  const ok=parseAutomationControlRequest({
    action:"previewWorkflow",workflowId,requestKey:key,input:"  Hello \n hi",
  });
  assert.equal(ok.ok,true);
  assert.equal(ok.input,"  Hello \n hi");
  for(const req of [
    {action:"previewWorkflow",workflowId,requestKey:key,input:"é".repeat(1001)},
    {action:"previewWorkflow",workflowId,requestKey:key,input:"ok",runNow:true},
    {action:"previewWorkflow",workflowId,requestKey:key,input:"ok",
      steps:[{kind:"eval"}]},
    {action:"previewWorkflow",workflowId,requestKey:key,input:"ok",url:"file:///etc/passwd"},
    {action:"previewWorkflow",workflowId,requestKey:"fake",input:"ok"},
    {action:"previewWorkflow",workflowId:"fake",requestKey:key,input:"ok"},
  ])assert.equal(parseAutomationControlRequest(req).ok,false,JSON.stringify(req));
});

test("server-curated cards compute their real output using the deterministic engine",()=>{
  const catalog=createTemplateCards([{
    id:"clean-lines",version:1,name:"Clean & deduplicate",category:"operations",
    description:"Normalize blank lines and remove duplicate text.",sample_input:"  Alpha \n\nalpha\nBeta",
    steps:[{id:"a1",kind:"trim"},{id:"a2",kind:"remove_blanks"},
      {id:"a3",kind:"unique",caseSensitive:false}],
  }]);
  assert.equal(catalog[0].source,"server_curated_catalog");
  assert.equal(catalog[0].sampleOutput,"Alpha\nBeta");
  assert.equal(catalog[0].stepCount,3);
  assert.deepEqual(catalog[0].operations,["trim","remove_blanks","unique"]);
  assert.equal(catalog[0].sampleOutput,runLocalWorkflow(
    catalog[0].sampleInput,[
      {id:"a1",kind:"trim"},{id:"a2",kind:"remove_blanks"},
      {id:"a3",kind:"unique",caseSensitive:false},
    ]).output);
});

test("curated listing rejects fabricated outputs, unsupported operations and duplicate template IDs",()=>{
  const good={id:"security-missing",version:1,name:"Missing security controls",
    category:"security",description:"Scan supplied text for literal missing lines",
    sample_input:"CSP missing\nHSTS present",
    steps:[{id:"a1",kind:"keep_contains",value:"missing",caseSensitive:false}]};
  assert.throws(()=>createTemplateCards([good,good]));
  assert.throws(()=>createTemplateCards([{...good,steps:[{id:"a1",kind:"shell",value:"whoami"}]}]));
  assert.throws(()=>createTemplateCards([{...good,id:"../../internal"}]));
  assert.throws(()=>createTemplateCards([{...good,category:"payments"}]));
  assert.throws(()=>createTemplateCards([{...good,sample_input:"x".repeat(2001)}]));
});

test("preview audit fingerprint is keyed and domain separated; raw input not exposed",async()=>{
  const a=await fingerprintPreview(master,workflowId,workflowId,1,"small secret");
  assert.match(a,/^[0-9a-f]{64}$/);
  assert.equal(a,await fingerprintPreview(master,workflowId,workflowId,1,"small secret"));
  assert.notEqual(a,await fingerprintPreview(master,workflowId,workflowId,2,"small secret"));
  assert.notEqual(a,await fingerprintPreview(master,workflowId,workflowId,1,"different"));
  assert.notEqual(a,await fingerprintPreview("b".repeat(64),workflowId,workflowId,1,"small secret"));
  assert.ok(!a.includes("small secret"));
  await assert.rejects(fingerprintPreview("abc",workflowId,workflowId,1,"x"));
});

test("SQL enforces actual curated recipes, owned copies and private capped previews",async()=>{
  const sql=await read("supabase/migrations/20261123050000_automation_template_gallery.sql");
  for(const id of ["clean-lines","sort-inventory","triage-errors","review-queue",
    "security-missing","cp-rectifiers","coating-holds","release-tags"]){
    assert.ok(sql.includes("('"+id+"',1,"),"Missing recipe "+id);
  }
  assert.match(sql,/automation_instantiate_template/);
  assert.match(sql,/automation_record_workflow_preview/);
  assert.match(sql,/automation_prune_template_metadata/);
  assert.match(sql,/template_copy_deleted/);
  assert.match(sql,/idempotency_conflict/);
  assert.match(sql,/preview_limit/);
  assert.match(sql,/interval '24 hours'\)>=20/);
  assert.match(sql,/input_bytes BETWEEN 0 AND 2000/);
  assert.match(sql,/output_bytes BETWEEN 0 AND 10000/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});

test("no-side-effect endpoint stores only preview metrics and server-sourced steps",async()=>{
  const edge=await read("supabase/functions/automation-control/index.ts");
  const gallery=await read("src/components/AutomationTemplateGallery.tsx");
  const cloud=await read("src/components/AutomationCloudPanel.tsx");
  assert.match(edge,/authenticateUser\(req\)/);
  assert.match(edge,/automation_template_catalog/);
  assert.match(edge,/createTemplateCards\(rows\?\?\[\]\)/);
  assert.match(edge,/automation_instantiate_template/);
  assert.match(edge,/automation_record_workflow_preview/);
  assert.match(edge,/runLocalWorkflow\(request\.input,workflow\.steps\)/);
  assert.match(edge,/fingerprintPreview\(/);
  assert.match(edge,/AUTOMATION_PREVIEW_AUDIT_KEY/);
  assert.match(edge,/cloudRunRecorded:false/);
  assert.match(edge,/externalActionTriggered:false/);
  assert.match(edge,/rawOutputStored:false/);
  assert.match(gallery,/Save this template as my workflow/);
  assert.match(gallery,/source!=="authenticated_server"/);
  assert.match(cloud,/<AutomationTemplateGallery/);
  assert.match(cloud,/Preview safely \(20\/day\)/);
});
