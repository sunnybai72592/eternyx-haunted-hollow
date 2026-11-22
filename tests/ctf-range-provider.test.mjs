import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  projectForSession, safeWorkerSession, validSessionId, validateWorkerRequest, verifyWorkerToken,
} from "../supabase/functions/_shared/ctf-range-worker-contract.mjs";
import { assertLocalDockerHost, dockerProcessEnv } from "../infrastructure/cyber-range/provider/docker-runtime.mjs";
import { RangeWorkerApi, runProviderTick } from "../infrastructure/cyber-range/provider/worker.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const a = "123e4567-e89b-42d3-a456-426614174001";
const b = "223e4567-e89b-42d3-a456-426614174001";
const projectA = projectForSession(a);
const future = "2099-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";
const sample = (id, status, expiresAt = future) => ({
  id, status, expiresAt,
  instanceRef: status === "running" || status === "stopping" ? projectForSession(id) : null,
});

function mockApi({ sessions = [], claim = { ok: false, reason: "empty" }, response = {} } = {}) {
  const calls = [];
  const api = {
    async call(body) {
      calls.push(body);
      if (body.action === "heartbeat") return { ok: true };
      if (body.action === "reconcile") return { ok: true, sessions };
      if (body.action === "claim") return claim;
      if (body.action === "report") return response[body.state] ?? { ok: true };
      throw new Error("Unexpected action");
    },
  };
  return { api, calls };
}

function mockRuntime({ exists = true, startError = null, stopError = null, wrongRef = false } = {}) {
  const calls = [];
  return {
    calls,
    async exists(id) { calls.push(["exists", id]); return exists; },
    async start(id) {
      calls.push(["start", id]);
      if (startError) throw startError;
      return { instanceRef: wrongRef ? "not-an-authorized-instance" : projectForSession(id), localPort: 38000, token: "example-private" };
    },
    async stop(id) { calls.push(["stop", id]); if (stopError) throw stopError; return true; },
  };
}

test("provider protocol rejects arbitrary commands, URLs, fake flags, owners and unrestricted report states", () => {
  assert.equal(validSessionId(a), true);
  assert.equal(projectA, "cr-" + a.replace(/-/g, ""));
  assert.deepEqual(validateWorkerRequest({ action: "heartbeat" }), { action: "heartbeat" });
  assert.deepEqual(validateWorkerRequest({ action: "claim" }), { action: "claim" });
  assert.deepEqual(validateWorkerRequest({ action: "reconcile" }), { action: "reconcile" });
  assert.deepEqual(validateWorkerRequest({ action: "report", sessionId: a, state: "running", instanceRef: projectA }),
    { action: "report", sessionId: a, state: "running", instanceRef: projectA });
  assert.deepEqual(validateWorkerRequest({ action: "report", sessionId: a, state: "failed" }),
    { action: "report", sessionId: a, state: "failed" });

  for (const invalid of [
    null, [], { action: "docker", command: "rm -rf /" },
    { action: "heartbeat", user_id: a },
    { action: "claim", image: "busybox" },
    { action: "reconcile", endpoint: "https://example.com" },
    { action: "report", sessionId: b, state: "running", instanceRef: projectA },
    { action: "report", sessionId: a, state: "running" },
    { action: "report", sessionId: a, state: "failed", instanceRef: projectA },
    { action: "report", sessionId: a, state: "queued" },
    { action: "report", sessionId: "nope", state: "stopped" },
  ]) assert.equal(validateWorkerRequest(invalid), null, JSON.stringify(invalid));

  assert.throws(() => projectForSession("other"), /Invalid range/);
  assert.deepEqual(safeWorkerSession({
    id: a, status: "running", expires_at: future,
    provider_instance_ref: projectA, user_id: b, api_key: "never-expose",
  }), { id: a, status: "running", expiresAt: future, instanceRef: projectA });
  assert.throws(() => safeWorkerSession({
    id: a, status: "running", expires_at: future, provider_instance_ref: projectForSession(b),
  }), /Unrecognized/);
});

test("worker secret verification is strict, length-bounded and digest-comparison safe", async () => {
  const secret = "super-strong-provider-token-with-enough-randomness-example-0123456789";
  assert.equal(await verifyWorkerToken(secret, secret), true);
  assert.equal(await verifyWorkerToken(secret + "x", secret), false);
  assert.equal(await verifyWorkerToken(secret, "wrong"), false);
  assert.equal(await verifyWorkerToken(undefined, secret), false);
  assert.equal(await verifyWorkerToken(secret, ""), false);
});

test("worker first reconciles stopping, expired and stale provisioning before any fresh claim", async () => {
  const { api, calls } = mockApi({
    sessions: [sample(a, "stopping"), sample(b, "provisioning", past)],
  });
  const runtime = mockRuntime();
  const result = await runProviderTick({ api, runtime });
  assert.deepEqual(result, { heartbeat: true, cleaned: 2, failed: 0, running: 0, claimed: 0 });
  assert.deepEqual(runtime.calls, [["stop", a], ["stop", b]]);
  assert.deepEqual(calls.map((x) => x.action), ["heartbeat", "reconcile", "report", "report", "claim"]);
  assert.deepEqual(calls.filter(x => x.action === "report").map(x => x.state), ["stopped", "expired"]);
});

test("provider reaps missing container and reports failure; functioning running target remains", async () => {
  const alive = mockApi({ sessions: [sample(a, "running")] });
  const yes = mockRuntime({ exists: true });
  const x = await runProviderTick({ api: alive.api, runtime: yes });
  assert.equal(x.running, 1);
  assert.deepEqual(yes.calls, [["exists", a]]);

  const missing = mockApi({ sessions: [sample(a, "running")] });
  const no = mockRuntime({ exists: false });
  const y = await runProviderTick({ api: missing.api, runtime: no });
  assert.equal(y.failed, 1);
  assert.deepEqual(no.calls, [["exists", a], ["stop", a]]);
  assert.equal(missing.calls.find(v => v.action === "report").state, "failed");
});

test("one authorized claim launches exactly one instance and reports only deterministic ref", async () => {
  const { api, calls } = mockApi({
    claim: { ok: true, sessionId: a, challengePack: "http-basics-v1", expiresAt: future },
  });
  const runtime = mockRuntime();
  const result = await runProviderTick({ api, runtime });
  assert.equal(result.claimed, 1);
  assert.equal(result.running, 1);
  assert.deepEqual(runtime.calls, [["start", a]]);
  assert.deepEqual(calls.at(-1), {
    action: "report", sessionId: a, state: "running", instanceRef: projectA,
  });
});

test("failed or forged provisioning never awards running and always tears down first", async () => {
  const claim = { ok: true, sessionId: a, challengePack: "http-basics-v1", expiresAt: future };
  const failed = mockApi({ claim });
  const runtime = mockRuntime({ startError: new Error("not enough resources") });
  const state = await runProviderTick({ api: failed.api, runtime });
  assert.equal(state.failed, 1);
  assert.deepEqual(runtime.calls, [["start", a], ["stop", a]]);
  assert.equal(failed.calls.at(-1).state, "failed");

  const forged = mockApi({ claim });
  const badRuntime = mockRuntime({ wrongRef: true });
  const forgery = await runProviderTick({ api: forged.api, runtime: badRuntime });
  assert.equal(forgery.failed, 1);
  assert.deepEqual(badRuntime.calls, [["start", a], ["stop", a]]);
});

test("worker never frees reservation when Docker cleanup fails", async () => {
  const { api, calls } = mockApi({ sessions: [sample(a, "stopping")] });
  const runtime = mockRuntime({ stopError: new Error("Docker offline") });
  await assert.rejects(runProviderTick({ api, runtime }), /Docker offline/);
  assert.ok(!calls.some((x) => x.action === "report"));
});

test("provider URL and Docker subprocess environment exclude secrets and remote hosts", () => {
  const validApi = "https://example.supabase.co/functions/v1/ctf-range-worker";
  assert.ok(new RangeWorkerApi(validApi, "k".repeat(64)));
  for (const url of [
    "http://example.supabase.co/functions/v1/ctf-range-worker",
    "https://example.supabase.co/functions/v1/ctf-range-control",
    "https://example.supabase.co/functions/v1/ctf-range-worker?url=x",
    "https://user:password@example.supabase.co/functions/v1/ctf-range-worker",
  ]) assert.throws(() => new RangeWorkerApi(url, "k".repeat(64)));

  assert.throws(() => assertLocalDockerHost({ DOCKER_HOST: "tcp://remote:2375" }), /Remote Docker/);
  assert.throws(() => assertLocalDockerHost({}, "tcp://remote:2376"), /local socket/);
  assert.doesNotThrow(() => assertLocalDockerHost({ DOCKER_HOST: "unix:///var/run/docker.sock" }, "unix:///var/run/docker.sock"));
  const workerEnv = dockerProcessEnv({
    PATH: "/usr/bin", HOME: "/tmp",
    CTF_RANGE_WORKER_TOKEN: "super-secret",
    SUPABASE_SERVICE_ROLE_KEY: "super-secret",
    RANGE_PROVIDER_API_URL: "https://example.invalid",
  });
  assert.deepEqual(Object.keys(workerEnv).sort(), ["ETERNYX_GATEWAY_TOKEN", "HOME", "PATH"]);
  assert.equal(JSON.stringify(workerEnv).includes("super-secret"), false);
});

test("managed Docker stack has per-session network isolation, no target port and token-gated ingress", async () => {
  const compose = await read("infrastructure/cyber-range/compose.managed.yaml");
  const gateway = await read("infrastructure/cyber-range/gateway/server.mjs");
  const edge = await read("supabase/functions/ctf-range-worker/index.ts");
  const config = await read("supabase/config.toml");
  const cli = await read("scripts/cyber-range-provider.mjs");

  assert.match(compose, /127\.0\.0\.1::8081/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /RANGE_MANAGED_MODE: "required"/);
  assert.match(compose, /ETERNYX_MANAGED_GATEWAY_TOKEN/);
  assert.doesNotMatch(compose.split("  gateway:")[0], /\s+ports:/);
  for (const rule of ["read_only: true", "cap_drop:", "no-new-privileges:true", "pids_limit:", "mem_limit:", "RANGE_MAX_AGE_SECONDS: \"900\""]) {
    assert.ok(compose.includes(rule), "Missing managed Docker rule: " + rule);
  }
  assert.match(gateway, /timingSafeEqual/);
  assert.match(gateway, /managedMode && !/);
  assert.match(gateway, /Managed session credential required/);
  assert.match(edge, /CTF_RANGE_WORKER_ENABLED/);
  assert.match(edge, /verifyWorkerToken\(supplied, configured\)/);
  assert.match(edge, /getSupabaseSecretKey\(\)/);
  assert.match(edge, /ctf_range_worker_claim/);
  assert.match(edge, /ctf_range_worker_report/);
  assert.match(config, /\[functions\.ctf-range-worker\]\s*verify_jwt\s*=\s*false/);
  assert.match(cli, /ETERNYX_PROVIDER_EXECUTION/);
  assert.doesNotMatch(compose, /docker\.sock|privileged:\s*true|network_mode:\s*host/);
});
