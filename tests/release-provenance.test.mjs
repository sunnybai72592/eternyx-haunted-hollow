import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validatedSha, readCheckedOutSha, createReleaseStamp,
} from "../scripts/releaseProvenance.mjs";
import {
  evaluateRemoteAcceptance, REMOTE_CASES, REMOTE_VIEWPORTS,
  REMOTE_HOSTS,
} from "../src/lib/remoteAcceptance.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const vite = read("vite.config.ts");
const main = read("src/main.tsx");
const runner = read("tests/browser/remote_readonly_smoke.py");
const workflow = read(".github/workflows/ci.yml");
const remoteSummary = read("scripts/summarize-remote-acceptance.mjs");
const artifactCheck = read("scripts/assertReleaseArtifact.mjs");
const HEX32 = "a".repeat(32);
const HEX40 = "b".repeat(40);

function report() {
  return {
    environment: "remote ETERNYX hosted frontend, anonymous, read-only",
    target: "public-domain-candidate",
    hostname: REMOTE_HOSTS["public-domain-candidate"],
    git_revision_under_test: "unverified: hosting release SHA not exposed",
    source_checkout_sha: HEX40,
    production_verified: false,
    payment_or_provider_verified: false,
    mocked_responses: false,
    network_policy: "GET/HEAD to exact allowlisted first-party HTTPS host only",
    blocked_external_requests: 0,
    blocked_write_attempts: 0,
    blocked_telemetry_attempts: 12,
    expected_cases: 16,
    cases: REMOTE_CASES.flatMap(name => REMOTE_VIEWPORTS.map(viewport => ({
      case: name, viewport, result: "passed",
    }))),
  };
}

test("source commit validation accepts exact SHA-1 length only, never branch names or secrets", () => {
  assert.equal(validatedSha(" B".repeat(40)), null);
  assert.equal(validatedSha("B".repeat(40)), HEX40);
  assert.equal(validatedSha(" "+HEX40+" "), HEX40);
  assert.equal(validatedSha("main"), null);
  assert.equal(validatedSha(1234), null);
  assert.equal(validatedSha("sk_test_"+"a".repeat(40)), null);
});

test("build metadata has a safe public shape and refuses to certify production", () => {
  const stamp = createReleaseStamp({
    cwd: "/__eternyx_git_absent__",
    buildId: HEX32,
    now: "2026-11-20T00:00:00.000Z",
  });
  assert.deepEqual(stamp, {
    schema: 1, project: "eternyx", build_id: HEX32,
    source_sha: null, source_sha_origin: "unavailable",
    built_at: "2026-11-20T00:00:00.000Z",
    production_verified: false,
  });
  assert.ok(Object.isFrozen(stamp));
  assert.ok(!JSON.stringify(stamp).includes("process.env"));
});

test("invalid build IDs and timestamps are rejected", () => {
  assert.throws(() => createReleaseStamp({ buildId: "wrong" }), /Invalid build identifier/);
  assert.throws(() => createReleaseStamp({ buildId: HEX32, now: "today" }), /Invalid build timestamp/);
  assert.equal(readCheckedOutSha("/__eternyx_git_absent__"), null);
});

test("real Git checkout SHA is emitted when available without using user-supplied environment keys", () => {
  const actual = readCheckedOutSha();
  if (actual) assert.match(actual, /^[a-f0-9]{40}$/);
  const stamp = createReleaseStamp({ buildId: HEX32 });
  assert.equal(stamp.source_sha, actual);
  assert.equal(stamp.source_sha_origin, actual ? "git-checkout" : "unavailable");
  const src = read("scripts/releaseProvenance.mjs");
  assert.match(src, /execFileSync\("git", \["rev-parse", "--verify", "HEAD"\]/);
  assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|POLAR_SANDBOX_ACCESS_TOKEN|process\.env\./);
});

test("Vite builds the exact same public marker into HTML, JSON and JavaScript", () => {
  assert.match(vite, /createReleaseStamp\(\)/);
  assert.match(vite, /name: "eternyx-build-id"/);
  assert.match(vite, /__ETERNYX_BUILD_ID__: JSON\.stringify\(stamp\.build_id\)/);
  assert.match(vite, /fileName: "release-info\.json"/);
  assert.match(vite, /source: JSON\.stringify\(stamp\)/);
  assert.match(main, /data-eternyx-build-id/);
  assert.match(main, /__ETERNYX_BUILD_ID__/);
  assert.ok(main.indexOf("data-eternyx-build-id") < main.indexOf("createRoot("));
});

test("CI rejects stale or inconsistent release manifests before running Chrome", () => {
  assert.match(workflow, /node scripts\/assertReleaseArtifact\.mjs/);
  assert.ok(workflow.indexOf("npm run build") < workflow.indexOf("node scripts/assertReleaseArtifact.mjs"));
  assert.ok(workflow.indexOf("node scripts/assertReleaseArtifact.mjs") < workflow.indexOf("preview_smoke.py"));
  assert.match(artifactCheck, /resolve\(dist, "release-info\.json"\)/);
  assert.match(artifactCheck, /resolve\(dist, "index\.html"\)/);
  assert.match(artifactCheck, /readCheckedOutSha\(\)/);
  assert.match(artifactCheck, /jsFiles\.some/);
  assert.match(artifactCheck, /production_verified, false/);
});

test("remote read-only probe can only request public metadata from the approved origin", () => {
  assert.match(runner, /fetch\("\/release-info\.json"/);
  assert.match(runner, /method: "GET", credentials: "omit", cache: "no-store", redirect: "error"/);
  assert.match(runner, /data-eternyx-build-id/);
  assert.match(runner, /meta\[name="eternyx-build-id"\]/);
  assert.match(runner, /def inspect_public_release\(page\):/);
  assert.match(runner, /"release_evidence": release_evidence/);
  assert.doesNotMatch(runner, /GET\s+https:\/\/github|request\.post_data|context\.storage_state\(/);
});

test("legacy remote browser evidence stays accepted but does not claim a deployment revision", () => {
  const evaluated = evaluateRemoteAcceptance(report());
  assert.equal(evaluated.allBrowserJourneysPassed, true);
  assert.equal(evaluated.productionVerified, false);
  assert.equal(evaluated.deploymentRevisionKnown, false);
  assert.equal(evaluated.releaseEvidence.status, "unavailable");
});

test("matched source SHA and HTML+JS markers establish observed release provenance only", () => {
  const r = report();
  r.release_evidence = {
    status: "source-matched", build_id: HEX32, source_sha: HEX40,
    html_matches: true, client_matches: true, matches_checkout: true,
  };
  const verified = evaluateRemoteAcceptance(r);
  assert.equal(verified.deploymentRevisionKnown, true);
  assert.equal(verified.releaseEvidence.source_sha, HEX40);
  assert.equal(verified.allBrowserJourneysPassed, true);
  assert.equal(verified.productionVerified, false);
  assert.equal(verified.approvedForLivePayments, false);
});

test("a build with no Git metadata can prove HTML/JS consistency but not the exact source commit", () => {
  const r = report();
  r.release_evidence = {
    status: "build-matched", build_id: HEX32, source_sha: null,
    html_matches: true, client_matches: true, matches_checkout: false,
  };
  const result = evaluateRemoteAcceptance(r);
  assert.equal(result.deploymentRevisionKnown, false);
  assert.equal(result.releaseEvidence.status, "build-matched");
});

test("mismatched source or unsafe HTML/JS evidence never upgrades the release status", () => {
  const r = report();
  r.release_evidence = {
    status: "source-matched", build_id: HEX32, source_sha: HEX40,
    html_matches: true, client_matches: true, matches_checkout: true,
  };
  r.source_checkout_sha = "c".repeat(40);
  assert.throws(() => evaluateRemoteAcceptance(r), /inconsistent release provenance/);
  r.source_checkout_sha = HEX40;
  r.release_evidence.client_matches = false;
  assert.throws(() => evaluateRemoteAcceptance(r), /inconsistent release provenance/);
  r.release_evidence.client_matches = true;
  r.release_evidence.build_id = "https://bad.example?token=secret";
  assert.throws(() => evaluateRemoteAcceptance(r), /unsafe release provenance/);
});

test("remote GitHub summary separates build markers from production, payment and provider certification", () => {
  assert.match(remoteSummary, /Hosted release provenance:/);
  assert.match(remoteSummary, /GitHub checkout SHA matched:/);
  assert.match(remoteSummary, /Production certification: NO/);
  assert.match(remoteSummary, /Live payments and AI provider operations: NOT tested/);
});
