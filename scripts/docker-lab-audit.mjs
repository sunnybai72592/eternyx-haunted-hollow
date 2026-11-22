#!/usr/bin/env node
// Local-only journal signature and verification; no Docker command or HTTP.
import {lstatSync,readFileSync} from "node:fs";
import {isAbsolute} from "node:path";
import {signLabAudit,verifyLabAudit} from "../src/lib/dockerLabAttestation.mjs";
try{
 const [action,first,second]=process.argv.slice(2);
 if(process.argv.length!==5||!["sign","verify"].includes(action))
   throw Error("Usage: docker-lab-audit.mjs sign CLAIM_UUID /ABS/PRIVATE.pem | verify /ABS/AUDIT.json /ABS/PINNED.pub");
 if(action==="sign")process.stdout.write(JSON.stringify(signLabAudit(first,second),null,2)+"\n");
 else{
   if(!isAbsolute(first))throw Error("Absolute audit path required.");
   const stat=lstatSync(first);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error("Invalid audit proof file.");
   process.stdout.write(JSON.stringify(verifyLabAudit(JSON.parse(readFileSync(first,"utf8")),second),null,2)+"\n");
 }
}catch(err){process.stderr.write((err instanceof Error?err.message:"Audit failed.")+"\n");process.exitCode=1;}
