#!/usr/bin/env node
// Read-only operator recovery inventory. Never runs Docker or sends network requests.
import {listLabClaims,readLabClaim} from "../src/lib/dockerLabRecovery.mjs";
import {auditSignedAgentRecoveryDirectory} from "../src/lib/dockerStrictRecoveryInventory.mjs";
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==="--strict-inventory")
   process.stdout.write(JSON.stringify(auditSignedAgentRecoveryDirectory(),null,2)+"\n");
 else if(args.length===0)process.stdout.write(JSON.stringify({scope:"operator-local",
   claims:listLabClaims(),note:"Do not automatically retry any claimed operation."},null,2)+"\n");
 else if(args.length===1)process.stdout.write(JSON.stringify(readLabClaim(args[0]),null,2)+"\n");
 else throw Error("Usage: node scripts/docker-lab-recovery.mjs [CLAIM_UUID | --strict-inventory]");
}catch(error){process.stderr.write((error instanceof Error?error.message:"Recovery unavailable")+"\n");process.exitCode=1;}
