/** Phase 2L: strictly bounded local export of previously recorded metadata.
 * No network request, no raw input/output text, and no spreadsheet formulas.
 */
export function checkedAutomationAuditSnapshot(raw) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.schema!=="eternyx-automation-audit-v1"||
    raw.source!=="database_completed_runs"||
    raw.rawInputsIncluded!==false||raw.rawOutputsIncluded!==false||
    raw.rangeDays!==7||!Number.isInteger(raw.totalMatching)||
    raw.totalMatching<0||!Number.isInteger(raw.included)||
    raw.included<0||raw.included>100||
    !Array.isArray(raw.rows)||raw.rows.length!==raw.included||
    raw.truncated!==(raw.totalMatching>100)||
    raw.totalMatching<raw.included||
    typeof raw.generatedAt!=="string"||
    !Number.isFinite(Date.parse(raw.generatedAt))||
    (raw.workflowId!==null && typeof raw.workflowId!=="string")||
    ![null,"manual","webhook","scheduled"].includes(raw.channel)){
    throw Error("Unverified bounded audit snapshot");
  }
  const rows=raw.rows.map(item=>{
    if(!item||typeof item!=="object"||Array.isArray(item)||
      typeof item.id!=="string"||typeof item.created_at!=="string"||
      !Number.isFinite(Date.parse(item.created_at))||
      (item.workflow_id!==null&&typeof item.workflow_id!=="string")||
      !Number.isInteger(item.workflow_revision)||item.workflow_revision<1||
      !["manual","webhook","scheduled"].includes(item.trigger_type)||
      !["input_lines","output_lines","input_characters","output_characters"].every(k=>
        Number.isInteger(item[k])&&item[k]>=0)||
      !Array.isArray(item.trace)||item.trace.length>12){
      throw Error("Unverified run metadata record");
    }
    // Explicit allowlist: ignore extra fields even if a future backend adds them.
    return {
      id:item.id,workflow_id:item.workflow_id,
      workflow_revision:item.workflow_revision,trigger_type:item.trigger_type,
      created_at:item.created_at,input_lines:item.input_lines,
      output_lines:item.output_lines,input_characters:item.input_characters,
      output_characters:item.output_characters,
      stepCount:item.trace.length,
    };
  });
  return {
    schema:"eternyx-automation-audit-v1",source:"database_completed_runs",
    generatedAt:raw.generatedAt,rangeDays:7,workflowId:raw.workflowId,
    channel:raw.channel,totalMatching:raw.totalMatching,
    included:rows.length,truncated:raw.truncated,
    rawInputsIncluded:false,rawOutputsIncluded:false,rows,
  };
}
function csvCell(value){
  let s=String(value??"");
  // OWASP-style spreadsheet formula mitigation (also after leading spaces).
  if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function automationAuditCsv(snapshot){
  const data=checkedAutomationAuditSnapshot(snapshot);
  const cols=["id","workflow_id","workflow_revision","trigger_type",
    "created_at","input_lines","output_lines","input_characters",
    "output_characters","stepCount"];
  const header=cols.map(csvCell).join(",");
  return "\ufeff"+header+"\r\n"+data.rows.map(row=>
    cols.map(key=>csvCell(row[key])).join(",")).join("\r\n")+
    (data.rows.length?"\r\n":"");
}
