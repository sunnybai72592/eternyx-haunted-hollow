import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCtfTargetDocument, ctfRooms, CTF_STORAGE_KEY,
  readCtfProgress, tallyCtfProgress, validateCtfFlag,
} from "../src/lib/eternyxCtf.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("four original interactive CTF rooms with hints and distinct, finite practice point values", () => {
  assert.deepEqual(ctfRooms.map((room) => room.id), ["source-leak", "idor", "xss", "traversal"]);
  assert.equal(new Set(ctfRooms.map((room) => room.id)).size, 4);
  assert.equal(ctfRooms.every((room) => room.hints.length >= 3 && room.points > 0), true);
  assert.match(CTF_STORAGE_KEY, /practice_progress/);
});

test("local flag validation accepts the exact flag and rejects guesses and invalid room IDs", () => {
  const examples = {
    "source-leak": "ETERNYX{comments_are_not_secrets}",
    idor: "ETERNYX{object_ids_need_owner_checks}",
    xss: "ETERNYX{untrusted_html_executes_code}",
    traversal: "ETERNYX{normalize_then_authorize_paths}",
  };
  for (const [id, flag] of Object.entries(examples)) {
    assert.equal(validateCtfFlag(id, flag).valid, true);
    assert.equal(validateCtfFlag(id, " " + flag + " ").valid, true);
    assert.equal(validateCtfFlag(id, flag + "oops").valid, false);
  }
  assert.equal(validateCtfFlag("__proto__", "anything").valid, false);
  assert.equal(validateCtfFlag("missing", "something").valid, false);
  assert.equal(validateCtfFlag("source-leak", null).valid, false);
});

test("local score represents only unique solved room IDs; no fabricated progress", () => {
  const empty = tallyCtfProgress([]);
  assert.deepEqual(empty, { solved: 0, points: 0, possible: 700 });
  assert.deepEqual(tallyCtfProgress(["source-leak", "source-leak", "idor", "unlisted"]), { solved: 2, points: 250, possible: 700 });
  assert.deepEqual(tallyCtfProgress(ctfRooms.map((room) => room.id)), { solved: 4, points: 700, possible: 700 });
});

test("saved browser progress validates its shape, filters unknown rooms and deduplicates", () => {
  assert.deepEqual(readCtfProgress(null), []);
  assert.deepEqual(readCtfProgress('{"solved":["source-leak"]}'), []);
  assert.deepEqual(readCtfProgress('"source-leak"'), []);
  assert.deepEqual(readCtfProgress('["source-leak",null,"source-leak","unknown","idor"]'), ["source-leak", "idor"]);
});

test("all four CTF targets render isolated CSP-protected interactive documents, without outbound fetches", () => {
  for (const room of ctfRooms) {
    const doc = buildCtfTargetDocument(room.id);
    assert.match(doc, /Content-Security-Policy/);
    assert.match(doc, /default-src 'none'/);
    assert.match(doc, /connect-src 'none'/);
    assert.match(doc, /form-action 'none'/);
    assert.match(doc, /object-src 'none'/);
    assert.match(doc, /worker-src 'none'/);
    assert.match(doc, /<script>/);
    assert.ok(doc.length > 900);
    assert.doesNotMatch(doc, /fetch\(|XMLHttpRequest|WebSocket|supabase\.|https:\/\/api\./);
  }
  assert.throws(() => buildCtfTargetDocument("invalid"), /Unknown room/);
});

test("source room contains a real HTML comment and an interactive page source viewer", () => {
  const doc = buildCtfTargetDocument("source-leak");
  assert.match(doc, /<!-- Developer reminder:.*ETERNYX\{comments_are_not_secrets\} -->/);
  assert.match(doc, /view-source/);
  assert.match(doc, /document\.documentElement\.outerHTML/);
});

test("IDOR room intentionally omits owner check when looking up records by user-controlled ID", () => {
  const doc = buildCtfTargetDocument("idor");
  assert.match(doc, /ticket-form/);
  assert.match(doc, /ticketRecords\[id\]/);
  assert.match(doc, /102/);
  assert.match(doc, /object_ids_need_owner_checks/);
});

test("XSS room intentionally uses an unsafe innerHTML sink and checks JavaScript execution proof", () => {
  const doc = buildCtfTargetDocument("xss");
  assert.match(doc, /\.innerHTML = document\.getElementById\("note"\)\.value/);
  assert.match(doc, /window\.__proof === true/);
  assert.match(doc, /untrusted_html_executes_code/);
});

test("traversal room uses path normalization without enforcing the public root", () => {
  const doc = buildCtfTargetDocument("traversal");
  assert.match(doc, /new URL\(supplied, "https:\/\/training\.invalid\/public\/"\)\.pathname/);
  assert.match(doc, /\/private\/range-config\.ini/);
  assert.match(doc, /normalize_then_authorize_paths/);
});

test("CTF route, discovery and iframe permissions match existing app architecture", async () => {
  const app = await read("src/App.tsx");
  const labs = await read("src/pages/EternyxLabs.tsx");
  const page = await read("src/pages/EternyxCtf.tsx");
  assert.match(app, /EternyxCtf = lazy\(\(\) => import\("\.\/pages\/EternyxCtf"\)\)/);
  assert.ok(app.includes('path="/labs/ctf" element={<EternyxCtf />}'));
  assert.ok(labs.includes('to="/labs/ctf"'));
  assert.match(page, /sandbox="allow-scripts"/);
  assert.doesNotMatch(page, /allow-same-origin|allow-popups|allow-top-navigation|allow-forms|allow-downloads/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /these isolated targets|these are browser-only training targets/i);
  assert.doesNotMatch(page, /supabase\.|Math\.random|fake score|mockResults/);
});
