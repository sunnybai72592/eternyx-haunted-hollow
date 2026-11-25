import {createClient} from "@supabase/supabase-js";
import {mkdirSync,rmSync,writeFileSync,renameSync} from "node:fs";
import {publicationConfig,publicationJourney} from "./educationHostedPublication.mjs";
const path="test-results/education-hosted-publication.json";
try{
 rmSync(path,{force:true});rmSync(path+".tmp",{force:true});mkdirSync("test-results",{recursive:true});
 const config=publicationConfig(process.env);
 const provenance={source_sha:process.env.GITHUB_SHA,github_run_id:process.env.GITHUB_RUN_ID,github_run_attempt:process.env.GITHUB_RUN_ATTEMPT};
 const persist=r=>{writeFileSync(path+".tmp",JSON.stringify({...r,...provenance},null,2)+"\n",{mode:0o600});renameSync(path+".tmp",path);};
 const report=await publicationJourney(config,()=>createClient(config.url,config.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(input,{...init,redirect:"error",signal:AbortSignal.timeout(15000)})}
 }),persist);
 if(report.outcome!=="passed")process.exitCode=1;
 process.stdout.write("Education synthetic publication: "+report.outcome+"; no production approval.\n");
}catch{process.stderr.write("Publication acceptance blocked; inspect staging before any new dispatch.\n");process.exitCode=1;}
finally{rmSync(path+".tmp",{force:true});}
