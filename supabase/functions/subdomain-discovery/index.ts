import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CT_TIMEOUT_MS = 10000;
const CT_RESPONSE_LIMIT_BYTES = 1024 * 1024;
const MAX_CERTIFICATE_ROWS = 5000;
const MAX_SUBDOMAINS = 250;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const DNS_TIMEOUT_MS = 5000;
const DNS_RESPONSE_LIMIT_BYTES = 16 * 1024;
const MAX_DNS_VERIFICATIONS = 100;
const DNS_CONCURRENCY = 5;

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
    const verificationTargets = subdomains.slice(0, MAX_DNS_VERIFICATIONS);
    const verifiedResults: DNSVerificationResult[] = new Array(verificationTargets.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(DNS_CONCURRENCY, verificationTargets.length) },
      async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= verificationTargets.length) return;
          verifiedResults[index] = await verifySubdomainDns(verificationTargets[index]);
        }
      },
    );
    await Promise.all(workers);

    const dnsResults: DNSVerificationResult[] = subdomains.map((hostname, index) =>
      index < verifiedResults.length
        ? verifiedResults[index]
        : { hostname, status: "not_checked_limit", addresses: [], verification_complete: false }
    );
    const dnsSummary = {
      resolved: dnsResults.filter((item) => item.status === "resolved").length,
      no_address_records: dnsResults.filter((item) => item.status === "no_address_records").length,
      inconclusive: dnsResults.filter((item) => item.status === "inconclusive").length,
      not_checked_limit: dnsResults.filter((item) => item.status === "not_checked_limit").length,
    };

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
      dns_verification: {
        provider: "Cloudflare DNS over HTTPS",
        summary: dnsSummary,
        verified_subdomains: verificationTargets.length,
        maximum_verifications: MAX_DNS_VERIFICATIONS,
        results: dnsResults,
        note: "A hostname is marked resolved only when an A or AAAA address answer is observed. No address answer does not prove the hostname is unused.",
      },
      limitations: [
        "This is passive Certificate Transparency discovery, not active DNS enumeration.",
        "Results may include historical names, duplicates, or names that no longer resolve.",
        "Certificates that were not publicly logged will not appear; this is not a complete asset inventory.",
        "No ports are probed and no target systems are contacted directly by ETERNYX.",
        "DNS verification uses a public recursive resolver and checks at most 100 discovered names per run.",
        "DNS results are point-in-time observations; resolver errors are marked inconclusive and names beyond the verification cap are not checked."
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


interface DNSVerificationResult {
  hostname: string;
  status: "resolved" | "no_address_records" | "inconclusive" | "not_checked_limit";
  addresses: Array<{ type: "A" | "AAAA"; address: string }>;
  verification_complete: boolean;
}

async function verifySubdomainDns(hostname: string): Promise<DNSVerificationResult> {
  const [aResult, aaaaResult] = await Promise.all([
    queryDnsAddressRecords(hostname, "A", 1),
    queryDnsAddressRecords(hostname, "AAAA", 28),
  ]);
  const addresses = [...aResult.addresses, ...aaaaResult.addresses]
    .filter((record, index, all) =>
      all.findIndex((candidate) => candidate.type === record.type && candidate.address === record.address) === index
    )
    .slice(0, 20);
  const verificationComplete = aResult.ok && aaaaResult.ok;
  return {
    hostname,
    status: addresses.length > 0
      ? "resolved"
      : verificationComplete
      ? "no_address_records"
      : "inconclusive",
    addresses,
    verification_complete: verificationComplete,
  };
}

async function queryDnsAddressRecords(
  hostname: string,
  recordType: "A" | "AAAA",
  expectedType: 1 | 28,
): Promise<{ ok: boolean; addresses: Array<{ type: "A" | "AAAA"; address: string }> }> {
  const query = new URLSearchParams({ name: hostname, type: recordType });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?${query.toString()}`, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, addresses: [] };

    const responseText = await readLimitedResponseText(response, DNS_RESPONSE_LIMIT_BYTES);
    let data: { Status?: unknown; Answer?: Array<{ type?: unknown; data?: unknown }> };
    try {
      data = JSON.parse(responseText);
    } catch {
      return { ok: false, addresses: [] };
    }
    if (!data || typeof data !== "object" ||
      (data.Status !== 0 && data.Status !== 3)) {
      return { ok: false, addresses: [] };
    }
    if (!Array.isArray(data.Answer)) return { ok: true, addresses: [] };

    const addresses = data.Answer
      .filter((answer) => answer?.type === expectedType &&
        typeof answer.data === "string" && answer.data.length <= 255)
      .slice(0, 10)
      .map((answer) => ({
        type: recordType,
        address: answer.data as string,
      }));
    return { ok: true, addresses };
  } catch {
    return { ok: false, addresses: [] };
  } finally {
    clearTimeout(timeout);
  }
}

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
