import test from "node:test";
import assert from "node:assert/strict";
import { readActiveConversation, rememberConversation } from "../src/lib/activeConversation.mjs";

test("chat selection is isolated by account and cleared for a new chat", t => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete globalThis.sessionStorage;
  });
  rememberConversation("alice", "first");
  rememberConversation("bob", "second");
  assert.equal(readActiveConversation("alice"), "first");
  rememberConversation("alice", null);
  assert.equal(readActiveConversation("alice"), null);
  assert.equal(readActiveConversation("bob"), "second");
});
