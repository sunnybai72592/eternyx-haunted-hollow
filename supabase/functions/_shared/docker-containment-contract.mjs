// Enforced typed owner actions for Docker incident containment, not execution.
// Confirmation ties an explicit high-impact button to the exact case UUID.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function note(v) {return typeof v==="string"&&v.trim().length>=20&&v.trim().length<=500&&
  !/[\u0000-\u001f\u007f]/.test(v);}
const exact=(obj,keys)=>Object.keys(obj).length===keys.length&&Object.keys(obj).every(k=>keys.includes(k));
export function parseDockerContainmentAction(input) {
 if(!input||typeof input!=="object"||Array.isArray(input))return null;
 if(!["incident_escalate","incident_release_hold"].includes(input.action)||
    !exact(input,["action","incidentId","note","confirmation"])||
    !UUID.test(input.incidentId||"")||!note(input.note))return null;
 const phrase=(input.action==="incident_escalate"?"SUSPEND ":"RELEASE ")+input.incidentId.slice(0,8);
 if(input.confirmation!==phrase)return null;
 return {action:input.action,incidentId:input.incidentId,note:input.note.trim()};
}
export function deriveDockerReadiness({policy,agents,reports,incidents,claims},now=Date.now()) {
 if(!policy||!Array.isArray(agents)||!Array.isArray(reports)||!Array.isArray(incidents)||!Array.isArray(claims))
   return {classification:"unknown",checks:[],checkedAt:null,executionAuthorized:false};
 const validAgents=new Set(agents.filter(a=>a?.status==="key_verified").map(a=>a.id));
 const fresh=reports.filter(r=>validAgents.has(r.agent_id)&&r.engine_available===true&&
   Number.isFinite(Date.parse(r.last_received_at))&&
   Date.parse(r.last_received_at)<=now+30000&&now-Date.parse(r.last_received_at)<180000).length;
 const unresolved=claims.filter(c=>c?.state==="claimed" &&
   (!Number.isFinite(Date.parse(c.claimed_at))||now-Date.parse(c.claimed_at)>45000)).length;
 const escalated=incidents.filter(c=>c?.status==="escalated").length;
 const checks=[
   {id:"incident_hold",passed:policy.incident_hold!==true,detail:policy.incident_hold===true?"Explicit operator incident suspension active":"No incident hold recorded"},
   {id:"owner_review_opt_in",passed:policy.enabled===true,detail:policy.enabled===true?"Owner review policy enabled":"Review policy disabled"},
   {id:"escalated_cases",passed:escalated===0,detail:escalated+" escalated investigations in loaded owner cases"},
   {id:"signed_reports",passed:fresh>0,detail:fresh+" recent signed engine observations from key-verified agents"},
   {id:"unresolved_claims",passed:unresolved===0,detail:unresolved+" unresolved claims among recently loaded records"},
 ];
 return {classification:checks.every(c=>c.passed)?"review_prerequisites_observed":"attention_required",
   checks,checkedAt:new Date(now).toISOString(),executionAuthorized:false,
   note:"Read-only snapshot of available records; not a production execution approval or host attestation."};
}
