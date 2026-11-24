#!/usr/bin/env node
// Source-only dormant release manifest. No network, deployment or secret access.
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateFunctionConfig} from "./labs-bootstrap-manifest.mjs";
import {RANGE_DORMANT_RELEASE,rangeActivationPermitted} from "../supabase/functions/_shared/ctf-range-dormant-rollout.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const DORMANT_FUNCTIONS=Object.freeze({"ctf-range-access":true,"ctf-range-access-check":false,"ctf-range-worker":false});
const base="supabase/functions/";
const allowedExternal=new Set(["https://deno.land/std@0.190.0/http/server.ts","https://esm.sh/@supabase/supabase-js@2.58.0"]);
const shared=base+"_shared/";
const bundles={
 "ctf-range-access":["ctf-range-dormant-rollout.mjs","user-auth.ts","supabase.ts","ctf-range-access-contract.mjs"],
 "ctf-range-access-check":["ctf-range-dormant-rollout.mjs","supabase.ts","ctf-range-worker-contract.mjs","ctf-range-access-contract.mjs"],
 "ctf-range-worker":["ctf-range-dormant-rollout.mjs","supabase.ts","ctf-range-worker-contract.mjs","ctf-range-fenced-contract.mjs"],
};
const digest=b=>createHash("sha256").update(b).digest("hex");
export async function createDormantBundleManifest(root=ROOT){
 if(RANGE_DORMANT_RELEASE!==true||rangeActivationPermitted()!==false)throw Error("labs_dormant_activation_lock_missing");
 validateFunctionConfig(await readFile(path.join(root,"supabase/config.toml"),"utf8"));
 const result=[];
 for(const [slug,verifyJwt] of Object.entries(DORMANT_FUNCTIONS)){
   const entrypoint=base+slug+"/index.ts",expected=[entrypoint,...bundles[slug].map(x=>shared+x)].sort();
   const visited=new Map(),external=new Set();
   async function visit(file){
     if(!expected.includes(file))throw Error("labs_dormant_unreviewed_dependency");
     if(visited.has(file))return;
     const data=await readFile(path.join(root,file));
     if(data.length===0||data.length>200000)throw Error("labs_dormant_source_size");
     const source=data.toString("utf8");
     visited.set(file,digest(data));
     if(file===entrypoint&&!/if \(!rangeActivationPermitted\(\) \|\| Deno\.env\.get/.test(source))
       throw Error("labs_dormant_entrypoint_gate_missing");
     if(file===shared+"ctf-range-dormant-rollout.mjs"&&!/export const RANGE_DORMANT_RELEASE = true;/.test(source))
       throw Error("labs_dormant_activation_lock_missing");
     if(/\b(?:import|require)\s*\(/.test(source))throw Error("labs_dormant_dynamic_dependency");
     for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)){
       const dep=match[1];
       if(dep.startsWith("."))await visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),dep)));
       else if(allowedExternal.has(dep))external.add(dep);
       else throw Error("labs_dormant_unreviewed_external");
     }
   }
   await visit(entrypoint);
   if(visited.size!==expected.length||expected.some(x=>!visited.has(x)))throw Error("labs_dormant_dependency_inventory_drift");
   result.push({slug,verifyJwt,entrypoint,files:expected.map(p=>({path:p,sha256:visited.get(p)})),externalImports:[...external].sort()});
 }
 return {schema:"eternyx.labs.dormant-edge-bundles.v1",targetProject:"mhodwvypfbxafamkrgsk",sourceLockedDormant:true,functions:result,externalTransitiveBytesVerified:false,remoteDeployed:false,activationAuthorized:false,productionReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)throw Error("arguments");console.log(JSON.stringify(await createDormantBundleManifest(),null,2));}
 catch{console.error("labs_dormant_manifest_failed");process.exitCode=1;}
}
