import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore Deno resolves the shared JavaScript module at runtime.
import {
  collectSslLabsFindings,
  deriveSslLabsChecks,
  flattenProtocolSuites,
} from "../_shared/ssl-labs-assessment.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SSL_LABS_API = "https://api.ssllabs.com/api/v3/analyze";
const MAX_POLL_ATTEMPTS = 8;

interface SSLAnalysisRequest {
  hostname: string;
}

interface SSLResult {
  grade: string;
  hasWarnings: boolean;
  isExceptional: boolean;
  progress: number;
  endpoints: any[];
  certificates: any[];
  protocols: any[];
  suites: any[];
  serverSignature: string;
  prefixDelegation: boolean;
  nonPrefixDelegation: boolean;
  vulnerabilities: Array<{
    id: string;
    name: string;
    severity: string;
    description: string;
  }>;
}

class SSLLabsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SSLLabsApiError";
    this.status = status;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }

    let body: SSLAnalysisRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }

    const hostname = validatePublicHostname(body?.hostname);
    if (!hostname) {
      return jsonResponse({
        error: "Enter a valid public DNS hostname, such as example.com. URLs, IP addresses and local hostnames are not accepted.",
      }, 400);
    }

    const startedAt = Date.now();
    // The target is assessed by Qualys infrastructure. This function never
    // opens a connection to a user-supplied host, avoiding a direct SSRF path.
    const sslResult = await performSSLAnalysis(hostname);
    const readyEndpoint = sslResult.endpoints.find((endpoint) => endpoint.statusMessage === "Ready");
    const additionalChecks = deriveSslLabsChecks(readyEndpoint, sslResult.certificates);
    const analysisTime = Math.floor((Date.now() - startedAt) / 1000);
    const recommendations = generateSSLRecommendations(sslResult, additionalChecks);

    const { data: analysisData, error: analysisError } = await supabaseClient
      .from("ai_security_analysis")
      .insert({
        user_id: user.id,
        analysis_type: "ssl_analysis",
        input_data: {
          hostname,
          timestamp: new Date().toISOString(),
        },
        results: {
          source: "Qualys SSL Labs API v3",
          ssl_labs_result: sslResult,
          additional_checks: additionalChecks,
          security_score: null,
          analysis_duration: analysisTime,
          summary: {
            overall_grade: sslResult.grade,
            assessed_endpoints: sslResult.endpoints.filter((endpoint) => endpoint.statusMessage === "Ready").length,
            total_endpoints: sslResult.endpoints.length,
            has_warnings: sslResult.hasWarnings,
            vulnerabilities_found: sslResult.vulnerabilities.length,
          },
        },
        // SSL Labs supplies a grade, not a statistical confidence score.
        confidence_score: null,
        processing_time: analysisTime * 1000,
      })
      .select("id")
      .single();

    if (analysisError) throw analysisError;

    return jsonResponse({
      success: true,
      analysis_id: analysisData.id,
      hostname,
      source: "Qualys SSL Labs API v3",
      overall_grade: sslResult.grade,
      security_score: null,
      analysis_time: analysisTime,
      ssl_result: sslResult,
      additional_checks: additionalChecks,
      recommendations,
      coverage_limitations: [
        "Qualys SSL Labs performs the TLS assessment from its own external infrastructure; results may differ from a specific client network path.",
        "Only endpoints whose individual assessment status is Ready are used to derive protocol and vulnerability findings. Other endpoint statuses remain visible in the returned endpoint list.",
        "Unknown checks are reported as unknown, not as absent or insecure. This assessment does not independently crawl the site or test application-layer vulnerabilities.",
      ],
    });
  } catch (error) {
    console.error("SSL analyzer error:", error);
    if (error instanceof SSLLabsApiError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({
      error: "The SSL/TLS assessment could not be completed. Please try again later.",
    }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requestSslLabs(hostname: string, startNew = false): Promise<any> {
  const url = new URL(SSL_LABS_API);
  url.searchParams.set("host", hostname);
  url.searchParams.set("all", "done");
  if (startNew) url.searchParams.set("startNew", "on");

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new SSLLabsApiError("Qualys SSL Labs could not be reached. Please retry later.", 502);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new SSLLabsApiError("Qualys SSL Labs rate limit reached. Please wait before starting another assessment.", 429);
    }
    if (response.status === 503 || response.status === 529) {
      throw new SSLLabsApiError("Qualys SSL Labs is temporarily unavailable or overloaded. Please retry later.", 503);
    }
    throw new SSLLabsApiError("Qualys SSL Labs rejected or could not process the assessment request.", 502);
  }

  try {
    return await response.json();
  } catch {
    throw new SSLLabsApiError("Qualys SSL Labs returned an unreadable assessment response.", 502);
  }
}

async function performSSLAnalysis(hostname: string): Promise<SSLResult> {
  // startNew is used once only. Polling requests must not restart the assessment.
  let analysisData = await requestSslLabs(hostname, true);
  let attempts = 0;

  while (analysisData.status !== "READY" && analysisData.status !== "ERROR" && attempts < MAX_POLL_ATTEMPTS) {
    const delayMs = analysisData.status === "IN_PROGRESS" ? 10000 : 5000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    analysisData = await requestSslLabs(hostname);
    attempts += 1;
  }

  if (analysisData.status === "ERROR") {
    throw new SSLLabsApiError("Qualys SSL Labs could not complete this hostname assessment. Check the hostname and retry later.", 422);
  }
  if (analysisData.status !== "READY") {
    throw new SSLLabsApiError("The SSL Labs assessment is still running. Please retry in a little while; no partial grade was saved.", 202);
  }

  const endpoints = Array.isArray(analysisData.endpoints) ? analysisData.endpoints : [];
  const readyEndpoints = endpoints.filter((endpoint: any) =>
    endpoint?.statusMessage === "Ready" && endpoint?.details,
  );
  if (readyEndpoints.length === 0) {
    throw new SSLLabsApiError("SSL Labs completed the host request but did not return a successfully assessed endpoint.", 422);
  }

  const gradeOrder: Record<string, number> = {
    "A+": 0, "A": 1, "A-": 2, "B": 3, "C": 4, "D": 5, "E": 6, "F": 7, "T": 8, "M": 9,
  };
  const grades = readyEndpoints
    .map((endpoint: any) => endpoint.grade)
    .filter((grade: unknown): grade is string => typeof grade === "string" && grade in gradeOrder);
  const grade = grades.length > 0
    ? grades.reduce((worst: string, current: string) => gradeOrder[current] > gradeOrder[worst] ? current : worst)
    : "N/A";
  const certificates = Array.isArray(analysisData.certs) ? analysisData.certs : [];
  const protocols = readyEndpoints.flatMap((endpoint: any) =>
    Array.isArray(endpoint.details.protocols) ? endpoint.details.protocols : [],
  );
  const suites = readyEndpoints.flatMap((endpoint: any) =>
    flattenProtocolSuites(endpoint.details.suites),
  );

  return {
    grade,
    hasWarnings: readyEndpoints.some((endpoint: any) => endpoint.hasWarnings === true),
    isExceptional: readyEndpoints.some((endpoint: any) => endpoint.isExceptional === true),
    progress: 100,
    endpoints,
    certificates,
    protocols,
    suites,
    serverSignature: readyEndpoints.map((endpoint: any) => endpoint.details.serverSignature).find(Boolean) ?? "",
    prefixDelegation: readyEndpoints.some((endpoint: any) => endpoint.details.prefixDelegation === true),
    nonPrefixDelegation: readyEndpoints.some((endpoint: any) => endpoint.details.nonPrefixDelegation === true),
    vulnerabilities: collectSslLabsFindings(readyEndpoints, certificates),
  };
}

function validatePublicHostname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const hostname = input.trim().toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253 || hostname.includes("://") || /[\/@?#:\s\\]/.test(hostname)) return null;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid")
  ) return null;
  // Accept DNS names only. IP literals (including IPv6) are deliberately rejected.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return null;
  const labels = hostname.split(".");
  if (labels.length < 2 || labels.some((label) =>
    label.length < 1 || label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) return null;
  return hostname;
}

function generateSSLRecommendations(
  sslResult: SSLResult,
  additionalChecks: Record<string, boolean | null>,
): string[] {
  const recommendations: string[] = [];
  if (["F", "T", "M"].includes(sslResult.grade)) {
    recommendations.push("Review the SSL Labs endpoint details and certificate trust or hostname findings before considering the service secure.");
  }
  if (additionalChecks.supports_tls13 === false) {
    recommendations.push("Consider enabling TLS 1.3 while retaining only protocols required for compatibility.");
  }
  if (additionalChecks.hsts_enabled === false) {
    recommendations.push("Review the site's HSTS policy and enable it where HTTPS is enforced across the intended domain scope.");
  }
  if (additionalChecks.certificate_transparency === false) {
    recommendations.push("Review certificate transparency logging and ensure certificates are issued with the expected SCT evidence.");
  }
  if (additionalChecks.ocsp_stapling === false) {
    recommendations.push("Consider enabling OCSP stapling where supported by the certificate and server platform.");
  }
  if (sslResult.vulnerabilities.length > 0) {
    recommendations.push(`Review and remediate the ${sslResult.vulnerabilities.length} issue(s) reported by SSL Labs.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("No actionable issues were identified in the returned SSL Labs assessment data. This is not a guarantee that the host is free of security weaknesses.");
  }
  return recommendations;
}
