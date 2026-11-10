import test from "node:test";
import assert from "node:assert/strict";
import {
  convertTimestamp,
  createLineDiff,
  decodeHtmlEntities,
  encodeHtmlEntities,
  jsonArrayToCsv,
  renderMarkdownSafe,
} from "../src/lib/developerStudioAdvancedUtils.mjs";

test("Markdown preview escapes HTML and formats supported Markdown", () => {
  const html = renderMarkdownSafe("# Hello\n\n**bold** and `code`\n<script>alert(1)</script>");
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("Markdown links only accept HTTP and HTTPS destinations", () => {
  assert.match(renderMarkdownSafe("[safe](https://example.com)"), /rel="noopener noreferrer"/);
  assert.doesNotMatch(renderMarkdownSafe("[unsafe](javascript:alert(1))"), /href="javascript:/);
});

test("Markdown renders ordered and unordered lists", () => {
  const html = renderMarkdownSafe("- one\n- two\n\n1. first\n2. second");
  assert.match(html, /<ul>[\s\S]*<\/ul>/);
  assert.match(html, /<ol>[\s\S]*<\/ol>/);
});

test("JSON array converts to CSV with union headers and quoted cells", () => {
  const csv = jsonArrayToCsv('[{"name":"A, B","active":true},{"name":"She said \\"hi\\"","extra":3}]');
  assert.equal(csv, 'name,active,extra\r\n"A, B",true,\r\n"She said ""hi""",,3');
});

test("JSON to CSV handles nested values and empty arrays", () => {
  assert.equal(jsonArrayToCsv('[{"meta":{"x":1},"tags":["a","b"]}]'), 'meta,tags\r\n"{""x"":1}","[""a"",""b""]"');
  assert.equal(jsonArrayToCsv("[]"), "");
});

test("JSON to CSV neutralizes spreadsheet formula injection in string cells", () => {
  assert.equal(jsonArrayToCsv('[{"value":"=SUM(1,2)"}]'), 'value\r\n"\'=SUM(1,2)"');
});
test("JSON to CSV rejects non-object rows", () => {
  assert.throws(() => jsonArrayToCsv('[1,2]'), /array of objects/);
  assert.throws(() => jsonArrayToCsv('{"a":1}'), /array of objects/);
});

test("HTML entities encode special characters", () => {
  assert.equal(encodeHtmlEntities(`<div title="x">Tom & Jerry</div>`), "&lt;div title=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/div&gt;");
});

test("HTML entities decode named, decimal, hexadecimal and Unicode entities", () => {
  assert.equal(decodeHtmlEntities("&lt;hi&gt; &#65; &#x1F680; &amp;"), "<hi> A 🚀 &");
});

test("HTML entity decoder leaves unknown entities untouched and replaces invalid code points", () => {
  assert.equal(decodeHtmlEntities("&unknown; &#x110000;"), "&unknown; �");
});

test("timestamp converter accepts seconds and milliseconds", () => {
  assert.equal(convertTimestamp("0").iso, "1970-01-01T00:00:00.000Z");
  assert.equal(convertTimestamp("1000").unixMilliseconds, 1000000);
  assert.equal(convertTimestamp("1000000000000").unixMilliseconds, 1000000000000);
});

test("timestamp converter accepts date strings and rejects invalid input", () => {
  assert.equal(convertTimestamp("2024-01-01T00:00:00Z").unixSeconds, 1704067200);
  assert.throws(() => convertTimestamp("not-a-date"), /valid timestamp or date/);
  assert.throws(() => convertTimestamp(""), /Enter a Unix timestamp or date/);
});

test("line diff identifies unchanged, removed and added lines", () => {
  assert.deepEqual(createLineDiff("one\ntwo\nthree", "one\nTWO\nthree\nfour"), [
    { type: "same", value: "one" },
    { type: "removed", value: "two" },
    { type: "added", value: "TWO" },
    { type: "same", value: "three" },
    { type: "added", value: "four" },
  ]);
});

test("line diff normalizes Windows newlines and detects identical text", () => {
  assert.deepEqual(createLineDiff("a\r\nb", "a\nb"), [
    { type: "same", value: "a" },
    { type: "same", value: "b" },
  ]);
});

test("line diff enforces the 300-line safety limit", () => {
  const tooMany = Array.from({ length: 301 }, (_, index) => String(index)).join("\n");
  assert.throws(() => createLineDiff(tooMany, "short"), /300 lines/);
});
