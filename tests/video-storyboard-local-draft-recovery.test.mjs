import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { saveStoryboardDraft, readStoryboardDraft, clearStoryboardDraft, storyboardDraftKey } from "../src/lib/ai/storyboardDraft.mjs";

function memoryStore() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key,value) => values.set(key,String(value)),
    removeItem: key => values.delete(key)
  };
}
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/VideoStoryboard.tsx");

test("1: a valid storyboard draft is stored locally with a version and save time", () => {
  const storage=memoryStore();
  const draft=saveStoryboardDraft(storage,{text:"Dawn\nWorkshop",seconds:5,format:"16:9"},12345);
  assert.equal(draft.version,1);
  assert.equal(draft.savedAt,12345);
  assert.equal(JSON.parse(storage.getItem(storyboardDraftKey)).text,"Dawn\nWorkshop");
});

test("2: recovery preserves text, timing, format and Unicode", () => {
  const storage=memoryStore();
  saveStoryboardDraft(storage,{text:"سوات 🌙\nمرحبا",seconds:3,format:"9:16"},999);
  assert.deepEqual(readStoryboardDraft(storage),{text:"سوات 🌙\nمرحبا",seconds:3,format:"9:16",savedAt:999});
});

test("3: invalid JSON and incompatible versions are safely ignored", () => {
  const storage=memoryStore();
  for (const invalid of ["{", "null", '{"version":2}', "x".repeat(16385)]) {
    storage.setItem(storyboardDraftKey,invalid);
    assert.equal(readStoryboardDraft(storage),null);
  }
});

test("4: malformed or over-limit storyboard content cannot be restored", () => {
  const storage=memoryStore();
  for (const text of ["x".repeat(12001),"x\n".repeat(61),""]) {
    storage.setItem(storyboardDraftKey,JSON.stringify({version:1,text,seconds:5,format:"16:9",savedAt:10}));
    assert.equal(readStoryboardDraft(storage),null);
  }
});

test("5: saving an empty storyboard clears the previous browser draft", () => {
  const storage=memoryStore();
  saveStoryboardDraft(storage,{text:"Hello",seconds:5,format:"16:9"});
  assert.equal(saveStoryboardDraft(storage,{text:" ",seconds:5,format:"16:9"}),null);
  assert.equal(storage.getItem(storyboardDraftKey),null);
});

test("6: explicit discard removes the saved draft and does not erase active editor text", () => {
  const storage=memoryStore();
  saveStoryboardDraft(storage,{text:"Keep",seconds:5,format:"16:9"});
  clearStoryboardDraft(storage);
  assert.equal(readStoryboardDraft(storage),null);
  assert.match(component,/Saved browser draft discarded\. The open editor is unchanged/);
});

test("7: storage failures never silently claim a saved draft", () => {
  const storage={ getItem(){throw Error("restricted");},setItem(){throw Error("quota");},removeItem(){throw Error("restricted");} };
  assert.throws(()=>saveStoryboardDraft(storage,{text:"A",seconds:5,format:"16:9"}),/quota/);
  assert.throws(()=>readStoryboardDraft(storage),/restricted/);
  assert.match(component,/Local draft could not be saved\. Download JSON/);
});

test("8: UI requires explicit restoration, debounces writes and announces outcome", () => {
  assert.match(component,/if \(!hasEdited\) return/);
  assert.match(component,/650/);
  assert.match(component,/window\.clearTimeout\(timer\)/);
  assert.match(component,/Restore saved storyboard/);
  assert.match(component,/Discard saved draft/);
  assert.match(component,/role="status" aria-live="polite"/);
  assert.match(component,/setHasEdited\(true\)/);
});

test("9: recovery leaves existing portable JSON, CSV and SRT exports intact", () => {
  for (const name of ["Download storyboard JSON","Export shot timeline CSV","Export shot captions SRT"]) assert.ok(component.includes(name));
  assert.match(component,/saveCopy\(localStorage/);
  assert.doesNotMatch(component,/supabase\.functions\.invoke/);
});

test("10: storyboard editor remains syntactically valid TSX", () => {
  const ast=ts.createSourceFile("VideoStoryboard.tsx",component,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
