export function formatJson(input) {
  return JSON.stringify(JSON.parse(input), null, 2);
}

export function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeUriComponent(value) {
  return encodeURIComponent(value);
}

export function decodeUriComponent(value) {
  return decodeURIComponent(value);
}

function decodeBase64UrlJson(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error("JWT header and payload must use unpadded Base64URL encoding.");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("JWT header and payload must each contain a JSON object.");
  }

  return json;
}

export function decodeJwt(token) {
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error("A JWT must contain three dot-separated segments.");
  }
  if (!/^[A-Za-z0-9_-]*$/.test(parts[2]) || parts[2].length % 4 === 1) {
    throw new Error("JWT signature segment must use valid Base64URL characters.");
  }

  return {
    header: decodeBase64UrlJson(parts[0]),
    payload: decodeBase64UrlJson(parts[1]),
  };
}

export function makeUuid() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error("A secure browser context with Web Crypto support is required to generate UUIDs.");
  }
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function generateUuids(count) {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Enter a whole number from 1 to 100.");
  }
  return Array.from({ length: count }, makeUuid).join("\n");
}
