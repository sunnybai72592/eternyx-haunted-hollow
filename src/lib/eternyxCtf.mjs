import { buildPlaygroundDocument } from "./eternyxLabs.mjs";

/**
 * ETERNYX CTF starter rooms.
 * These are real, interactive, deliberately flawed IN-MEMORY/browser targets, not real
 * server vulnerabilities. Flags and grading both ship to the browser. Never use this
 * module for financial entitlements, certificates, leaderboards, or trusted scores.
 */
export const ctfRooms = Object.freeze([
  {
    id: "source-leak",
    title: "The Forgotten Comment",
    category: "Source inspection",
    difficulty: "Beginner",
    points: 100,
    objective: "Find the flag that a developer accidentally left in the page source of a small news site.",
    skill: "HTML source inspection and accidental information disclosure",
    hints: [
      "Sometimes the clue is not visible on the rendered page.",
      "Open the page-source viewer inside the challenge, then read the HTML carefully.",
      "Check HTML comments for an ETERNYX{...} token.",
    ],
  },
  {
    id: "idor",
    title: "The Other Ticket",
    category: "Broken access control",
    difficulty: "Beginner",
    points: 150,
    objective: "You are signed in as Visitor. The support portal displays your ticket 101. Can you open someone else's ticket?",
    skill: "Insecure direct object references and missing object-level authorization",
    hints: [
      "The ticket number is supplied by the user, not enforced by the server.",
      "Look at the numeric ticket ID next to the Open ticket button.",
      "Try ticket 102, which belongs to a different user.",
    ],
  },
  {
    id: "xss",
    title: "Guestbook Injection",
    category: "Cross-site scripting",
    difficulty: "Intermediate",
    points: 200,
    objective: "Find the guestbook's unsafe HTML sink and execute a local event handler that sets window.__proof = true.",
    skill: "DOM XSS, HTML sinks, and event-handler execution",
    hints: [
      "The guestbook renders the submitted message as HTML, rather than text.",
      "An HTML tag with an error event can execute JavaScript in this intentionally vulnerable sandbox.",
      "A possible approach uses an img element whose onerror sets window.__proof=true; then choose Check execution.",
    ],
  },
  {
    id: "traversal",
    title: "The Wrong Directory",
    category: "Path traversal",
    difficulty: "Intermediate",
    points: 250,
    objective: "The document viewer is meant to access files in /public/. Can you reach a private configuration file?",
    skill: "Path normalization and directory traversal",
    hints: [
      "The file name is converted to a path without an allowlisted root check.",
      "Try using ../ to move from /public/ toward the site root.",
      "The file to locate is /private/range-config.ini.",
    ],
  },
]);

const flags = Object.freeze({
  "source-leak": "ETERNYX{comments_are_not_secrets}",
  "idor": "ETERNYX{object_ids_need_owner_checks}",
  "xss": "ETERNYX{untrusted_html_executes_code}",
  "traversal": "ETERNYX{normalize_then_authorize_paths}",
});

export const CTF_STORAGE_KEY = "eternyx_ctf_practice_progress_v1";

export function validateCtfFlag(id, entered) {
  if (!Object.hasOwn(flags, id)) return { valid: false, reason: "Unknown challenge." };
  const value = typeof entered === "string" ? entered.trim() : "";
  return value === flags[id]
    ? { valid: true, reason: "Local practice flag matched." }
    : { valid: false, reason: "That flag does not match this room. Search the target and try again." };
}

export function readCtfProgress(raw) {
  try {
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    const known = new Set(ctfRooms.map((room) => room.id));
    return [...new Set(stored.filter((id) => typeof id === "string" && known.has(id)))];
  } catch {
    return [];
  }
}

export function tallyCtfProgress(solvedIds) {
  const solved = new Set(solvedIds);
  return {
    solved: ctfRooms.filter((room) => solved.has(room.id)).length,
    possible: ctfRooms.reduce((total, room) => total + room.points, 0),
    points: ctfRooms.reduce((total, room) => total + (solved.has(room.id) ? room.points : 0), 0),
  };
}

const targetCss = [
  "body{margin:0;padding:22px;background:#f8fafc;color:#172033;font:15px/1.6 system-ui,sans-serif}",
  "header{border-bottom:1px solid #cbd5e1;padding-bottom:12px;margin-bottom:20px}",
  "h1{font-size:25px;margin:0 0 4px}h2{font-size:18px}",
  "p{margin:8px 0}.muted{color:#566279}.panel{background:white;border:1px solid #cbd5e1;border-radius:12px;padding:18px;margin:14px 0}",
  "label{display:block;font-weight:600;margin:10px 0 5px}",
  "input,textarea{width:100%;max-width:560px;box-sizing:border-box;padding:10px;border:1px solid #94a3b8;border-radius:8px;font:inherit}",
  "button{padding:10px 16px;border:0;border-radius:8px;background:#1d4ed8;color:white;font:inherit;cursor:pointer;margin:10px 8px 0 0}",
  "pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#e2e8f0;border-radius:8px;font-size:12px}",
  "#result,#message,#execution,#ticket{overflow-wrap:anywhere}",
].join("");

const targets = Object.freeze({
  "source-leak": {
    html: [
      '<header><h1>Harbor News</h1><p class="muted">The independent local bulletin</p></header>',
      '<article class="panel"><h2>New opening this weekend</h2><p>Our editorial calendar is ready for launch.</p>',
      '<p>The article contains no secrets. Or does it?</p></article>',
      '<!-- Developer reminder: remove before production. ETERNYX{comments_are_not_secrets} -->',
      '<button id="view-source" type="button">View this page source</button>',
      '<pre id="source" hidden></pre>',
    ].join(""),
    js: [
      'document.getElementById("view-source").addEventListener("click", () => {',
      '  const source = document.getElementById("source");',
      '  source.textContent = document.documentElement.outerHTML;',
      '  source.hidden = false;',
      '});',
    ].join("\n"),
  },
  idor: {
    html: [
      '<header><h1>SupportDesk</h1><p class="muted">Session: Visitor (customer 7)</p></header>',
      '<div class="panel"><h2>My support tickets</h2>',
      '<p>Welcome back, Visitor. Your current ticket is <strong>#101</strong>.</p>',
      '<form id="ticket-form"><label for="ticket-id">Ticket ID</label>',
      '<input id="ticket-id" value="101" inputmode="numeric" maxlength="8">',
      '<button type="submit">Open ticket</button></form></div>',
      '<div class="panel"><h2>Ticket details</h2><pre id="ticket" aria-live="polite"></pre></div>',
    ].join(""),
    js: [
      'const ticketRecords = {',
      ' "101": { owner: "Visitor", subject: "New account", message: "Welcome to the support desk." },',
      ' "102": { owner: "Operations", subject: "Internal deployment note", message: "This is another user\\u0027s ticket. ETERNYX{object_ids_need_owner_checks}" }',
      '};',
      'const ticket = document.getElementById("ticket");',
      'function openTicket(id) {',
      ' const record = ticketRecords[id];',
      ' ticket.textContent = record ? "Owner: "+record.owner+"\\nSubject: "+record.subject+"\\nMessage: "+record.message : "Ticket not found.";',
      ' // BUG: no record.owner vs current-user authorization check',
      '}',
      'document.getElementById("ticket-form").addEventListener("submit", (event) => {',
      ' event.preventDefault(); openTicket(document.getElementById("ticket-id").value.trim());',
      '});',
      'openTicket("101");',
    ].join("\n"),
  },
  xss: {
    html: [
      '<header><h1>Neighborhood Guestbook</h1><p class="muted">Leave a note for the community</p></header>',
      '<div class="panel"><form id="guestbook"><label for="note">Message</label>',
      '<textarea id="note" rows="3" placeholder="Write your message"></textarea>',
      '<button type="submit">Publish note</button></form>',
      '<h2>Latest note</h2><div id="message" class="panel">No comments yet.</div></div>',
      '<div class="panel"><h2>Execution verification</h2>',
      '<p class="muted">Prove JavaScript ran in this isolated training target, then check the result.</p>',
      '<button id="check" type="button">Check execution</button><pre id="execution" aria-live="polite">Waiting for proof.</pre></div>',
    ].join(""),
    js: [
      'window.__proof = false;',
      'document.getElementById("guestbook").addEventListener("submit", (event) => {',
      ' event.preventDefault();',
      ' // BUG: an untrusted message is sent to an HTML-interpreting sink.',
      ' document.getElementById("message").innerHTML = document.getElementById("note").value;',
      '});',
      'document.getElementById("check").addEventListener("click", () => {',
      ' document.getElementById("execution").textContent = window.__proof === true',
      '  ? "Proof received. ETERNYX{untrusted_html_executes_code}"',
      '  : "Not yet. HTML rendering alone is not proof of script execution.";',
      '});',
    ].join("\n"),
  },
  traversal: {
    html: [
      '<header><h1>Document Library</h1><p class="muted">Public documentation browser</p></header>',
      '<div class="panel"><h2>Read a document</h2>',
      '<p class="muted">The normal document root is /public/.</p>',
      '<form id="file-form"><label for="file-name">File name</label>',
      '<input id="file-name" value="notes.txt">',
      '<button type="submit">Read file</button></form></div>',
      '<div class="panel"><h2>File response</h2><pre id="result" aria-live="polite"></pre></div>',
    ].join(""),
    js: [
      'const virtualFiles = {',
      ' "/public/notes.txt": "Release notes: the documentation viewer is online.",',
      ' "/public/readme.txt": "Readme: public files only, please.",',
      ' "/private/range-config.ini": "range_mode=training\\nflag=ETERNYX{normalize_then_authorize_paths}"',
      '};',
      'document.getElementById("file-form").addEventListener("submit", (event) => {',
      ' event.preventDefault();',
      ' const supplied = document.getElementById("file-name").value.trim();',
      ' const resolved = new URL(supplied, "https://training.invalid/public/").pathname;',
      ' // BUG: no check that the normalized path is still inside /public/.',
      ' document.getElementById("result").textContent = "Path: "+resolved+"\\n\\n"+(virtualFiles[resolved] || "404: file not found");',
      '});',
      'document.getElementById("file-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));',
    ].join("\n"),
  },
});

export function buildCtfTargetDocument(id) {
  const target = targets[id];
  if (!target) throw new Error("Unknown room");
  return buildPlaygroundDocument({ html: target.html, css: targetCss, js: target.js });
}
