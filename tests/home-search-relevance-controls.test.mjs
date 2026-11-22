import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { findHomeTaskChoices } from "../src/lib/homeTaskDiscovery.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("src/components/home/HomeTaskFinder.tsx");
const helper = read("src/lib/homeTaskDiscovery.mjs");

test("1: recognizes ordinary plural variants for registry tools", () => {
  const tools = [
    {name:"API inspector",route:"/api-inspector"},
    {name:"Database report",route:"/database-report"},
    {name:"Workflow builder",route:"/workflow-builder"},
    {name:"Image studio",route:"/image-studio"}
  ];
  for (const [query,path] of [["apis","/api-inspector"],["databases","/database-report"],
    ["workflows","/workflow-builder"],["images","/image-studio"]]) {
    assert.equal(findHomeTaskChoices(query,tools)[0]?.route,path);
  }
});

test("2: supports common analysis and security synonyms without substring false positives", () => {
  const tools=[{name:"Vulnerability scanner",route:"/scanner"},{name:"Encrypt text",route:"/encrypt"}];
  assert.equal(findHomeTaskChoices("vulnerabilities",tools)[0]?.route,"/scanner");
  assert.equal(findHomeTaskChoices("encryption",tools)[0]?.route,"/encrypt");
  assert.deepEqual(findHomeTaskChoices("sc",tools),[]);
});

test("3: duplicate routes never displace distinct ranked results", () => {
  const tools=[
    {name:"Report alpha",route:"/report"},
    {name:"Report beta",route:"/report"},
    {name:"Report gamma",route:"/other"}
  ];
  assert.deepEqual(findHomeTaskChoices("report",tools).map(x=>x.route),["/report","/other"]);
});

test("4: work is bounded for long input, with stable result ranking", () => {
  const tools=[
    {name:"Image report",route:"/both"},
    {name:"Report",route:"/report"},
    {name:"Image",route:"/image"}
  ];
  assert.equal(findHomeTaskChoices("image report",tools)[0]?.route,"/both");
  assert.deepEqual(findHomeTaskChoices("report ".repeat(100),tools),
    findHomeTaskChoices("report ".repeat(40),tools));
});

test("5: empty results and unsafe links still safely fall back", () => {
  assert.deepEqual(findHomeTaskChoices("please do this",[]),[]);
  assert.deepEqual(findHomeTaskChoices("report",[{name:"Report",route:"//evil.test"}]),[]);
  assert.match(source,/No matching tool found/);
  assert.ok(source.includes('to="/explore"'));
});

test("6: clear search resets both text and prior suggestions", () => {
  assert.ok(source.includes('const clearSearch = () => { setQuery(""); setChoices(null); };'));
});

test("7: accessible control and status are keyboard-friendly", () => {
  assert.ok(source.includes('aria-label="Clear task search and suggestions"'));
  assert.ok(source.includes('role="status"'));
  assert.ok(source.includes('aria-live="polite"'));
  assert.ok(source.includes('type="button" onClick={clearSearch}'));
  assert.ok(source.includes('focus-visible:ring-primary'));
});

test("8: result lists have stable keys even when two tools have identical names", () => {
  assert.ok(source.includes('choices.map(choice => <div key={choice.route}>'));
  assert.match(helper,/seen\.has\(tool\.route\)/);
});

test("9: homepage JSX and local matcher remain syntactically valid", () => {
  const parsed=ts.createSourceFile("HomeTaskFinder.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
  assert.doesNotMatch(helper,/\bfetch\(/);
});
