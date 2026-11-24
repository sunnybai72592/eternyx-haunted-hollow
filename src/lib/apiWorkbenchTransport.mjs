import { formatApiResponseBody } from "./apiWorkbenchUtils.mjs";

export const API_MAX_RESPONSE_BYTES = 1_000_000;
export const API_REQUEST_TIMEOUT_MS = 30_000;

// This transport is browser-direct and never follows redirects. Neither
// cookies nor referrer URLs are sent. Caller-supplied headers are explicit.
export async function readBoundedApiBody(response, limit = API_MAX_RESPONSE_BYTES) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > API_MAX_RESPONSE_BYTES) {
    throw new Error("Invalid response byte limit.");
  }
  if (!response.body) return { text:"", truncated:false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = limit - bytes;
      if (value.byteLength > remaining) {
        text += decoder.decode(value.subarray(0, remaining), { stream:true });
        truncated = true;
        // Do not wait indefinitely for a remote cancellation acknowledgement.
        try { void reader.cancel().catch(() => {}); } catch { /* already closed */ }
        break;
      }
      bytes += value.byteLength;
      text += decoder.decode(value, { stream:true });
    }
    text += decoder.decode();
    return { text, truncated };
  } finally {
    reader.releaseLock();
  }
}

export async function executeApiWorkbenchRequest(request, options = {}) {
  const fetcher = options.fetcher || fetch;
  const now = options.now || (() => performance.now());
  const signal = options.signal;
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const started = now();
  const response = await fetcher(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    ...(request.body && !["GET","HEAD"].includes(request.method) ? {body:request.body} : {}),
    mode:"cors",
    credentials:"omit",
    cache:"no-store",
    redirect:"error",
    referrerPolicy:"no-referrer",
    signal,
  });
  if (signal?.aborted) {
    try { void response.body?.cancel().catch(() => {}); } catch { /* already closed */ }
    throw new DOMException("Request aborted", "AbortError");
  }
  const headerDurationMs = Math.max(0, Math.round(now() - started));
  const received = await readBoundedApiBody(response);
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const raw = received.text;
  const formatted = received.truncated ? raw : formatApiResponseBody(raw, response.headers.get("content-type") || "");
  // Pretty printing can expand a compact JSON document substantially.
  const encoder = new TextEncoder();
  const preferred = encoder.encode(formatted).byteLength <= API_MAX_RESPONSE_BYTES ? formatted : raw;
  const encoded = encoder.encode(preferred);
  const displayClipped = encoded.byteLength > API_MAX_RESPONSE_BYTES;
  const body = displayClipped ? new TextDecoder().decode(encoded.subarray(0, API_MAX_RESPONSE_BYTES), {stream:true}) : preferred;
  return {
    status:response.status, statusText:response.statusText, ok:response.ok,
    headerDurationMs, durationMs:Math.max(0, Math.round(now() - started)),
    headers:Array.from(response.headers.entries()).map(([name,value])=>name+": "+value).join("\n") ||
      "No response headers exposed by the browser.",
    body, truncated:received.truncated || displayClipped,
  };
}
