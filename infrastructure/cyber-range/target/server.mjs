/**
 * ETERNYX local-only Docker training target.
 * Deliberate backend flaws: IDOR, bounded traversal, trusted client role.
 * DO NOT DEPLOY ON ETERNYX PRODUCTION OR ANY PUBLIC INTERFACE.
 */
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const RANGE_ROOMS = Object.freeze([
  { id: "ticket-idor", title: "Ticket Ownership", difficulty: "Beginner", points: 150,
    lesson: "Enforce object ownership on the server, never trust a record ID.",
    hints: ["Ticket #101 is yours.", "Try changing the ticket query argument.", "Look at ticket #102."] },
  { id: "file-traversal", title: "Document Root Escape", difficulty: "Intermediate", points: 200,
    lesson: "Normalize file paths before enforcing the permitted directory.",
    hints: ["Files start in the public directory.", "The ../ segment moves to its parent.", "Look for ../private/brief.txt."] },
  { id: "role-header", title: "Operations Role Spoofing", difficulty: "Intermediate", points: 200,
    lesson: "Never authorize server actions using a user-supplied role header.",
    hints: ["Look at the headers of an HTTP request.", "Which role header does the API accept?", "Try X-Lab-Role: admin."] },
]);

const knownRooms = new Set(RANGE_ROOMS.map((room) => room.id));
const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
};

function reply(res, status, payload, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { ...responseHeaders, "Content-Type": contentType });
  res.end(contentType.startsWith("application/json") ? JSON.stringify(payload) : payload);
}

function equalFlag(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function createFlags() {
  return Object.fromEntries(RANGE_ROOMS.map((room) =>
    [room.id, "ETERNYX{" + room.id.replace(/-/g, "_") + "_" + randomBytes(12).toString("hex") + "}"]));
}

const homePage = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>ETERNYX Local Cyber Range</title><style>',
  'body{font:16px/1.6 system-ui;background:#0b1220;color:#e2e8f0;margin:auto;max-width:800px;padding:24px}',
  'article,header{border:1px solid #334155;padding:20px;margin:16px 0;border-radius:15px;background:#131f33}',
  'p{color:#cbd5e1}input{display:block;box-sizing:border-box;width:100%;padding:12px;border:1px solid #64748b;background:#09111e;color:white;border-radius:7px}',
  'button{background:#67e8f9;color:#09111e;padding:12px;border:0;border-radius:8px;margin-top:10px;font-weight:700;cursor:pointer}',
  'code{overflow-wrap:anywhere;background:#334155;padding:4px;border-radius:5px}h1,h2{line-height:1.2}small{color:#93c5fd}',
  '</style></head><body>',
  '<header><small>LOCAL ONLY · TRAINING TARGET · AUTO-EXPIRES</small><h1>ETERNYX HTTP Cyber Range</h1>',
  '<p>Three genuine request-handling vulnerabilities inside an isolated Docker training container. Never publish this target publicly.</p></header>',
  '<article><h2>01 — Ticket Ownership / IDOR</h2><p>Your user is Visitor (owner #7). Your ticket is #101.</p>',
  '<form action="/api/tickets" method="get"><label for="ticket">Ticket number</label><input id="ticket" name="ticket" value="101">',
  '<button type="submit">Read ticket</button></form></article>',
  '<article><h2>02 — Document Root Escape</h2><p>Read files from the public documents directory.</p>',
  '<form action="/api/files" method="get"><label for="name">Filename</label><input id="name" name="name" value="welcome.txt">',
  '<button type="submit">Read document</button></form></article>',
  '<article><h2>03 — Role Spoofing</h2><p>Investigate <code>GET /api/ops/report</code>. Explore the request headers used for access control with curl or your browser developer tools.</p></article>',
  '<article><h2>Verify a captured flag</h2><p>POST <code>/api/verify</code> with JSON containing <code>roomId</code> and <code>flag</code>.</p>',
  '<p>Dynamic flags change when the training container is reset. Verification is local practice only; no ETERNYX account scoring.</p></article>',
  '<p><small>Scope: your local machine only. No production user data, credentials, Supabase integration, scanning or paid GPU infrastructure.</small></p>',
  '</body></html>',
].join("");

export async function startLocalRange({ host = "127.0.0.1", port = 0, lifetimeSeconds = 1800 } = {}) {
  if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("Invalid bind address");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 0 || lifetimeSeconds > 3600) throw new Error("Invalid lifetime");

  const workspace = await mkdtemp(join(tmpdir(), "eternyx-training-"));
  const publicDir = join(workspace, "public");
  await mkdir(publicDir);
  await mkdir(join(workspace, "private"));
  const flags = createFlags();
  await writeFile(join(publicDir, "welcome.txt"), "Welcome to the ETERNYX local training library.\n");
  await writeFile(join(workspace, "private", "brief.txt"), "Restricted training file\n" + flags["file-traversal"] + "\n");
  const tickets = {
    "101": { owner_id: 7, subject: "Welcome", content: "This is your ticket." },
    "102": { owner_id: 8, subject: "Internal report", content: "Training evidence: " + flags["ticket-idor"] },
  };
  const attempts = new Map();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://training.invalid");
      const pathname = url.pathname;
      // Browser DNS-rebinding guard; Docker still MUST publish on 127.0.0.1 only.
      if (!/^(127\.0\.0\.1|localhost|http-range):\d{1,5}$/.test(req.headers.host || "")) {
        return reply(res, 421, { error: "Loopback Host required" });
      }
      if (req.method === "GET" && pathname === "/healthz") return reply(res, 200, { ok: true });
      if (req.method === "GET" && pathname === "/") return reply(res, 200, homePage, "text/html; charset=utf-8");
      if (req.method === "GET" && pathname === "/api/rooms") return reply(res, 200, { rooms: RANGE_ROOMS, localOnly: true });

      if (req.method === "GET" && pathname === "/api/tickets") {
        const id = url.searchParams.get("ticket") || "101";
        if (!/^\d{1,6}$/.test(id)) return reply(res, 400, { error: "Invalid ticket ID" });
        if (!Object.hasOwn(tickets, id)) return reply(res, 404, { error: "Unknown ticket" });
        // DELIBERATE IDOR: never checks tickets[id].owner_id against Visitor #7.
        return reply(res, 200, { ticket: id, ...tickets[id] });
      }

      if (req.method === "GET" && pathname === "/api/files") {
        const requested = url.searchParams.get("name") || "welcome.txt";
        if (requested.length > 120 || requested.includes("\0")) return reply(res, 400, { error: "Invalid filename" });
        const file = resolve(publicDir, requested);
        // Bounded safety guard: only files inside THIS disposable range workspace.
        if (!file.startsWith(workspace + sep)) return reply(res, 403, { error: "Outside training workspace" });
        // DELIBERATE TRAVERSAL: does NOT ensure resolved file remains in publicDir.
        try { return reply(res, 200, { requested, content: await readFile(file, "utf8") }); }
        catch { return reply(res, 404, { error: "Document not found" }); }
      }

      if (req.method === "GET" && pathname === "/api/ops/report") {
        // DELIBERATE ROLE BYPASS: client-controlled X-Lab-Role is not an authorization source.
        if (req.headers["x-lab-role"] !== "admin") return reply(res, 403, { error: "Admin role required" });
        return reply(res, 200, { kind: "training-report", evidence: flags["role-header"] });
      }

      if (req.method === "POST" && pathname === "/api/verify") {
        const origin = req.headers.origin;
        if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(origin)) {
          return reply(res, 403, { error: "Cross-origin verification blocked" });
        }
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
          return reply(res, 415, { error: "JSON required" });
        }
        const key = req.socket.remoteAddress || "local";
        const now = Date.now();
        const last = attempts.get(key);
        const next = !last || now - last.started > 60000
          ? { started: now, count: 1 } : { started: last.started, count: last.count + 1 };
        attempts.set(key, next);
        if (next.count > 10) return reply(res, 429, { error: "Local verification quota exceeded" });
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString("utf8");
          if (body.length > 400) return reply(res, 413, { error: "Request too large" });
        }
        let parsed;
        try { parsed = JSON.parse(body); } catch { return reply(res, 400, { error: "Invalid JSON" }); }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
            !knownRooms.has(parsed.roomId) || typeof parsed.flag !== "string" || parsed.flag.length > 100) {
          return reply(res, 400, { error: "roomId and flag are required" });
        }
        return reply(res, 200, {
          roomId: parsed.roomId,
          accepted: equalFlag(parsed.flag.trim(), flags[parsed.roomId]),
          accountVerified: false,
        });
      }
      return reply(res, 404, { error: "Training endpoint not found" });
    } catch {
      return reply(res, 500, { error: "Training request failed" });
    }
  });

  try {
    await new Promise((resolveReady, rejectReady) => {
      server.once("error", rejectReady);
      server.listen(port, host, () => {
        server.removeListener("error", rejectReady);
        resolveReady();
      });
    });
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }

  let timer = null;
  const close = async () => {
    if (timer) clearTimeout(timer);
    await new Promise((ok, fail) => server.close((error) => error ? fail(error) : ok()));
    await rm(workspace, { recursive: true, force: true });
  };
  if (lifetimeSeconds > 0) {
    timer = setTimeout(() => server.close(() => process.exit(0)), lifetimeSeconds * 1000);
    timer.unref();
  }
  return { port: server.address().port, server, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const lifetimeSeconds = Number.parseInt(process.env.RANGE_MAX_AGE_SECONDS || "1800", 10);
  const instance = await startLocalRange({ host: "0.0.0.0", port, lifetimeSeconds });
  console.log("ETERNYX disposable range ready on internal port", instance.port);
}
