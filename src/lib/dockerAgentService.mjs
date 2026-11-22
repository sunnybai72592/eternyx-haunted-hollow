// Loopback-only read-only Docker API. No Docker daemon port is exposed.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { DOCKER_ID, jsonRows, safeList, safeImages, safeStats, safeInspect } from "./dockerOperatorUtils.mjs";
const SOURCE = "eternyx-docker-readonly-agent";
const LIMIT = 30; // authenticated requests per minute; operator-only, no multi-tenant API
const MAX_BODY = 512 * 1024;
function equalsToken(actual, expected) {
  if (typeof actual !== "string" || !actual.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(actual.slice(7), "utf8");
  const secret = Buffer.from(expected, "utf8");
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}
function reply(res, status, body) {
  const content = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Content-Length": Buffer.byteLength(content),
  });
  res.end(content);
}
function validResourcePath(path) {
  if (path === "/v1/health" || path === "/v1/containers" || path === "/v1/images") return true;
  const m = /^\/v1\/containers\/([a-f0-9]{64})(\/stats)?$/.exec(path);
  return Boolean(m && DOCKER_ID.test(m[1]));
}
/**
 * The caller must bind this server to 127.0.0.1, never a wildcard interface.
 * runDocker(args) must execute the Docker CLI in a verified local context.
 */
export function createDockerAgentServer({ token, runDocker }) {
  if (typeof token !== "string" || !/^[a-f0-9]{64,128}$/.test(token)) throw new Error("Agent token must be 64-128 lowercase hexadecimal characters.");
  if (typeof runDocker !== "function") throw new TypeError("A verified Docker runner is required.");
  let started = Date.now(), count = 0;
  const server = createServer(async (req, res) => {
    const port = server.address()?.port;
    const remote = req.socket.remoteAddress;
    if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1") return reply(res, 403, { error: "Loopback clients only." });
    if (req.headers.host !== "127.0.0.1:" + port || req.headers.origin ||
      req.headers["access-control-request-method"]) return reply(res, 403, { error: "Origin or host is not permitted." });
    if (!equalsToken(req.headers.authorization, token)) return reply(res, 401, { error: "Authentication required." });
    if (req.method !== "GET") return reply(res, 405, { error: "Only read-only GET is supported." });
    if (req.headers["transfer-encoding"] || req.headers["content-length"] && req.headers["content-length"] !== "0") return reply(res, 400, { error: "Request bodies are not supported." });
    const now = Date.now();
    if (now - started >= 60_000) { started = now; count = 0; }
    count += 1;
    if (count > LIMIT) return reply(res, 429, { error: "Rate limit reached." });
    if (!req.url || !req.url.startsWith("/") || req.url.includes("?") || req.url.includes("#") || !validResourcePath(req.url)) {
      return reply(res, 404, { error: "Unknown read-only endpoint." });
    }
    if (req.url === "/v1/health") return reply(res, 200, { status: "agent-ready", mode: "read-only", checkedAt: new Date().toISOString() });
    try {
      let body;
      if (req.url === "/v1/containers") {
        const result = await runDocker(["container", "ls", "--all", "--format", "{{json .}}"]);
        body = { source: SOURCE, capturedAt: new Date().toISOString(), containers: safeList(jsonRows(result)) };
      } else if (req.url === "/v1/images") {
        const result = await runDocker(["image", "ls", "--format", "{{json .}}"]);
        body = { source: SOURCE, capturedAt: new Date().toISOString(), images: safeImages(jsonRows(result)) };
      } else {
        const match = /^\/v1\/containers\/([a-f0-9]{64})(\/stats)?$/.exec(req.url);
        const id = match[1];
        if (match[2]) {
          const result = await runDocker(["stats", "--no-stream", "--format", "{{json .}}", id]);
          body = { source: SOURCE, capturedAt: new Date().toISOString(), stats: safeStats(jsonRows(result, 1)) };
        } else {
          const result = await runDocker(["container", "inspect", "--format", "{{json .}}", id]);
          const item = JSON.parse(result);
          if (item?.Id !== id) throw new Error("Mismatched Docker object.");
          body = { source: SOURCE, capturedAt: new Date().toISOString(), container: safeInspect(item) };
        }
      }
      const encoded = JSON.stringify(body);
      if (Buffer.byteLength(encoded) > MAX_BODY) throw new Error("Response exceeded limit.");
      return reply(res, 200, body);
    } catch {
      // Do not disclose Docker internal errors, environment variables, or sensitive paths.
      return reply(res, 503, { error: "Docker resource unavailable or command failed." });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 2500;
  server.maxRequestsPerSocket = 50;
  return server;
}
