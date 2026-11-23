import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const helper = await read("src/lib/ai/document-privacy-tools.ts");
const page = await read("src/pages/AIDocumentIntelligence.tsx");
const hub = await read("src/pages/AIArsenal.tsx");
const transpiled = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const privacy = await import("data:text/javascript;base64," + Buffer.from(transpiled).toString("base64"));

test("email and explicit credential assignments are masked without changing their labels", () => {
  const source = 'Email tech@example.org\napi_key="testsecret123456"\npassword: correcthorse98765';
  const copy = privacy.redactDocumentPrivacy(source);
  assert.equal(copy.report.counts.email, 1);
  assert.equal(copy.report.counts.credential, 2);
  assert.match(copy.text, /\[REDACTED_EMAIL\]/);
  assert.match(copy.text, /api_key="\[REDACTED_CREDENTIAL_VALUE\]"/);
  assert.match(copy.text, /password: \[REDACTED_CREDENTIAL_VALUE\]/);
  for (const secret of ["tech@example.org", "testsecret123456", "correcthorse98765"]) {
    assert.ok(source.includes(secret));
    assert.ok(!copy.text.includes(secret), "Unmasked source value: " + secret);
  }
  assert.ok(source.includes('api_key="testsecret123456"'), "Original text must not be modified");
});

test("Luhn-valid card-like numbers are detected, non-card numbers are not reported as cards", () => {
  const report = privacy.inspectDocumentPrivacy("Card: 4111 1111 1111 1111; misc: 4111 1111 1111 1112");
  assert.equal(report.counts.payment_card, 1);
  const result = privacy.redactDocumentPrivacy("Card: 4111111111111111");
  assert.equal(result.report.counts.payment_card, 1);
  assert.match(result.text, /REDACTED_PAYMENT_CARD_LIKE_NUMBER/);
});

test("international phone patterns and emails are positional and source-derived", () => {
  const source = "Heading\nCall +966 55 123 4567 or email user@company.com";
  const {findings} = privacy.inspectDocumentPrivacy(source);
  assert.equal(findings.length, 2);
  for (const f of findings) {
    assert.equal(source.slice(f.start, f.end).length, f.characters);
    assert.equal(f.line, 2);
    assert.ok(f.column >= 1);
  }
  assert.deepEqual(findings.map(f => f.kind), ["international_phone", "email"]);
});

test("overlapping JWT-like token in a Bearer header is masked once with higher priority", () => {
  // Deliberately synthetic, not a signed JWT or credential; construct the
  // three parser-shape segments at runtime to keep fixtures out of scanners.
  const jwt = ["eyJsyntheticHEADER", "syntheticPAYLOAD", "syntheticSIGNATURE"].join(".");
  const source = "Authorization: Bearer " + jwt;
  const result = privacy.redactDocumentPrivacy(source);
  assert.equal(result.report.findings.length, 1);
  assert.equal(result.report.counts.bearer, 1);
  assert.equal(result.report.counts.jwt, 0);
  assert.match(result.text, /^Authorization: Bearer \[REDACTED_BEARER_TOKEN\]$/);
  assert.ok(!result.text.includes(jwt));
  assert.equal(privacy.inspectDocumentPrivacy("JWT=" + jwt).counts.jwt, 1);
});

test("the privacy scan reports no-match uncertainty instead of claiming the document is safe", () => {
  const source = "These are project notes with no configured pattern match.";
  const redacted = privacy.redactDocumentPrivacy(source);
  assert.equal(redacted.report.findings.length, 0);
  assert.equal(redacted.text, source);
  assert.match(redacted.report.note, /may be missed/);
  assert.match(privacy.formatDocumentPrivacyAudit(redacted.report), /no guarantee/i);
});

test("audit export lists category and positions only, never raw matched values", () => {
  const input = "Secret is user@example.com\napi_key=credentialvalue654321";
  const report = privacy.inspectDocumentPrivacy(input);
  const output = privacy.formatDocumentPrivacyAudit(report);
  for (const raw of ["user@example.com", "credentialvalue654321", "Secret is"]) {
    assert.ok(!output.includes(raw), "Audit exposed source string");
  }
  assert.match(output, /line 2, column/);
  assert.match(output, /Findings: 2/);
});

test("scanner and redaction reject binary, oversized, and more than 250 findings rather than returning partial results", () => {
  assert.equal(privacy.MAX_PRIVACY_SOURCE_CHARS, 100000);
  assert.equal(privacy.MAX_PRIVACY_FINDINGS, 250);
  assert.throws(() => privacy.inspectDocumentPrivacy(""), { code: "invalid_text" });
  assert.throws(() => privacy.inspectDocumentPrivacy("a\u0000b"), { code: "invalid_text" });
  assert.throws(() => privacy.inspectDocumentPrivacy("x".repeat(100001)), { code: "too_large" });
  assert.throws(() => privacy.redactDocumentPrivacy(Array.from({length: 251}, (_, i) =>
    "account" + i + "@example.com").join("\n")), { code: "too_many_findings" });
});

test("redaction retains exact surrounding punctuation, source order and visible placeholders", () => {
  const source = "start (alpha@site.org), next: beta@site.org; end";
  const {text, report} = privacy.redactDocumentPrivacy(source);
  assert.equal(report.findings.length, 2);
  assert.equal(text, "start ([REDACTED_EMAIL]), next: [REDACTED_EMAIL]; end");
  assert.ok(report.findings[0].start < report.findings[1].start);
});

test("page integrates consent-based redacted AI input rather than silently replacing raw data", () => {
  for (const required of [
    "redactDocumentPrivacy(privacyTarget)",
    "formatDocumentPrivacyAudit(privacyCurrent.report)",
    "setPrivacyCopy(null)",
    "setPrivacyUseForAI(false)",
    "privacyCopy?.sourceText === privacyTarget",
    "const request = prepareDocumentDraft(chosenText, kind, task, instruction);",
    "chosenText = privacyCurrent.text",
    "inspectDocumentPrivacy(chosenText).findings.length",
    "inspectDocumentPrivacy(prompt).findings.length",
    "redaction checkbox does NOT silently affect them",
    "window.confirm(",
    "No configured pattern match does not imply safety",
    "ai.run(request.featureKey, formatDocumentDraft(request))",
    "downloadPrivacyText",
    "privacyTarget = aiPassage ?? source",
    "setPrivacyCopy({ ...redaction, sourceText: privacyTarget })",
    "ai.invalidate()",
  ]) assert.ok(page.includes(required), "Missing boundary: " + required);
  assert.doesNotMatch(page + helper, /supabase\.functions\.invoke|ai-generation-job-enqueue|fetch\(/);
  assert.match(hub, /AI Document Intelligence/);
});
