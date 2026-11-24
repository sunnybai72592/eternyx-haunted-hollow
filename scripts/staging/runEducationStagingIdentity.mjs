import {createClient} from "@supabase/supabase-js";
import {mkdirSync,rmSync,writeFileSync} from "node:fs";
import {identityConfig,checkIdentityRoles,identityReport} from "./educationStagingIdentity.mjs";
const path="test-results/education-staging-identity.json";
try{
 rmSync(path,{force:true});
 const config=identityConfig(process.env);
 const report=identityReport(config.mode,await checkIdentityRoles(config,c=>createClient(c.url,c.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 })),process.env);
 mkdirSync("test-results",{recursive:true});
 writeFileSync(path,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 process.stdout.write("Education staging identity: "+report.outcome+"; no exam fixtures written.\n");
 if(report.outcome!=="identity_checks_passed")process.exitCode=1;
}catch{process.stderr.write("Education staging identity blocked; inspect protected configuration.\n");process.exitCode=1;}
