import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  developerCategories, developerTools, developerUtilityTab,
  filterDeveloperTools, normalizeDeveloperSavedIds,
  recordDeveloperRecent, toggleDeveloperFavorite,
} from "../src/lib/developerStudioCatalog.mjs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/pages/DeveloperStudio.tsx", import.meta.url), "utf8");
const command = readFileSync(new URL("../src/components/developer/DeveloperCommandCenter.tsx", import.meta.url), "utf8");

test("catalog covers unique routed tools without dead links or unrecognized categories", () => {
  assert.ok(developerTools.length >= 27);
  assert.equal(new Set(developerTools.map((item) => item.id)).size, developerTools.length);
  const categories = new Set(developerCategories.map((category) => category.id));
  for (const item of developerTools) {
    assert.ok(categories.has(item.category), item.id);
    assert.ok(["local", "public-readonly", "browser-request"].includes(item.mode), item.id);
    assert.ok(item.title && item.description);
    const path = new URL(item.route, "https://eternyx.test").pathname;
    assert.ok(app.includes('path="' + path + '"'), item.id + " must link to an existing route: " + path);
  }
});

test("search matches titles and descriptions case-insensitively", () => {
  assert.ok(filterDeveloperTools({ query: "gItHuB" }).length >= 5);
  assert.ok(filterDeveloperTools({ query: "sql" }).some((item) => item.id === "sql"));
  assert.ok(filterDeveloperTools({ query: "signature" }).some((item) => item.id === "jwt"));
  assert.equal(filterDeveloperTools({ query: "no-workbench-matches-this-string" }).length, 0);
});

test("category and favorites filters compose and unknown categories default to all", () => {
  assert.ok(filterDeveloperTools({ category: "github" }).every((item) => item.category === "github"));
  assert.deepEqual(filterDeveloperTools({ category: "github", favoritesOnly: true, favorites: ["json", "github-hub"] }).map((item) => item.id), ["github-hub"]);
  assert.equal(filterDeveloperTools({ category: "unknown" }).length, developerTools.length);
});

test("saved ids are bounded, unique and tolerate corrupt legacy values", () => {
  assert.deepEqual(normalizeDeveloperSavedIds({ wrong: "type" }), []);
  assert.deepEqual(normalizeDeveloperSavedIds(["json", "json", "unknown", 1, "jwt"], 2), ["json", "jwt"]);
  assert.deepEqual(recordDeveloperRecent(["json", "jwt"], "jwt"), ["jwt", "json"]);
  assert.deepEqual(recordDeveloperRecent(["json"], "unknown"), ["json"]);
  assert.deepEqual(toggleDeveloperFavorite(["json"], "json"), []);
  assert.deepEqual(toggleDeveloperFavorite(["json"], "jwt"), ["json", "jwt"]);
  assert.deepEqual(toggleDeveloperFavorite(["json"], "invalid"), ["json"]);
});

test("utility deep links select the correct existing tab and preserve no unverified claims", () => {
  for (const tab of ["json", "base64", "url", "uuid", "jwt"]) {
    assert.equal(developerUtilityTab(tab), tab);
    assert.ok(developerTools.some((item) => item.id === tab && item.route.includes("?tool=" + tab)));
  }
  assert.equal(developerUtilityTab("not-a-tab"), "json");
  assert.match(studio, /value=\{selectedUtilityTab\}/);
  assert.match(studio, /<DeveloperCommandCenter \/>/);
  assert.match(command, /useSearchParams\(/);
  assert.match(command, /role="status"/);
  assert.match(command, /aria-pressed=/);
  assert.doesNotMatch(command, /production.ready|verified deployment|run arbitrary code/i);
});

test("public API and local analysis execution labels do not imply authenticated integrations", () => {
  for (const id of ["github-hub", "github-actions", "github-collaboration", "github-changes", "github-releases"]) {
    assert.equal(developerTools.find((tool) => tool.id === id)?.mode, "public-readonly");
  }
  assert.equal(developerTools.find((tool) => tool.id === "api-workbench")?.mode, "browser-request");
  assert.equal(developerTools.find((tool) => tool.id === "deployment")?.mode, "local");
});
