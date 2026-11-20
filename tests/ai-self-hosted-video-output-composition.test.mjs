import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const path = new URL("../supabase/functions/_shared/ai-self-hosted-video-output-composition.ts", import.meta.url);
const source = await readFile(path, "utf8");

test("staging composer is syntactically valid TypeScript", () => {
  const compiled = ts.transpileModule(source, {
    fileName: "ai-self-hosted-video-output-composition.ts",
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
});
test("connects real private GPU downloader to existing lease-fenced materializer", () => {
  assert.match(source, /createSelfHostedVideoOutputDownloader\(/);
  assert.match(source, /createAIWorkerOutputMaterializer\(/);
  assert.match(source, /downloadProviderOutput\s*,/);
  assert.match(source, /config\.materializer\.maxBytes/);
});
test("requires explicit staging approval and server-owned dependencies", () => {
  assert.match(source, /config\.stagingApproved !== true/);
  assert.match(source, /typeof config\.materializer\.calculateFinalCredits !== "function"/);
  assert.match(source, /!config\.materializer\.storageClient\?\.storage/);
  assert.match(source, /config\.worker/);
  assert.match(source, /200 \* 1024 \* 1024/);
});
test("does not enable generation, bill customers or create public downloads", () => {
  assert.doesNotMatch(source, /createSignedUrl|createCheckout|grant_tool_credits|enforce_paid_plan|serveStatic/);
  assert.doesNotMatch(source, /service_role|supabaseUrl|new SupabaseClient/);
});
