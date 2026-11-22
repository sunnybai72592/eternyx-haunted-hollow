import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findHomeTaskChoices } from "../src/lib/homeTaskDiscovery.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const registry = JSON.parse(read("src/data/toolRegistry.json"));
const component = read("src/components/home/HomeTaskFinder.tsx");

test("1: domain, video and education intents lead to their real routes", () => {
  assert.equal(findHomeTaskChoices("Check my DNS", registry)[0]?.route, "/cybersecurity/dns");
  assert.equal(findHomeTaskChoices("Make a video", registry)[0]?.route, "/ai-arsenal/video");
  assert.equal(findHomeTaskChoices("Learn something", registry)[0]?.route, "/education");
});

test("2: combined intent queries include both matches without duplicates", () => {
  const routes = findHomeTaskChoices("Check domain and make a video", registry).map(x => x.route);
  assert.ok(routes.includes("/cybersecurity/dns"));
  assert.ok(routes.includes("/ai-arsenal/video"));
  assert.equal(new Set(routes).size, routes.length);
});

test("3: empty and stop-word-only queries never redirect to arbitrary tools", () => {
  assert.deepEqual(findHomeTaskChoices("", registry), []);
  assert.deepEqual(findHomeTaskChoices("please help me with the", registry), []);
  assert.match(component, /setChoices\(found\)/);
  assert.doesNotMatch(component, /navigate\(found\[0\]/);
});

test("4: rank matching names ahead of description-only candidates", () => {
  const rows = [
    {name:"Other work", route:"/other", description:"Review SQL database"},
    {name:"SQL review", route:"/sql", description:"Analyze statements"},
    {name:"Database learning", route:"/db", pillar:"developer-studio"}
  ];
  const found = findHomeTaskChoices("SQL review", rows);
  assert.equal(found[0]?.route, "/sql");
});

test("5: descriptions, categories and IDs improve discovery without requiring name matches", () => {
  const rows = [
    {name:"Inspector", route:"/inspector", description:"Review response headers"},
    {name:"Sandbox", route:"/sandbox", id:"github-actions-helper", pillar:"developer-studio"},
  ];
  assert.ok(findHomeTaskChoices("headers", rows).some(x => x.route === "/inspector"));
  assert.ok(findHomeTaskChoices("github", rows).some(x => x.route === "/sandbox"));
});

test("6: suggestions are bounded, stable, unique and include truthful access information", () => {
  const rows = Array.from({length:20},(_,i) => ({
    name:"Report " + i, route:"/report-" + i, description:"Generate report",
    access:"Signed-in account"
  }));
  const found = findHomeTaskChoices("report", rows);
  assert.equal(found.length,4);
  assert.equal(found[0].route, "/report-0");
  assert.match(found[0].detail,/Access: Signed-in account/);
  assert.equal(new Set(found.map(x => x.route)).size,4);
});

test("7: unsafe and malformed routes never surface as navigation suggestions", () => {
  const rows = [
    {name:"Example",route:"https://attacker.test/collect"},
    {name:"Example",route:"//attacker.test"},
    {name:"Example",route:"/safe?redirect=https://bad.test"},
    {name:"Example",route:"/good"},
  ];
  assert.deepEqual(findHomeTaskChoices("example", rows).map(x => x.route),["/good"]);
});

test("8: real audited registry generates only valid local destinations", () => {
  const results = findHomeTaskChoices("developer security code", registry);
  assert.ok(results.length > 0);
  for (const x of results) assert.match(x.route,/^\/(?!\/)[a-z0-9/_-]+$/i);
});

test("9: all helper and UI code is dependency-free and no query is sent to server", () => {
  const helper = read("src/lib/homeTaskDiscovery.mjs");
  assert.doesNotMatch(helper,/\bfetch\(/);
  assert.doesNotMatch(helper,/\blocalStorage\b/);
  assert.match(component,/findHomeTaskChoices\(value, tools\)/);
  assert.match(component,/aria-live="polite"/);
});
