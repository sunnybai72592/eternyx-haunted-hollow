import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEVELOPER_RELEASE_PHASES, DEVELOPER_RELEASE_VIEWPORTS,
  verifyHostedDeveloperReleaseObservations, verifyHostedDeveloperRuntimeSafety,
} from "../scripts/developer-staging-provenance.mjs";

const sha = "a".repeat(40);
const build = "b".repeat(32);
const observations = () => DEVELOPER_RELEASE_VIEWPORTS.flatMap(
  viewport => DEVELOPER_RELEASE_PHASES.map(phase => ({
    viewport, phase, status: "source-matched", build_id: build, source_sha: sha,
    html_matches: true, client_matches: true, matches_checkout: true,
  }))
);
const runtime = () => ({
  network_audit: { blocked_external_requests: 3, blocked_write_attempts: 0 },
  runtime_errors: [], asset_failures: [],
});

test("two before/after Chrome viewport observations establish stable self-reported release ID", () => {
  const verified = verifyHostedDeveloperReleaseObservations(observations(), sha);
  assert.equal(verified.build_id, build);
  assert.equal(verified.observed_source_sha, sha);
  assert.equal(verified.observations, 4);
  assert.match(verified.scope, /not an independent signed deployment attestation/);
});

test("refuse missing, duplicate, stale and changed hosted release observations", () => {
  const changes = [
    x=>x.slice(1),
    x=>[x[0],x[0],x[2],x[3]],
    x=>x.map((v,i)=>i===3?{...v,build_id:"c".repeat(32)}:v),
    x=>x.map((v,i)=>i===2?{...v,source_sha:"c".repeat(40)}:v),
    x=>x.map((v,i)=>i===1?{...v,status:"build-matched",matches_checkout:false}:v),
    x=>x.map((v,i)=>i===1?{...v,status:"unavailable",source_sha:null,build_id:null}:v),
    x=>x.map((v,i)=>i===1?{...v,html_matches:false}:v),
    x=>x.map((v,i)=>i===1?{...v,client_matches:false}:v),
    x=>x.map((v,i)=>i===1?{...v,phase:"unexpected"}:v),
    x=>x.map((v,i)=>i===1?{...v,viewport:"375x812"}:v),
    x=>x.map((v,i)=>i===1?{...v,leaked_source:"bad"}:v),
  ];
  for(const mutate of changes) assert.throws(
    ()=>verifyHostedDeveloperReleaseObservations(mutate(observations()),sha),
    /Hosted release:/);
  assert.throws(()=>verifyHostedDeveloperReleaseObservations(observations(),"main"),/complete Git commit/);
});

test("network audit counts truly blocked cross-origin reads but rejects any attempted writes", () => {
  assert.deepEqual(verifyHostedDeveloperRuntimeSafety(runtime()),{
    blocked_external_requests:3, blocked_write_attempts:0, runtime_exceptions:0, failed_first_party_assets:0,
  });
  assert.throws(()=>verifyHostedDeveloperRuntimeSafety({
    ...runtime(),network_audit:{blocked_external_requests:1,blocked_write_attempts:1},
  }),/unexpected network writes/);
  assert.throws(()=>verifyHostedDeveloperRuntimeSafety({
    ...runtime(),network_audit:{blocked_external_requests:-1,blocked_write_attempts:0},
  }),/unexpected network writes/);
  assert.throws(()=>verifyHostedDeveloperRuntimeSafety({
    ...runtime(),network_audit:{blocked_external_requests:0,blocked_write_attempts:0,credential:"bad"},
  }),/unexpected network writes/);
});

test("untrusted or broken JavaScript and first-party script/document HTTP errors block staging acceptance", () => {
  for (const kind of ["javascript-type-error","module-load-error","other-js-error"]) {
    assert.throws(()=>verifyHostedDeveloperRuntimeSafety({...runtime(),runtime_errors:[kind]}),/exceptions/);
  }
  assert.throws(()=>verifyHostedDeveloperRuntimeSafety({
    ...runtime(),asset_failures:[{resource_type:"script",status:404}],
  }),/failed script/);
  assert.throws(()=>verifyHostedDeveloperRuntimeSafety({
    ...runtime(),asset_failures:[{resource_type:"document",status:503}],
  }),/failed script/);
  assert.throws(()=>verifyHostedDeveloperRuntimeSafety({
    ...runtime(),asset_failures:[{resource_type:"script",status:400,url:"private?token=secret"}],
  }),/failed script/);
});

test("Chrome runner gathers real public manifest/HTML/JS checks and never persists source or exception messages", () => {
  const src=readFileSync(new URL("../tests/browser/developer_project_lab_smoke.py",import.meta.url),"utf8");
  assert.match(src,/def observe_hosted_release\(/);
  assert.match(src,/fetch\("\/release-info\.json"/);
  assert.match(src,/credentials: "omit", cache: "no-store", redirect: "error"/);
  assert.match(src,/data-eternyx-build-id/);
  assert.match(src,/meta\[name="eternyx-build-id"\]/);
  assert.match(src,/observe_hosted_release\(page, viewport, "before", args\.staging\)/);
  assert.match(src,/observe_hosted_release\(page, viewport, "after", args\.staging\)/);
  assert.match(src,/page\.on\("pageerror", on_runtime_error\)/);
  assert.match(src,/page\.on\("response", on_asset_response\)/);
  assert.match(src,/route\.request\.method not in \("GET", "HEAD"\)/);
  assert.match(src,/"release_observations":RELEASE_OBSERVATIONS/);
  assert.match(src,/"network_audit":NETWORK_AUDIT/);
  assert.doesNotMatch(src,/page\.screenshot|record_video_dir|trace\.start/);
});

test("staging gate requires observed revision parity beyond forged case success", () => {
  const gate=readFileSync(new URL("../scripts/developer-staging-gate.mjs",import.meta.url),"utf8");
  const workflow=readFileSync(new URL("../.github/workflows/developer-staging-browser-acceptance.yml",import.meta.url),"utf8");
  assert.match(gate,/verifyHostedDeveloperReleaseObservations\(value\.release_observations, sourceCommit\)/);
  assert.match(gate,/verifyHostedDeveloperRuntimeSafety\(value\)/);
  assert.match(gate,/Hosted staging acceptance|hosted staging acceptance/i);
  assert.match(gate,/Production certification: NO/);
  assert.match(workflow,/--verify-report/);
  assert.doesNotMatch(workflow,/npm run deploy|supabase db push|secrets\./);
});
