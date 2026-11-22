/** Real UTC day-bucket incident reporting; no inferred outage or failure scores. */
export function verifiedIncidentTrend(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.source!=="authenticated_server"||
    raw.reportSource!=="recorded_incident_activity"||
    ![7,30].includes(raw.rangeDays)||raw.timezone!=="UTC"||
    raw.automatedFailureDetection!==false||
    raw.actualWorkerUptimeMeasured!==false||
    raw.externalExecutionTriggered!==false||
    !Number.isSafeInteger(raw.casesOpened)||raw.casesOpened<0||
    !Number.isSafeInteger(raw.resolutionEvents)||raw.resolutionEvents<0||
    !Array.isArray(raw.days)||raw.days.length!==raw.rangeDays){
    throw Error("Unverified measured incident trend.");
  }
  let prev=null, opened=0,resolved=0;
  const rows=raw.days.map(entry=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||
       typeof entry.date!=="string"||
       !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||
       !Number.isFinite(Date.parse(entry.date+"T00:00:00Z"))||
       !Number.isSafeInteger(entry.casesOpened)||entry.casesOpened<0||
       !Number.isSafeInteger(entry.resolutionEvents)||entry.resolutionEvents<0){
      throw Error("Unverified daily case counters.");
    }
    const utc=new Date(entry.date+"T00:00:00Z").toISOString().slice(0,10);
    if(utc!==entry.date || (prev!==null&&
       Date.parse(entry.date+"T00:00:00Z")-prev!==86400000)){
      throw Error("Incident trend day sequence is malformed.");
    }
    prev=Date.parse(entry.date+"T00:00:00Z");
    opened+=entry.casesOpened;resolved+=entry.resolutionEvents;
    return {date:entry.date,casesOpened:entry.casesOpened,
      resolutionEvents:entry.resolutionEvents};
  });
  if(opened!==raw.casesOpened||resolved!==raw.resolutionEvents){
    throw Error("Incident trend totals disagree with the day buckets.");
  }
  return {schema:"eternyx-incident-trend-v1",
    reportSource:"recorded_incident_activity",source:"authenticated_server",
    timezone:"UTC",rangeDays:raw.rangeDays,days:rows,
    casesOpened:opened,resolutionEvents:resolved,
    automatedFailureDetection:false,actualWorkerUptimeMeasured:false,
    externalExecutionTriggered:false};
}
export function incidentTrendCsv(report){
  const safe=verifiedIncidentTrend(report);
  const lines=[["date","casesOpened","resolutionEvents"],
    ...safe.days.map(d=>[d.date,d.casesOpened,d.resolutionEvents])];
  const csvCell=value=>{
    let s=String(value??"");
    if(/^\s*[=+\-@\t\r\n]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  return "\ufeff"+lines.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
