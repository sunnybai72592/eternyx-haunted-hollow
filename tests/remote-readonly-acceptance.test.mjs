import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  evaluateRemoteAcceptance, REMOTE_CASES, REMOTE_VIEWPORTS, REMOTE_HOSTS,
} from "../src/lib/remoteAcceptance.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const browser = read("tests/browser/remote_readonly_smoke.py");
const workflow = read(".github/workflows/remote-readonly-acceptance.yml");
const docs = read("docs/REMOTE_READONLY_ACCEPTANCE_2026-11.md");
const registry = JSON.parse(read("src/data/toolRegistry.json"));
const cases = REMOTE_CASES.flatMap(name => REMOTE_VIEWPORTS.map(viewport => ({
  case: name, viewport, result: "passed",
})));

const validReport = () => ({
  environment: "remote ETERNYX hosted frontend, anonymous, read-only",
  target: "lovable-preview",
  hostname: REMOTE_HOSTS["lovable-preview"],
  git_revision_under_test: "unverified: hosting release SHA not exposed",
  source_checkout_sha: "test-fixture",
  production_verified: false,
  payment_or_provider_verified: false,
  mocked_responses: false,
  network_policy: "GET/HEAD to exact allowlisted first-party HTTPS host only",
  blocked_external_requests: 7,
  blocked_write_attempts: 0,
  expected_cases: 16,
  cases: cases.map(item => ({ ...item })),
});

test("only two exact ETERNYX hosts are allowed and no custom URL can be supplied", () => {
  assert.deepEqual(Object.keys(REMOTE_HOSTS).sort(), ["lovable-preview", "public-domain-candidate"]);
  assert.ok(Object.values(REMOTE_HOSTS).every(host => host.endsWith(".lovable.app")));
  assert.match(browser, /target_name not in TARGETS/);
  assert.match(browser, /address\.hostname != hostname/);
  assert.match(browser, /address\.port not in \(None, 443\)/);
  assert.doesNotMatch(browser, /getenv\("REMOTE_URL"\)|argparse|sys\.argv/);
});

test("unmocked browser runner makes only GET/HEAD to the allowlisted first-party HTTPS origin", () => {
  assert.match(browser, /request\.method not in \("GET", "HEAD"\)/);
  assert.match(browser, /address\.scheme != "https"/);
  assert.match(browser, /blocked\["cross_origin"\] \+= 1/);
  assert.match(browser, /blocked\["write_attempt"\] \+= 1/);
  assert.match(browser, /route\.abort\(\)/);
  assert.match(browser, /page\.route\("\*\*\/\*", guarded_request\)/);
  assert.doesNotMatch(browser, /route\.fulfill\(|mock_response|fake_response/);
  assert.match(browser, /service_workers="block"/);
});

test("remote test cases cover eight real workflows across two viewports", () => {
  assert.equal(REMOTE_CASES.length, 8);
  assert.deepEqual(REMOTE_VIEWPORTS, ["390x844", "1440x900"]);
  for (const name of REMOTE_CASES) assert.ok(browser.includes('"' + name + '"'), name);
  assert.match(browser, /expect\(page\.get_by_role\("heading", name="Master tool registry"\)\)/);
  assert.match(browser, /"0 production-verified"/);
  assert.match(browser, /"JSON input"/);
  assert.match(browser, /"Base64 to decode"/);
  assert.match(browser, /"Decoded header & payload"/);
  assert.match(browser, /"Invalid percent-encoded input."/);
  assert.match(browser, /"No indexed capabilities match these filters."/);
});

test("valid completed hosted preview report can be marked browser-passing, NEVER production verified", () => {
  const result = evaluateRemoteAcceptance(validReport());
  assert.equal(result.attempted, 16);
  assert.equal(result.passed, 16);
  assert.equal(result.failed, 0);
  assert.equal(result.missing, 0);
  assert.equal(result.allBrowserJourneysPassed, true);
  assert.equal(result.productionVerified, false);
  assert.equal(result.deploymentRevisionKnown, false);
  assert.equal(result.approvedForLivePayments, false);
});

test("partial or failing browser reports remain clearly unverified", () => {
  const report = validReport();
  report.cases.pop();
  const incomplete = evaluateRemoteAcceptance(report);
  assert.equal(incomplete.missing, 1);
  assert.equal(incomplete.allBrowserJourneysPassed, false);
  report.cases[0].result = "failed";
  const failed = evaluateRemoteAcceptance(report);
  assert.equal(failed.failed, 1);
  assert.equal(failed.productionVerified, false);
  assert.equal(failed.allBrowserJourneysPassed, false);
});

test("unsafe attempted HTTP writes fail audit even if all UI assertions passed", () => {
  const report = validReport();
  report.blocked_write_attempts = 1;
  assert.equal(evaluateRemoteAcceptance(report).allBrowserJourneysPassed, false);
  report.blocked_write_attempts = -1;
  assert.throws(() => evaluateRemoteAcceptance(report), /invalid blocked count/);
});

test("unexpected host, provenance, environment or fake certification always fail closed", () => {
  for (const [key, value] of [
    ["hostname", "unrelated-site.example"],
    ["target", "arbitrary-target"],
    ["git_revision_under_test", "unverified but assumed"],
    ["production_verified", true],
    ["payment_or_provider_verified", true],
    ["mocked_responses", true],
    ["network_policy", "POST allowed"],
    ["environment", "fully certified"],
  ]) {
    const report = validReport();
    report[key] = value;
    assert.throws(() => evaluateRemoteAcceptance(report), /Invalid remote acceptance evidence/, key);
  }
});

test("duplicate cases or unknown case names cannot inflate pass rates", () => {
  const duplicate = validReport();
  duplicate.cases.push({ ...duplicate.cases[0] });
  assert.throws(() => evaluateRemoteAcceptance(duplicate), /duplicated case result/);
  const unknown = validReport();
  unknown.cases[0].case = "live-stripe-checkout";
  assert.throws(() => evaluateRemoteAcceptance(unknown), /unknown case or viewport/);
  const badResult = validReport();
  badResult.cases[0].result = "verified production";
  assert.throws(() => evaluateRemoteAcceptance(badResult), /unknown case result/);
});

test("manual GitHub Actions workflow cannot auto-target third parties or consume secrets", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /type: choice/);
  assert.match(workflow, /lovable-preview/);
  assert.match(workflow, /public-domain-candidate/);
  assert.doesNotMatch(workflow, /\n\s+schedule:|\n\s+push:|\n\s+pull_request:/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /remote_readonly_smoke\.py/);
  assert.match(workflow, /summarize-remote-acceptance\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test("remote runner stores only abstract evidence; no screenshots, auth or personal tokens", () => {
  assert.match(browser, /"production_verified": False/);
  assert.match(browser, /"mocked_responses": False/);
  assert.match(browser, /"payment_or_provider_verified": False/);
  assert.match(browser, /write_report\(\)/);
  assert.doesNotMatch(browser, /page\.screenshot\(|context\.storage_state\(|access_token|service_role|api_key/);
  assert.match(browser, /accept_downloads=False/);
  assert.match(browser, /os\.environ\.get\("GITHUB_SHA", "unknown"\)/);
});

test("all 32 tools remain unverified until a real deployed build and provider checks exist", () => {
  assert.equal(registry.length, 32);
  assert.ok(registry.every(tool => tool.releaseVerified === false && tool.owner === null));
  assert.match(docs, /not confirmed published/);
  assert.match(docs, /not proof the published URL serves that SHA/);
  assert.match(docs, /no screenshots, cookies, prompts, provider tokens or personal notes/);
  assert.match(docs, /read-only/);
});

test("safe diagnostic categories explain hosted-page failures without storing navigation URLs", () => {
  const report = validReport();
  report.page_observations = [{
    case: "registry-landing", viewport: "390x844", reason: "missing-expected-ui",
    on_approved_host: true, path: "/explore", http_status: 200, root_present: true,
    heading_class: "other",
  }];
  report.blocked_samples = [{
    reason: "write-blocked", method: "POST", path: "/api/[redacted]", resource_type: "fetch",
  }];
  report.blocked_write_attempts = 1;
  const result = evaluateRemoteAcceptance(report);
  assert.equal(result.pageObservations[0].http_status, 200);
  assert.equal(result.pageObservations[0].heading_class, "other");
  assert.equal(result.blockedSamples[0].path, "/api/[redacted]");
  assert.equal(result.allBrowserJourneysPassed, false);
  assert.equal(result.productionVerified, false);
});

test("raw URL, query string, bearer token and unbounded diagnostic payloads are rejected", () => {
  const make = () => {
    const report = validReport();
    report.page_observations = [{
      case: "registry-landing", viewport: "390x844", reason: "unexpected-redirect",
      on_approved_host: false, path: "[different-host]", http_status: null,
      root_present: false, heading_class: "none",
    }];
    report.blocked_samples = [{
      reason: "write-blocked", method: "POST", path: "/api/[redacted]", resource_type: "fetch",
    }];
    return report;
  };
  for (const path of [
    "https://evil.example?token=sensitive", "/api?token=secret",
    "/api/users/123abc", "/a\ncookie", "../../auth", "/too-long-diagnostic-route-capturing-identifiers",
  ]) {
    const p = make();
    p.blocked_samples[0].path = path;
    assert.throws(() => evaluateRemoteAcceptance(p), /unsafe blocked-request sample/, path);
  }
  const malicious = make();
  malicious.page_observations[0].heading_class = "Signed in as customer@example.com";
  assert.throws(() => evaluateRemoteAcceptance(malicious), /unsafe page observation/);
  const huge = make();
  huge.blocked_samples = Array.from({length: 17}, () => huge.blocked_samples[0]);
  assert.throws(() => evaluateRemoteAcceptance(huge), /too many or invalid diagnostics/);
});

test("remote browser records first-party status and blocked HTTP write categories with no body or query", () => {
  assert.match(browser, /def scrub_path\(url\):/);
  assert.match(browser, /def safe_page_observation\(page, name, viewport, exc\):/);
  assert.match(browser, /"http_status": navigation\.get\("http_status"\)/);
  assert.match(browser, /"heading_class": heading/);
  assert.match(browser, /"root_present": app_root/);
  assert.match(browser, /block_sample\(request, "write-blocked"\)/);
  assert.match(browser, /block_sample\(request, "cross-origin"\)/);
  assert.match(browser, /"page_observations": page_observations/);
  assert.match(browser, /"blocked_samples": blocked_samples/);
  assert.match(browser, /if len\(page_observations\) < MAX_OBSERVATIONS:/);
  assert.doesNotMatch(browser, /request\.post_data|page\.content\(\)|page\.screenshot\(/);
  assert.doesNotMatch(browser, /"full_url":|"redirect_url":|"query":/);
});

test("independent hosted journeys continue after one fails and workflow defaults to valid target", () => {
  assert.match(browser, /def exercise\(page, name, viewport\):/);
  assert.match(browser, /page_observations\.append\(observation\)/);
  assert.match(browser, /if blocked\["write_attempt"\] or any\(case\["result"\] == "failed" for case in results\)/);
  assert.match(workflow, /default: lovable-preview/);
  assert.doesNotMatch(workflow, /default: Lovable preview/);
  const doc = read("docs/REMOTE_READONLY_ACCEPTANCE_2026-11.md");
  assert.match(doc, /44761338587/);
  assert.match(doc, /missing expected heading/i);
  assert.match(doc, /blocked HTTP write/i);
});

test("Python hosted browser runner parses and Node evidence summarizer parses", () => {
  const py = new URL("../tests/browser/remote_readonly_smoke.py", import.meta.url);
  const p = spawnSync("python3", [
    "-c", "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())", py.pathname,
  ], { encoding: "utf8", timeout: 12000 });
  assert.equal(p.status, 0, p.stderr || p.stdout);
  const n = spawnSync(process.execPath, ["--check", new URL("../scripts/summarize-remote-acceptance.mjs", import.meta.url).pathname], {
    encoding: "utf8", timeout: 12000,
  });
  assert.equal(n.status, 0, n.stderr || n.stdout);
});
