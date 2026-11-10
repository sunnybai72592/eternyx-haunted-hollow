import test from "node:test";
import assert from "node:assert/strict";
import { buildCurlCommand, formatApiResponseBody, parseRequestHeaders, validateApiRequest } from "../src/lib/apiWorkbenchUtils.mjs";

test("parses request headers and preserves values containing colons", () => {
  assert.deepEqual(parseRequestHeaders("Accept: application/json\nAuthorization: Bearer abc:def"), [
    ["Accept", "application/json"], ["Authorization", "Bearer abc:def"],
  ]);
});

test("rejects malformed header lines and invalid header names", () => {
  assert.throws(() => parseRequestHeaders("Authorization Bearer token"), /Name: value/);
  assert.throws(() => parseRequestHeaders("Bad Header: value"), /invalid header name/);
});

test("validates HTTP and HTTPS URLs and normalizes methods", () => {
  assert.deepEqual(validateApiRequest({ url: "https://example.com/path", method: "post" }), {
    url: "https://example.com/path", method: "POST", headers: [], body: "",
  });
  assert.throws(() => validateApiRequest({ url: "javascript:alert(1)" }), /Only HTTP and HTTPS/);
  assert.throws(() => validateApiRequest({ url: "https://user:pass@example.com" }), /Do not embed credentials/);
});

test("rejects bodies for GET and HEAD requests", () => {
  assert.throws(() => validateApiRequest({ url: "https://example.com", method: "GET", body: "{}" }), /cannot include a body/);
  assert.throws(() => validateApiRequest({ url: "https://example.com", method: "HEAD", body: "x" }), /cannot include a body/);
});

test("builds a safely shell-quoted cURL command", () => {
  const command = buildCurlCommand({
    url: "https://example.com/search?q=it's",
    method: "POST",
    headers: "Content-Type: application/json\nAuthorization: Bearer abc",
    body: "{\"name\":\"it's safe\"}",
  });
  assert.match(command, /^curl --request 'POST'/);
  assert.match(command, /--header 'Authorization: Bearer abc'/);
  assert.match(command, /--data-raw '\{.*'\\''.*\}'/);
});

test("formats JSON responses but leaves non-JSON and malformed bodies unchanged", () => {
  assert.equal(formatApiResponseBody('{"ok":true}', "application/json"), '{\n  "ok": true\n}');
  assert.equal(formatApiResponseBody("<ok/>", "text/xml"), "<ok/>");
  assert.equal(formatApiResponseBody("{broken", "application/json"), "{broken");
});
