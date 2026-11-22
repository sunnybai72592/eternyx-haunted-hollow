#!/usr/bin/env node
// No Docker invocation, browser API, Supabase calls or network operations.
import {runDockerLabDrills} from "../src/lib/dockerLabDrills.mjs";
import {signDrillReport,verifyDrillEnvelope,readDrillEvidence} from "../src/lib/dockerLabDrillEvidence.mjs";
import {evaluateDockerLabPreflight} from "../src/lib/dockerLabPreflight.mjs";
const usage="Usage: docker-lab-assurance.mjs drill [--sign-key /ABS/PRIVATE.pem] | verify /ABS/REPORT.json /ABS/PINNED-PUBLIC.key | preflight [--agent-key /ABS/AGENT.pem --server-key /ABS/SERVER.pub]";
function flags(args,allowed){
 if(args.length%2)throw Error(usage);
 const result={};
 for(let i=0;i<args.length;i+=2){
   if(!allowed.includes(args[i])||result[args[i]]!==undefined||!args[i+1])throw Error(usage);
   result[args[i]]=args[i+1];
 }
 return result;
}
try{
 const [mode,...args]=process.argv.slice(2);
 if(mode==="drill"){
   const opts=flags(args,["--sign-key"]);
   const report=runDockerLabDrills();
   process.stdout.write(JSON.stringify(opts["--sign-key"]?signDrillReport(report,opts["--sign-key"]):report,null,2)+"\n");
   if(report.summary.failed)process.exitCode=1;
 }else if(mode==="verify"){
   if(args.length!==2)throw Error(usage);
   const checked=verifyDrillEnvelope(readDrillEvidence(args[0]),args[1]);
   process.stdout.write(JSON.stringify(checked,null,2)+"\n");
   if(!checked.allDrillsPassed)process.exitCode=1;
 }else if(mode==="preflight"){
   const opts=flags(args,["--agent-key","--server-key"]);
   const checked=evaluateDockerLabPreflight({
     agentKeyPath:opts["--agent-key"]||null,pinnedServerKeyPath:opts["--server-key"]||null
   });
   process.stdout.write(JSON.stringify(checked,null,2)+"\n");
   if(!checked.passed)process.exitCode=1;
 }else throw Error(usage);
}catch(e){
 process.stderr.write((e instanceof Error?e.message:"Offline assurance failed.")+"\n");
 process.exitCode=1;
}
