import { parsePortableWorkspaceArchive } from "./workspaceRecoveryFork.mjs";
import { parseWorkspaceArchiveV3 } from "./workspaceChecklistArchive.mjs";
import { WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "./workspaceFullBackup.mjs";
import { sha256Hex } from "./workspaceImportRecovery.mjs";

export const WORKSPACE_RECONCILIATION_VERSION = 1;
export const WORKSPACE_RECONCILIATION_MAX_TASKS = 1000;
export const WORKSPACE_RECONCILIATION_MAX_ITEMS = 1000;
export const WORKSPACE_RECONCILIATION_PAGE_SIZE = 25;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;

const indexed = (rows, indices, type) => {
  if (!Array.isArray(rows) || !Array.isArray(indices) ||
      indices.length > WORKSPACE_RECONCILIATION_MAX_TASKS ||
      new Set(indices).size !== indices.length ||
      indices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= rows.length)) {
    throw new Error("The " + type + " selection is invalid, duplicated or out of range");
  }
  return indices.map(i => rows[i]);
};
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

function projectScoped(snapshot, owner, projectId) {
  if (!snapshot || !Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.items) ||
      !Array.isArray(snapshot.steps) ||
      snapshot.tasks.length > WORKSPACE_RECONCILIATION_MAX_TASKS ||
      snapshot.items.length > WORKSPACE_RECONCILIATION_MAX_ITEMS) {
    throw new Error("Current private project has too many rows for a complete reviewed recovery");
  }
  const ids=new Set();
  for(const row of [...snapshot.tasks,...snapshot.items]) {
    if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id) ||
        row.owner_id !== owner || row.project_id !== projectId) {
      throw new Error("Recovery snapshot includes a duplicate, foreign or invalid record");
    }
    ids.add(row.id);
  }
  const tasks = new Set(snapshot.tasks.map(t=>t.id));
  const stepIds = new Set();
  const perTask = new Map();
  for(const step of snapshot.steps) {
    if (!step || typeof step.id !== "string" || !step.id || stepIds.has(step.id) ||
        step.owner_id !== owner || !tasks.has(step.task_id)) {
      throw new Error("Recovery checklist includes an invalid or foreign step");
    }
    stepIds.add(step.id);
    const list=perTask.get(step.task_id)??[];
    list.push(step);
    if (list.length > 30) throw new Error("A current task exceeds 30 checklist steps");
    perTask.set(step.task_id,list);
  }
  return perTask;
}

export function emptyWorkspaceReviewSelection() {
  return { sourceTasks: [], currentTasks: [], sourceItems: [], currentItems: [] };
}

export function selectWorkspaceReviewRecord(selection, section, index, enabled) {
  if (!["sourceTasks","currentTasks","sourceItems","currentItems"].includes(section) ||
      !Number.isSafeInteger(index) || index < 0 || index >= 1000 ||
      typeof enabled !== "boolean") {
    throw new Error("Unrecognized review selection");
  }
  const previous = selection?.[section] ?? [];
  const next = new Set(previous);
  if (enabled) next.add(index); else next.delete(index);
  return { ...selection, [section]:[...next].sort((a,b)=>a-b) };
}

export async function fingerprintWorkspaceReviewSnapshot(snapshot, owner, projectId) {
  const byTask=projectScoped(snapshot,owner,projectId);
  const canonical = {
    tasks: snapshot.tasks.map(t=>[
      t.id,t.title,t.details,t.status,t.priority,t.due_on,
      t.updated_at,t.completed_at,
      (byTask.get(t.id)??[]).map(s=>[
        s.id,s.task_id,s.title,s.done,s.created_at,s.updated_at,
      ]),
    ]),
    items: snapshot.items.map(i=>[
      i.id,i.kind,i.title,i.note_text,i.target_url,i.file_size,
      i.mime_type,i.storage_path,i.updated_at,
    ]),
  };
  return sha256Hex(JSON.stringify(canonical));
}

const taskPortable = (task, steps=[]) => ({
  title: task.title, details: task.details ?? "", status: task.status,
  priority: task.priority ?? "normal", due_on: task.due_on ?? null,
  checklist: steps.map(s=>({title:s.title,done:s.done})),
});
const itemPortable = item => item.kind==="note"
  ? {kind:"note",title:item.title,text:item.note_text}
  : {kind:"link",title:item.title,url:item.target_url};

export async function createWorkspaceReviewedReconciliation({
  rawSource, sourceBytes, sourceSha256, snapshot, snapshotSha256,
  owner, projectId, selection, forkId, createdAt,
}) {
  if (typeof rawSource !== "string" || typeof sourceSha256 !== "string" ||
      !HASH.test(sourceSha256) || typeof snapshotSha256 !== "string" ||
      !HASH.test(snapshotSha256) || typeof owner !== "string" || !owner ||
      typeof projectId !== "string" || !projectId || !UUID.test(forkId) ||
      !date(createdAt) || (sourceBytes !== undefined &&
        !(sourceBytes instanceof Uint8Array))) {
    throw new Error("Reviewed recovery is missing a valid source, owner or creation identity");
  }
  if (await sha256Hex(sourceBytes ?? rawSource) !== sourceSha256) {
    throw new Error("Original archive bytes have changed; no recovery was produced");
  }
  const source = await parsePortableWorkspaceArchive(rawSource);
  if (source.forkMarker) throw new Error("Select the original archive, not an existing recovery copy");
  const verifiedSnapshot = await fingerprintWorkspaceReviewSnapshot(snapshot,owner,projectId);
  if (verifiedSnapshot !== snapshotSha256) {
    throw new Error("Current project snapshot changed since the review; reload before selecting records");
  }
  const byTask=projectScoped(snapshot,owner,projectId);
  const selectedSourceTasks=indexed(source.parsed.tasks,selection?.sourceTasks,"original task");
  const selectedCurrentTasks=indexed(snapshot.tasks,selection?.currentTasks,"current task");
  const selectedSourceItems=indexed(source.parsed.items,selection?.sourceItems,"original item");
  const currentNoteLinks=snapshot.items.filter(i=>["note","link"].includes(i.kind));
  const selectedCurrentItems=indexed(currentNoteLinks,selection?.currentItems,"current item");
  if (selectedSourceTasks.length + selectedCurrentTasks.length > WORKSPACE_RECONCILIATION_MAX_TASKS ||
      selectedSourceItems.length + selectedCurrentItems.length > WORKSPACE_RECONCILIATION_MAX_ITEMS) {
    throw new Error("Reviewed recovery exceeds the 1,000-task or 1,000-item limit");
  }
  if (!selectedSourceTasks.length && !selectedCurrentTasks.length &&
      !selectedSourceItems.length && !selectedCurrentItems.length) {
    throw new Error("Select at least one record explicitly before preparing a recovery");
  }
  const tasks=[
    ...selectedSourceTasks.map(t=>taskPortable(t,t.checklist??[])),
    ...selectedCurrentTasks.map(t=>taskPortable(t,
      (byTask.get(t.id)??[]).map(s=>({title:s.title,done:s.done})))),
  ];
  const items=[
    ...selectedSourceItems.map(itemPortable),
    ...selectedCurrentItems.map(itemPortable),
  ];
  const payloadSha256=await sha256Hex(JSON.stringify({tasks,items}));
  const reviewedSteps=tasks.reduce((total,task)=>total+task.checklist.length,0);
  const excludedFiles=(source.parsed.files?.length??source.parsed.filesSkipped??0)+
    snapshot.items.filter(i=>i.kind==="file").length;
  const nameSuffix=" (Reviewed recovery)";
  const newName=(source.parsed.project.name.slice(0,120-nameSuffix.length).trimEnd()+nameSuffix);
  const document = {
    format: "eternyx.workspace.project",
    format_version: 3, archive_mode: "metadata",
    exported_at: createdAt,
    project: { name:newName,description:source.parsed.project.description,
      status:"active",created_at:createdAt },
    tasks,items,
    reviewed_reconciliation: {
      version:2,
      fork_id:forkId,
      created_at:createdAt,
      source_sha256:sourceSha256,
      snapshot_sha256:snapshotSha256,
      payload_sha256:payloadSha256,
      checklist_steps:reviewedSteps,
      excluded_files:excludedFiles,
      selected: {
        source_tasks:selectedSourceTasks.length,
        current_tasks:selectedCurrentTasks.length,
        source_items:selectedSourceItems.length,
        current_items:selectedCurrentItems.length,
      },
    },
    limitations: "User-selected current and source tasks/checklists/notes/links ONLY. No private file contents or file manifests, note revision history, activity audit or original completion timestamps. No original projects were changed.",
  };
  const content=JSON.stringify(document);
  if (new TextEncoder().encode(content).length > WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES) {
    throw new Error("Reviewed archive exceeds 24 MiB; no incomplete file was produced");
  }
  // Reject any forged note/link/task/checklist data using the existing
  // full v3 import parser. This does NOT trust the imported origin metadata.
  const parsed = await parseWorkspaceArchiveV3(content);
  if (parsed.tasks.length !== tasks.length || parsed.items.length !== items.length ||
      parsed.stepCount !== tasks.reduce((n,t)=>n+t.checklist.length,0) ||
      parsed.filesSkipped !== 0) {
    throw new Error("Final reconciliation verification did not preserve the selected records");
  }
  if (JSON.stringify(parsed.tasks) !== JSON.stringify(tasks) ||
      JSON.stringify(parsed.items) !== JSON.stringify(items.map(i=>({
        kind:i.kind,title:i.title,
        note_text:i.kind==="note"?i.text:null,
        target_url:i.kind==="link"?i.url:null,
      })))) {
    throw new Error("Selected record contents were modified during reconciliation verification");
  }
  const fingerprint=await sha256Hex(content);
  if (fingerprint===sourceSha256) throw new Error("Reviewed archive did not create a new import identity");
  return {
    content,fingerprint,projectName:newName,
    taskCount:tasks.length,stepCount:parsed.stepCount,itemCount:items.length,
    excludedSourceFiles:source.parsed.files?.length??source.parsed.filesSkipped??0,
    excludedCurrentFiles:snapshot.items.filter(i=>i.kind==="file").length,
    payloadSha256,selected:document.reviewed_reconciliation.selected,
    reviewedSteps,excludedFiles,sourceSha256,snapshotSha256,
  };
}
