import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isPublicIpAddress, normalizeWebTarget } from '../_shared/web-scan-safety.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const REQUEST_LIMIT = 4096
const RESPONSE_LIMIT = 512 * 1024
const REQUEST_TIMEOUT_MS = 10000

interface Finding {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  location: string
  proof_of_concept?: string
  remediation: string
  owasp_category: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let requestTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid or expired session' }, 401)

    const declaredLength = Number(req.headers.get('content-length') || 0)
    if (declaredLength > REQUEST_LIMIT) return json({ error: 'Request body is too large' }, 413)
    const rawBody = await req.text()
    if (rawBody.length > REQUEST_LIMIT) return json({ error: 'Request body is too large' }, 413)

    let body: { target_url?: unknown }
    try { body = JSON.parse(rawBody) } catch { return json({ error: 'Request body must be valid JSON' }, 400) }

    let target: URL
    try { target = normalizeWebTarget(body.target_url) } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid target URL' }, 400)
    }

    // Check all DNS answers, then repeat immediately before the single outbound request.
    const firstResolution = await resolvePublicAddresses(target.hostname)
    if (!firstResolution.ok) return json({ error: firstResolution.error }, 400)
    const secondResolution = await resolvePublicAddresses(target.hostname)
    if (!secondResolution.ok || secondResolution.addresses.some(ip => !firstResolution.addresses.includes(ip))) {
      return json({ error: 'Target DNS answers changed during validation. Retry when DNS is stable.' }, 400)
    }

    const startedAt = Date.now()
    const controller = new AbortController()
    requestTimeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const response = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'ETERNYX-Web-Configuration-Inspector/1.0',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      clearTimeout(requestTimeout)
      requestTimeout = undefined
      await response.body?.cancel()
      return json({ error: 'Redirects are not followed for safety. Submit the final public URL directly.', redirect_status: response.status }, 400)
    }

    const findings: Finding[] = []
    const contentType = response.headers.get('content-type') || ''
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType)

    const server = response.headers.get('server')
    if (server && /(?:apache|nginx|iis)\/[\w.]+/i.test(server)) findings.push({
      type: 'Server Version Disclosure', severity: 'low',
      description: 'The HTTP Server header exposes a product/version string.',
      location: 'HTTP response header: Server', proof_of_concept: server.slice(0, 160),
      remediation: 'Consider suppressing detailed server version tokens where practical.',
      owasp_category: 'A05:2021 – Security Misconfiguration',
    })

    const poweredBy = response.headers.get('x-powered-by')
    if (poweredBy) findings.push({
      type: 'Technology Disclosure', severity: 'low',
      description: 'The X-Powered-By response header discloses implementation technology.',
      location: 'HTTP response header: X-Powered-By', proof_of_concept: poweredBy.slice(0, 160),
      remediation: 'Remove unnecessary technology-identifying response headers.',
      owasp_category: 'A05:2021 – Security Misconfiguration',
    })

    const securityHeaders = [
      { name: 'content-security-policy', label: 'Content-Security-Policy', severity: 'medium' as const },
      { name: 'x-content-type-options', label: 'X-Content-Type-Options', severity: 'low' as const },
      { name: 'referrer-policy', label: 'Referrer-Policy', severity: 'low' as const },
      { name: 'permissions-policy', label: 'Permissions-Policy', severity: 'low' as const },
      { name: 'x-frame-options', label: 'X-Frame-Options', severity: 'low' as const },
    ]
    for (const header of securityHeaders) {
      if (!response.headers.get(header.name)) findings.push({
        type: 'Missing Security Header', severity: header.severity,
        description: `The response does not include the ${header.label} header.`,
        location: `HTTP response header: ${header.label}`,
        remediation: `Review and configure an appropriate ${header.label} policy for this application.`,
        owasp_category: 'A05:2021 – Security Misconfiguration',
      })
    }
    if (target.protocol === 'https:' && !response.headers.get('strict-transport-security')) findings.push({
      type: 'Missing Security Header', severity: 'medium',
      description: 'The HTTPS response does not include Strict-Transport-Security.',
      location: 'HTTP response header: Strict-Transport-Security',
      remediation: 'Configure HSTS after confirming all relevant subdomains support HTTPS.',
      owasp_category: 'A05:2021 – Security Misconfiguration',
    })

    const csp = response.headers.get('content-security-policy')
    if (csp && /'unsafe-inline'|'unsafe-eval'/i.test(csp)) findings.push({
      type: 'Permissive Content Security Policy', severity: 'medium',
      description: 'The CSP includes unsafe-inline or unsafe-eval. This weakens script restrictions but does not prove exploitable XSS.',
      location: 'HTTP response header: Content-Security-Policy', proof_of_concept: csp.slice(0, 300),
      remediation: 'Replace unsafe script directives with nonces or hashes where feasible.',
      owasp_category: 'A05:2021 – Security Misconfiguration',
    })

    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
    for (const cookie of cookies) {
      const name = cookie.split('=', 1)[0].trim().slice(0, 80) || 'unnamed cookie'
      const lower = cookie.toLowerCase()
      const checks = [
        ...(target.protocol === 'https:' && !/(^|;\s*)secure(?:;|$)/i.test(cookie)
          ? [{ type: 'Cookie Missing Secure Attribute', severity: 'medium' as const, attr: 'Secure' }] : []),
        ...(!/(^|;\s*)httponly(?:;|$)/i.test(lower)
          ? [{ type: 'Cookie Missing HttpOnly Attribute', severity: 'low' as const, attr: 'HttpOnly' }] : []),
        ...(!/(^|;\s*)samesite=/i.test(lower)
          ? [{ type: 'Cookie Missing SameSite Attribute', severity: 'low' as const, attr: 'SameSite' }] : []),
      ]
      for (const check of checks) findings.push({
        type: check.type, severity: check.severity,
        description: `The ${name} cookie does not declare the ${check.attr} attribute.`,
        location: 'HTTP Set-Cookie header',
        remediation: `Review whether the ${check.attr} attribute should be set for this cookie's purpose.`,
        owasp_category: 'A05:2021 – Security Misconfiguration',
      })
    }

    let html = ''
    let bodyTruncated = false
    if (isHtml && response.body) {
      const bodyResult = await readLimitedBody(response, RESPONSE_LIMIT)
      html = bodyResult.text
      bodyTruncated = bodyResult.truncated
    } else {
      await response.body?.cancel()
    }
    clearTimeout(requestTimeout)
    requestTimeout = undefined
    const formsFound = isHtml ? (html.match(/<form\b/gi) || []).length : 0
    const duration = Math.floor((Date.now() - startedAt) / 1000)
    const coverageLimitations = [
      'Single-request passive HTTP configuration inspection only; this is not a penetration test.',
      'No SQL injection, XSS payload, directory traversal, authentication bypass, or form submission tests are performed.',
      'No crawling or multi-page scan occurs. Forms are counted from returned HTML; inputs are not tested.',
      'TLS certificate chain, protocol/cipher strength, and TLS vulnerability checks are not performed.',
      'DNS answers are checked twice and redirects are not followed. Edge Runtime fetch does not pin the resolved IP; strict DNS-rebinding prevention requires network-level egress controls.',
      'HTML inspection is limited to the first 512 KiB. Cookie checks depend on runtime support for individual Set-Cookie headers.',
    ]
    if (bodyTruncated) coverageLimitations.push('The HTML response exceeded 512 KiB and was truncated.')
    if (!isHtml) coverageLimitations.push('The response was not identified as HTML; form inventory was skipped.')

    const result = {
      target_url: target.toString(), http_status: response.status, content_type: contentType || null,
      findings, vulnerabilities: findings, vulnerabilities_found: findings.length,
      pages_scanned: 1, forms_found: formsFound, inputs_tested: 0, cookies_analyzed: cookies.length,
      headers_checked: countHeaders(response.headers), scan_duration: duration,
      risk_score: null, risk_assessment: 'not_scored', coverage_limitations: coverageLimitations,
      recommendations: findings.length
        ? [...new Set(findings.map(item => item.remediation))]
        : ['No configuration observations were identified in the inspected response. This limited inspection does not establish that the application is vulnerability-free.'],
    }

    const { data: scanData, error: scanError } = await supabase.from('vulnerability_scans').insert({
      user_id: user.id, target_url: target.toString(), scan_type: 'web_application',
      status: 'completed', completed_at: new Date().toISOString(), results: result,
      vulnerabilities_found: findings.length, risk_score: null, scan_duration: duration,
    }).select('id').single()
    if (scanError) throw scanError

    if (findings.length) {
      const { error: detailsError } = await supabase.from('vulnerability_details').insert(findings.map(item => ({
        scan_id: scanData.id, vulnerability_type: item.type, severity: item.severity,
        description: item.description, location: item.location,
        proof_of_concept: item.proof_of_concept, remediation: item.remediation,
      })))
      if (detailsError) console.error('Could not store inspection findings:', detailsError)
    }
    return json({ success: true, scan_id: scanData.id, ...result })
  } catch (error) {
    if (requestTimeout) clearTimeout(requestTimeout)
    console.error('Web configuration inspection failed:', error)
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'The target did not respond within the 10-second request limit.' }, 504)
    return json({ error: 'Web configuration inspection failed. No vulnerability conclusion was produced.' }, 502)
  }
})

async function resolvePublicAddresses(hostname: string): Promise<{ ok: true; addresses: string[] } | { ok: false; error: string }> {
  const answers = await Promise.allSettled([Deno.resolveDns(hostname, 'A'), Deno.resolveDns(hostname, 'AAAA')])
  const addresses = answers.flatMap(answer => answer.status === 'fulfilled' ? answer.value : [])
  if (!addresses.length) return { ok: false, error: 'The target hostname did not resolve to a public IP address.' }
  if (addresses.some(address => !isPublicIpAddress(address))) {
    return { ok: false, error: 'The target hostname resolves to a private, reserved, or non-public IP address.' }
  }
  return { ok: true, addresses }
}

async function readLimitedBody(response: Response, limit: number): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = limit - total
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.slice(0, remaining))
        total += Math.max(0, remaining)
        truncated = true
        await reader.cancel()
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally { reader.releaseLock() }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return { text: new TextDecoder().decode(merged), truncated }
}

function countHeaders(headers: Headers): number {
  let count = 0
  headers.forEach(() => count++)
  return count
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
