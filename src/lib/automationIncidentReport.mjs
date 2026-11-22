/** Client-side allowlist for factual Automation incident reporting.
 * No user notes, raw run inputs, credentials, or unverified URLs are exported.
 */
const counters=[
  "casesOpenedInWindow","resolutionEventsInWindow","currentOpen",
  "currentInvestigating","currentResolved","currentHighUnresolved",
  "unresolvedOlder24h","unresolvedOlder7d","capturedEvidenceInWindow",
  "currentUnresolvedWithEvidence","currentUnresolvedWithoutEvidence",
];
const sourceKeys=["failedSchedule","expiredLease","quarantine","manualRunReview"];
const severityKeys=["low","medium","high"];
const isCount=n=>Number.isSafeInteger(n)&&n>=0;
function exactCounters(record,keys){
  return Boolean(record&&typeof record==="object"&&!Array.isArray(record)&&
    keys.every(k=>isCount(record[k])));
}
export function checkedIncidentReport(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.source!=="database_incident_reporting"||
    ![7,30].includes(raw.rangeDays)||
    typeof raw.generatedAt!=="string"||
    !Number.isFinite(Date.parse(raw.generatedAt))||
    !exactCounters(raw,counters)||
    !exactCounters(raw.sourcesInWindow,sourceKeys)||
    !exactCounters(raw.severitiesInWindow,severityKeys)||
    !Array.isArray(raw.topUnresolvedWorkflows)||
    raw.topUnresolvedWorkflows.length>5||
    raw.allFailureAttemptsMeasured!==false||
    raw.automaticDetectionEnabled!==false||
    raw.externalDeliveryVerified!==false||raw.recoveryExecuted!==false){
    throw Error("Unverified incident report.");
  }
  const list=raw.topUnresolvedWorkflows.map(entry=>{
    if(!entry||typeof entry!=="object"||
       typeof entry.workflow_id!=="string"||
       !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(entry.workflow_id)||
       !isCount(entry.unresolved_cases)){
      throw Error("Unverified workflow report breakdown.");
    }
    return {workflowId:entry.workflow_id,unresolvedCases:entry.unresolved_cases};
  });
  return {
    schema:"eternyx-incident-report-v1",
    source:"database_incident_reporting",
    generatedAt:raw.generatedAt,rangeDays:raw.rangeDays,
    ...Object.fromEntries(counters.map(k=>[k,raw[k]])),
    sourcesInWindow:Object.fromEntries(sourceKeys.map(k=>[k,raw.sourcesInWindow[k]])),
    severitiesInWindow:Object.fromEntries(severityKeys.map(k=>[k,raw.severitiesInWindow[k]])),
    topUnresolvedWorkflows:list,
    allFailureAttemptsMeasured:false,automaticDetectionEnabled:false,
    externalDeliveryVerified:false,recoveryExecuted:false,
  };
}
function cell(value){
  let s=String(value??"");
  if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function incidentReportCsv(raw){
  const data=checkedIncidentReport(raw);
  const rows=[
    ["scope","metric","value"],
    ["report","generatedAt",data.generatedAt],
    ["report","rangeDays",data.rangeDays],
    ...counters.map(k=>["case_counts",k,data[k]]),
    ...sourceKeys.map(k=>["source_in_window",k,data.sourcesInWindow[k]]),
    ...severityKeys.map(k=>["severity_in_window",k,data.severitiesInWindow[k]]),
    ...data.topUnresolvedWorkflows.map(v=>[
      "unresolved_workflow",v.workflowId,v.unresolvedCases]),
    ["limitations","allFailureAttemptsMeasured","false"],
    ["limitations","automaticDetectionEnabled","false"],
    ["limitations","externalDeliveryVerified","false"],
  ];
  return "\ufeff"+rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
