import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const NAME=/^\d{14}_automation_[a-z0-9_]+$/;
const VERSION=/^\d{14}$/;
const SHA=/^[0-9a-f]{40}$/;
const counts=["tables","rlsTables","unsafeTableGrants","rpcs","unsafeRpcs","workflows","runs","enabledSchedules","expiredLeases","activeLeases","failedSchedules","enabledWebhooks","staleApprovals","stuckProviderCalls","failedProviderCalls24h","providerCalls","confirmedAccounts"];
export function sourceJournal(dir=path.join(root,"supabase/migrations")){
 return readdirSync(dir).filter(n=>NAME.test(n.slice(0,-4))&&n.endsWith(".sql")).sort().map(file=>{
  const b=readFileSync(path.join(dir,file));
  return {name:file.slice(0,-4),gitBlobSha:createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex")};
 });
}
export function assess(snapshot,source,{now=Date.now()}={}){
 if(!snapshot||snapshot.schema!=="eternyx-automation-operator-snapshot-v1"||typeof snapshot.schedulerEnabled!=="boolean"||
 !counts.every(k=>Number.isSafeInteger(snapshot[k])&&snapshot[k]>=0)||
 typeof snapshot.observedAt!=="string"||!Number.isFinite(now)||!Number.isFinite(Date.parse(snapshot.observedAt))||
 Date.parse(snapshot.observedAt)>now+60000||now-Date.parse(snapshot.observedAt)>900000||
 !Array.isArray(snapshot.journal)||!Array.isArray(source)||source.length!==22||
 source.some(x=>!x||!NAME.test(x.name)||!SHA.test(x.gitBlobSha))||
 new Set(source.map(x=>x.name)).size!==22)throw Error("invalid_or_stale_operator_snapshot");
 const rows=snapshot.journal;
 if(rows.some(x=>!x||typeof x.name!=="string"||!NAME.test(x.name)||typeof x.version!=="string"||!VERSION.test(x.version)||
 x.statementCount!==1||typeof x.gitBlobSha!=="string"||!SHA.test(x.gitBlobSha))||
 new Set(rows.map(x=>x.name)).size!==rows.length||new Set(rows.map(x=>x.version)).size!==rows.length)
 throw Error("invalid_operator_journal");
 const expected=[...source].sort((a,b)=>a.name.localeCompare(b.name));
 const ordered=[...rows].sort((a,b)=>a.version.localeCompare(b.version));
 const exact=ordered.length===expected.length&&expected.every((s,i)=>s.name===ordered[i].name&&s.gitBlobSha===ordered[i].gitBlobSha);
 const blockers=[];
 if(!exact)blockers.push("migration_integrity");
 if(snapshot.tables!==30||snapshot.rlsTables!==30||snapshot.rpcs!==92||snapshot.unsafeTableGrants!==0||snapshot.unsafeRpcs!==0)blockers.push("catalog_security");
 if(snapshot.schedulerEnabled||snapshot.enabledSchedules||snapshot.activeLeases)blockers.push("unexpected_scheduler_activity");
 if(snapshot.expiredLeases||snapshot.failedSchedules||snapshot.staleApprovals||snapshot.stuckProviderCalls)blockers.push("operational_attention");
 if(snapshot.confirmedAccounts<2)blockers.push("test_accounts_missing");
 // Successful completed rows do not prove HTTP authentication, delivery or worker liveness.
 return {schema:"eternyx-automation-operator-assessment-v1",journalMatchesSource:exact,
 observedCompletedRuns:snapshot.runs,observedProviderCalls:snapshot.providerCalls,
 observedProviderFailures24h:snapshot.failedProviderCalls24h,blockers,
 operatorInspectionPassed:blockers.length===0,
 targetIdentityVerifiedByThisScript:false,authenticatedRuntimeVerified:false,notificationDeliveryVerified:false,
 workerLivenessVerified:false,productionReady:false,releaseAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error("invalid_arguments");
  const report=assess(JSON.parse(readFileSync(process.argv[2],"utf8")),sourceJournal());
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(!report.operatorInspectionPassed)process.exitCode=2;
 }catch{process.stderr.write("Automation operator inspection rejected\n");process.exitCode=1;}
}
