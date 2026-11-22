// Only signed-in owners can create/triage incident notes via the Docker control
// Edge Function. Review records DO NOT grant Docker execution rights.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function note(value){
 return typeof value==="string"&&value.trim().length>=12&&value.trim().length<=500&&
   !/[\u0000-\u001f\u007f]/.test(value);
}
const exact=(o,keys)=>Object.keys(o).length===keys.length&&
  Object.keys(o).every(k=>keys.includes(k));
export function parseDockerIncidentAction(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 if(value.action==="incident_open"&&exact(value,["action","claimId","note"])&&
   UUID.test(value.claimId||"")&&note(value.note))
   return {action:"incident_open",claimId:value.claimId,note:value.note.trim()};
 if(value.action==="incident_triage"&&exact(value,["action","incidentId","status","note"])&&
   UUID.test(value.incidentId||"")&&["investigating","reviewed"].includes(value.status)&&note(value.note))
   return {action:"incident_triage",incidentId:value.incidentId,status:value.status,note:value.note.trim()};
 return null;
}
export function classifyDockerIncidentStatus(record){
 if(!record||!["open","investigating","reviewed"].includes(record.status))return "unknown";
 return record.status;
}
