import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RANGE_ROOMS, startLocalRange } from "../infrastructure/cyber-range/target/server.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const flagFrom = (value) => String(value).match(/ETERNYX\{[a-z0-9_]+\}/)?.[0];
const postJson = async (port, body, headers = {}) => {
  const response = await fetch("http://127.0.0.1:" + port + "/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test("three local network-backed rooms expose original challenge metadata without flags", () => {
  assert.deepEqual(RANGE_ROOMS.map((r) => r.id), ["ticket-idor", "file-traversal", "role-header"]);
  assert.ok(RANGE_ROOMS.every((room) => room.points > 0 && room.hints.length === 3));
  assert.doesNotMatch(JSON.stringify(RANGE_ROOMS), /ETERNYX\{/);
});

test("real HTTP IDOR exposes another synthetic ticket and its flag; local grader checks it", async (t) => {
  const range = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => range.close());
  const base = "http://127.0.0.1:" + range.port;
  const own = await (await fetch(base + "/api/tickets?ticket=101")).json();
  assert.equal(own.owner_id, 7);
  assert.equal(flagFrom(own.content), undefined);
  const stolen = await (await fetch(base + "/api/tickets?ticket=102")).json();
  assert.equal(stolen.owner_id, 8);
  const flag = flagFrom(stolen.content);
  assert.match(flag, /^ETERNYX\{ticket_idor_[0-9a-f]{24}\}$/);
  assert.deepEqual(await postJson(range.port, { roomId: "ticket-idor", flag }),
    { status: 200, body: { roomId: "ticket-idor", accepted: true, accountVerified: false } });
  assert.equal((await postJson(range.port, { roomId: "ticket-idor", flag: "ETERNYX{guess}" })).body.accepted, false);
});

test("bounded path traversal leaks an in-range private fixture but blocks host file traversal", async (t) => {
  const range = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => range.close());
  const base = "http://127.0.0.1:" + range.port + "/api/files?name=";
  const pub = await (await fetch(base + "welcome.txt")).json();
  assert.match(pub.content, /Welcome to the ETERNYX local training library/);
  const privateDoc = await (await fetch(base + encodeURIComponent("../private/brief.txt"))).json();
  const flag = flagFrom(privateDoc.content);
  assert.match(flag, /^ETERNYX\{file_traversal_[0-9a-f]{24}\}$/);
  assert.equal((await postJson(range.port, { roomId: "file-traversal", flag })).body.accepted, true);
  const escaped = await fetch(base + encodeURIComponent("../../etc/passwd"));
  assert.equal(escaped.status, 403);
});

test("unauthorized operations endpoint rejects normal user and trusts forged role header", async (t) => {
  const range = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => range.close());
  const base = "http://127.0.0.1:" + range.port + "/api/ops/report";
  assert.equal((await fetch(base)).status, 403);
  const elevated = await (await fetch(base, { headers: { "X-Lab-Role": "admin" } })).json();
  const flag = flagFrom(elevated.evidence);
  assert.match(flag, /^ETERNYX\{role_header_[0-9a-f]{24}\}$/);
  assert.equal((await postJson(range.port, { roomId: "role-header", flag })).body.accepted, true);
});

test("flags change on new isolated instance, and one instance's flags fail in another", async (t) => {
  const a = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => a.close());
  const b = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => b.close());
  const get = async (port) => (await (await fetch("http://127.0.0.1:" + port + "/api/tickets?ticket=102")).json()).content;
  const aFlag = flagFrom(await get(a.port));
  const bFlag = flagFrom(await get(b.port));
  assert.notEqual(aFlag, bFlag);
  assert.equal((await postJson(b.port, { roomId: "ticket-idor", flag: aFlag })).body.accepted, false);
});

test("range endpoints have CSP, no CORS exposure, expiry hints and strict invalid submissions", async (t) => {
  const range = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => range.close());
  const base = "http://127.0.0.1:" + range.port;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /LOCAL ONLY/);
  assert.match(home.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(home.headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/api/rooms")).status, 200);
  assert.equal((await postJson(range.port, { roomId: "invalid", flag: "x" })).status, 400);
  assert.equal((await postJson(range.port, { roomId: "ticket-idor", flag: "x" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await postJson(range.port, { roomId: "ticket-idor", flag: "x" }, { origin: "http://127.0.0.1:1234" })).status, 200);
});

test("local flag checker imposes submission quota and never awards account-level scores", async (t) => {
  const range = await startLocalRange({ lifetimeSeconds: 0 });
  t.after(() => range.close());
  for (let i = 1; i <= 10; i++) {
    const result = await postJson(range.port, { roomId: "ticket-idor", flag: "ETERNYX{wrong}" });
    assert.equal(result.status, 200);
    assert.equal(result.body.accountVerified, false);
  }
  const denied = await postJson(range.port, { roomId: "ticket-idor", flag: "ETERNYX{wrong}" });
  assert.equal(denied.status, 429);
});

test("container hardening, local-only publishing and no Docker socket bind mounts are retained", async () => {
  const compose = await read("infrastructure/cyber-range/compose.yaml");
  const dockerfile = await read("infrastructure/cyber-range/target/Dockerfile");
  const runner = await read("scripts/cyber-range.mjs");
  assert.match(compose, /127\.0\.0\.1:8765:8080/);
  assert.match(compose, /internal: true/);
  for (const rule of ["read_only: true", "cap_drop:", "no-new-privileges:true", "pids_limit:", "mem_limit:", "tmpfs:", "restart: \"no\"", "RANGE_MAX_AGE_SECONDS"]) {
    assert.ok(compose.includes(rule), "Missing local range isolation rule: " + rule);
  }
  assert.doesNotMatch(compose, /docker\.sock|privileged:\s*true|host:\s*true|network_mode:\s*host|^\s*volumes:/m);
  assert.match(dockerfile, /USER 10001:10001/);
  assert.match(runner, /Remote Docker daemon is forbidden/);
  assert.match(runner, /ensureLocalDaemon\(\)/);
  assert.match(runner, /waitForHealth\(\)/);
  assert.doesNotMatch(runner, /shell:\s*true/);
});

test("local range is discoverable from Labs without making a false hosted-execution promise", async () => {
  const app = await read("src/App.tsx");
  const labs = await read("src/pages/EternyxLabs.tsx");
  const page = await read("src/pages/EternyxCyberRange.tsx");
  const pkg = JSON.parse(await read("package.json"));
  assert.match(app, /EternyxCyberRange = lazy/);
  assert.ok(app.includes('path="/labs/range" element={<EternyxCyberRange />}'));
  assert.ok(labs.includes('to="/labs/range"'));
  assert.match(page, /Developer preview — not a hosted lab yet/);
  assert.match(page, /http:\/\/127\.0\.0\.1:8765/);
  assert.equal(pkg.scripts.range, "node scripts/cyber-range.mjs");
});
