import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {parseDockerReleaseReviewAction}
 from "../supabase/functions/_shared/docker-release-review-contract.mjs";
import {dockerReleaseEventMessage}
 from "../src/lib/dockerReleaseHistoryIntegrity.mjs";
import {verifyDockerReleaseAuditExport}
 from "../src/lib/dockerReleaseAuditExport.mjs";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const R="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C="b".repeat(64),COMMIT="a".repeat(40);
const NOTE="Operator recorded independent release review metadata only.";
const DIGEST=s=>createHash("sha256").update(s).digest("hex");
function makeEvent(id,kind,actor,previous){
 const event={
  id,review_id:R,owner_id:A,actor_id:actor,event_kind:kind,
  occurred_at:"2026-11-23T14:40:12.789Z",note:NOTE,
  previous_sha256:previous
 };
 return {...event,entry_sha256:DIGEST(dockerReleaseEventMessage(event,previous))};
}
function fixture(){
 const e1=makeEvent(5,"submitted",A,"0".repeat(64));
 const e2=makeEvent(6,"in_review",A,e1.entry_sha256);
 const e3=makeEvent(8,"reviewer_invited",A,e2.entry_sha256);
 const e4=makeEvent(11,"reviewer_accepted",B,e3.entry_sha256);
 const e5=makeEvent(12,"reviewed",A,e4.entry_sha256);
 return {ok:true,schema:"eternyx-docker-release-audit-export-v1",
  review:{
   id:R,owner_id:A,commit_sha:COMMIT,candidate_sha256:C,
   source_snapshot_sha256:"c".repeat(64),manifest_sha256:"d".repeat(64),
   staging_ref:"s".repeat(20),state:"reviewed"
  },
  assignment:{review_id:R,owner_id:A,reviewer_id:B,
   commit_sha:COMMIT,candidate_sha256:C,state:"accepted"},
  events:[e1,e2,e3,e4,e5],eventCount:5,
  fullDatabaseWindow:true,serverChainAuthenticated:false,
  independentTailAnchorVerified:false,
  productionDeploymentAuthorized:false,dockerExecutionAuthorized:false,
  independentSecurityApprovalRequired:true
 };
}
const options=report=>({
 reviewId:R,ownerId:A,candidateSha256:C,commitSha:COMMIT,
 expectedTailSha256:report.events.at(-1).entry_sha256
});
const check=async(report,opts)=>verifyDockerReleaseAuditExport(report,opts,webcrypto);
test("read-only export requires exact owner-owned request schema, never executes Docker",()=>{
 assert.deepEqual(parseDockerReleaseReviewAction({action:"release_export_audit",reviewId:R}),
  {action:"release_export_audit",reviewId:R});
 for(const bad of [
  {action:"release_export_audit",reviewId:R,ownerId:A},
  {action:"release_export_audit",reviewId:R,includePrivateKeys:true},
  {action:"release_export_audit",reviewId:"bad"},
  {action:"release_export_audit",reviewId:R,command:"docker run"},
  {action:"release_export_all"}
 ])assert.equal(parseDockerReleaseReviewAction(bad),null);
});
test("actual WebCrypto verifies full five-event chain and independently pinned candidate/tail",async()=>{
 const report=fixture();
 const result=await check(report,options(report));
 assert.equal(result.status,"pinned_tail_consistent_server_report");
 assert.equal(result.verifiedEvents,5);
 assert.equal(result.complete,true);
 assert.equal(result.tailPinMatched,true);
 assert.equal(result.reportAuthenticationIndependentlyEstablished,false);
 assert.equal(result.signedByDatabase,false);
 assert.equal(result.productionDeploymentAuthorized,false);
 assert.equal(result.dockerExecutionAuthorized,false);
});
test("same server-supplied report without independent tail pin stays explicitly unanchored",async()=>{
 const report=fixture(),opts=options(report);delete opts.expectedTailSha256;
 const result=await check(report,opts);
 assert.equal(result.status,"unanchored_server_report_only");
 assert.equal(result.tailPinMatched,false);
 assert.equal(result.independentSecurityApprovalRequired,true);
});
test("missing events, count mismatch and omitted first event never pass",async()=>{
 const report=fixture();
 for(const change of [
  {...report,events:report.events.slice(1),eventCount:4},
  {...report,eventCount:99},
  {...report,events:report.events.slice(0,4),eventCount:4},
  {...report,fullDatabaseWindow:false},
  {...report,serverChainAuthenticated:true},
  {...report,independentTailAnchorVerified:true}
 ]){
  assert.equal((await check(change,options(report))).status,"rejected");
 }
});
test("tampered event note, actor, hash, timing and reordered chain fail closed",async()=>{
 const report=fixture();
 for(const modification of [
  {note:NOTE+" tampered"},
  {actor_id:A},
  {entry_sha256:"0".repeat(64)},
  {previous_sha256:"0".repeat(64)},
  {occurred_at:"2026-11-23T14:40:12.790Z"}
 ]){
  const events=report.events.map((e,i)=>i===3?{...e,...modification}:e);
  assert.equal((await check({...report,events},options(report))).status,"rejected");
 }
 const reordered=[report.events[1],report.events[0],...report.events.slice(2)];
 assert.equal((await check({...report,events:reordered},options(report))).status,"rejected");
});
test("foreign owner, alternate review, substituted candidate and wrong trusted tail are rejected",async()=>{
 const report=fixture();
 for(const opt of [
  {...options(report),ownerId:B},
  {...options(report),reviewId:B},
  {...options(report),candidateSha256:"e".repeat(64)},
  {...options(report),commitSha:"f".repeat(40)},
  {...options(report),expectedTailSha256:"f".repeat(64)}
 ])assert.equal((await check(report,opt)).status,"rejected");
 assert.equal((await check({...report,review:{...report.review,owner_id:B}},
  options(report))).status,"rejected");
});
test("independent reviewer must match candidate, owner, identity and completed state",async()=>{
 const report=fixture();
 for(const assignment of [
  null,
  {...report.assignment,reviewer_id:A},
  {...report.assignment,candidate_sha256:"f".repeat(64)},
  {...report.assignment,commit_sha:"e".repeat(40)},
  {...report.assignment,state:"declined"},
  {...report.assignment,owner_id:B}
 ])assert.equal((await check({...report,assignment},options(report))).status,"rejected");
 const forged=report.events.map((e,i)=>i===3?{...e,actor_id:A}:e);
 assert.equal((await check({...report,events:forged},options(report))).status,"rejected");
});
test("terminal event must reflect recorded state and all owner history is bounded",async()=>{
 const report=fixture();
 assert.equal((await check({...report,review:{...report.review,state:"blocked"}},options(report))).status,"rejected");
 assert.equal((await check({...report,review:{...report.review,state:"in_review"}},options(report))).status,"rejected");
 assert.equal((await check({...report,eventCount:33,events:Array(33).fill(report.events[0])},options(report))).status,"rejected");
});
test("CLI rejects unsafe files, missing independent pins and wrong anchors without logging notes",()=>{
 const dir=mkdtempSync(join(tmpdir(),"eternyx-audit-verify-"));
 try{
  const path=join(dir,"report.json");
  const data=fixture();
  writeFileSync(path,JSON.stringify(data),{mode:0o600});chmodSync(path,0o600);
  const cli=fileURLToPath(new URL("../scripts/docker-release-audit-verify.mjs",import.meta.url));
  const env={...process.env,
   ETERNYX_DOCKER_AUDIT_OWNER_ID:A,
   ETERNYX_DOCKER_AUDIT_REVIEW_ID:R,
   ETERNYX_DOCKER_AUDIT_PINNED_CANDIDATE_SHA256:C,
   ETERNYX_DOCKER_AUDIT_PINNED_COMMIT_SHA:COMMIT,
   ETERNYX_DOCKER_AUDIT_PINNED_TAIL_SHA256:data.events.at(-1).entry_sha256
  };
  const run=(patch={},args=[path])=>spawnSync(process.execPath,[cli,...args],{
   env:{...env,...patch},encoding:"utf8",timeout:10000});
  const success=run();
  assert.equal(success.status,0,success.stderr);
  assert.equal(JSON.parse(success.stdout).status,"pinned_tail_consistent_server_report");
  assert.equal(run({ETERNYX_DOCKER_AUDIT_PINNED_TAIL_SHA256:"e".repeat(64)}).status,1);
  assert.equal(run({ETERNYX_DOCKER_AUDIT_PINNED_TAIL_SHA256:""}).status,1);
  assert.equal(run({},["./relative/report.json"]).status,1);
  chmodSync(path,0o644);
  if(process.platform!=="win32")assert.equal(run().status,1);
  for(const result of [success,run({ETERNYX_DOCKER_AUDIT_OWNER_ID:B})])
   assert.equal((result.stdout+result.stderr).includes(NOTE),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("hosted API returns only reviewed record and safe owner-only SQL, with no deployment control",()=>{
 const edge=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
 const migration=readFileSync(new URL("../supabase/migrations/20261123130000_docker_full_release_audit_export.sql",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../src/components/docker/DockerReleaseReviewWorkspace.tsx",import.meta.url),"utf8");
 assert.match(edge,/supabase\.rpc\("docker_release_export_audit"/);
 assert.match(edge,/p_owner_id:owner,p_review_id:parsed\.reviewId/);
 assert.match(edge,/verifiedDockerOwnerId\(user,supabase\)/);
 assert.match(migration,/SECURITY INVOKER/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/owner_id=p_owner_id/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.docker_release_export_audit/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.docker_release_export_audit/);
 assert.match(ui,/onAction\("release_export_audit"/);
 assert.match(ui,/verifyDockerReleaseAuditExport/);
 assert.match(ui,/unanchored_server_report_only/);
 assert.match(ui,/UNANCHORED/);
 assert.doesNotMatch(edge,/Deno\.Command|docker\.sock|spawnSync/);
});
