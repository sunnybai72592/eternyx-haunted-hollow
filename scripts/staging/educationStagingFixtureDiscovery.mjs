import {spawnSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
import {STAGING_REF,MANIFEST_KEYS,validateManifest} from "./educationStagingSyntheticFixtures.mjs";
const fail=()=>{throw Error("Education fixture discovery blocked");};
const keys=["ETERNYX_RLS_TEST_A_EMAIL","ETERNYX_RLS_TEST_B_EMAIL","ETERNYX_RLS_INSTRUCTOR_EMAIL"];
export function discoveryConfig(env){
 if(env?.ETERNYX_EDU_DISCOVERY_APPROVAL!=="I_APPROVE_EDUCATION_SYNTHETIC_FIXTURE_READ"||
 env.ETERNYX_EDU_RELEASE_MODE!=="journey"||env.ETERNYX_RLS_STAGING_REF!==STAGING_REF||
 env.ETERNYX_RLS_STAGING_URL!=="https://"+STAGING_REF+".supabase.co"||
 !/^[a-z0-9]{20}$/.test(env.ETERNYX_RLS_PRODUCTION_REF||"")||env.ETERNYX_RLS_PRODUCTION_REF===STAGING_REF||
 typeof env.ETERNYX_EDU_STAGING_DB_PASSWORD!=="string"||env.ETERNYX_EDU_STAGING_DB_PASSWORD.length<12||
 MANIFEST_KEYS.some(k=>env[k]))fail();
 const emails=keys.map(k=>env[k]);
 if(emails.some(e=>typeof e!=="string"||!/^rls-[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e))||
 new Set(emails.map(e=>e.toLowerCase())).size!==3)fail();
 return {...Object.fromEntries(keys.map(k=>[k,env[k]])),PATH:env.PATH||"",
 PGPASSWORD:env.ETERNYX_EDU_STAGING_DB_PASSWORD,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"10",
 PGOPTIONS:"-c default_transaction_read_only=on -c statement_timeout=20000"};
}
export function maskedHandoff(manifest,mask,append){
 const checked=validateManifest(manifest);
 for(const key of MANIFEST_KEYS)if(!/_(?:SCORE|MAX|POINTS)$/.test(key))mask(checked[key]);
 append(MANIFEST_KEYS.map(k=>k+"="+checked[k]).join("\n")+"\n");
}
export function run(env=process.env){
 try{
  const config=discoveryConfig(env);
  if(!env.GITHUB_ENV||env.GITHUB_ACTIONS!=="true")fail();
  const r=spawnSync("psql",["-X","-qAt","-w","-v","ON_ERROR_STOP=1","-h","db."+STAGING_REF+".supabase.co","-p","5432","-U","postgres","-d","postgres","-f",
  fileURLToPath(new URL("../sql/education-staging-fixture-discovery.sql",import.meta.url))],
  {env:config,encoding:"utf8",timeout:35000,maxBuffer:128*1024});
  if(r.error||r.status!==0)fail();
  maskedHandoff(JSON.parse(r.stdout.trim()),v=>process.stdout.write("::add-mask::"+v+"\n"),
  v=>appendFileSync(env.GITHUB_ENV,v,{encoding:"utf8"}));
  process.stdout.write("Discovered 24 validated synthetic fixture settings; no database writes.\n");
 }catch{process.stderr.write("Education fixture discovery blocked: absent, ambiguous, expired, consumed, or mixed fixture settings.\n");process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run();
