import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("src/pages/AIVideoStudio.tsx");

test("1: video job ID must be a valid UUID before network lookup", () => {
  assert.match(source, /const JOB_ID_PATTERN = \/\^/);
  assert.match(source, /if \(!JOB_ID_PATTERN\.test\(requestedId\)\)/);
  assert.match(source, /disabled=\{isLoading \|\| isCancelling \|\| !validJobId\}/);
});

test("2: input conveys validation to assistive technology and limits length", () => {
  assert.match(source, /aria-invalid=\{Boolean\(jobId\.trim\(\)\) && !validJobId\}/);
  assert.match(source, /aria-describedby="ai-video-job-help"/);
  assert.match(source, /id="ai-video-job-help"/);
  assert.match(source, /maxLength=\{36\}/);
});

test("3: changing job IDs invalidates the last job and clears its actions", () => {
  assert.match(source, /const updateJobId = \(value: string\) => \{/);
  assert.match(source, /requestVersion\.current\+\+;/);
  assert.match(source, /setJob\(null\);/);
  assert.match(source, /setNotice\(null\);/);
  assert.match(source, /onChange=\{\(event\) => updateJobId\(event\.target\.value\)\}/);
});

test("4: outdated lookup responses and errors cannot clobber newer lookups", () => {
  assert.match(source, /const version = \+\+requestVersion\.current;/);
  assert.match(source, /if \(version !== requestVersion\.current\) return;/);
  assert.match(source, /if \(version === requestVersion\.current\) setIsLoading\(false\)/);
});

test("5: cancellation remains explicit and cannot show another job's result", () => {
  assert.match(source, /if \(!job \|\| isCancelling \|\| isLoading\) return;/);
  assert.match(source, /const requestedJobId = job\.id;/);
  assert.match(source, /requestAIJobCancellation\(requestedJobId\)/);
  assert.match(source, /if \(version === requestVersion\.current\) setJob\(refreshed\)/);
  assert.match(source, /disabled=\{!canCancel \|\| isLoading \|\| isCancelling\}/);
});

test("6: hidden tabs do not schedule polling and event subscriptions are cleaned", () => {
  assert.match(source, /document\.addEventListener\("visibilitychange", updateVisibility\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", updateVisibility\)/);
  assert.match(source, /if \(!pageVisible \|\| isLoading \|\| isCancelling \|\| !job/);
  assert.match(source, /!document\.hidden/);
  assert.match(source, /window\.clearTimeout\(timeoutId\)/);
});

test("7: terminal states are never polled and lifecycle truthfulness remains intact", () => {
  assert.match(source, /isTerminalAIJobStatus\(job\.status\)/);
  assert.match(source, /job\.status === "reconciliation_required"/);
  assert.match(source, /provider reconciliation is required/);
  assert.match(source, /Generation is intentionally unavailable/);
});

test("8: decorative accents inherit the five-color scheme", () => {
  assert.match(source, /from-primary\/\[0\.12\] via-background to-accent\/\[0\.08\]/);
  assert.match(source, /bg-primary text-primary-foreground/);
  assert.match(source, /border-primary\/20 bg-primary\/10/);
  const palettes = read("src/styles/eternyx-palettes.css");
  for (const name of ["cyan", "violet", "emerald", "bronze", "rose"]) {
    assert.ok(palettes.includes(":root[data-eternyx-palette='" + name + "']"));
  }
});

test("9: video job console TSX remains syntactically valid", () => {
  const ast = ts.createSourceFile("AIVideoStudio.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
