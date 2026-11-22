import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseDockerIncidentAction,classifyDockerIncidentStatus} from "../supabase/functions/_shared/docker-incident-contract.mjs";
const owner="33333333-3333-4333-8333-333333333333",claim="44444444-4444-4444-8444-444444444444";
const note="Operator checked lab journal; receipt is missing.";
test("incident contract binds typed ID, note and allowed transitions",()=>{
 assert.equal(parseDockerIncidentAction({action:"incident_open",claimId:claim,note})?.action,"incident_open");
 assert.equal(parseDockerIncidentAction({action:"incident_triage",incidentId:claim,status:"reviewed",note})?.status,"reviewed");
 assert.equal(classifyDockerIncidentStatus({status:"reviewed"}),"reviewed");
 assert.equal(classifyDockerIncidentStatus({status:"resolved"}),"unknown");
});
test("incident contract rejects spoofing, arbitrary actions, secrets and short notes",()=>{
 for(const bad of [
  {action:"incident_open",claimId:claim,note,ownerId:owner},
  {action:"incident_open",claimId:owner,note:"short"},
  {action:"incident_open",claimId:"../../etc",note},
  {action:"incident_open",claimId:claim,note:"x".repeat(501)},
  {action:"incident_open",claimId:claim,note:"new\\nline"},
  {action:"incident_triage",incidentId:claim,status:"resolved",note},
  {action:"incident_triage",incidentId:claim,status:"reviewed",note,execute:true},
  {action:"incident_delete",incidentId:claim,note},
 ])assert.equal(parseDockerIncidentAction(bad),null);
});
test("incident SQL protects owner relationships, privileges and durable events",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261123090000_docker_lab_incident_triage.sql",import.meta.url),"utf8");
 for(const table of ["docker_lab_incidents","docker_lab_incident_events"]){
  assert.match(sql,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
  assert.match(sql,new RegExp("REVOKE ALL ON public\\."+table+" FROM PUBLIC,anon,authenticated"));
  assert.match(sql,new RegExp('GRANT SELECT ON public\\.'+table+' TO authenticated'));
 }
 assert.match(sql,/FOREIGN KEY \(claim_id,owner_id\) REFERENCES public\.docker_command_claims\(id,owner_id\)/);
 assert.match(sql,/FOREIGN KEY \(incident_id,owner_id\) REFERENCES public\.docker_lab_incidents\(id,owner_id\)/);
 assert.match(sql,/status IN \('open','investigating','reviewed'\)/);
 assert.match(sql,/v_claim\.state='claimed' AND v_claim\.claimed_at <= v_now-interval '45 seconds'/);
 assert.match(sql,/v_claim\.state='reported_failed'/);
 assert.match(sql,/v_claim\.state='reported_guard_denied'/);
 assert.match(sql,/pg_catalog\.pg_advisory_xact_lock/);
 assert.match(sql,/IF v_case\.status=p_status THEN/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_lab_open_incident/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_lab_triage_incident/);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON public\.docker_lab_incidents TO authenticated/);
 assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
test("authenticated Edge reads owner-only cases, never authorizes execution through incident RPC",()=>{
 const edge=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
 assert.match(edge,/authenticateUser\(req\)/);
 assert.match(edge,/user\.is_anonymous/);
 assert.match(edge,/parseDockerIncidentAction\(body\)/);
 assert.match(edge,/docker_lab_open_incident/);
 assert.match(edge,/docker_lab_triage_incident/);
 assert.match(edge,/\.from\("docker_lab_incidents"\).*\.eq\("owner_id",owner\)/);
 assert.match(edge,/incidentEvents:incidentEvents\.data\?\?\[\]/);
 assert.match(edge,/executionStatus:"not_executed"/);
 assert.doesNotMatch(edge,/docker\.sock|spawnSync|Deno\.Command/);
});
test("owner UI offers real incident notes and reviewed but never success claims",()=>{
 const component=readFileSync(new URL("../src/components/docker/DockerIncidents.tsx",import.meta.url),"utf8");
 assert.match(component,/Open investigation case/);
 assert.match(component,/Mark reviewed/);
 assert.match(component,/reconciliation_required/);
 assert.match(component,/Never|never/);
 assert.doesNotMatch(component,/mark successful|executionStatus:"executed"/i);
});
