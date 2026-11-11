import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DNSAnalysisRequest {
  domain: string;
}

interface DNSRecord {
  type: string;
  name: string;
  value: string;
  ttl?: number;
}

interface DNSVulnerability {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
  proof_of_concept?: string;
  remediation: string;
}

interface DNSAnalysisResult {
  domain: string;
  dns_records: DNSRecord[];
  vulnerabilities: DNSVulnerability[];
  security_features: {
    ds_record_present: boolean;
    spf_configured: boolean;
    default_dkim_selector_found: boolean;
    dmarc_configured: boolean;
    caa_configured: boolean;
  };
  nameservers: string[];
  analysis_duration: number;
  risk_score: number;
  coverage_limitations: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { domain }: DNSAnalysisRequest = await req.json()
    const normalizedDomain = typeof domain === 'string'
      ? domain.trim().toLowerCase().replace(/\.$/, '')
      : ''
    const domainRegex = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
    if (!domainRegex.test(normalizedDomain)) {
      return new Response(JSON.stringify({ error: 'Enter a valid public domain name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const domainName = normalizedDomain
    const user_id = user.id
    const startTime = Date.now()
    const vulnerabilities: DNSVulnerability[] = []
    const dnsRecords: DNSRecord[] = []
    let nameservers: string[] = []

    console.log(`Starting DNS configuration review for: ${domainName}`)

    // 1. DNS Record Enumeration
    const recordTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA']
    
    for (const recordType of recordTypes) {
      const records = await queryDNSRecords(domainName, recordType)
      dnsRecords.push(...records)

      if (recordType === 'NS') {
        nameservers = records.map(r => r.value)
      }
    }

    // 2. Security Features Analysis
    const securityFeatures = await analyzeSecurityFeatures(domainName, dnsRecords)

    // 3. Observe DS record presence (not a full DNSSEC validation)
    const dnssecAnalysis = await analyzeDNSSEC(domainName)
    vulnerabilities.push(...dnssecAnalysis.vulnerabilities)

    // 4. Email Security Analysis
    const emailSecurityAnalysis = await analyzeEmailSecurity(domainName, dnsRecords)
    vulnerabilities.push(...emailSecurityAnalysis.vulnerabilities)

    // 5. DNS Configuration Security
    const configAnalysis = await analyzeDNSConfiguration(domainName, dnsRecords, nameservers)
    vulnerabilities.push(...configAnalysis.vulnerabilities)

    const coverageLimitations = [
      'DNS zone transfers (AXFR) are not tested by this analyzer.',
      'DNS cache-poisoning resistance is not tested by this analyzer.',
      'DKIM lookup checks only the default._domainkey selector; other provider-specific selectors may exist.',
      'DNSSEC status is inferred from the presence of a DS record; this is not a full DNSSEC validation.'
    ]

    const analysisDuration = Math.floor((Date.now() - startTime) / 1000)
    const riskScore = calculateDNSRiskScore(vulnerabilities, securityFeatures)

    const analysisResult: DNSAnalysisResult = {
      domain: domainName,
      dns_records: dnsRecords,
      vulnerabilities,
      security_features: securityFeatures,
      coverage_limitations: coverageLimitations,
      nameservers,
      analysis_duration: analysisDuration,
      risk_score: riskScore
    }

    // Store analysis results in database
    const { data: analysisData, error: analysisError } = await supabaseClient
      .from('ai_security_analysis')
      .insert({
        user_id,
        analysis_type: 'dns_security',
        input_data: {
          domain: domainName,
          timestamp: new Date().toISOString()
        },
        results: analysisResult,
        processing_time: analysisDuration * 1000
      })
      .select()
      .single()

    if (analysisError) {
      throw analysisError
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysisData.id,
        domain: domainName,
        vulnerabilities_found: vulnerabilities.length,
        risk_score: riskScore,
        analysis_duration: analysisDuration,
        dns_records: dnsRecords.length,
        security_features: securityFeatures,
        coverage_limitations: coverageLimitations,
        nameservers: nameservers.length,
        summary: {
          critical: vulnerabilities.filter(v => v.severity === 'critical').length,
          high: vulnerabilities.filter(v => v.severity === 'high').length,
          medium: vulnerabilities.filter(v => v.severity === 'medium').length,
          low: vulnerabilities.filter(v => v.severity === 'low').length
        },
        vulnerabilities: vulnerabilities.slice(0, 10), // Return first 10 for preview
        recommendations: generateDNSRecommendations(vulnerabilities, securityFeatures)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('DNS analyzer error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function queryDNSRecords(domain: string, recordType: string): Promise<DNSRecord[]> {
  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(recordType)}`
  const response = await fetch(dohUrl, {
    headers: { 'Accept': 'application/dns-json' }
  })

  if (!response.ok) {
    throw new Error(`DNS provider returned HTTP ${response.status} for ${recordType} query`)
  }

  const data = await response.json()
  if (data.Status !== undefined && data.Status !== 0 && data.Status !== 3) {
    throw new Error(`DNS provider returned status ${data.Status} for ${recordType} query`)
  }

  return Array.isArray(data.Answer)
    ? data.Answer.map((answer: any) => ({
        type: recordType,
        name: answer.name,
        value: answer.data,
        ttl: answer.TTL
      }))
    : []
}

async function analyzeSecurityFeatures(domain: string, dnsRecords: DNSRecord[]): Promise<any> {
  const features = {
    ds_record_present: false,
    spf_configured: false,
    default_dkim_selector_found: false,
    dmarc_configured: false,
    caa_configured: false
  }

  const txtRecords = dnsRecords.filter(r => r.type === 'TXT')
  features.spf_configured = txtRecords.some(r => r.value.includes('v=spf1'))

  const dmarcRecords = await queryDNSRecords(`_dmarc.${domain}`, 'TXT')
  features.dmarc_configured = dmarcRecords.some(r => r.value.includes('v=DMARC1'))

  const dkimRecords = await queryDNSRecords(`default._domainkey.${domain}`, 'TXT')
  features.default_dkim_selector_found = dkimRecords.length > 0

  const caaRecords = dnsRecords.filter(r => r.type === 'CAA')
  features.caa_configured = caaRecords.length > 0

  const dsRecords = await queryDNSRecords(domain, 'DS')
  features.ds_record_present = dsRecords.length > 0

  return features
}

async function analyzeDNSSEC(domain: string): Promise<{ vulnerabilities: DNSVulnerability[] }> {
  const vulnerabilities: DNSVulnerability[] = []
  const dsRecords = await queryDNSRecords(domain, 'DS')

  if (dsRecords.length === 0) {
    vulnerabilities.push({
      type: 'No DS Record Observed',
      severity: 'medium',
      description: 'No DS record was returned for this domain. Confirm DNSSEC delegation with the registrar; this lookup is not a complete DNSSEC validation.',
      location: 'DNS Configuration',
      remediation: 'Verify DNSSEC signing and DS delegation with the DNS provider and domain registrar.',
    })
  }

  return { vulnerabilities }
}

async function analyzeEmailSecurity(domain: string, dnsRecords: DNSRecord[]): Promise<{ vulnerabilities: DNSVulnerability[] }> {
  const vulnerabilities: DNSVulnerability[] = []
  const txtRecords = dnsRecords.filter(r => r.type === 'TXT')
  const spfRecords = txtRecords.filter(r => r.value.includes('v=spf1'))

  if (spfRecords.length === 0) {
    vulnerabilities.push({
      type: 'Missing SPF Record',
      severity: 'medium',
      description: 'Domain lacks SPF record for email authentication',
      location: 'TXT Records',
      remediation: 'Configure SPF record to prevent email spoofing',
    })
  } else if (spfRecords.length > 1) {
    vulnerabilities.push({
      type: 'Multiple SPF Records',
      severity: 'high',
      description: 'Multiple SPF records found, which can cause authentication failures',
      location: 'TXT Records',
      proof_of_concept: spfRecords.map(r => r.value).join(', '),
      remediation: 'Consolidate into a single SPF record',
    })
  } else {
    const spfRecord = spfRecords[0].value
    if (spfRecord.includes('+all')) {
      vulnerabilities.push({
        type: 'Weak SPF Policy',
        severity: 'high',
        description: 'SPF record uses +all which allows any server to send email',
        location: 'SPF Record',
        proof_of_concept: spfRecord,
        remediation: 'Change +all to ~all or -all for stricter policy',
      })
    }
  }

  const dmarcRecords = await queryDNSRecords(`_dmarc.${domain}`, 'TXT')
  if (dmarcRecords.length === 0) {
    vulnerabilities.push({
      type: 'Missing DMARC Record',
      severity: 'medium',
      description: 'Domain lacks DMARC record for email policy enforcement',
      location: '_dmarc subdomain',
      remediation: 'Configure DMARC record to enforce email authentication policies',
    })
  } else {
    const dmarcRecord = dmarcRecords[0].value
    if (dmarcRecord.includes('p=none')) {
      vulnerabilities.push({
        type: 'Weak DMARC Policy',
        severity: 'low',
        description: 'DMARC policy is set to none, providing no protection',
        location: 'DMARC Record',
        proof_of_concept: dmarcRecord,
        remediation: 'Strengthen DMARC policy to quarantine or reject',
      })
    }
  }

  return { vulnerabilities }
}

async function analyzeDNSConfiguration(domain: string, dnsRecords: DNSRecord[], nameservers: string[]): Promise<{ vulnerabilities: DNSVulnerability[] }> {
  const vulnerabilities: DNSVulnerability[] = []

  // Check for wildcard DNS records
  const wildcardRecords = dnsRecords.filter(r => r.name.includes('*'))
  if (wildcardRecords.length > 0) {
    vulnerabilities.push({
      type: 'Wildcard DNS Records',
      severity: 'low',
      description: 'Wildcard DNS records detected, which may expose internal structure',
      location: 'DNS Records',
      proof_of_concept: wildcardRecords.map(r => `${r.name} -> ${r.value}`).join(', '),
      remediation: 'Review wildcard records and remove if unnecessary',
    })
  }

  // Check for excessive TTL values
  const highTTLRecords = dnsRecords.filter(r => r.ttl && r.ttl > 86400) // > 24 hours
  if (highTTLRecords.length > 0) {
    vulnerabilities.push({
      type: 'High TTL Values',
      severity: 'low',
      description: 'Some DNS records have very high TTL values',
      location: 'DNS Records',
      remediation: 'Consider reducing TTL values for faster updates during incidents',
    })
  }

  // Check nameserver diversity
  if (nameservers.length < 2) {
    vulnerabilities.push({
      type: 'Insufficient Nameserver Redundancy',
      severity: 'medium',
      description: 'Domain has insufficient nameserver redundancy',
      location: 'NS Records',
      remediation: 'Configure at least 2 nameservers for redundancy',
    })
  }

  return { vulnerabilities }
}

function calculateDNSRiskScore(vulnerabilities: DNSVulnerability[], securityFeatures: any): number {
  let score = 0
  
  // Add points for vulnerabilities
  vulnerabilities.forEach(vuln => {
    switch (vuln.severity) {
      case 'critical': score += 25; break
      case 'high': score += 15; break
      case 'medium': score += 8; break
      case 'low': score += 3; break
    }
  })
  
  // Deduct points for security features
  if (securityFeatures.ds_record_present) score -= 5
  if (securityFeatures.spf_configured) score -= 3
  if (securityFeatures.dmarc_configured) score -= 3
  if (securityFeatures.default_dkim_selector_found) score -= 2
  if (securityFeatures.caa_configured) score -= 2
  
  return Math.max(0, Math.min(100, score))
}

function generateDNSRecommendations(vulnerabilities: DNSVulnerability[], securityFeatures: any): string[] {
  const recommendations: string[] = []
  
  if (!securityFeatures.ds_record_present) {
    recommendations.push('No DS record was observed. Verify DNSSEC signing and DS delegation with your DNS provider and registrar.')
  }
  
  if (!securityFeatures.spf_configured) {
    recommendations.push('Configure SPF records to prevent email spoofing')
  }
  
  if (!securityFeatures.dmarc_configured) {
    recommendations.push('Implement DMARC policy for email authentication enforcement')
  }
  
  if (!securityFeatures.default_dkim_selector_found) {
    recommendations.push('No TXT record was found at default._domainkey. Check the DKIM selector configured by your email provider; this analyzer checks only the default selector.')
  }
  
  if (!securityFeatures.caa_configured) {
    recommendations.push('Configure CAA records to control certificate issuance')
  }
  
  const vulnTypes = new Set(vulnerabilities.map(v => v.type))
  
  if (vulnTypes.has('Multiple SPF Records')) {
    recommendations.push('Consolidate multiple SPF records into a single record')
  }
  
  if (recommendations.length === 0) {
    recommendations.push('No issues were detected by the checks completed. Review the coverage limitations before treating this as a full DNS security assessment.')
  }
  
  return recommendations
}

