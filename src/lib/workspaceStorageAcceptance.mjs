import {WORKSPACE_BUCKET,WORKSPACE_MIME_TYPES,MAX_WORKSPACE_FILE_BYTES} from "./workspaceRules.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STORAGE_APPROVAL="PRIVATE_FIXTURE_BYTES_READ_ONLY_STAGING";
export const STORAGE_BUCKET=WORKSPACE_BUCKET;
export function validateStorageConfig(env,base){
  if(env.WORKSPACE_STAGING_STORAGE_CONFIRM!==STORAGE_APPROVAL)
    throw Error("Workspace storage blocked: explicit-fixture-read-approval-required");
  const id=String(env.WORKSPACE_STAGING_STORAGE_FILE_ITEM_ID??"").trim();
  const digest=String(env.WORKSPACE_STAGING_STORAGE_SHA256??"").trim().toLowerCase();
  if(!UUID.test(id))throw Error("Workspace storage blocked: file-item-uuid-required");
  if(!/^[0-9a-f]{64}$/.test(digest))
    throw Error("Workspace storage blocked: trusted-fixture-sha256-required");
  return {...base,storageItemId:id,expectedDigest:digest};
}
export function validateFileFixture(row,id,owner){
  if(!row||row.id!==id||row.owner_id!==owner||row.kind!=="file"||
    !UUID.test(row.project_id)||!Number.isSafeInteger(row.file_size)||
    row.file_size<1||row.file_size>MAX_WORKSPACE_FILE_BYTES||
    !WORKSPACE_MIME_TYPES.includes(row.mime_type)||
    typeof row.storage_path!=="string")
    throw Error("Workspace storage blocked: invalid-file-fixture");
  const p=row.storage_path.split("/");
  if(p.length!==3||p[0]!==owner||p[1]!==row.project_id||
    !UUID.test(p[2].slice(0,36))||p[2][36]!=="-"||
    !/^[\p{L}\p{N}._-]{38,130}$/u.test(p[2])||p[2].includes(".."))
    throw Error("Workspace storage blocked: unsafe-object-key");
  return {path:row.storage_path,size:row.file_size};
}
export function explicitlyDenied(result){
  if(result?.data||!result?.error)return false;
  return [400,401,403,404].includes(Number(
    result.error.statusCode??result.error.status));
}
export function safePrivateStorageReport(checks){
  if(!Array.isArray(checks)||checks.length!==6||
    !checks.every(x=>/^[a-z_]{3,64}$/.test(x)))
    throw Error("Workspace storage blocked: unsafe-evidence");
  return {schema:"eternyx.workspace.phase24.private-file-acceptance",
    mode:"read_only_existing_staging_fixture",
    checks:checks.map(key=>({key,status:"pass"})),
    summary:{passed:checks.length,failed:0},
    verified_owner_private_bytes:true,verified_exact_sha256:true,
    verified_cross_account_denial:true,verified_public_url_denial:true,
    application_data_modified:false,production_certified:false,
    migration_history_verified:false,realtime_delivery_verified:false,
    release_gate:"manual_review_required",
    limitations:"One non-sensitive staging file only; no production or migration certificate."};
}
