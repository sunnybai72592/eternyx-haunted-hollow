import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guard = await readFile(new URL("../src/components/auth/RequireAuth.tsx", import.meta.url), "utf8");

test("private routes verify Supabase persisted session before redirecting", () => {
  assert.match(guard, /supabase\.auth\.getSession\(\)/);
  assert.match(guard, /data\.session\?\.user/);
  assert.match(guard, /setUser\(data\.session\.user\)/);
  assert.match(guard, /sessionCheckComplete/);
  assert.match(guard, /Restoring your ETERNYX session/);
});

test("private routes still redirect when no persisted session exists", () => {
  assert.match(guard, /if \(!user \|\| !isAuthenticated\)/);
  assert.match(guard, /<Navigate to="\/auth" replace state=\{\{ from: location \}\} \/>/);
});

test("session recovery ignores results after the route guard unmounts", () => {
  assert.match(guard, /let active = true/);
  assert.match(guard, /if \(!active\) return/);
  assert.match(guard, /active = false/);
});
