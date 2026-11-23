import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helper = await read("src/lib/ai/research-local-tools.ts");
const page = await read("src/pages/AIResearchStudio.tsx");
const app = await read("src/App.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const output = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const local = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
const inputSource = { id: "s1", title: "An article", url: "https://example.org/path", publisher: "Publisher" };
const source = () => local.addResearchSource([], inputSource)[0];
const entry = (sourceId = "s1", id = "e1", stance = "supports") => ({
  id, sourceId, stance, claim: "Claim one", excerpt: "Some quoted text", notes: "Read carefully",
});

test("Research Studio has an authenticated route and explicit Arsenal link", () => {
  assert.ok(app.includes('const AIResearchStudio = lazy(() => import("./pages/AIResearchStudio"));'));
  assert.ok(app.includes('path="/ai-arsenal/research" element={<RequireAuth><AIResearchStudio /></RequireAuth>}'));
  assert.ok(hub.includes('to="/ai-arsenal/research"'));
  assert.ok(hub.includes("Local workspace ready · AI disabled"));
});

test("URL normalization requires HTTPS without embedded credentials", () => {
  assert.equal(local.normalizeResearchUrl(" HTTPS://Example.org/path "), "https://example.org/path");
  for (const uri of ["http://example.org", "javascript:alert(1)", "file:///x", "https://u:p@example.org", "not-a-url", ""]) {
    assert.throws(() => local.normalizeResearchUrl(uri), { code: "invalid_url" });
  }
});

test("source creation trims user metadata and prevents URL duplicates", () => {
  const sources = local.addResearchSource([], { ...inputSource, title: "  Article  " });
  assert.equal(sources[0].title, "Article");
  assert.equal(sources[0].url, "https://example.org/path");
  assert.throws(() => local.addResearchSource(sources, { ...inputSource, id: "s2", url: "https://EXAMPLE.org/path" }), { code: "duplicate_source" });
  assert.throws(() => local.addResearchSource(sources, { ...inputSource, id: "s1", url: "https://example.org/other" }), { code: "invalid_id" });
});

test("source limits and invalid titles do not silently truncate user data", () => {
  const sources = Array.from({ length: 25 }, (_, n) => ({ id: "s" + n, title: "Page", url: "https://example.org/" + n }));
  assert.throws(() => local.addResearchSource(sources, { ...inputSource, id: "new" }), { code: "source_limit" });
  assert.throws(() => local.addResearchSource([], { ...inputSource, title: "  " }), { code: "invalid_source" });
  assert.throws(() => local.addResearchSource([], { ...inputSource, title: "x".repeat(201) }), { code: "invalid_source" });
});

test("evidence must cite an existing local source and use valid stance tags", () => {
  const sources = [source()];
  assert.deepEqual(local.addResearchEvidence([], sources, entry())[0], entry());
  assert.throws(() => local.addResearchEvidence([], [], entry()), { code: "missing_source" });
  assert.throws(() => local.addResearchEvidence([], sources, entry("s1", "e1", "confirmed")), { code: "invalid_evidence" });
  assert.throws(() => local.addResearchEvidence([], sources, { ...entry(), claim: "" }), { code: "invalid_evidence" });
});

test("duplicate evidence IDs, excessive excerpt lengths and entry limits fail closed", () => {
  const sources = [source()];
  const existing = local.addResearchEvidence([], sources, entry());
  assert.throws(() => local.addResearchEvidence(existing, sources, entry()), { code: "invalid_id" });
  assert.throws(() => local.addResearchEvidence([], sources, { ...entry(), excerpt: "x".repeat(2001) }), { code: "invalid_evidence" });
  const full = Array.from({ length: 100 }, (_, n) => ({ ...entry("s1", "e" + n) }));
  assert.throws(() => local.addResearchEvidence(full, sources, entry("s1", "last")), { code: "evidence_limit" });
});

test("removing a source cascades removal of its linked evidence", () => {
  const sources = [source(), { id: "s2", title: "Second", url: "https://example.org/two" }];
  const evidence = [entry(), entry("s2", "e2", "challenges")];
  const result = local.removeResearchSource(sources, evidence, "s1");
  assert.deepEqual(result.sources.map(x => x.id), ["s2"]);
  assert.deepEqual(result.evidence.map(x => x.id), ["e2"]);
});

test("stance comparison counts only user labels rather than judging truth", () => {
  const evidence = [entry(), entry("s1", "e2", "challenges"), entry("s1", "e3", "context")];
  assert.deepEqual(local.countResearchStances(evidence), { supports: 1, challenges: 1, context: 1 });
});

test("literal evidence search includes claims, excerpts, notes and source titles", () => {
  const sources = [source()];
  const evidence = [entry(), { ...entry("s1", "e2", "challenges"), claim: "Another viewpoint" }];
  assert.equal(local.filterResearchEvidence(sources, evidence, "AN ARTICLE").length, 2);
  assert.deepEqual(local.filterResearchEvidence(sources, evidence, "quoted").map(x => x.id), ["e1", "e2"]);
  assert.deepEqual(local.filterResearchEvidence(sources, evidence, "another").map(x => x.id), ["e2"]);
  assert.throws(() => local.filterResearchEvidence(sources, evidence, "x".repeat(101)), { code: "invalid_query" });
});

test("plain-text brief preserves references and prominently labels excerpts as unverified", () => {
  const brief = local.formatLocalResearchBrief([source()], [entry()]);
  assert.match(brief, /\[1\] An article — https:\/\/example.org\/path/);
  assert.match(brief, /User-entered excerpt \(unverified\)/);
  assert.match(brief, /No live web research, independent fact-checking/);
});

test("research and summary request drafts reuse existing feature keys without submission", () => {
  const sources = [source()];
  const evidence = [entry()];
  const research = local.prepareResearchDraft("research", "  Investigate this  ", sources, evidence);
  assert.equal(research.featureKey, "ai.research.search");
  assert.equal(research.question, "Investigate this");
  assert.equal(local.prepareResearchDraft("summarize", "Summarize evidence", sources, evidence).featureKey, "ai.research.summarize");
  assert.match(local.formatResearchDraft(research), /BEGIN UNVERIFIED USER RESEARCH NOTES/);
  assert.throws(() => local.prepareResearchDraft("research", "", sources, evidence), { code: "invalid_question" });
});

test("UI contains source and evidence removal, bounded input and clipboard feedback", () => {
  for (const fragment of [
    "crypto.randomUUID()", "removeResearchSource(", "addResearchEvidence(", "filterResearchEvidence(",
    "maxLength={1000}", "maxLength={2000}", "maxLength={100}",
    "await navigator.clipboard.writeText(text)",
    'role="alert"', 'aria-live="polite"',
  ]) assert.ok(page.includes(fragment), "Missing UI boundary: " + fragment);
});

test("UI keeps local notebook private until explicit, bounded AI synthesis", () => {
  assert.match(page, /No URLs are fetched, checked or ranked/);
  assert.match(page, /Research notes are in memory only/);
  assert.match(page, /Synthesize notes with AI Chat/);
  assert.match(page, /useAIStudioChat/);
  assert.match(page, /ai\.run\("ai.research.summarize", formatResearchNotebookAIRequest\(request\)\)/);
  assert.match(page, /No webpages are opened/);
  assert.match(page, /ai\.error/);
  assert.match(page, /ai\.result/);
  assert.doesNotMatch(page + helper, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(|\beval\(|localStorage\./);
});

test("AI note synthesis is explicitly grounded in unverified notes without suggesting a live search", () => {
  const request = local.prepareResearchDraft("research", "What changed?", [source()], [entry()]);
  const prompt = local.formatResearchNotebookAIRequest(request);
  assert.match(prompt, /Work ONLY from the user-provided research notebook/);
  assert.match(prompt, /Never claim live web access/);
  assert.match(prompt, /BEGIN UNVERIFIED USER RESEARCH NOTES/);
  assert.match(prompt, /What changed/);
  assert.doesNotMatch(prompt, /independently checked sources; distinguish/);
  const summary = local.formatResearchNotebookAIRequest(
    local.prepareResearchDraft("summarize", "Summarize", [source()], [entry()]),
  );
  assert.match(summary, /Summarize the user's notes/);
});
