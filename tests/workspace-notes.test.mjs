import test from "node:test";
import assert from "node:assert/strict";
import { deleteCopy, matchingCopies, noteExcerpt, suggestedTitle, readCopies, saveCopy } from "../src/lib/workspaceNotes.mjs";

function storage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test("same-title copies retain separate text, sort newest first and preserve legacy drafts", () => {
  const db = storage();
  db.setItem("eternyx.workspace.device-note", "original");
  saveCopy(db, "a", " Field ", "  صباح الخير\n", 1);
  saveCopy(db, "b", "Field", "Inspection", 2);
  db.setItem("eternyx.workspace.saved-note.broken", "{");
  const notes = readCopies(db);
  assert.deepEqual(notes.map(n => n.id), ["b", "a"]);
  assert.equal(notes[1].title, "Field");
  assert.equal(notes[1].body, "  صباح الخير\n");
  assert.equal(matchingCopies(notes, " INSPECT ")[0].id, "b");
  assert.equal(matchingCopies(notes, "field").length, 2);
  deleteCopy(db, "b");
  assert.deepEqual(readCopies(db).map(n => n.id), ["a"]);
  assert.equal(db.getItem("eternyx.workspace.device-note"), "original");
});

test("invalid notes and storage failures never report a saved copy", () => {
  const db = storage();
  for (const [title, body] of [[" ", "text"], ["title", " "], ["x".repeat(101), "text"]]) {
    assert.throws(() => saveCopy(db, "a", title, body, 1));
  }
  db.setItem = () => { throw new Error("quota"); };
  assert.throws(() => saveCopy(db, "a", "title", "body", 1), /quota/);
  assert.equal(readCopies(db).length, 0);
});

test("title suggestions respect the first line, the field limit and emoji boundaries", () => {
  assert.equal(suggestedTitle("  \n  Field visit\r\nDetails"), "Field visit");
  assert.equal(suggestedTitle("x".repeat(99) + "🙂"), "x".repeat(99));
  assert.equal(suggestedTitle(" \n "), "");
});

test("previews include a late body match and mark clipped text", () => {
  const text = "prior ".repeat(40) + "Inspection complete";
  assert.match(noteExcerpt(text, "INSPECTION"), /^….*Inspection complete$/u);
  assert.equal(noteExcerpt("one\n two", ""), "one two");
  assert.ok(noteExcerpt(text, "").endsWith("…"));
});
