// Disposable composed replay only. No hosted connection, credentials or deployment.
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {JOURNAL} from "./automation-after-labs-stage-plan.mjs";
import {buildCandidate,CTF} from "./automation-additive-replay-candidate.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export function compose(labs,automation){
 const expected=JOURNAL.filter(([,name])=>name.startsWith("labs_")).map(([,name])=>name.slice(5)+".sql");
 if(!Array.isArray(labs)||!Array.isArray(automation)||labs.length!==6||automation.length!==22)throw Error("composed_count");
 const all=[...labs,...automation];
 if(all.some(f=>!f||typeof f.name!=="string"||!/^20\d{12}_[a-z0-9_]+\.sql$/.test(f.name)||typeof f.sha256!=="string"||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error("composed_source");
 if(labs.some((f,i)=>f.name!==expected[i])||automation.some((f,i)=>!/^20\d{12}_automation_/.test(f.name)||(i>0&&automation[i-1].name>=f.name)))throw Error("composed_order");
 if(new Set(all.map(f=>f.name.slice(0,14))).size!==28)throw Error("composed_collision");
 return {schema:"eternyx-composed-labs-automation-replay-v1",labs,automation,sourceCount:28,disposableOnly:true,remoteExecutionAuthorized:false};
}
export async function buildComposed(root=ROOT){
 const candidate=await buildCandidate(root);
 const labs=[];
 for(const [,name] of JOURNAL.filter(([,name])=>name.startsWith("labs_"))){
  const filename=name.slice(5)+".sql";
  const bytes=await readFile(path.join(root,"supabase/migrations",filename));
  labs.push({name:filename,sha256:createHash("sha256").update(bytes).digest("hex")});
 }
 const base=candidate.files.find(f=>f.name===CTF);
 if(!base||base.sha256!==labs[0].sha256)throw Error("composed_foundation");
 return compose(labs,candidate.files.filter(f=>f.name!==CTF));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error("composed_arguments");
 buildComposed().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error("Composed replay candidate unavailable or invalid");process.exitCode=1;});
}
