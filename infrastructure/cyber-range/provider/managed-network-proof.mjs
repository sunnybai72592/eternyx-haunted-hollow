/** Exact local Docker network identity and attachment validation.
 * Managed marker + Compose ownership + expected internal bridge name required.
 * A matching name alone never authorizes resource removal.
 */
import {sessionFromProject} from "./orphan-watchdog.mjs";
const names=new Set(["local_target_only","gateway_ingress_only"]);
const id=/^[a-f0-9]{64}$/;
export function verifyManagedNetwork(n){
  const labels=n?.Labels,project=labels?.["com.docker.compose.project"];
  const kind=labels?.["com.docker.compose.network"],sessionId=sessionFromProject(project);
  if(!sessionId||!names.has(kind)||n.Name!==project+"_"+kind||
    labels?.["org.eternyx.range.network"]!=="v1"||!id.test(n.Id??"")||
    n.Internal!==true||n.Driver!=="bridge"||n.Scope!=="local"||
    typeof n.Created!=="string"||!Number.isFinite(Date.parse(n.Created))||
    !n.Containers||typeof n.Containers!=="object"||Array.isArray(n.Containers))
    throw Error("Unverified managed network; cleanup refused");
  const attachedIds=Object.keys(n.Containers).sort();
  if(attachedIds.length>2||attachedIds.some(x=>!id.test(x)))
    throw Error("Unexpected managed network attachments; cleanup refused");
  return {id:n.Id,project,sessionId,kind,createdAt:n.Created,attachedIds};
}
export function verifyNetworkInventory(networks,containers){
  if(!Array.isArray(networks)||networks.length>200||!Array.isArray(containers))
    throw Error("Invalid managed network inventory");
  const seen=new Set(),kinds=new Set(),result=[];
  for(const raw of networks){
    const n=verifyManagedNetwork(raw),key=n.project+"/"+n.kind;
    if(seen.has(n.id)||kinds.has(key))throw Error("Duplicate managed network; cleanup refused");
    seen.add(n.id);kinds.add(key);
    const allowed=new Set(containers.filter(c=>c?.Config?.Labels?.["com.docker.compose.project"]===n.project).map(c=>c.Id));
    if(n.attachedIds.some(x=>!allowed.has(x)))throw Error("Foreign network attachment; cleanup refused");
    result.push(n);
  }
  return result;
}
