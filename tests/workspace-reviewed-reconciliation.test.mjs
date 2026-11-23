import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceArchiveV3, parseWorkspaceArchiveV3 } from "../src/lib/workspaceChecklistArchive.mjs";
import { sha256Hex } from "../src/lib/workspaceImportRecovery.mjs";
import {
  createWorkspaceReviewedReconciliation, emptyWorkspaceReviewSelection,
  selectWorkspaceReviewRecord, fingerprintWorkspaceReviewSnapshot,
} from "../src/lib/workspaceReconciliation.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const projectId="22222222-2222-4222-8222-222222222222";
const forkId="33333333-3333-4333-8333-333333333333";
const at="2026-11-23T12:00:00.000Z";
const original={id:projectId,owner_id:owner,name:"Review",description:"Original inspection",status:"active",created_at:at};
const sourceTasks=[
  {id:"source-1",project_id:projectId,owner_id:owner,title:"Repeated title",
    details:"Original current reading",status:"todo",priority:"high",due_on:null,created_at:at},
  {id:"source-2",project_id:projectId,owner_id:owner,title:"Repeated title",
    details:"Original second",status:"done",priority:"normal",due_on:null,created_at:at},
];
const sourceSteps=[{id:"source-step",task_id:"source-1",owner_id:owner,
  title:"Use reference electrode",done:false,created_at:at}];
const sourceItems=[
  {project_id:projectId,owner_id:owner,kind:"note",title:"Report",
    note_text:"Source-only text",created_at:at},
  {project_id:projectId,owner_id:owner,kind:"file",title:"proof.txt",
    mime_type:"text/plain",file_size:5,storage_path:owner+"/"+projectId+"/private",created_at:at},
];
const snapshot={
  tasks:[
    {id:"current-1",project_id:projectId,owner_id:owner,title:"Repeated title",
      details:"Manually edited reading",status:"in_progress",priority:"urgent",
      due_on:null,updated_at:at,completed_at:null},
    {id:"current-2",project_id:projectId,owner_id:owner,title:"Another task",
      details:"Current data",status:"todo",priority:"low",due_on:null,updated_at:at,completed_at:null},
  ],
  items:[
    {id:"current-note",project_id:projectId,owner_id:owner,kind:"note",title:"Report",
      note_text:"Edited current notes",target_url:null,updated_at:at,file_size:null,
      mime_type:null,storage_path:null},
    {id:"current-file",project_id:projectId,owner_id:owner,kind:"file",title:"physical.txt",
      note_text:null,target_url:null,updated_at:at,file_size:5,
      mime_type:"text/plain",storage_path:owner+"/"+projectId+"/secret"},
  ],
  steps:[
    {id:"current-step",task_id:"current-1",owner_id:owner,
      title:"Keep this current checklist",done:true,created_at:at},
  ],
};

const source=()=>createWorkspaceArchiveV3(original,sourceTasks,sourceItems,sourceSteps,
  async()=>new Blob([new TextEncoder().encode("hello")],{type:"text/plain"}));
const build=async(selection,changes={})=>{
  const rawSource=await source();
  const sourceSha256=await sha256Hex(rawSource);
  const snapshotSha256=await fingerprintWorkspaceReviewSnapshot(snapshot,owner,projectId);
  return createWorkspaceReviewedReconciliation({
    rawSource,sourceSha256,snapshot,snapshotSha256,owner,projectId,
    selection,forkId,createdAt:at,...changes,
  });
};

test("no records are automatically selected and selection indices are explicit",()=>{
  const empty=emptyWorkspaceReviewSelection();
  assert.deepEqual(empty,{
    sourceTasks:[],currentTasks:[],sourceItems:[],currentItems:[],
  });
  const one=selectWorkspaceReviewRecord(empty,"currentTasks",0,true);
  assert.deepEqual(one.currentTasks,[0]);
  assert.deepEqual(empty.currentTasks,[]);
  const two=selectWorkspaceReviewRecord(one,"currentTasks",0,false);
  assert.deepEqual(two.currentTasks,[]);
  assert.throws(()=>selectWorkspaceReviewRecord(one,"not-a-kind",0,true),/Unrecognized/);
  assert.throws(()=>selectWorkspaceReviewRecord(one,"sourceTasks",-1,true),/Unrecognized/);
});

test("explicitly selected source and current tasks retain distinct text and checklist states",async()=>{
  const selection={
    sourceTasks:[0,1],currentTasks:[0],
    sourceItems:[0],currentItems:[0],
  };
  const result=await build(selection);
  assert.equal(result.taskCount,3);
  assert.equal(result.stepCount,2);
  assert.equal(result.itemCount,2);
  assert.equal(result.excludedSourceFiles,1);
  assert.equal(result.excludedCurrentFiles,1);
  assert.match(result.projectName,/Reviewed recovery/);
  assert.ok(!result.content.includes("private"));
  assert.ok(!result.content.includes("current-1"));
  assert.ok(!result.content.includes("source-step"));
  assert.ok(!result.content.includes('"storage_path"'));
  const parsed=await parseWorkspaceArchiveV3(result.content);
  assert.deepEqual(parsed.tasks.map(t=>t.title),
    ["Repeated title","Repeated title","Repeated title"]);
  assert.deepEqual(parsed.tasks.map(t=>t.details),
    ["Original current reading","Original second","Manually edited reading"]);
  assert.deepEqual(parsed.tasks.map(t=>t.priority),["high","normal","urgent"]);
  assert.deepEqual(parsed.tasks.map(t=>t.checklist.length),[1,0,1]);
  assert.equal(parsed.tasks[0].checklist[0].done,false);
  assert.equal(parsed.tasks[2].checklist[0].done,true);
  assert.deepEqual(parsed.items.map(i=>i.note_text),
    ["Source-only text","Edited current notes"]);
  assert.equal(parsed.filesSkipped,0);
  assert.equal(result.fingerprint,await sha256Hex(result.content));
  assert.notEqual(result.fingerprint,JSON.parse(result.content).reviewed_reconciliation.source_sha256);
});

test("source private file content is excluded even when original contains verified bytes",async()=>{
  const result=await build({sourceTasks:[0],currentTasks:[],sourceItems:[],currentItems:[]});
  const json=JSON.parse(result.content);
  assert.equal(json.archive_mode,"metadata");
  assert.equal(json.items.length,0);
  assert.ok(!result.content.includes("aGVsbG8="));
  assert.equal(json.reviewed_reconciliation.selected.source_tasks,1);
});

test("source and current work are protected from malformed, duplicate or out-of-range choices",async()=>{
  await assert.rejects(build(emptyWorkspaceReviewSelection()),/Select at least one/);
  await assert.rejects(build({sourceTasks:[0,0],currentTasks:[],sourceItems:[],currentItems:[]}),
    /invalid, duplicated/);
  await assert.rejects(build({sourceTasks:[8],currentTasks:[],sourceItems:[],currentItems:[]}),
    /invalid, duplicated/);
  await assert.rejects(build({sourceTasks:[0],currentTasks:[],sourceItems:[],currentItems:[]},{
    snapshotSha256:"0".repeat(64),
  }),/changed since the review/);
  await assert.rejects(build({sourceTasks:[0],currentTasks:[],sourceItems:[],currentItems:[]},{
    sourceSha256:"0".repeat(64),
  }),/Original archive bytes/);
  await assert.rejects(build({sourceTasks:[0],currentTasks:[],sourceItems:[],currentItems:[]},{
    snapshot:{...snapshot,tasks:[{...snapshot.tasks[0],owner_id:"foreign"}]},
  }),/foreign/);
  await assert.rejects(build({sourceTasks:[0],currentTasks:[],sourceItems:[],currentItems:[]},{
    snapshot:{...snapshot,items:[snapshot.items[0],snapshot.items[0]]},
  }),/duplicate/);
});

test("review is invalidated by same-count edits or changed checklist states",async()=>{
  const before=await fingerprintWorkspaceReviewSnapshot(snapshot,owner,projectId);
  const after=await fingerprintWorkspaceReviewSnapshot({
    ...snapshot,tasks:[{...snapshot.tasks[0],details:"Changed again"},snapshot.tasks[1]],
  },owner,projectId);
  const changedStep=await fingerprintWorkspaceReviewSnapshot({
    ...snapshot,steps:[{...snapshot.steps[0],done:false}],
  },owner,projectId);
  assert.notEqual(before,after);
  assert.notEqual(before,changedStep);
});
