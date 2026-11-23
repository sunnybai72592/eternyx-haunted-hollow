import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseDockerReleaseReviewAction} from "../supabase/functions/_shared/docker-release-review-contract.mjs";
const requestKey="11111111-1111-4111-8111-111111111111";
const reviewId="22222222-2222-4222-8222-222222222222";
const valid={
 action:"release_submit",requestKey,commitSha:"a".repeat(40),
 candidateSha256:"b".repeat(64),sourceSnapshotSha256:"c".repeat(64),
 manifestSha256:"d".repeat(64),stagingRef:"s".repeat(20),
 note:"Owner reviewed independently signed release evidence, no deployment."
};
test("exact allowlisted release submission carries only hashes, ref, idempotency and note",()=>{
 assert.deepEqual(parseDockerReleaseReviewAction(valid),valid);
 for(const edit of [
  {ownerId:reviewId},{privateKey:"do-not-upload"},{authorization:"Bearer fake"},
  {containerId:"a".repeat(64)},{execute:true},{deploy:true},
  {commitSha:"f".repeat(39)},{candidateSha256:"e".repeat(63)},
  {sourceSnapshotSha256:"e".repeat(65)},{manifestSha256:"?"+"e".repeat(63)},
  {stagingRef:"https://prod.supabase.co"},{note:"short"},
  {note:"a".repeat(501)},{note:"contains\nnewline"},{requestKey:"not-a-uuid"}
 ])assert.equal(parseDockerReleaseReviewAction({...valid,...edit}),null);
});
test("owner release-review transitions are strictly typed with meaningful notes",()=>{
 const accepted={
  action:"release_decide",reviewId,state:"in_review",
  note:"Started manual staging release evidence review."
 };
 assert.deepEqual(parseDockerReleaseReviewAction(accepted),accepted);
 assert.equal(parseDockerReleaseReviewAction({...accepted,state:"reviewed"})?.state,"reviewed");
 assert.equal(parseDockerReleaseReviewAction({...accepted,state:"blocked"})?.state,"blocked");
 for(const change of [
  {state:"approved"},{state:"deployed"},{state:"submitted"},
  {note:"tiny"},{note:"invalid\rcontrol"},
  {reviewId:"../owner"},{releaseAuthorized:true},
  {role:"admin"},{actorId:requestKey},
 ])assert.equal(parseDockerReleaseReviewAction({...accepted,...change}),null);
 assert.equal(parseDockerReleaseReviewAction({action:"release_execute"}),null);
});
test("real database migration has owner read-only RLS, composite event ownership and service-only write RPC",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261123110000_docker_release_review_history.sql",import.meta.url),"utf8");
 for(const table of ["docker_release_reviews","docker_release_review_events"]){
  assert.match(sql,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
  assert.match(sql,new RegExp("REVOKE ALL ON public\\."+table+" FROM PUBLIC,anon,authenticated"));
  assert.match(sql,new RegExp("GRANT SELECT ON public\\."+table+" TO authenticated"));
  assert.doesNotMatch(sql,new RegExp("GRANT (?:INSERT|UPDATE|DELETE) ON public\\."+table+" TO authenticated"));
 }
 assert.match(sql,/FOREIGN KEY\(review_id,owner_id\) REFERENCES public\.docker_release_reviews\(id,owner_id\)/);
 assert.match(sql,/UNIQUE\(owner_id,request_key\)/);
 assert.match(sql,/SECURITY INVOKER/g);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_release_submit_review/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.docker_release_decide_review/);
 assert.match(sql,/invalid_transition/);
 assert.doesNotMatch(sql,/SECURITY DEFINER/);
 assert.doesNotMatch(sql,/\b(?:docker\.sock|Deno\.Command|shell)\b/);
});
test("owner JWT authentication gates all review database access and never exposes Docker execution",()=>{
 const edge=readFileSync(new URL("../supabase/functions/docker-control/index.ts",import.meta.url),"utf8");
 assert.match(edge,/verifiedDockerOwnerId\(user,supabase\)/);
 assert.match(edge,/parseDockerReleaseReviewAction\(body\)/);
 assert.match(edge,/supabase\.from\("docker_release_reviews"\)/);
 assert.match(edge,/supabase\.from\("docker_release_review_events"\)/);
 assert.match(edge,/supabase\.rpc\("docker_release_submit_review"/);
 assert.match(edge,/supabase\.rpc\("docker_release_decide_review"/);
 assert.match(edge,/p_owner_id:owner/);
 assert.match(edge,/releaseExecutionAuthorized:false/);
 assert.match(edge,/releaseIndependentApprovalVerified:false/);
 assert.doesNotMatch(edge,/Deno\.Command|docker\.sock|spawnSync/);
});
test("release workspace uses real server mutation actions without an execution or deployment control",()=>{
 const page=readFileSync(new URL("../src/pages/DockerControlReview.tsx",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../src/components/docker/DockerReleaseReviewWorkspace.tsx",import.meta.url),"utf8");
 assert.match(page,/DockerReleaseReviewWorkspace/);
 assert.match(page,/setReleaseReviews/);
 assert.match(page,/setReleaseReviewEvents/);
 assert.match(ui,/onAction\("release_submit"/);
 assert.match(ui,/onAction\("release_decide"/);
 assert.match(ui,/crypto\.randomUUID\(\)/);
 assert.match(ui,/r\.state==="in_review"/);
 assert.match(ui,/r\.state!=="reviewed"&&r\.state!=="blocked"/);
 assert.match(ui,/independent security approval/i);
 assert.match(ui,/not approval/i);
 assert.doesNotMatch(ui,/\/docker\.sock|fetch\(["']https:\/\/api\.supabase\.com|deploy\(/);
});
