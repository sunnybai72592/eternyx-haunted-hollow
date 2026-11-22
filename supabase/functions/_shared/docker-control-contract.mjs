// Strict request contract. This is a review/approval queue, NOT Docker execution.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCKER_ID=/^[0-9a-f]{64}$/;
const COMMANDS=new Set(["start","stop","restart"]);
const noExtra=(o,keys)=>Object.keys(o).every(k=>keys.includes(k));
export function parseDockerControlRequest(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const a=raw.action;
  if(a==="list"&&noExtra(raw,["action"]))return {action:"list"};
  if(a==="policy"&&typeof raw.enabled==="boolean"&&Number.isInteger(raw.dailyLimit)&&
    raw.dailyLimit>=1&&raw.dailyLimit<=10&&noExtra(raw,["action","enabled","dailyLimit"]))
    return {action:"policy",enabled:raw.enabled,dailyLimit:raw.dailyLimit};
  if(a==="request"&&UUID.test(raw.agentId||"")&&UUID.test(raw.requestKey||"")&&
    COMMANDS.has(raw.operation)&&DOCKER_ID.test(raw.containerId||"")&&
    noExtra(raw,["action","agentId","requestKey","operation","containerId"]))
    return {action:"request",agentId:raw.agentId,requestKey:raw.requestKey,operation:raw.operation,containerId:raw.containerId};
  if(a==="decide"&&UUID.test(raw.requestId||"")&&
    ["approve","reject","cancel"].includes(raw.decision)&&
    noExtra(raw,["action","requestId","decision","confirmation"])){
    if(a==="decide"&&raw.decision==="approve"&&raw.confirmation!=="APPROVE "+raw.requestId.slice(0,8))
      return null;
    if(raw.decision!=="approve"&&raw.confirmation!==undefined)return null;
    return {action:"decide",requestId:raw.requestId,decision:raw.decision};
  }
  return null;
}
export function effectiveDockerControlState(record,now=Date.now()){
  if(!record||typeof record!=="object")return "unavailable";
  if(record.state==="pending"||record.state==="approved"){
    if(!Number.isFinite(Date.parse(record.expires_at)))return "unavailable";
    if(Date.parse(record.expires_at)<=now)return "expired";
  }
  return ["pending","approved","rejected","cancelled"].includes(record.state)?record.state:"unavailable";
}
export function localDockerPreview(operation,id){
  if(!COMMANDS.has(operation)||!DOCKER_ID.test(id||""))throw new Error("Invalid isolated lab preview.");
  return "node scripts/docker-operator.mjs "+operation+" "+id;
}
