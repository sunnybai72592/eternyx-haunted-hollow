import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase64Utf8,
  decodeJwt,
  decodeUriComponent,
  encodeBase64Utf8,
  encodeUriComponent,
  formatJson,
  generateUuids,
} from "../src/lib/developerStudioUtils.mjs";

const toBase64Url = (value) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const makeToken = (header = { alg: "HS256", typ: "JWT" }, payload = { sub: "user-1" }, signature = "c2ln") =>
  `${toBase64Url(header)}.${toBase64Url(payload)}.${signature}`;

test("formats valid JSON with two-space indentation", () => {
  assert.equal(formatJson('{"name":"ETERNYX","active":true}'), '{\n  "name": "ETERNYX",\n  "active": true\n}');
});

test("rejects malformed JSON", () => {
  assert.throws(() => formatJson('{"name":}'), SyntaxError);
});

test("formats JSON arrays and primitive values", () => {
  assert.equal(formatJson("[1,2]"), "[\n  1,\n  2\n]");
  assert.equal(formatJson("null"), "null");
});

test("Base64 round-trips UTF-8 text, emoji, and non-English characters", () => {
  const value = "ETERNYX — سلام 🌙";
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(value)), value);
});

test("Base64 decoder tolerates whitespace", () => {
  assert.equal(decodeBase64Utf8(" SGV sbG8=\\n"), "Hello");
});

test("Base64 decoder rejects invalid Base64", () => {
  assert.throws(() => decodeBase64Utf8("%%%"));
});

test("Base64 decoder rejects invalid UTF-8", () => {
  assert.throws(() => decodeBase64Utf8("/w=="), TypeError);
});

test("URI component encoding and decoding round-trip reserved and Unicode characters", () => {
  const value = "hello world & سلام";
  assert.equal(decodeUriComponent(encodeUriComponent(value)), value);
  assert.equal(encodeUriComponent("a b"), "a%20b");
});

test("URI decoder rejects malformed percent escapes", () => {
  assert.throws(() => decodeUriComponent("%E0%A4%A"), URIError);
});

test("JWT decoder returns header and payload objects", () => {
  assert.deepEqual(decodeJwt(makeToken()), {
    header: { alg: "HS256", typ: "JWT" },
    payload: { sub: "user-1" },
  });
});

test("JWT decoder rejects tokens without exactly three segments", () => {
  assert.throws(() => decodeJwt("one.two"), /three dot-separated segments/);
  assert.throws(() => decodeJwt("one.two.three.four"), /three dot-separated segments/);
});

test("JWT decoder rejects malformed Base64URL header and payload segments", () => {
  assert.throws(() => decodeJwt("a.b.c"), /Base64URL/);
  assert.throws(() => decodeJwt(`${toBase64Url({ alg: "HS256" })}.a.c`), /Base64URL/);
});

test("JWT decoder requires header and payload to be JSON objects", () => {
  assert.throws(() => decodeJwt(`${toBase64Url([])}.${toBase64Url({ sub: "x" })}.c2ln`), /JSON object/);
  assert.throws(() => decodeJwt(`${toBase64Url({ alg: "HS256" })}.${toBase64Url(null)}.c2ln`), /JSON object/);
});

test("JWT decoder rejects invalid signature segment characters and impossible lengths", () => {
  const valid = makeToken();
  const [header, payload] = valid.split(".");
  assert.throws(() => decodeJwt(`${header}.${payload}.bad!`), /signature segment/);
  assert.throws(() => decodeJwt(`${header}.${payload}.a`), /signature segment/);
});

test("UUID generator creates the requested number of valid version-4 UUIDs", () => {
  const values = generateUuids(8).split("\n");
  assert.equal(values.length, 8);
  assert.equal(new Set(values).size, 8);
  for (const value of values) {
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("UUID generator rejects invalid counts", () => {
  for (const count of [0, -1, 1.5, 101, Number.NaN]) {
    assert.throws(() => generateUuids(count), /whole number from 1 to 100/);
  }
});
