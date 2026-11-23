import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceReviewedReconciliation, fingerprintWorkspaceReviewSnapshot } from "../src/lib/workspaceReconciliation.mjs";
import { createWorkspaceArchiveV3 } from "../src/lib/workspaceChecklistArchive.mjs";
import { sha256Hex } from "../src/lib/workspaceImportRecovery.mjs";
import {
  verifyWorkspaceReviewedArchive,buildWorkspaceReviewReceiptArgs,
} from "../src/lib/workspaceReconciliationVerification.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const projectId="22222222-2222-4222-8222-222222222222";
const forkId="33333333-3333-4333-8333-333333333333";
const sessionId="44444444-4444-4444-8444-444444444444";
const now="2026-11-23T12:00:00.000Z";
const project={id:projectId,owner_id:owner,name:"Review of actual readings",
  description:"Project",status:"active",created_at:now};
const sourceTasks=[
  {id:"s1",owner_id:owner,project_id:projectId,title:"Inspect",
    details:"Original",status:"todo",priority:"high",due_on:null,created_at:now},
];
const sourceSteps=[{id:"st1",owner_id:owner,task_id:"s1",
  title:"Check electrode",done:false,created_at:now}];
const snapshot={
  tasks:[{id:"cur1",owner_id:owner,project_id:projectId,title:"Inspect",
    details:"Current",status:"in_progress",priority:"urgent",due_on:null,
    updated_at:now,completed_at:null}],
  steps:[{id:"curstep",task_id:"cur1",owner_id:owner,
    title:"Measure off",done:true,created_at:now}],
  items:[{id:"n1",owner_id:owner,project_id:projectId,kind:"note",title:"Readings",
    note_text:"Manual data",target_url:null,storage_path:null,mime_type:null,file_size:null,
    updated_at:now}],
};
const selected={sourceTasks:[0],currentTasks:[0],sourceItems:[],currentItems:[0]};
async function create(){
  const rawSource=await createWorkspaceArchiveV3(project,sourceTasks,[],sourceSteps);
  const sourceSha256=await sha256Hex(rawSource);
  const snapshotSha256=await fingerprintWorkspaceReviewSnapshot(snapshot,owner,projectId);
  return createWorkspaceReviewedReconciliation({
    rawSource,sourceSha256,snapshot,snapshotSha256,
    owner,projectId,selection:selected,forkId,createdAt:now,
  });
}

test("fresh reviewed archive carries independently verifiable selected payload and counts",async()=>{
  const fork=await create();
  const verified=await verifyWorkspaceReviewedArchive(fork.content,fork.fingerprint);
  assert.equal(verified.verifiedPayload,true);
  assert.equal(verified.version,2);
  assert.equal(verified.taskCount,2);
  assert.equal(verified.itemCount,1);
  assert.equal(verified.stepCount,2);
  assert.equal(verified.payloadSha256,fork.payloadSha256);
  assert.equal(verified.sourceSha256,fork.sourceSha256);
  assert.equal(verified.snapshotSha256,fork.snapshotSha256);
  assert.equal(verified.excludedFiles,0);
  const args=buildWorkspaceReviewReceiptArgs(sessionId,verified);
  assert.deepEqual({
    source:args.p_source_tasks,current:args.p_current_tasks,
    sourceItems:args.p_source_items,currentItems:args.p_current_items,
    steps:args.p_checklist_steps,
  },{source:1,current:1,sourceItems:0,currentItems:1,steps:2});
  assert.equal(args.p_archive_sha256,await sha256Hex(fork.content));
  assert.equal(args.p_payload_sha256,fork.payloadSha256);
  assert.ok(!fork.content.includes(owner));
  assert.ok(!fork.content.includes('"storage_path"'));
});

test("exact expected file SHA catches byte changes before any parsing",async()=>{
  const fork=await create();
  await assert.rejects(
    verifyWorkspaceReviewedArchive(fork.content+" ",fork.fingerprint),
    /SHA-256 differs/);
  await assert.rejects(
    verifyWorkspaceReviewedArchive(fork.content,"f".repeat(64)),
    /SHA-256 differs/);
  const bytes=new Uint8Array([239,187,191,...new TextEncoder().encode(fork.content)]);
  await assert.rejects(
    verifyWorkspaceReviewedArchive(fork.content,fork.fingerprint,bytes),
    /SHA-256 differs/);
});

test("changed task content and checklist state are caught by internal selected payload digest",async()=>{
  const fork=await create();
  const doc=JSON.parse(fork.content);
  doc.tasks[0].details="Malicious replacement";
  await assert.rejects(
    verifyWorkspaceReviewedArchive(JSON.stringify(doc)),/payload or checklist integrity/);
  const stepDoc=JSON.parse(fork.content);
  stepDoc.tasks[1].checklist[0].done=false;
  await assert.rejects(
    verifyWorkspaceReviewedArchive(JSON.stringify(stepDoc)),/payload or checklist integrity/);
});

test("forged counts, missing marker and extra payload field are rejected",async()=>{
  const fork=await create();
  const doc=JSON.parse(fork.content);
  doc.reviewed_reconciliation.selected.current_tasks=0;
  await assert.rejects(
    verifyWorkspaceReviewedArchive(JSON.stringify(doc)),/counts do not match/);
  const stepDoc=JSON.parse(fork.content);
  stepDoc.reviewed_reconciliation.checklist_steps=0;
  await assert.rejects(
    verifyWorkspaceReviewedArchive(JSON.stringify(stepDoc)),/integrity check/);
  const malformed=JSON.parse(fork.content);
  malformed.reviewed_reconciliation.injected="unverified";
  await assert.rejects(
    verifyWorkspaceReviewedArchive(JSON.stringify(malformed)),/invalid digest or exclusion/);
  const omitted=JSON.parse(fork.content);
  delete omitted.reviewed_reconciliation;
  await assert.rejects(
    verifyWorkspaceReviewedArchive(JSON.stringify(omitted)),/not a reviewed reconciliation/);
});

test("historical Phase 13 v1 markers remain readable but are never falsely marked payload-verified",async()=>{
  const fork=await create();
  const doc=JSON.parse(fork.content);
  doc.reviewed_reconciliation.version=1;
  delete doc.reviewed_reconciliation.payload_sha256;
  delete doc.reviewed_reconciliation.checklist_steps;
  delete doc.reviewed_reconciliation.excluded_files;
  const legacy=await verifyWorkspaceReviewedArchive(JSON.stringify(doc));
  assert.equal(legacy.verifiedPayload,false);
  assert.equal(legacy.version,1);
  assert.equal(legacy.taskCount,2);
  assert.throws(()=>buildWorkspaceReviewReceiptArgs(sessionId,legacy),/unverified or legacy/);
});

test("untrusted or mismatched identifiers cannot create a verified journal receipt request",async()=>{
  const fork=await create();
  const verified=await verifyWorkspaceReviewedArchive(fork.content);
  assert.throws(()=>buildWorkspaceReviewReceiptArgs("missing",verified),/unverified/);
  assert.throws(()=>buildWorkspaceReviewReceiptArgs(sessionId,{
    ...verified,taskCount:3,
  }),/counts are not verified/);
  assert.throws(()=>buildWorkspaceReviewReceiptArgs(sessionId,{
    ...verified,excludedFiles:-1,
  }),/unverified/);
});
