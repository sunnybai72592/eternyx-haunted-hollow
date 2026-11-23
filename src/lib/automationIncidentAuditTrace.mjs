/** Safe owner-only Automation audit trace projection for local exports.
 * Never copy arbitrary server metadata, notes, credentials or request keys.
 */
const kinds=new Set(["incident_status","evidence_capture","plan_review",
  "closure_decision","reopen_decision"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const allowed={
  incident_status:["state","type"],
  evidence_capture:["evidenceKind","sourceId"],
  plan_review:["stepKind","type"],
  closure_decision:["decision","incidentRevision"],
  reopen_decision:["decision","reason","incidentRevision","evidenceId"],
};
function cell(v){
  let s=String(v??"");
  if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function verifiedIncidentAuditTrace(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.source!=="authenticated_server"||
    raw.auditSource!=="owner_database_audit_trace"||
    typeof raw.incidentId!=="string"||!uuid.test(raw.incidentId)||
    raw.containsNotes!==false||raw.containsCredentials!==false||
    raw.externalExecutionTriggered!==false||
    !Array.isArray(raw.rows)||raw.rows.length>100||
    !Number.isSafeInteger(raw.total)||raw.total<0||
    raw.truncated!==false||raw.total!==raw.rows.length){
    throw Error("Unverified incident audit trace.");
  }
  let previous=Number.NEGATIVE_INFINITY;
  const rows=raw.rows.map(entry=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||
      !kinds.has(entry.kind)||typeof entry.ref!=="string"||
      entry.ref.length>50||!/^[0-9a-z-]+$/i.test(entry.ref)||
      typeof entry.recordedAt!=="string"||
      !Number.isFinite(Date.parse(entry.recordedAt))||
      !entry.metadata||typeof entry.metadata!=="object"||
      Array.isArray(entry.metadata)){
      throw Error("Unverified audit event.");
    }
    const n=Date.parse(entry.recordedAt);
    if(n<previous)throw Error("Audit events are out of chronological order.");
    previous=n;
    const fields=allowed[entry.kind];
    const safe={};
    for(const field of fields){
      const v=entry.metadata[field];
      if(v===undefined||v===null)continue;
      if(typeof v==="string"&&v.length<=60&&
        /^[a-z0-9_-]+$/i.test(v))safe[field]=v;
      else if(Number.isSafeInteger(v)&&v>=0)safe[field]=v;
      else throw Error("Unexpected audit metadata field.");
    }
    return {kind:entry.kind,ref:entry.ref,recordedAt:entry.recordedAt,metadata:safe};
  });
  return {schema:"eternyx-owner-incident-trace-v1",
    source:"authenticated_server",auditSource:"owner_database_audit_trace",
    incidentId:raw.incidentId,total:raw.total,truncated:false,
    containsNotes:false,containsCredentials:false,externalExecutionTriggered:false,
    rows};
}
export function incidentAuditCsv(data){
  const audit=verifiedIncidentAuditTrace(data);
  const rows=[["kind","ref","recordedAt","state","reason","revision","evidenceKind"],
    ...audit.rows.map(x=>[x.kind,x.ref,x.recordedAt,
      x.metadata.state??x.metadata.decision??x.metadata.type??"",
      x.metadata.reason??"",
      x.metadata.incidentRevision??"",
      x.metadata.evidenceKind??""])];
  return "\ufeff"+rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
