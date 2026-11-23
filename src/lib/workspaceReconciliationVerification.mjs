import { parseWorkspaceArchiveV3 } from "./workspaceChecklistArchive.mjs";
import { sha256Hex } from "./workspaceImportRecovery.mjs";

// SHA-256 here detects changed local bytes / payloads. It is NOT a signature.
// The source/snapshot digests in a downloaded archive are user-supplied claims.
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const count=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const keys=(obj,expected)=>obj && typeof obj==="object" &&
  !Array.isArray(obj) &&
  Object.keys(obj).sort().join("|")===expected.slice().sort().join("|");

export async function verifyWorkspaceReviewedArchive(raw,expectedSha256=null,rawBytes=null) {
  if(typeof raw!=="string" || (rawBytes!==null && !(rawBytes instanceof Uint8Array)) ||
    (expectedSha256!==null && (typeof expectedSha256!=="string" ||
      !SHA.test(expectedSha256)))) {
    throw new Error("Choose a valid UTF-8 reviewed recovery archive and expected digest");
  }
  const archiveSha256=await sha256Hex(rawBytes??raw);
  if(expectedSha256 && archiveSha256!==expectedSha256)
    throw new Error("Archive SHA-256 differs from its owner-only preparation receipt");
  let doc;
  try {doc=JSON.parse(raw);} catch {throw new Error("Reviewed archive contains invalid JSON");}
  if(!doc || typeof doc!=="object" || !doc.reviewed_reconciliation)
    throw new Error("File is not a reviewed reconciliation archive");
  const marker=doc.reviewed_reconciliation;
  if(![1,2].includes(marker.version) || typeof marker.fork_id!=="string" ||
    !UUID.test(marker.fork_id) || typeof marker.created_at!=="string" ||
    !Number.isFinite(Date.parse(marker.created_at)) ||
    new Date(marker.created_at).toISOString()!==marker.created_at ||
    typeof marker.source_sha256!=="string" || !SHA.test(marker.source_sha256) ||
    typeof marker.snapshot_sha256!=="string" || !SHA.test(marker.snapshot_sha256) ||
    !keys(marker.selected,["source_tasks","current_tasks","source_items","current_items"]) ||
    !Object.values(marker.selected).every(v=>count(v,1000))) {
    throw new Error("Reviewed archive contains invalid selection provenance");
  }
  const legacy=marker.version===1;
  if(legacy) {
    if(!keys(marker,["version","fork_id","created_at","source_sha256","snapshot_sha256","selected"]))
      throw new Error("Legacy reviewed archive has unrecognized provenance fields");
  } else if(!keys(marker,[
    "version","fork_id","created_at","source_sha256","snapshot_sha256",
    "payload_sha256","checklist_steps","excluded_files","selected",
  ]) || typeof marker.payload_sha256!=="string" || !SHA.test(marker.payload_sha256) ||
    !count(marker.checklist_steps,30000) || !count(marker.excluded_files,2000)) {
    throw new Error("Reviewed archive contains invalid digest or exclusion metadata");
  }
  const parsed=await parseWorkspaceArchiveV3(raw);
  if(parsed.archiveMode!=="metadata" || parsed.files?.length ||
    parsed.filesSkipped!==0 || doc.items.some(item=>item?.kind==="file")) {
    throw new Error("A reviewed reconciliation cannot contain private file manifests or bytes");
  }
  const selected=marker.selected;
  const taskCount=selected.source_tasks+selected.current_tasks;
  const itemCount=selected.source_items+selected.current_items;
  if(taskCount!==parsed.tasks.length || itemCount!==parsed.items.length ||
    taskCount>1000 || itemCount>1000 || taskCount+itemCount<1) {
    throw new Error("Reviewed selection counts do not match actual archive records");
  }
  const payloadSha256=await sha256Hex(JSON.stringify({tasks:doc.tasks,items:doc.items}));
  if(!legacy && (marker.payload_sha256!==payloadSha256 ||
      marker.checklist_steps!==parsed.stepCount ||
      marker.excluded_files<0)) {
    throw new Error("Reviewed archive payload or checklist integrity check failed");
  }
  return {
    archiveSha256,payloadSha256,sourceSha256:marker.source_sha256,
    snapshotSha256:marker.snapshot_sha256,selected:{...selected},
    taskCount,itemCount,stepCount:parsed.stepCount,
    excludedFiles:legacy?null:marker.excluded_files,
    version:marker.version,
    verifiedPayload:!legacy,
    mode:"metadata",
  };
}

export function buildWorkspaceReviewReceiptArgs(sessionId,verification) {
  if(typeof sessionId!=="string" || !UUID.test(sessionId) ||
    !verification?.verifiedPayload || verification.version!==2 ||
    !SHA.test(verification.archiveSha256) ||
    !SHA.test(verification.payloadSha256) ||
    !SHA.test(verification.sourceSha256) ||
    !SHA.test(verification.snapshotSha256) ||
    !verification.selected || !count(verification.stepCount,30000) ||
    !count(verification.excludedFiles,2000)) {
    throw new Error("Cannot journal an unverified or legacy reviewed archive");
  }
  const selected=verification.selected;
  const values=["source_tasks","current_tasks","source_items","current_items"].map(k=>selected[k]);
  if(!values.every(v=>count(v,1000)) ||
    values[0]+values[1]!==verification.taskCount ||
    values[2]+values[3]!==verification.itemCount) {
    throw new Error("Reconciliation counts are not verified");
  }
  return {
    p_source_session_id:sessionId,
    p_source_sha256:verification.sourceSha256,
    p_snapshot_sha256:verification.snapshotSha256,
    p_archive_sha256:verification.archiveSha256,
    p_payload_sha256:verification.payloadSha256,
    p_source_tasks:selected.source_tasks,
    p_current_tasks:selected.current_tasks,
    p_source_items:selected.source_items,
    p_current_items:selected.current_items,
    p_checklist_steps:verification.stepCount,
    p_excluded_files:verification.excludedFiles,
  };
}
