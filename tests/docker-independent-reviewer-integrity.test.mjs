import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseDockerReleaseReviewAction}
 from "../supabase/functions/_shared/docker-release-review-contract.mjs";
import {dockerReleaseEventMessage,verifyDockerReleaseHistory}
 from "../src/lib/dockerReleaseHistoryIntegrity.mjs";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const REVIEW="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HEX="a".repeat(64);
const NOTE="Operator reviewed exact release hash; no deployment was authorized.";
const invitation={action:"release_invite_reviewer",reviewId:REVIEW,reviewerId:B,note:NOTE};
const response={action:"release_reviewer_respond",reviewId:REVIEW,candidateSha256:HEX,
 decision:"accept",note:NOTE};
test("shared Docker contract requires exact reviewer fields and forbids client owner/role overrides",()=>{
 assert.deepEqual(parseDockerReleaseReviewAction(invitation),invitation);
 assert.deepEqual(parseDockerReleaseReviewAction(response),response);
 assert.equal(parseDockerReleaseReviewAction({...response,decision:"decline"})?.decision,"decline");
 for(const illegal of [
  {...invitation,ownerId:A},{...invitation,execute:true},{...invitation,note:"short"},
  {...invitation,reviewerId:"fake"},{...invitation,role:"admin"},
  {...response,decision:"approve"},{...response,deploy:true},
  {...response,candidateSha256:"b".repeat(63)},
  {...response,note:"Bearer\nsecret"},{...response,privateKey:"do_not_upload"}
 ])assert.equal(parseDockerReleaseReviewAction(illegal),null);
 assert.equal(parseDockerReleaseReviewAction({action:"release_deploy"}),null);
});
const digest=s=>createHash("sha256").update(s).digest("hex");
function event(id,kind,actor,previous){
 const e={id,review_id:REVIEW,owner_id:A,actor_id:actor,event_kind:kind,
  note:NOTE,occurred_at:"2026-11-23T14:30:20.124Z",
  previous_sha256:previous};
 return {...e,entry_sha256:digest(dockerReleaseEventMessage(e,previous))};
}
const chain=()=>{
 const first=event(41,"submitted",A,"0".repeat(64));
 const second=event(42,"in_review",A,first.entry_sha256);
 const third=event(46,"reviewer_invited",A,second.entry_sha256);
 const fourth=event(50,"reviewer_accepted",B,third.entry_sha256);
 return [first,second,third,fourth,event(51,"reviewed",A,fourth.entry_sha256)];
};
test("real WebCrypto verifies every visible SHA-256 event with distinct reviewer identity",async()=>{
 const e=chain();
 const result=await verifyDockerReleaseHistory(e,REVIEW,A,webcrypto);
 assert.equal(result.status,"hash_chain_consistent");
 assert.equal(result.authenticatedAudit,false);
 assert.equal(result.independentDatabaseAttestation,false);
 assert.equal(result.verifiedCount,5);
 assert.equal(result.tailHash,e.at(-1).entry_sha256);
 const outOfOrder=[e[3],e[4],e[0],e[1],e[2]];
 assert.equal((await verifyDockerReleaseHistory(outOfOrder,REVIEW,A,webcrypto)).status,
  "hash_chain_consistent");
});
test("missing first event never passes hash chain, even if later events are self-consistent",async()=>{
 const e=chain().slice(2);
 const out=await verifyDockerReleaseHistory(e,REVIEW,A,webcrypto);
 assert.equal(out.status,"incomplete");
 assert.equal(out.reason,"genesis_not_in_window");
 assert.equal((await verifyDockerReleaseHistory([],REVIEW,A,webcrypto)).status,"incomplete");
});
test("altered reviewer, note, timestamp, predecessor or entry hash breaks the chain",async()=>{
 const e=chain();
 for(const change of [
  {actor_id:A},{note:NOTE+" changed"},
  {occurred_at:"2026-11-23T14:30:20.125Z"},
  {previous_sha256:"b".repeat(64)},
  {entry_sha256:"c".repeat(64)}
 ]){
  const modified=e.map((entry,i)=>i===3?{...entry,...change}:entry);
  assert.equal((await verifyDockerReleaseHistory(modified,REVIEW,A,webcrypto)).status,"broken");
 }
 const wrongOwner=e.map((x,i)=>i===4?{...x,owner_id:B}:x);
 assert.equal((await verifyDockerReleaseHistory(wrongOwner,REVIEW,A,webcrypto)).status,"broken");
});
test("duplicate IDs, malformed timestamps, malformed history and no crypto fail closed",async()=>{
 const e=chain();
 const duplicate=e.map((x,i)=>i===2?{...x,id:42}:x);
 assert.equal((await verifyDockerReleaseHistory(duplicate,REVIEW,A,webcrypto)).status,"broken");
 const wrongTime=e.map((x,i)=>i===1?{...x,occurred_at:"not-a-date"}:x);
 assert.equal((await verifyDockerReleaseHistory(wrongTime,REVIEW,A,webcrypto)).status,"broken");
 assert.equal((await verifyDockerReleaseHistory(e,"invalid",A,webcrypto)).status,"unverified");
 assert.equal((await verifyDockerReleaseHistory(e,REVIEW,A,null)).status,"unverified");
});
test("release owner cannot mark reviewed without independent accepted matching candidate",()=>{
 const migration=readFileSync(new URL("../supabase/migrations/20261123120000_docker_reviewer_accountability_and_event_chain.sql",import.meta.url),"utf8");
 assert.match(migration,/independent_reviewer_required/);
 assert.match(migration,/a\.reviewer_id<>p_owner_id/);
 assert.match(migration,/a\.candidate_sha256=v_case\.candidate_sha256/);
 assert.match(migration,/a\.state='accepted'/);
 assert.match(migration,/p_owner_id=p_reviewer_id/);
 assert.match(migration,/p_candidate_sha256/);
 assert.match(migration,/reviewer_already_assigned/);
 assert.match(migration,/reviewer_finalized/);
});
test("real SQL audit history is linked, backfilled, mutation-protected and readable via owner RLS",()=>{
 const migration=readFileSync(new URL("../supabase/migrations/20261123120000_docker_reviewer_accountability_and_event_chain.sql",import.meta.url),"utf8");
 assert.match(migration,/pg_catalog\.sha256\(/);
 assert.match(migration,/previous_sha256/);
 assert.match(migration,/entry_sha256/);
 assert.match(migration,/CREATE TRIGGER docker_release_history_compute_hash/);
 assert.match(migration,/CREATE TRIGGER docker_release_history_no_updates/);
 assert.match(migration,/FOR SELECT TO authenticated/);
 assert.match(migration,/owner_id<>reviewer_id/);
 assert.match(migration,/SECURITY INVOKER/);
 assert.doesNotMatch(migration,/SECURITY DEFINER/);
});
test("Edge binds authenticated identities separately for owner invitation and reviewer response",()=>{
 const edge=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
 assert.match(edge,/verifiedDockerOwnerId\(user,supabase\)/);
 assert.match(edge,/parseDockerReleaseReviewAction\(body\)/);
 assert.match(edge,/supabase\.rpc\("docker_release_invite_reviewer"/);
 assert.match(edge,/supabase\.rpc\("docker_release_respond_reviewer"/);
 assert.match(edge,/p_owner_id:owner,p_review_id:parsed\.reviewId/);
 assert.match(edge,/p_reviewer_id:owner,p_review_id:parsed\.reviewId/);
 assert.match(edge,/releaseReviewerIdentityIndependentlyVerified:false/);
 assert.match(edge,/releaseExecutionAuthorized:false/);
 assert.doesNotMatch(edge,/Deno\.Command|docker\.sock|spawnSync/);
});
test("React workspace cannot finish owner review without invited other account acceptance",()=>{
 const ui=readFileSync(new URL("../src/components/docker/DockerReleaseReviewWorkspace.tsx",import.meta.url),"utf8");
 const reviewer=readFileSync(new URL("../src/components/docker/DockerReleaseReviewerPanel.tsx",import.meta.url),"utf8");
 const page=readFileSync(new URL("../src/pages/DockerControlReview.tsx",import.meta.url),"utf8");
 assert.match(ui,/a\.reviewer_id!==currentUserId&&a\.state==="accepted"/);
 assert.match(ui,/!accepted\|\|!noteOK\(note\)/);
 assert.match(ui,/verifyDockerReleaseHistory\(events,review\.id,currentUserId/);
 assert.match(ui,/incomplete or unverified/);
 assert.match(reviewer,/onAction\("release_invite_reviewer"/);
 assert.match(reviewer,/onAction\("release_reviewer_respond"/);
 assert.match(reviewer,/confirm\[assignment\.review_id\]!==assignment\.candidate_sha256/);
 assert.match(page,/releaseReviewerAssignments/);
 assert.match(page,/currentUserId=\{user\?\.id\?\?null\}/);
 assert.doesNotMatch(reviewer,/\/docker\.sock|execFileSync|supabase functions deploy/);
});
