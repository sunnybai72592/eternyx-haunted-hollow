import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseDockerContainmentAction,deriveDockerReadiness}
  from "../supabase/functions/_shared/docker-containment-contract.mjs";
const id="33333333-3333-4333-8333-333333333333",note="Confirmed lab investigation and verified operator review evidence.";
test("explicit suspend/release signatures are bound to case and reject spoofed fields",()=>{
 assert.equal(parseDockerContainmentAction({action:"incident_escalate",incidentId:id,note,confirmation:"SUSPEND "+id.slice(0,8)})?.action,"incident_escalate");
 assert.equal(parseDockerContainmentAction({action:"incident_release_hold",incidentId:id,note,confirmation:"RELEASE "+id.slice(0,8)})?.action,"incident_release_hold");
 for(const input of [
  {action:"incident_escalate",incidentId:id,note,confirmation:"RELEASE "+id.slice(0,8)},
  {action:"incident_release_hold",incidentId:id,note,confirmation:"SUSPEND "+id.slice(0,8)},
  {action:"incident_escalate",incidentId:id,note,confirmation:"SUSPEND "+id.slice(0,8),ownerId:id},
  {action:"incident_escalate",incidentId:"../x",note,confirmation:"SUSPEND ../x"},
  {action:"incident_escalate",incidentId:id,note:"too short",confirmation:"SUSPEND "+id.slice(0,8)},
  {action:"incident_escalate",incidentId:id,note:"a".repeat(501),confirmation:"SUSPEND "+id.slice(0,8)},
  {action:"incident_escalate",incidentId:id,note:"Confirmed note\nsecret",confirmation:"SUSPEND "+id.slice(0,8)},
 ])assert.equal(parseDockerContainmentAction(input),null);
});
test("readiness is a source-derived observation, never execution authorization",()=>{
 const time=Date.parse("2026-11-22T20:00:00Z");
 const data={policy:{enabled:true,incident_hold:false},
 agents:[{id,status:"key_verified"}],
 reports:[{agent_id:id,engine_available:true,last_received_at:new Date(time).toISOString()}],
 incidents:[],claims:[]};
 const good=deriveDockerReadiness(data,time);
 assert.equal(good.classification,"review_prerequisites_observed");
 assert.equal(good.executionAuthorized,false);
 assert.equal(deriveDockerReadiness({...data,policy:{enabled:false,incident_hold:true}},time).classification,"attention_required");
 assert.equal(deriveDockerReadiness({...data,incidents:[{status:"escalated"}]},time).classification,"attention_required");
 assert.equal(deriveDockerReadiness({...data,claims:[{state:"claimed",claimed_at:new Date(time-60000).toISOString()}]},time).classification,"attention_required");
 assert.equal(deriveDockerReadiness({...data,reports:[]},time).classification,"attention_required");
 assert.equal(deriveDockerReadiness(null).classification,"unknown");
});
test("containment migration forbids ordinary policy re-enable during a hold",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261123100000_docker_incident_containment.sql",import.meta.url),"utf8");
 assert.match(sql,/ADD COLUMN incident_hold boolean NOT NULL DEFAULT false/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.docker_set_control_policy/);
 assert.match(sql,/p_enabled IS TRUE AND EXISTS/);
 assert.match(sql,/incident_hold=true/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.docker_lab_triage_incident/);
 assert.match(sql,/v_case\.status='escalated'/);
 assert.match(sql,/CREATE FUNCTION public\.docker_lab_escalate_incident/);
 assert.match(sql,/CREATE FUNCTION public\.docker_lab_release_incident_hold/);
 assert.match(sql,/SET state='cancelled',resolved_at=v_now/);
 assert.match(sql,/already_issued_permits_revoked',false/);
 assert.match(sql,/incident_hold=false/);
 assert.match(sql,/enabled=false,updated_at=v_now/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_lab_escalate_incident/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_lab_release_incident_hold/);
 assert.doesNotMatch(sql,/SECURITY DEFINER/);
 assert.doesNotMatch(sql,/TO authenticated;\s*--/);
});
test("server incident containment is owner-authenticated, not an execution API",()=>{
 const code=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
 assert.match(code,/authenticateUser\(req\)/);
 assert.match(code,/parseDockerContainmentAction\(body\)/);
 assert.match(code,/docker_lab_escalate_incident/);
 assert.match(code,/docker_lab_release_incident_hold/);
 assert.match(code,/remoteExecutionEnabled:false/);
 assert.doesNotMatch(code,/Deno\.Command|docker\.sock|spawnSync/);
});
