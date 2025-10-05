import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SSLAnalysisRequest {
  hostname: string;
  user_id: string;
}

interface SSLResult {
  grade: string;
  hasWarnings: boolean;
  isExceptional: boolean;
  progress: number;
  endpoints: SSLEndpoint[];
  certificates: SSLCertificate[];
  protocols: SSLProtocol[];
  suites: SSLSuite[];
  serverSignature: string;
  prefixDelegation: boolean;
  nonPrefixDelegation: boolean;
  vulnerabilities: SSLVulnerability[];
}

interface SSLEndpoint {
  ipAddress: string;
  serverName: string;
  statusMessage: string;
  grade: string;
  gradeTrustIgnored: string;
  hasWarnings: boolean;
  isExceptional: boolean;
  progress: number;
  duration: number;
  eta: number;
}

interface SSLCertificate {
  subject: string;
  commonNames: string[];
  altNames: string[];
  notBefore: number;
  notAfter: number;
  issuerSubject: string;
  sigAlg: string;
  issuerLabel: string;
  revocationInfo: number;
  crlURIs: string[];
  ocspURIs: string[];
  keyAlg: string;
  keySize: number;
  keyStrength: number;
  keyKnownDebianInsecure: boolean;
  raw: string;
}

interface SSLProtocol {
  id: number;
  name: string;
  version: string;
  v2SuitesDisabled: boolean;
  errorMessage: string;
}

interface SSLSuite {
  id: number;
  name: string;
  cipherStrength: number;
  dhStrength: number;
  dhP: number;
  dhG: number;
  dhYs: number;
  ecdhBits: number;
  ecdhStrength: number;
}

interface SSLVulnerability {
  id: string;
  name: string;
  severity: string;
  description: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { hostname, user_id }: SSLAnalysisRequest = await req.json()

    // Validate input
    if (!hostname || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const startTime = Date.now()

    // Use Qualys SSL Labs API for comprehensive SSL analysis
    const sslResult = await performSSLAnalysis(hostname)
    
    // Perform additional SSL checks
    const additionalChecks = await performAdditionalSSLChecks(hostname)
    
    const analysisTime = Math.floor((Date.now() - startTime) / 1000)

    // Calculate overall security score
    const securityScore = calculateSSLSecurityScore(sslResult, additionalChecks)

    // Store analysis results in database
    const { data: analysisData, error: analysisError } = await supabaseClient
      .from('ai_security_analysis')
      .insert({
        user_id,
        analysis_type: 'ssl_analysis',
        input_data: {
          hostname,
          timestamp: new Date().toISOString()
        },
        results: {
          ssl_labs_result: sslResult,
          additional_checks: additionalChecks,
          security_score: securityScore,
          analysis_duration: analysisTime,
          summary: {
            overall_grade: sslResult.grade,
            has_warnings: sslResult.hasWarnings,
            certificate_valid: additionalChecks.certificate_valid,
            supports_tls13: additionalChecks.supports_tls13,
            hsts_enabled: additionalChecks.hsts_enabled,
            vulnerabilities_found: sslResult.vulnerabilities?.length || 0
          }
        },
        confidence_score: securityScore / 100,
        processing_time: analysisTime * 1000
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
        hostname,
        overall_grade: sslResult.grade,
        security_score: securityScore,
        analysis_time: analysisTime,
        ssl_result: sslResult,
        additional_checks: additionalChecks,
        recommendations: generateSSLRecommendations(sslResult, additionalChecks)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('SSL analyzer error:', error)
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

async function performSSLAnalysis(hostname: string): Promise<SSLResult> {
  try {
    // Start SSL Labs analysis
    const startResponse = await fetch(`https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(hostname)}&startNew=on&all=done`)
    
    if (!startResponse.ok) {
      throw new Error('Failed to start SSL Labs analysis')
    }

    let analysisData = await startResponse.json()

    // Poll for results (SSL Labs analysis can take time)
    let attempts = 0
    const maxAttempts = 30 // Maximum 5 minutes (30 * 10 seconds)

    while (analysisData.status !== 'READY' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
      
      const pollResponse = await fetch(`https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(hostname)}&all=done`)
      if (pollResponse.ok) {
        analysisData = await pollResponse.json()
      }
      
      attempts++
    }

    // Process SSL Labs results
    const vulnerabilities: SSLVulnerability[] = []
    
    if (analysisData.endpoints && analysisData.endpoints.length > 0) {
      const endpoint = analysisData.endpoints[0]
      
      // Check for common SSL vulnerabilities
      if (endpoint.details) {
        const details = endpoint.details
        
        // Check for weak protocols
        if (details.protocols) {
          details.protocols.forEach((protocol: any) => {
            if (protocol.name === 'SSL' || (protocol.name === 'TLS' && protocol.version === '1.0')) {
              vulnerabilities.push({
                id: 'WEAK_PROTOCOL',
                name: 'Weak Protocol Support',
                severity: 'medium',
                description: `Supports weak protocol: ${protocol.name} ${protocol.version}`
              })
            }
          })
        }

        // Check for weak cipher suites
        if (details.suites && details.suites.list) {
          const weakCiphers = details.suites.list.filter((suite: any) => 
            suite.cipherStrength < 128 || suite.name.includes('RC4') || suite.name.includes('DES')
          )
          
          if (weakCiphers.length > 0) {
            vulnerabilities.push({
              id: 'WEAK_CIPHER',
              name: 'Weak Cipher Suites',
              severity: 'high',
              description: `${weakCiphers.length} weak cipher suites detected`
            })
          }
        }

        // Check certificate issues
        if (details.cert) {
          const cert = details.cert
          const now = Date.now()
          const notAfter = cert.notAfter * 1000
          const daysUntilExpiry = Math.floor((notAfter - now) / (1000 * 60 * 60 * 24))
          
          if (daysUntilExpiry < 30) {
            vulnerabilities.push({
              id: 'CERT_EXPIRING',
              name: 'Certificate Expiring Soon',
              severity: daysUntilExpiry < 7 ? 'high' : 'medium',
              description: `Certificate expires in ${daysUntilExpiry} days`
            })
          }
        }
      }
    }

    return {
      grade: analysisData.endpoints?.[0]?.grade || 'T',
      hasWarnings: analysisData.endpoints?.[0]?.hasWarnings || false,
      isExceptional: analysisData.endpoints?.[0]?.isExceptional || false,
      progress: analysisData.endpoints?.[0]?.progress || 100,
      endpoints: analysisData.endpoints || [],
      certificates: analysisData.certs || [],
      protocols: analysisData.endpoints?.[0]?.details?.protocols || [],
      suites: analysisData.endpoints?.[0]?.details?.suites?.list || [],
      serverSignature: analysisData.endpoints?.[0]?.serverSignature || '',
      prefixDelegation: analysisData.endpoints?.[0]?.prefixDelegation || false,
      nonPrefixDelegation: analysisData.endpoints?.[0]?.nonPrefixDelegation || false,
      vulnerabilities
    }

  } catch (error) {
    console.error('SSL Labs API error:', error)
    
    // Return basic analysis if SSL Labs fails
    return {
      grade: 'T',
      hasWarnings: true,
      isExceptional: false,
      progress: 100,
      endpoints: [],
      certificates: [],
      protocols: [],
      suites: [],
      serverSignature: 'Analysis failed',
      prefixDelegation: false,
      nonPrefixDelegation: false,
      vulnerabilities: [{
        id: 'ANALYSIS_FAILED',
        name: 'Analysis Failed',
        severity: 'high',
        description: 'SSL Labs analysis could not be completed'
      }]
    }
  }
}

async function performAdditionalSSLChecks(hostname: string): Promise<any> {
  const checks = {
    certificate_valid: false,
    supports_tls13: false,
    hsts_enabled: false,
    certificate_transparency: false,
    ocsp_stapling: false,
    perfect_forward_secrecy: false,
    certificate_chain_valid: false
  }

  try {
    // Check HTTPS availability and headers
    const response = await fetch(`https://${hostname}`, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SSLAnalyzer/1.0)' }
    })

    if (response.ok) {
      checks.certificate_valid = true
      
      // Check for HSTS header
      const hstsHeader = response.headers.get('strict-transport-security')
      checks.hsts_enabled = !!hstsHeader
      
      // Check for other security headers that indicate good SSL practices
      const expectCTHeader = response.headers.get('expect-ct')
      checks.certificate_transparency = !!expectCTHeader
    }

  } catch (error) {
    console.error('Additional SSL checks error:', error)
  }

  return checks
}

function calculateSSLSecurityScore(sslResult: SSLResult, additionalChecks: any): number {
  let score = 0

  // Base score from SSL Labs grade
  const gradeScores: { [key: string]: number } = {
    'A+': 95,
    'A': 90,
    'A-': 85,
    'B': 75,
    'C': 60,
    'D': 40,
    'E': 20,
    'F': 10,
    'T': 5
  }

  score = gradeScores[sslResult.grade] || 0

  // Bonus points for additional security features
  if (additionalChecks.supports_tls13) score += 5
  if (additionalChecks.hsts_enabled) score += 3
  if (additionalChecks.certificate_transparency) score += 2
  if (additionalChecks.ocsp_stapling) score += 2
  if (additionalChecks.perfect_forward_secrecy) score += 3

  // Deduct points for vulnerabilities
  if (sslResult.vulnerabilities) {
    sslResult.vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'high': score -= 10; break
        case 'medium': score -= 5; break
        case 'low': score -= 2; break
      }
    })
  }

  return Math.max(0, Math.min(100, score))
}

function generateSSLRecommendations(sslResult: SSLResult, additionalChecks: any): string[] {
  const recommendations: string[] = []

  if (sslResult.grade === 'F' || sslResult.grade === 'T') {
    recommendations.push('Critical: SSL/TLS configuration has serious security issues that need immediate attention')
  }

  if (!additionalChecks.supports_tls13) {
    recommendations.push('Enable TLS 1.3 support for improved security and performance')
  }

  if (!additionalChecks.hsts_enabled) {
    recommendations.push('Implement HTTP Strict Transport Security (HSTS) headers')
  }

  if (!additionalChecks.certificate_transparency) {
    recommendations.push('Enable Certificate Transparency monitoring')
  }

  if (sslResult.vulnerabilities && sslResult.vulnerabilities.length > 0) {
    recommendations.push(`Address ${sslResult.vulnerabilities.length} SSL/TLS vulnerabilities found`)
  }

  if (recommendations.length === 0) {
    recommendations.push('SSL/TLS configuration appears to be well-configured')
  }

  return recommendations
}

