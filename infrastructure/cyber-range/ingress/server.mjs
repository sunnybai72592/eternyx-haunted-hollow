/**
 * Operator-local range ingress prototype. Not Internet-facing or multi-tenant.
 * Every request must present a short-lived account/session access credential.
 * The verifier queries the trusted Edge access-check endpoint; a separate
 * random gateway token is forwarded only to the localhost managed gateway.
 * No Docker socket, Supabase service-role key or target selection in HTTP input.
 */
import { createServer } from "node:http";
import { validAccessToken, validUserJwt } from "../../../supabase/functions/_shared/ctf-range-access-contract.mjs";
import { validSessionId } from "../../../supabase/functions/_shared/ctf-range-worker-contract.mjs";

const paths = new Set([
  "/", "/healthz", "/api/rooms", "/api/tickets", "/api/files",
  "/api/ops/report", "/api/verify",
]);
const methods = new Set(["GET", "POST"]);
const outHeaders = {
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
function reply(res, status, error) {
  res.writeHead(status, { ...outHeaders, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error }));
}

/**
 * Purely fixed-destination HTTPS verifier client; no caller-supplied URL.
 */
export class RangeAccessVerifier {
  constructor(url, secret) {
    if (typeof url !== "string" || typeof secret !== "string" || secret.length < 48) {
      throw new Error("Missing private ingress verifier configuration");
    }
    const target = new URL(url);
    if (target.protocol !== "https:" ||
        target.pathname !== "/functions/v1/ctf-range-access-check" ||
        target.username || target.password || target.search || target.hash) {
      throw new Error("Verifier must use exact HTTPS Edge Function path");
    }
    this.url = target.toString();
    this.secret = secret;
  }

  async check(sessionId, accessToken, userJwt) {
    if (!validUserJwt(userJwt)) throw new Error("Invalid signed-in learner JWT");
    const response = await fetch(this.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "x-range-proxy-token": this.secret,
        "x-range-user-jwt": userJwt,
      },
      body: JSON.stringify({ action: "check", sessionId, accessToken }),
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 403) return false;
    if (!response.ok) throw new Error("Trusted range verifier is unavailable");
    const result = await response.json();
    return result?.authorized === true;
  }
}

export async function startLocalIngress({
  sessionId, gatewayPort, gatewayToken, verifier,
  port = 0, lifetimeSeconds = 900,
} = {}) {
  if (!validSessionId(sessionId) || !Number.isInteger(gatewayPort) ||
      gatewayPort < 1024 || gatewayPort > 65535 ||
      typeof gatewayToken !== "string" || !/^[0-9a-f]{64}$/.test(gatewayToken) ||
      !verifier || typeof verifier.check !== "function" ||
      !Number.isInteger(port) || port < 0 || port > 65535 ||
      !Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 900) {
    throw new Error("Invalid local ingress configuration");
  }

  let localPort = port;
  const server = createServer(async (req, res) => {
    try {
      if (!new RegExp("^(127\\.0\\.0\\.1|localhost):" + localPort + "$").test(req.headers.host || "")) {
        return reply(res, 421, "Loopback Host required");
      }
      if (!methods.has(req.method)) return reply(res, 405, "Method not allowed");
      if (!req.url?.startsWith("/") || req.url.startsWith("//") || req.url.includes("\\")) {
        return reply(res, 400, "Invalid range path");
      }
      const destination = new URL(req.url, "http://127.0.0.1:" + gatewayPort);
      if (destination.origin !== "http://127.0.0.1:" + gatewayPort ||
          !paths.has(destination.pathname)) return reply(res, 404, "Unknown range resource");
      if (req.method === "POST" && destination.pathname !== "/api/verify") {
        return reply(res, 405, "POST is not supported on this resource");
      }

      const authorization = req.headers.authorization;
      if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
        return reply(res, 401, "Session access credential required");
      }
      const accessToken = authorization.slice(7);
      if (!validAccessToken(accessToken)) return reply(res, 401, "Invalid session credential");
      const userJwt = req.headers["x-eternyx-auth-jwt"];
      if (!validUserJwt(userJwt)) return reply(res, 401, "Current ETERNYX login required");

      const origin = req.headers.origin;
      if (origin && origin !== "http://127.0.0.1:" + localPort &&
          origin !== "http://localhost:" + localPort) {
        return reply(res, 403, "Cross-origin request refused");
      }
      let authorized;
      try { authorized = await verifier.check(sessionId, accessToken, userJwt); }
      catch { return reply(res, 503, "Session authorization temporarily unavailable"); }
      if (!authorized) return reply(res, 403, "Session authorization rejected");

      let body;
      if (req.method === "POST") {
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 1024) return reply(res, 413, "Request body too large");
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }

      const headers = { Authorization: "Bearer " + gatewayToken };
      if (typeof req.headers["content-type"] === "string") {
        headers["Content-Type"] = req.headers["content-type"].slice(0, 120);
      }
      if (typeof req.headers["x-lab-role"] === "string") {
        headers["X-Lab-Role"] = req.headers["x-lab-role"].slice(0, 120);
      }
      // Never forward the user's accessToken to the vulnerable target.
      const target = await fetch(destination, {
        method: req.method,
        redirect: "manual",
        headers,
        ...(req.method === "POST" ? { body } : {}),
        signal: AbortSignal.timeout(3500),
      });
      const data = Buffer.from(await target.arrayBuffer());
      if (data.length > 32768) return reply(res, 502, "Range response too large");
      const safe = { ...outHeaders };
      const type = target.headers.get("content-type");
      if (type && type.length < 120) safe["Content-Type"] = type;
      res.writeHead(target.status, safe);
      res.end(data);
    } catch {
      if (!res.headersSent) reply(res, 503, "Local range target temporarily unavailable");
      else res.end();
    }
  });

  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", fail);
      ok();
    });
  });
  localPort = server.address().port;
  const ttl = setTimeout(() => server.close(() => {}), lifetimeSeconds * 1000);
  ttl.unref();
  const close = () => {
    clearTimeout(ttl);
    return new Promise((ok, fail) => server.close((err) => err ? fail(err) : ok()));
  };
  return { port: localPort, close };
}
