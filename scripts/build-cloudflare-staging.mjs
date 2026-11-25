import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const STAGING_REF = "mhodwvypfbxafamkrgsk";
export const PRODUCTION_REF = "wcncuarekaofmfurbtbh";
export const STAGING_URL = "https://" + STAGING_REF + ".supabase.co";

export function stagingBuildEnv(env) {
  if (env.VITE_SUPABASE_PROJECT_ID !== STAGING_REF || env.VITE_SUPABASE_URL !== STAGING_URL)
    throw new Error("Configure the exact isolated staging project ID and URL in Cloudflare build variables.");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  // Modern public keys do not encode their project; operator must copy from staging.
  if (typeof key !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    throw new Error("Use the staging project's modern publishable browser key, never an anon/service-role/secret key.");
  return {...env,VITE_SUPABASE_PROJECT_ID:STAGING_REF,VITE_SUPABASE_URL:STAGING_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY:key,VITE_OPENAI_API_KEY:"",
    VITE_ENABLE_POLAR_SANDBOX_CHECKOUT:"false",VITE_ENABLE_STRIPE_TEST_CHECKOUT:"false"};
}

export function verifyStagingAssets(directory) {
  let files=0, stageSeen=false;
  function walk(dir) {
    for(const entry of readdirSync(dir,{withFileTypes:true})) {
      const filename=join(dir,entry.name);
      if(entry.isSymbolicLink())throw new Error("Symlinks are not permitted in staging artifacts.");
      if(entry.isDirectory()){walk(filename);continue;}
      if(!entry.isFile())throw new Error("Unexpected staging artifact.");
      if(!/\.(?:js|mjs|cjs|html|css|json|map|txt|webmanifest|svg)$/i.test(entry.name))continue;
      const content=readFileSync(filename,"utf8");files++;
      if(content.includes(PRODUCTION_REF))throw new Error("Production project reference detected in staging assets.");
      if(/(?:sb_secret_[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,})/.test(content))
        throw new Error("Possible private API key detected in staging assets.");
      if(content.includes(STAGING_URL))stageSeen=true;
    }
  }
  walk(directory);
  if(!files||!stageSeen||!statSync(join(directory,"index.html")).isFile()||
    !statSync(join(directory,"release-info.json")).isFile())
    throw new Error("Staging output lacks expected app, release manifest or isolated backend reference.");
  return {files,stagingBackendReference:true};
}
function main() {
  const env=stagingBuildEnv(process.env);
  rmSync("dist",{recursive:true,force:true});
  const result=spawnSync(process.execPath,["node_modules/vite/bin/vite.js","build"],{env,stdio:"inherit"});
  if(result.error||result.status!==0)throw new Error("Staging Vite build failed.");
  try {const checked=verifyStagingAssets("dist"); console.log("Staging asset guard passed:",checked.files,"text assets checked.");}
  catch(error){rmSync("dist",{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error("Staging deployment blocked:",error.message);process.exitCode=1;}
}
