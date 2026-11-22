import {mkdirSync,lstatSync,openSync,closeSync,writeSync,fsyncSync,readFileSync,unlinkSync,readdirSync,constants} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";
export const labJournalDir=join(homedir(),".eternyx","docker-lab-journal");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULL=/^[a-f0-9]{64}$/;
const ACTIONS=new Set(["start","stop","restart"]);
const OUTCOMES=["completed","failed","guard_denied"];
function directory(dir){
  mkdirSync(dir,{recursive:true,mode:0o700});
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error("Invalid lab journal directory.");
  if(process.platform!=="win32" && ((st.mode&0o077)!==0||st.uid!==process.getuid()))throw Error("Lab journal directory must be private and owned by operator.");
  return dir;
}
function privateFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw Error("Invalid lab journal file.");
  if(process.platform!=="win32" && ((st.mode&0o077)!==0||st.uid!==process.getuid()))throw Error("Lab journal file must be 0600 and operator-owned.");
  return path;
}
function writeDurable(fd,data){writeSync(fd,JSON.stringify({at:new Date().toISOString(),...data})+"\n");fsyncSync(fd);}
export function lockLabAgent(agentId,dir=labJournalDir){
  if(!UUID.test(agentId||""))throw Error("Invalid lab agent identity.");
  const path=join(directory(dir),"agent-"+agentId.toLowerCase()+".lock");
  // No automatic stale-lock clearing: an interrupted process requires human review.
  const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW||0),0o600);
  try{writeDurable(fd,{event:"active",agentId});}finally{closeSync(fd);}
  let released=false;
  return ()=>{if(released)return;privateFile(path);unlinkSync(path);released=true;};
}
export function reserveLabClaim({agentId,claimId,operation,containerId},dir=labJournalDir){
  if(!UUID.test(agentId||"")||!UUID.test(claimId||"")||!ACTIONS.has(operation)||!FULL.test(containerId||""))throw Error("Invalid lab claim.");
  const path=join(directory(dir),"claim-"+claimId.toLowerCase()+".jsonl");
  const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW||0),0o600);
  try{writeDurable(fd,{event:"reserved",agentId:agentId.toLowerCase(),claimId:claimId.toLowerCase(),operation,containerId});}
  finally{closeSync(fd);}
  return path;
}
export function readLabClaim(claimId,dir=labJournalDir){
  if(!UUID.test(claimId||""))throw Error("Invalid lab claim ID.");
  const path=privateFile(join(directory(dir),"claim-"+claimId.toLowerCase()+".jsonl"));
  const raw=readFileSync(path,"utf8");
  const lines=raw.trim().split("\n");
  if(!raw.endsWith("\n")||lines.length>8)throw Error("Invalid journal length or incomplete write.");
  let entries;
  try{entries=lines.map(x=>JSON.parse(x));}catch{throw Error("Invalid lab journal JSON.");}
  const first=entries[0],events=entries.map(x=>x.event);
  // Exact canonical transitions, not merely the presence of an attempted event.
  // Corrupt/reordered entries cannot be treated as successful or acknowledged.
  const allowed=[
    ["reserved"],["reserved","attempted"],["reserved","guard_denied"],
    ["reserved","attempted","completed"],["reserved","attempted","failed"],
    ["reserved","guard_denied","receipt_accepted"],
    ["reserved","attempted","completed","receipt_accepted"],
    ["reserved","attempted","failed","receipt_accepted"],
  ];
  if(!allowed.some(sequence=>sequence.length===events.length &&
       sequence.every((event,index)=>event===events[index])))
    throw Error("Invalid journal event ordering.");
  const timestamp=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
  if(!entries.every((entry,index)=>{
    const keys=Object.keys(entry).sort().join(",");
    return timestamp(entry.at)&&
      (index===0?keys==="agentId,at,claimId,containerId,event,operation":keys==="at,event")&&
      (index===0||Date.parse(entries[index-1].at)<=Date.parse(entry.at));
  }))throw Error("Invalid journal fields or timestamps.");

  if(first?.event!=="reserved"||first.claimId!==claimId.toLowerCase()||!UUID.test(first.agentId||"")||
    !ACTIONS.has(first.operation)||!FULL.test(first.containerId||"")||
    new Set(events).size!==events.length ||
    !events.every(x=>["reserved","attempted","completed","failed","guard_denied","receipt_accepted"].includes(x))||
    OUTCOMES.filter(x=>events.includes(x)).length>1 ||
    events.includes("receipt_accepted")&&events.at(-1)!=="receipt_accepted")
    throw Error("Invalid lab journal events.");
  const outcome=OUTCOMES.find(x=>events.includes(x))||null;
  if((events.includes("completed")||events.includes("failed"))&&!events.includes("attempted"))throw Error("Missing attempted event.");
  if(events.includes("guard_denied")&&events.includes("attempted"))throw Error("Guard denial after attempted mutation.");
  if(events.includes("receipt_accepted")&&!outcome)throw Error("Receipt without outcome.");
  return {agentId:first.agentId,claimId:first.claimId,operation:first.operation,containerId:first.containerId,
    events,outcome,attempted:events.includes("attempted"),
    acknowledged:events.includes("receipt_accepted"),attentionRequired:!events.includes("receipt_accepted")};
}
export function appendLabEvent(claimId,event,dir=labJournalDir){
  const current=readLabClaim(claimId,dir);
  if(current.acknowledged||current.events.includes(event))throw Error("Lab journal is already finalized.");
  if(event==="attempted"&&current.events.length!==1)throw Error("Invalid attempted event.");
  if(OUTCOMES.includes(event)&&current.outcome)throw Error("Cannot replace outcome.");
  if(["completed","failed"].includes(event)&&!current.attempted)throw Error("No Docker attempt recorded.");
  if(event==="guard_denied"&&current.attempted)throw Error("Guard denial after mutation attempt.");
  if(event==="receipt_accepted"&&!current.outcome)throw Error("No outcome to acknowledge.");
  if(!["attempted","completed","failed","guard_denied","receipt_accepted"].includes(event))throw Error("Invalid lab journal event.");
  const path=privateFile(join(directory(dir),"claim-"+claimId.toLowerCase()+".jsonl"));
  const fd=openSync(path,constants.O_WRONLY|constants.O_APPEND|(constants.O_NOFOLLOW||0));
  try{writeDurable(fd,{event});}finally{closeSync(fd);}
  return readLabClaim(claimId,dir);
}
export function listLabClaims(dir=labJournalDir){
  return readdirSync(directory(dir)).filter(x=>/^claim-[a-f0-9-]{36}\.jsonl$/.test(x)).slice(0,100)
    .map(file=>{try{const c=readLabClaim(file.slice(6,-6),dir);
      return {claimId:c.claimId,agentId:c.agentId,operation:c.operation,outcome:c.outcome,
        attempted:c.attempted,acknowledged:c.acknowledged,attentionRequired:c.attentionRequired};
    }catch{return {claimId:file.slice(6,-6),attentionRequired:true,error:"invalid_journal"};}});
}
export function labPostcondition(operation,before,after){
  if(!ACTIONS.has(operation)||!before||!after||before.Id!==after.Id)return false;
  if(operation==="stop")return after.State?.Running===false&&after.State?.Status==="exited";
  if(after.State?.Running!==true||after.State?.Status!=="running")return false;
  if(operation==="start")return true;
  return typeof before.State?.StartedAt==="string"&&typeof after.State?.StartedAt==="string"&&
    before.State.StartedAt!==after.State.StartedAt;
}
