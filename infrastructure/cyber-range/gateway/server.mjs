/**
 * Narrow, local-only gateway for the disposable ETERNYX training target.
 *
 * The deliberately vulnerable target stays on a Docker internal-only network
 * and has no published ports. This gateway joins that network plus a separate
 * ingress bridge and publishes ONLY to 127.0.0.1 on the Docker host.
 *
 * Not for Internet exposure or multi-tenant access.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const targetOrigin = "http://http-range:8080";
const allowedMethods = new Set(["GET", "POST"]);
const managedMode = process.env.RANGE_MANAGED_MODE === "required";
const managedToken = process.env.ETERNYX_MANAGED_GATEWAY_TOKEN ?? "";
if (managedMode && !/^[0-9a-f]{64,128}$/i.test(managedToken)) {
  // Refuse to serve any vulnerable endpoints if the provider's access key is missing.
  throw new Error("Managed range ingress token is missing or invalid");
}

function checkManagedToken(value) {
  if (!managedMode) return true; // Existing localhost-only developer range unchanged.
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(managedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
const fail = (res, status, message) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify({ error: message }));
};

const gateway = createServer(async (req, res) => {
  const host = req.headers.host || "";
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host)) {
    return fail(res, 421, "Localhost Host required");
  }
  if (!checkManagedToken(req.headers.authorization)) return fail(res, 401, "Managed session credential required");
  if (!allowedMethods.has(req.method)) return fail(res, 405, "Method not allowed");
  if (!req.url?.startsWith("/") || req.url.startsWith("//") || req.url.includes("\\")) {
    return fail(res, 400, "Invalid local target path");
  }

  const destination = new URL(req.url, targetOrigin);
  if (destination.origin !== targetOrigin) return fail(res, 400, "External destination denied");
  const headers = {};
  for (const key of ["content-type", "x-lab-role", "origin"]) {
    const value = req.headers[key];
    if (typeof value === "string" && value.length <= 512) headers[key] = value;
  }

  let requestBody;
  if (req.method === "POST") {
    const chunks = [];
    let length = 0;
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1024) return fail(res, 413, "Request body too large");
        chunks.push(chunk);
      }
    } catch {
      return fail(res, 400, "Unable to read request body");
    }
    requestBody = Buffer.concat(chunks);
  }

  try {
    const response = await fetch(destination, {
      method: req.method,
      headers,
      ...(req.method === "POST" ? { body: requestBody } : {}),
      signal: AbortSignal.timeout(4000),
      redirect: "manual",
    });
    // Do not follow redirects to any origin. Only forward the response bytes.
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 32 * 1024) return fail(res, 502, "Training target response too large");
    const responseHeaders = {};
    for (const key of [
      "content-type", "cache-control", "content-security-policy",
      "x-frame-options", "x-content-type-options", "referrer-policy",
    ]) {
      const value = response.headers.get(key);
      if (value) responseHeaders[key] = value;
    }
    res.writeHead(response.status, responseHeaders);
    res.end(bytes);
  } catch {
    fail(res, 503, "Local training target unavailable");
  }
});

const port = Number.parseInt(process.env.PORT || "8081", 10);
if (!Number.isInteger(port) || port !== 8081) {
  throw new Error("Unexpected gateway port");
}
gateway.listen(port, "0.0.0.0", () => {
  console.log("ETERNYX local-only range gateway ready on internal port", port);
});

const lifetimeSeconds = Number.parseInt(process.env.RANGE_MAX_AGE_SECONDS || "1800", 10);
if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 1800) {
  throw new Error("Invalid gateway lifetime");
}
const ttl = setTimeout(() => gateway.close(() => process.exit(0)), lifetimeSeconds * 1000);
ttl.unref();
