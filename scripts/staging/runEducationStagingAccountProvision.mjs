// Run on a trusted operator machine only. Never expose the secret to a browser.
import {createClient} from "@supabase/supabase-js";
import {writeFileSync,renameSync,rmSync} from "node:fs";
import {accountProvisionConfig,accountConfigurationIssues,freshAccountJournal,provisionAccounts} from "./educationStagingAccountProvision.mjs";
const path="education-staging-account-recovery.private.json";
const tmp=path+".tmp";
let ownsJournal=false;
try{
 const issues=accountConfigurationIssues(process.env);
 if(issues.length){
  for(const issue of issues)process.stderr.write("CONFIG "+issue.setting+": "+issue.reason+"\n");
  throw Error("Configuration blocked before Auth requests");
 }
 const config=accountProvisionConfig(process.env);
 if(process.argv.includes("--check-config")){
  process.stdout.write("Education account configuration passed; no Auth requests or writes performed.\n");
 }else{
 const journal=freshAccountJournal();
 writeFileSync(path,JSON.stringify(journal,null,2)+"\n",{flag:"wx",mode:0o600});
 ownsJournal=true;
 const makeClient=key=>createClient(config.url,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(input,{...init,redirect:"error",signal:AbortSignal.timeout(15000)})},
 });
 await provisionAccounts(config,{journal,admin:makeClient(config.secret),
  makePublicClient:()=>makeClient(config.publishableKey),
  persist:value=>{writeFileSync(tmp,JSON.stringify(value,null,2)+"\n",{mode:0o600,flag:"wx"});renameSync(tmp,path);}});
 process.stdout.write("Four dedicated staging Auth users verified without application privileges. Separate operator grant still required.\n");
 }
}catch{process.stderr.write(ownsJournal?"Education account setup blocked or incomplete. Inspect staging and local recovery record; do not automatically retry.\n":"Education setup blocked before account creation; check configuration diagnostics or existing recovery journal.\n");process.exitCode=1;}
finally{if(ownsJournal)rmSync(tmp,{force:true});}
