import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CT_TIMEOUT_MS = 10000;
const CT_RESPONSE_LIMIT_BYTES = 1024 * 1024;
const MAX_CERTIFICATE_ROWS = 5000;
const MAX_SUBDOMAINS = 250;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CertificateRecord {
  name_value?: unknown;
  common_name?: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Invalid or expired session" }, 401);

    let body: { domain?: unknown };
    try {
      const requestText = await readLimitedResponseText(req, MAX_REQUEST_BODY_BYTES);
      body = JSON.parse(requestText);
    } catch {
      return json({ error: "Request body must be valid JSON and no larger than 8 KB" }, 400);
    }

    const domain = typeof body.domain === "string"
      ? body.domain.trim().toLowerCase().replace(/\.$/, "")
      : "";
    const domainRegex = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    if (!domainRegex.test(domain)) {
      return json({ error: "Enter a valid public root domain name" }, 400);
    }

    const startedAt = Date.now();
    const query = new URLSearchParams({ q: `%.${domain}`, output: "json" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CT_TIMEOUT_MS);
    let response: Response;
    let responseText: string;
    try {
      response = await fetch(`https://crt.sh/?${query.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        return json({ error: "Certificate Transparency lookup failed. No subdomain results were confirmed." }, 502);
      }
      responseText = await readLimitedResponseText(response, CT_RESPONSE_LIMIT_BYTES);
    } finally {
      clearTimeout(timeout);
    }

    let records: unknown;
    try {
      records = JSON.parse(responseText);
    } catch {
      return json({ error: "Certificate Transparency provider returned an invalid response." }, 502);
    }
    if (!Array.isArray(records)) {
      return json({ error: "Certificate Transparency provider returned an unexpected response." }, 502);
    }

    const discovered = new Set<string>();
    for (const item of records.slice(0, MAX_CERTIFICATE_ROWS) as CertificateRecord[]) {
      const candidates = [
        ...(typeof item?.name_value === "string" ? item.name_value.split(/\r?\n/) : []),
        ...(typeof item?.common_name === "string" ? [item.common_name] : []),
      ];
      for (const candidate of candidates) {
        const hostname = candidate.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
        if (
          hostname.length <= 253 &&
          hostname !== domain &&
          hostname.endsWith(`.${domain}`) &&
          domainRegex.test(hostname)
        ) {
          discovered.add(hostname);
        }
      }
    }

    const subdomains = [...discovered].sort().slice(0, MAX_SUBDOMAINS);
    return json({
      success: true,
      domain,
      source: "Certificate Transparency (crt.sh)",
      lookup_completed_at: new Date().toISOString(),
      lookup_duration_ms: Date.now() - startedAt,
      certificate_rows_reviewed: Math.min(records.length, MAX_CERTIFICATE_ROWS),
      subdomains,
      subdomains_returned: subdomains.length,
      results_truncated: discovered.size > MAX_SUBDOMAINS || records.length > MAX_CERTIFICATE_ROWS,
      limitations: [
        "This is passive Certificate Transparency discovery, not active DNS enumeration.",
        "Results may include historical names, duplicates, or names that no longer resolve.",
        "Certificates that were not publicly logged will not appear; this is not a complete asset inventory.",
        "No ports are probed and no target systems are contacted directly by ETERNYX."
      ]
    });
  } catch (error) {
    console.error("Passive subdomain discovery failed:", error);
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({
      error: timedOut
        ? "Certificate Transparency lookup timed out."
        : "Subdomain discovery could not be completed.",
    }, timedOut ? 504 : 502);
  }
});

async function readLimitedResponseText(response: Response, limit: number): Promise<string> {
  if (!response.body) throw new Error("Certificate Transparency provider returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Certificate Transparency response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
