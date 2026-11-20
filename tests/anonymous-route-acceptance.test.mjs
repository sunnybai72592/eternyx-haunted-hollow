import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  evaluateAnonymousRouteAudit,
  ANONYMOUS_AUTH_CASES,
  AUTH_VIEWPORTS,
  AUTH_ALLOWED_HOSTS,
} from "../src/lib/anonymousRouteAcceptance.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const runner = read("tests/browser/anonymous_route_guards.py");
const app = read("src/App.tsx");
const authPage = read("src/pages/AuthPage.tsx");
const guard = read("src/components/auth/RequireAuth.tsx");
const workflow = read(".github/workflows/remote-readonly-acceptance.yml");
const summary = read("scripts/summarize-anonymous-routes.mjs");

function validReport() {
  return {
    schema: 1,
    environment: "hosted ETERNYX anonymous frontend route guards",
    target: "public-domain-candidate",
    hostname: AUTH_ALLOWED_HOSTS["public-domain-candidate"],
    source_checkout_sha: "a".repeat(40),
    production_verified: false,
    server_rls_verified: false,
    authenticated_user_flow_verified: false,
    credentials_used: false,
    network_policy: "GET/HEAD to one exact approved HTTPS host",
    blocked_external: 0,
    blocked_telemetry: 16,
    blocked_writes: 0,
    expected: 18,
    cases: ANONYMOUS_AUTH_CASES.flatMap(name => AUTH_VIEWPORTS.map(viewport => ({
      case: name, viewport, result: "passed",
    }))),
  };
}

test("nine exact anonymous route journeys run at both viewport sizes", () => {
  assert.equal(ANONYMOUS_AUTH_CASES.length, 9);
  assert.equal(new Set(ANONYMOUS_AUTH_CASES).size, 9);
  assert.deepEqual(AUTH_VIEWPORTS, ["390x844", "1440x900"]);
  const r = evaluateAnonymousRouteAudit(validReport());
  assert.equal(r.passed, 18);
  assert.equal(r.expected, 18);
  assert.equal(r.failed, 0);
  assert.equal(r.missing, 0);
  assert.equal(r.frontEndAnonymousGuardPassed, true);
  assert.equal(r.productionVerified, false);
  assert.equal(r.serverRlsVerified, false);
  assert.equal(r.authenticatedUserFlowVerified, false);
});

test("protected browser routes exactly match currently guarded React routes", () => {
  const pairs = [
    ["/account", "AccountCenter"],
    ["/notifications", "Notifications"],
    ["/profile", "Profile"],
    ["/settings", "Settings"],
    ["/ai-arsenal/image", "AIImageStudio"],
    ["/ai-arsenal/video", "AIVideoStudio"],
    ["/black-hat-pentesting", "BlackHatPentesting"],
    ["/my-bug-reports", "MyBugReports"],
  ];
  for (const [path, component] of pairs) {
    assert.ok(app.includes('path="' + path + '" element={<RequireAuth><' + component + ' /></RequireAuth>}'),
      "Missing protected route: " + path);
    assert.ok(runner.includes('"' + path + '"'), "Browser check missing route " + path);
  }
  assert.ok(app.includes('path="/auth" element={<AuthPage />} />'));
});

test("guard redirects signed-out visitors only after checking restored session", () => {
  assert.match(guard, /supabase\.auth\.getSession\(\)/);
  assert.match(guard, /if \(!user \|\| !isAuthenticated\)/);
  assert.match(guard, /<Navigate to="\/auth" replace/);
  assert.match(guard, /sessionCheckComplete/);
  assert.match(authPage, /aria-label="Authentication mode"/);
  assert.match(authPage, /Welcome back/);
});

test("browser never signs up, logs in, posts credentials, or visits third-party sites", () => {
  assert.match(runner, /request\.method not in \("GET", "HEAD"\)/);
  assert.match(runner, /address\.hostname != host/);
  assert.match(runner, /route\.abort\(\)/);
  assert.match(runner, /service_workers="block"/);
  assert.match(runner, /accept_downloads=False/);
  assert.doesNotMatch(runner, /signInWithPassword|signUp\(|password=|post_data|storage_state\(|screenshot\(|page\.content\(\)/);
  assert.doesNotMatch(runner, /route\.fulfill\(/);
  assert.match(runner, /No sign-in, registration, account changes/);
});

test("frontend route evidence must never be reported as authenticated backend proof", () => {
  const r = validReport();
  for (const key of [
    "production_verified",
    "server_rls_verified",
    "authenticated_user_flow_verified",
    "credentials_used",
  ]) {
    r[key] = true;
    assert.throws(() => evaluateAnonymousRouteAudit(r), /prohibited verification claim/);
    r[key] = false;
  }
  assert.match(summary, /Supabase server RLS: NOT tested/);
  assert.match(summary, /Authenticated login and account isolation: NOT tested/);
  assert.match(summary, /Production certification: NO/);
});

test("invalid hosts, policy and report structure fail closed", () => {
  const r = validReport();
  r.hostname = "attacker.example";
  assert.throws(() => evaluateAnonymousRouteAudit(r), /host/);
  r.hostname = AUTH_ALLOWED_HOSTS[r.target];
  r.network_policy = "POST to third parties allowed";
  assert.throws(() => evaluateAnonymousRouteAudit(r), /network policy/);
  r.network_policy = "GET/HEAD to one exact approved HTTPS host";
  r.target = "arbitrary-site";
  assert.throws(() => evaluateAnonymousRouteAudit(r), /target/);
  r.target = "public-domain-candidate";
  r.expected = 7;
  assert.throws(() => evaluateAnonymousRouteAudit(r), /expected case count/);
});

test("unknown or duplicate outcomes cannot inflate signed-out guard evidence", () => {
  const r = validReport();
  r.cases[0].case = "fake-verified-payment";
  assert.throws(() => evaluateAnonymousRouteAudit(r), /case/);
  r.cases = validReport().cases;
  r.cases.push({ ...r.cases[0] });
  assert.throws(() => evaluateAnonymousRouteAudit(r), /excess cases/);
  r.cases.pop();
  r.cases[1] = { ...r.cases[0] };
  assert.throws(() => evaluateAnonymousRouteAudit(r), /duplicate case/);
});

test("missing and failing routes keep the hosted anonymous audit unverified", () => {
  const r = validReport();
  r.cases.pop();
  const partial = evaluateAnonymousRouteAudit(r);
  assert.equal(partial.missing, 1);
  assert.equal(partial.frontEndAnonymousGuardPassed, false);
  r.cases[0].result = "failed";
  const failed = evaluateAnonymousRouteAudit(r);
  assert.equal(failed.failed, 1);
  assert.equal(failed.frontEndAnonymousGuardPassed, false);
});

test("telemetry stays blocked; any attempted account HTTP write invalidates acceptance", () => {
  const r = validReport();
  r.blocked_telemetry = 33;
  assert.equal(evaluateAnonymousRouteAudit(r).frontEndAnonymousGuardPassed, true);
  r.blocked_writes = 1;
  assert.equal(evaluateAnonymousRouteAudit(r).frontEndAnonymousGuardPassed, false);
  r.blocked_writes = -1;
  assert.throws(() => evaluateAnonymousRouteAudit(r), /blocked_writes/);
});

test("manual workflow independently records route checks and uploads both reports", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:|\n\s+pull_request:|\n\s+schedule:/);
  assert.match(workflow, /tests\/browser\/anonymous_route_guards\.py/);
  assert.match(workflow, /scripts\/summarize-anonymous-routes\.mjs/);
  assert.match(workflow, /test-results\/anonymous-route-acceptance\.json/);
  assert.match(workflow, /test-results\/remote-readonly-acceptance\.json/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("Python route auditor is syntactically valid", () => {
  const py = new URL("../tests/browser/anonymous_route_guards.py", import.meta.url);
  const result = spawnSync("python3", [
    "-c", "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf8').read())", py.pathname,
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
