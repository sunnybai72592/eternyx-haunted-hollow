#!/usr/bin/env node
// Candidate only: no connection, remote write, secret, or deployment.
import {readdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {inspectRehearsalSource} from "./automation-fresh-staging-mirror.mjs";
export const CTF="20261122170000_ctf_verified_missions.sql";
export const PROTECTED_TABLES=Object.freeze(["pentest_audit_events","pentest_engagements","pentest_evidence","security_case_assets","security_case_finding_evidence","security_case_finding_history","security_case_findings"]);
export const OBSERVED_VERSIONS=Object.freeze(["20261123215132","20261123215141","20261123215211"]);
const NAME=/^20\d{12}_[A-Za-z0-9_-]+\.sql$/;
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fail=reason=>{throw Error("additive_replay_"+reason);};
export function selectCandidate(names,occupied=OBSERVED_VERSIONS){
  if(!Array.isArray(names)||names.some(n=>typeof n!=="string"||!NAME.test(n))||new Set(names).size!==names.length)fail("invalid_source");
  if(!Array.isArray(occupied)||occupied.some(v=>typeof v!=="string"||!/^20\d{12}$/.test(v))||new Set(occupied).size!==occupied.length)fail("invalid_journal");
  const chosen=names.filter(n=>n===CTF||/^20\d{12}_automation_/.test(n)).sort();
  if(chosen.length<23||chosen[0]!==CTF||!chosen[1]?.endsWith("_automation_manual_control_plane.sql"))fail("missing_foundation");
  const versions=chosen.map(n=>n.slice(0,14));
  if(new Set(versions).size!==versions.length)fail("candidate_collision");
  if(versions.some(v=>occupied.includes(v)))fail("occupied_version");
  return chosen;
}
export async function buildCandidate(root=ROOT){
  const audit=await inspectRehearsalSource(root);
  if(!audit.sourceBaselineValid)fail("source_baseline");
  const dir=path.join(root,"supabase/migrations");
  const names=(await readdir(dir)).filter(n=>n.endsWith(".sql"));
  const chosen=selectCandidate(names);
  const files=[];
  for(const name of chosen){
    const sql=await readFile(path.join(dir,name));
    const body=sql.toString("utf8");
    // Conservative tripwire, not a SQL parser or a proof of isolation.
    if(PROTECTED_TABLES.some(t=>new RegExp("\\b"+t+"\\b","i").test(body)))fail("protected_table_reference");
    files.push({name,version:name.slice(0,14),sha256:createHash("sha256").update(sql).digest("hex")});
  }
  return {schema:"eternyx-additive-replay-candidate-v1",files,protectedTables:[...PROTECTED_TABLES],observedStageVersions:[...OBSERVED_VERSIONS],sourceBaselineValid:true,otherPillarsExcluded:true,stageSnapshotIsHistorical:true,sqlDependenciesVerified:false,remoteExecutionAuthorized:false,productionExecutionAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2)fail("arguments");
  buildCandidate().then(report=>process.stdout.write(JSON.stringify(report,null,2)+"\n")).catch(e=>{process.stderr.write(/^additive_replay_[a-z_]+$/.test(e.message)?e.message+"\n":"additive_replay_unavailable\n");process.exitCode=1;});
}
