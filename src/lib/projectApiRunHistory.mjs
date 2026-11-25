import { normalizeApiEnvironment } from "./projectApiEnvironment.mjs";
export const API_RUN_HISTORY_KEY = "eternyx:project-api-run-history:v1";
export const API_RUN_HISTORY_SCHEMA = "eternyx-project-api-run-history-v1";
const MAX_RUNS=30;
const ID=/^[a-z0-9-]{1,64}$/i;
const SHA=/^[a-f0-9]{64}$/;
const STATES=["started","completed","stopped-on-failure","cancelled","execution-error"];
const REASONS=["passed","status-mismatch","slow-response","network-or-cors-error","timed-out","cancelled","content-type-mismatch","content-type-unavailable","json-contract-failed"];
const id=value=>typeof value==="string" && ID.test(value);
const timestamp=value=>typeof value==="string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
function fail(){throw new Error("Invalid or inconsistent API run history.");}
function cleanRow(row,scenarioId) {
  if(!row || row.scenarioId!==scenarioId || !REASONS.includes(row.reason) ||
      typeof row.passed!=="boolean" || row.passed!==(row.reason==="passed") ||
      !(row.status===null || Number.isInteger(row.status)&&row.status>=100&&row.status<=599) ||
      (row.passed&&row.status===null) || !Number.isInteger(row.elapsedMs)||row.elapsedMs<0||row.elapsedMs>21000)fail();
  return {scenarioId,status:row.status,elapsedMs:row.elapsedMs,passed:row.passed,reason:row.reason};
}
export function normalizeApiRun(value) {
  if(!value || value.schema!==API_RUN_HISTORY_SCHEMA || !id(value.runId)||!id(value.projectId)||
      typeof value.fingerprint!=="string"||!SHA.test(value.fingerprint)||!timestamp(value.startedAt)||
      !STATES.includes(value.state)||typeof value.stopOnFailure!=="boolean"||
      !Array.isArray(value.scenarioIds)||value.scenarioIds.length<1||value.scenarioIds.length>8||
      !value.scenarioIds.every(id)||new Set(value.scenarioIds).size!==value.scenarioIds.length||
      !Array.isArray(value.cases)||value.cases.length>value.scenarioIds.length)fail();
  const cases=value.cases.map((row,i)=>cleanRow(row,value.scenarioIds[i]));
  const last=cases.at(-1);
  const cancelled=cases.filter(row=>row.reason==="cancelled").length;
  if(cancelled>1 || cancelled && last?.reason!=="cancelled")fail();
  if(value.stopOnFailure && cases.slice(0,-1).some(row=>!row.passed))fail();
  if(value.state==="started" ? value.finishedAt!==null :
    !timestamp(value.finishedAt)||Date.parse(value.finishedAt)<Date.parse(value.startedAt))fail();
  if(value.state==="completed"&&(cases.length!==value.scenarioIds.length||cancelled))fail();
  if(value.state==="stopped-on-failure"&&(!value.stopOnFailure||!last||last.passed||cancelled||cases.length>=value.scenarioIds.length))fail();
  if(value.state!=="cancelled"&&value.state!=="started"&&cancelled)fail();
  return {schema:API_RUN_HISTORY_SCHEMA,runId:value.runId,projectId:value.projectId,
    environment:normalizeApiEnvironment(value.environment),fingerprint:value.fingerprint,
    startedAt:value.startedAt,finishedAt:value.finishedAt,state:value.state,stopOnFailure:value.stopOnFailure,
    scenarioIds:[...value.scenarioIds],cases};
}
export function startApiRun({runId,projectId,environment,fingerprint,scenarioIds,stopOnFailure,startedAt=new Date().toISOString()}) {
  return normalizeApiRun({schema:API_RUN_HISTORY_SCHEMA,runId,projectId,environment,fingerprint,scenarioIds,stopOnFailure,startedAt,finishedAt:null,state:"started",cases:[]});
}
export function checkpointApiRun(run,rows,state="started",finishedAt=new Date().toISOString()) {
  const previous=normalizeApiRun(run);
  if(previous.state!=="started"||!Array.isArray(rows)||rows.length<previous.cases.length)fail();
  const next=normalizeApiRun({...previous,cases:rows,state,finishedAt:state==="started"?null:finishedAt});
  if(previous.cases.some((row,i)=>JSON.stringify(row)!==JSON.stringify(next.cases[i])))fail();
  return next;
}
export function readApiRunHistory(raw) {
  if(typeof raw!=="string"||raw.length>180000)return [];
  try {
    const data=JSON.parse(raw);if(!Array.isArray(data))return [];
    const seen=new Set(),runs=[];
    for(const value of data.slice(0,MAX_RUNS)){
      try{const run=normalizeApiRun(value);if(!seen.has(run.runId)){seen.add(run.runId);runs.push(run)}}catch{/* untrusted browser storage */}
    }
    return runs;
  }catch{return []}
}
export function upsertApiRun(history,input) {
  const next=normalizeApiRun(input);
  const existing=history.find(run=>run.runId===next.runId);
  if(existing){
    const previous=normalizeApiRun(existing);
    const identity=run=>JSON.stringify([run.projectId,run.environment,run.fingerprint,run.scenarioIds,run.stopOnFailure,run.startedAt]);
    if(identity(previous)!==identity(next)||previous.state!=="started"||
      previous.cases.length>next.cases.length||previous.cases.some((row,i)=>JSON.stringify(row)!==JSON.stringify(next.cases[i])))fail();
  }else if(next.state!=="started"||next.cases.length)fail();
  return [next,...history.filter(run=>run.runId!==next.runId)].slice(0,MAX_RUNS);
}
export function summarizeApiRun(run) {
  const safe=normalizeApiRun(run);
  return {planned:safe.scenarioIds.length,attempted:safe.cases.length,passed:safe.cases.filter(row=>row.passed).length,
    failed:safe.cases.filter(row=>!row.passed&&row.reason!=="cancelled").length,
    cancelled:safe.cases.filter(row=>row.reason==="cancelled").length,notRun:safe.scenarioIds.length-safe.cases.length};
}
export function exportApiRunHistory(history,projectId) {
  if(!id(projectId))fail();
  return JSON.stringify({schema:"eternyx-api-run-history-export-v1",scope:"local-browser-observations",productionVerified:false,
    runs:history.slice(0,MAX_RUNS).map(normalizeApiRun).filter(run=>run.projectId===projectId)},null,2);
}
