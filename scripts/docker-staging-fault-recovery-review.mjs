#!/usr/bin/env node
// Phase43 operator-only READ-ONLY local incident observation and independent
// offline comparison. Does not run Docker, contact Supabase, transmit a receipt,
// retry a command, unlink a lock, edit a claim or declare production readiness.
import {auditSignedAgentRecoveryDirectory}
 from "../src/lib/dockerStrictRecoveryInventory.mjs";
import {evaluateDockerFaultRecoverySnapshot,compareDockerFaultRecoverySnapshots,
 validateDockerFaultReviewPins,DOCKER_FAULT_EXPECTED_KEYS}
 from "../src/lib/dockerStagingFaultRecoveryReview.mjs";
import {lstatSync,fstatSync,openSync,closeSync,readFileSync,constants} from "node:fs";
import {isAbsolute} from "node:path";

function file(path,max,ownerOnly){
 if(typeof path!=="string"||!isAbsolute(path)||!path.startsWith("/")||
    path.length>512||path.endsWith("/")||path.includes("//")||path.includes("%")||
    path.split("/").some(x=>x==="."||x==="..")||
    /[\u0000-\u001f\u007f]/.test(path))
  throw Error("Canonical absolute path required for private recovery evidence.");
 const before=lstatSync(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
    before.size<2||before.size>max||
    (ownerOnly&&(before.uid!==process.getuid()||(before.mode&0o077)!==0)))
  throw Error("Private incident evidence file must be original, bounded and owner-only.");
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|
  (constants.O_NONBLOCK||0));
 try{
  const current=fstatSync(fd);
  if(!current.isFile()||current.dev!==before.dev||
     current.ino!==before.ino||current.size!==before.size||
     current.uid!==before.uid)
   throw Error("Original incident file inode changed before read.");
  const raw=readFileSync(fd),after=fstatSync(fd),named=lstatSync(path);
  if(raw.length!==before.size||after.ctimeMs!==before.ctimeMs||
     after.mtimeMs!==before.mtimeMs||named.ctimeMs!==before.ctimeMs||
     named.mtimeMs!==before.mtimeMs||named.ino!==before.ino||
     named.dev!==before.dev)
   throw Error("Original incident evidence file changed during read.");
  return raw.toString("utf8");
 }finally{closeSync(fd);}
}
function json(path,max,ownerOnly){
 const raw=file(path,max,ownerOnly);
 if(!raw.endsWith("\n"))throw Error("Incomplete incident-review JSON.");
 let parsed;try{parsed=JSON.parse(raw);}catch{throw Error("Invalid incident JSON.");}
 if(parsed===null||typeof parsed!=="object"||Array.isArray(parsed)||
    JSON.stringify(parsed)+"\n"!==raw)
  throw Error("Noncanonical incident-review JSON.");
 return parsed;
}
try{
 const args=process.argv.slice(2);
 if(args[0]==="snapshot"&&args.length===7){
  if(process.platform!=="linux"||process.getuid()===0||
     process.env.CI==="true"||process.env.GITHUB_ACTIONS==="true"||
     process.env.ETERNYX_REMOTE_LAB_ENABLED==="true"||
     process.env.DOCKER_REMOTE_LAB_ENABLED==="true")
   throw Error("Real fault observation requires approved non-root Linux outside CI with execution disabled.");
  const pins={
   agentId:args[2],claimId:args[3],containerId:args[4],operation:args[5]
  };
  validateDockerFaultReviewPins(pins);
  // Both passes must re-read the REAL original private journal; no user-supplied
  // JSON substitutes for actual signed-agent journal records in this mode.
  const before=auditSignedAgentRecoveryDirectory(args[1]);
  const after=auditSignedAgentRecoveryDirectory(args[1]);
  if(before.inventorySha256!==after.inventorySha256||
     JSON.stringify(before.claims)!==JSON.stringify(after.claims)||
     JSON.stringify(before.locks)!==JSON.stringify(after.locks)||
     JSON.stringify(before.containerLocks)!==JSON.stringify(after.containerLocks))
   throw Error("Original incident journal changed between two complete scans.");
  const result=evaluateDockerFaultRecoverySnapshot(after,pins,{
   expectedStage:args[6]
  });
  process.stdout.write(JSON.stringify(result)+"\n");
 }else if(args[0]==="compare"&&args.length===4){
  const before=json(args[1],4096,false),after=json(args[2],4096,false);
  const approved=json(args[3],1024,true);
  if(Object.keys(approved).join("|")!==DOCKER_FAULT_EXPECTED_KEYS.join("|"))
   throw Error("Independently approved agent/claim/target/operation pins required.");
  validateDockerFaultReviewPins(approved);
  process.stdout.write(JSON.stringify(compareDockerFaultRecoverySnapshots(
   before,after,approved))+"\n");
 }else{
  throw Error("Usage: snapshot /ABS/PRIVATE-JOURNAL AGENT_UUID CLAIM_UUID FULL_CONTAINER_ID start|stop|restart EXPECTED_STAGE | compare /ABS/BEFORE.json /ABS/AFTER.json /ABS/APPROVED.json");
 }
}catch{
 // Deliberately no untrusted exception strings, paths, raw journal, or keys.
 process.stderr.write("Read-only Docker fault recovery evidence refused; original complete private history and independently approved pins need human investigation.\n");
 process.exitCode=1;
}
