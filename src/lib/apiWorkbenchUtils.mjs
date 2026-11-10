const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const METHOD_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function parseRequestHeaders(input = "") {
  const headers = [];
  for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Header line ${index + 1} must use the format Name: value.`);
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!HEADER_NAME.test(name)) throw new Error(`Header line ${index + 1} has an invalid header name.`);
    if (/[\r\n]/.test(value)) throw new Error(`Header line ${index + 1} contains an invalid header value.`);
    headers.push([name, value]);
  }
  try {
    new Headers(headers);
  } catch {
    throw new Error("One or more request headers are invalid for the Fetch API.");
  }
  return headers;
}

export function validateApiRequest({ url, method = "GET", headers = "", body = "" }) {
  const normalizedMethod = String(method).trim().toUpperCase();
  if (!METHOD_TOKEN.test(normalizedMethod)) throw new Error("Enter a valid HTTP method token.");
  let parsedUrl;
  try {
    parsedUrl = new URL(String(url).trim());
  } catch {
    throw new Error("Enter a complete URL, including https:// or http://.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS request URLs are supported.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Do not embed credentials in the URL. Use an Authorization header instead.");
  }
  const parsedHeaders = parseRequestHeaders(headers);
  const requestBody = String(body ?? "");
  if (["GET", "HEAD"].includes(normalizedMethod) && requestBody.trim()) {
    throw new Error(`${normalizedMethod} requests cannot include a body in this workbench.`);
  }
  return { url: parsedUrl.href, method: normalizedMethod, headers: parsedHeaders, body: requestBody };
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

export function buildCurlCommand(request) {
  const validated = validateApiRequest(request);
  const parts = ["curl", "--request", shellQuote(validated.method), shellQuote(validated.url)];
  for (const [name, value] of validated.headers) {
    parts.push("--header", shellQuote(`${name}: ${value}`));
  }
  if (validated.body && !["GET", "HEAD"].includes(validated.method)) {
    parts.push("--data-raw", shellQuote(validated.body));
  }
  return parts.join(" ");
}

export function formatApiResponseBody(body, contentType = "") {
  if (!body) return "";
  if (/json/i.test(contentType)) {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
  }
  return body;
}
