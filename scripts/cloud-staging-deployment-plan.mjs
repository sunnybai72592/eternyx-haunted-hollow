#!/usr/bin/env node
// Source-only plan. Never runs Supabase, SQL, Docker, or a deployment.
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const prefix="supabase/migrations/20261123";
const migrations=[
["030000_docker_workspace_enrollment","36210549a62235b964148047b2113b18c6b0b3a4"],
["040000_docker_agent_signed_reports","dcb16efcd0dbc0a4d887deda86150cc07fb03502"],
["050000_docker_operation_review","ded63b44239ff9607d18432c9a3cb04214600a79"],
["070000_docker_signed_command_dispatch","7bf5d8d1bf212bd150f92d9a548fdb03eb42c93e"],
["080000_docker_dispatch_receipt_recovery","b5247c4678bf7200cb371c83e6165fb78931b8ad"],
["090000_docker_lab_incident_triage","daab3f088aa6a5bb0a5f8425835ba32357bdb2"],
["100000_docker_incident_containment","39637d0abed5b719d33913a92069e18843e3b0d6"],
["110000_docker_release_review_history","05d655cfc56e8767ef69679d8aebd3c4181cc59e"],
["120000_docker_reviewer_accountability_and_event_chain","04434f6c9f8cf0e7743edbb6dc1a2f41663a3ea8"],
["130000_docker_full_release_audit_export","8af292272209b86eb7bb170d915dc21f6be99fec"]
];
const functions=[
["docker-enrollment",true,"c4f73932608871bbf0e692a9bb181068f529234a"],
["docker-control",true,"fb31078aa8fff48b68e853db057aa6ebe7fd8cee"],
["docker-heartbeat",false,"794505a67899efdc0bd6898606a859a6257c0c76"],
["docker-command-dispatch",false,"cd412922960b58d886d95e9e489d2edf520ec8de"]
];
function source(path,pin){
 const committed=git("rev-parse","HEAD:"+path);
 const worktree=git("hash-object","--no-filters","--",path);
 if(committed!==worktree||(pin&&committed!==pin))throw Error("Unreviewed source drift: "+path);
 return {path,gitBlob:committed,sha256:createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex")};
}
export function buildPlan(){
 const ordered=migrations.map(([name,pin])=>source(prefix+name+".sql",pin));
 const tracked=git("ls-files","supabase/migrations").split("\n").filter(x=>/_docker_.*\.sql$/.test(x)).sort();
 if(JSON.stringify(tracked)!==JSON.stringify(ordered.map(x=>x.path)))throw Error("Unexpected Docker migration set; review dependencies again");
 const config=source("supabase/config.toml");
 const toml=readFileSync(resolve(root,config.path),"utf8");
 const edges=functions.map(([slug,verifyJwt,pin])=>{
  const section=toml.split("[functions."+slug+"]");
  if(section.length!==2)throw Error("Missing or duplicate Docker function config: "+slug);
  const body=section[1].split(/^\[/m)[0];
  const flags=body.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/gm)||[];
  if(flags.length!==1||!new RegExp("=\\s*"+verifyJwt+"\\s*$").test(flags[0]))throw Error("Unexpected JWT policy: "+slug);
  return {slug,verifyJwt,...source("supabase/functions/"+slug+"/index.ts",pin)};
 });
 // Pin all tracked shared code, not just direct imports; this is a source manifest, not bundle attestation.
 const shared=git("ls-files","supabase/functions/_shared").split("\n").filter(Boolean).sort().map(path=>source(path));
 const body={schema:"eternyx-cloud-staging-candidate-v1",commit:git("rev-parse","HEAD"),
  migrations:ordered,functions:edges,config,shared,
  target:"staging_only",remoteExecutionEnabled:false,
  remoteMigrationHistoryVerified:false,remoteBundlesVerified:false,
  accountIsolationVerified:false,deploymentAuthorized:false,productionAuthorized:false};
 return {...body,manifestSha256:createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)throw Error("No arguments accepted");console.log(JSON.stringify(buildPlan(),null,2))}
 catch(e){console.error(e.message);process.exitCode=1}
}
