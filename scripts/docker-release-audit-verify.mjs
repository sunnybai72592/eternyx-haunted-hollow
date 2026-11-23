#!/usr/bin/env node
// Offline verifier; all pins must come from independent review records.
// Never fetch, call Supabase, touch Docker, mutate or sign the report.
import {openSync,closeSync,fstatSync,readFileSync,constants} from "node:fs";
import {isAbsolute} from "node:path";
import {webcrypto} from "node:crypto";
import {verifyDockerReleaseAuditExport} from "../src/lib/dockerReleaseAuditExport.mjs";
const env=process.env;
try{
 if(process.argv.length!==3||!isAbsolute(process.argv[2]))
  throw Error("Absolute local audit JSON path required.");
 const fd=openSync(process.argv[2],constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 let json;
 try{
  const stat=fstatSync(fd);
  if(!stat.isFile()||stat.size<2||stat.size>65536||
   process.platform!=="win32"&&(stat.uid!==process.getuid()||(stat.mode&0o077)!==0))
   throw Error("Audit evidence must be a private, bounded regular file.");
  json=JSON.parse(readFileSync(fd,"utf8"));
 }finally{closeSync(fd);}
 const result=await verifyDockerReleaseAuditExport(json,{
  ownerId:env.ETERNYX_DOCKER_AUDIT_OWNER_ID,
  reviewId:env.ETERNYX_DOCKER_AUDIT_REVIEW_ID,
  candidateSha256:env.ETERNYX_DOCKER_AUDIT_PINNED_CANDIDATE_SHA256,
  commitSha:env.ETERNYX_DOCKER_AUDIT_PINNED_COMMIT_SHA,
  expectedTailSha256:env.ETERNYX_DOCKER_AUDIT_PINNED_TAIL_SHA256
 },webcrypto);
 if(result.status!=="pinned_tail_consistent_server_report")
  throw Error("Audit evidence did not match independently pinned identity and tail.");
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}catch{
 process.stderr.write("Offline Docker audit verification refused: incomplete or tampered report, untrusted independent pins, unsafe file or invalid chain. No evidence contents printed.\n");
 process.exitCode=1;
}
