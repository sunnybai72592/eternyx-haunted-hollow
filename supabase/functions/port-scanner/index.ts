import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PortScanRequest {
  target: string;
  ports?: number[];
  scan_type?: string;
}

interface ShodanHostResponse {
  ip_str?: string;
  org?: string;
  ports?: number[];
  data?: Array<{ port: number; banner?: string; product?: string; version?: string; transport?: string }>;
  vulns?: string[] | Record<string, unknown>;
  country_name?: string;
  city?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid or expired session' }, 401)

    const body = await req.json() as PortScanRequest
    const target = typeof body.target === 'string' ? body.target.trim() : ''
    if (!isPublicIPv4(target)) {
      return json({ error: 'Enter a public IPv4 address. Hostnames, private addresses, and reserved ranges are not accepted.' }, 400)
    }

    const requestedPorts = body.ports ?? []
    if (!Array.isArray(requestedPorts) || requestedPorts.length > 100 ||
        requestedPorts.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
      return json({ error: 'Ports must be an array of up to 100 valid port numbers (1–65535).' }, 400)
    }
    const portFilter = [...new Set(requestedPorts)]

    const shodanApiKey = Deno.env.get('SHODAN_API_KEY')
    if (!shodanApiKey) {
      return json({ error: 'Shodan integration is not configured. No port observations were performed.', code: 'SHODAN_NOT_CONFIGURED' }, 503)
    }

    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    let providerResponse: Response
    try {
      providerResponse = await fetch(
        `https://api.shodan.io/shodan/host/${encodeURIComponent(target)}?key=${encodeURIComponent(shodanApiKey)}`,
        { headers: { 'Accept': 'application/json' }, signal: controller.signal }
      )
    } finally {
      clearTimeout(timeout)
    }

    if (providerResponse.status === 404) {
      return json({
        success: true,
        target,
        source: 'Shodan Host API',
        observation_type: 'passive_internet_scan_observations',
        observed_at: new Date().toISOString(),
        message: 'Shodan has no host record for this IP. This does not mean its ports are closed.',
        observed_ports: [],
        ports_requested_filter: portFilter,
        scan_duration_ms: Date.now() - startedAt,
        risk_level: 'unknown',
        limitations: ['This is a passive lookup, not a live TCP or UDP scan.', 'Ports absent from Shodan data are unknown, not closed.']
      })
    }

    if (!providerResponse.ok) {
      return json({
        error: providerResponse.status === 401 || providerResponse.status === 403
          ? 'Shodan rejected the configured API credentials or access level.'
          : `Shodan lookup failed with HTTP ${providerResponse.status}. No port states were inferred.`,
        code: 'SHODAN_LOOKUP_FAILED'
      }, 502)
    }

    const host = await providerResponse.json() as ShodanHostResponse
    const observedPorts = Array.isArray(host.ports) ? host.ports : []
    const filteredPorts = portFilter.length ? observedPorts.filter(port => portFilter.includes(port)) : observedPorts
    const observations = filteredPorts.map(port => {
      const service = host.data?.find(item => item.port === port)
      return {
        port,
        state: 'observed_open' as const,
        transport: service?.transport || 'unknown',
        service: service?.product || service?.version || 'unknown',
        banner: service?.banner?.slice(0, 200) || undefined
      }
    })

    const result = {
      target,
      source: 'Shodan Host API',
      observation_type: 'passive_internet_scan_observations',
      observed_at: new Date().toISOString(),
      observation_age: 'Shodan observations may be stale; verify with an authorized live assessment.',
      organization: host.org || null,
      country: host.country_name || null,
      city: host.city || null,
      observed_ports: observations,
      ports_requested_filter: portFilter,
      vulnerabilities_reported_by_shodan: host.vulns || [],
      scan_duration_ms: Date.now() - startedAt,
      risk_level: 'not_scored',
      limitations: [
        'This is a passive lookup of Shodan observations, not a live TCP or UDP port scan.',
        'Ports absent from Shodan data are unknown, not closed.',
        'Service banners and vulnerability associations may be outdated or inaccurate.',
        'No OS fingerprinting, stealth scanning, firewall evasion, or UDP probing is performed.'
      ]
    }

    const { data: stored, error: storeError } = await supabaseClient
      .from('network_traffic_analysis')
      .insert({
        user_id: user.id,
        analysis_name: `Shodan Host Exposure Lookup - ${target}`,
        traffic_data: result,
        risk_level: 'unknown',
        analysis_results: {
          observation_source: result.source,
          observed_ports: observations.length,
          ports: observations.map(item => item.port)
        }
      })
      .select('id')
      .single()
    if (storeError) throw storeError

    return json({ success: true, lookup_id: stored.id, ...result })
  } catch (error) {
    console.error('Shodan host lookup failed:', error)
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Shodan lookup timed out. No port states were inferred.'
      : 'Host exposure lookup failed. No port states were inferred.'
    return json({ error: message }, 502)
  }
})

function isPublicIPv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some(part => part > 255)) return false
  const [a, b, c] = octets

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && c === 0) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a === 255 && b === 255 && c === 255) return false
  return true
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
