import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebScanRequest {
  target_url: string;
  scan_depth: number;
  user_id: string;
}

interface WebVulnerability {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
  proof_of_concept?: string;
  remediation: string;
  owasp_category: string;
}

interface WebScanResult {
  target_url: string;
  vulnerabilities: WebVulnerability[];
  pages_scanned: number;
  forms_found: number;
  inputs_tested: number;
  cookies_analyzed: number;
  headers_checked: number;
  scan_duration: number;
  risk_score: number;
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

    const { target_url, scan_depth = 2, user_id }: WebScanRequest = await req.json()

    // Validate input
    if (!target_url || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate URL format
    try {
      new URL(target_url)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const startTime = Date.now()
    const vulnerabilities: WebVulnerability[] = []
    let pagesScanned = 0
    let formsFound = 0
    let inputsTested = 0
    let cookiesAnalyzed = 0
    let headersChecked = 0

    // Perform comprehensive web application security scan
    console.log(`Starting web application scan for: ${target_url}`)

    // 1. Basic HTTP Response Analysis
    const httpAnalysis = await analyzeHTTPResponse(target_url)
    vulnerabilities.push(...httpAnalysis.vulnerabilities)
    headersChecked = httpAnalysis.headers_checked
    cookiesAnalyzed = httpAnalysis.cookies_analyzed

    // 2. Security Headers Check
    const headerAnalysis = await analyzeSecurityHeaders(target_url)
    vulnerabilities.push(...headerAnalysis.vulnerabilities)

    // 3. SSL/TLS Configuration Check
    const sslAnalysis = await analyzeSSLConfiguration(target_url)
    vulnerabilities.push(...sslAnalysis.vulnerabilities)

    // 4. Content Analysis and Form Discovery
    const contentAnalysis = await analyzePageContent(target_url, scan_depth)
    vulnerabilities.push(...contentAnalysis.vulnerabilities)
    pagesScanned = contentAnalysis.pages_scanned
    formsFound = contentAnalysis.forms_found
    inputsTested = contentAnalysis.inputs_tested

    // 5. Common Vulnerability Checks
    const commonVulns = await checkCommonVulnerabilities(target_url)
    vulnerabilities.push(...commonVulns.vulnerabilities)

    // 6. Directory and File Enumeration
    const dirEnumeration = await performDirectoryEnumeration(target_url)
    vulnerabilities.push(...dirEnumeration.vulnerabilities)

    const scanDuration = Math.floor((Date.now() - startTime) / 1000)
    const riskScore = calculateWebRiskScore(vulnerabilities)

    const scanResult: WebScanResult = {
      target_url,
      vulnerabilities,
      pages_scanned: pagesScanned,
      forms_found: formsFound,
      inputs_tested: inputsTested,
      cookies_analyzed: cookiesAnalyzed,
      headers_checked: headersChecked,
      scan_duration: scanDuration,
      risk_score: riskScore
    }

    // Store scan results in database
    const { data: scanData, error: scanError } = await supabaseClient
      .from('vulnerability_scans')
      .insert({
        user_id,
        target_url,
        scan_type: 'web_application',
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: scanResult,
        vulnerabilities_found: vulnerabilities.length,
        risk_score: riskScore,
        scan_duration: scanDuration
      })
      .select()
      .single()

    if (scanError) {
      throw scanError
    }

    // Store individual vulnerabilities
    if (vulnerabilities.length > 0) {
      const vulnDetails = vulnerabilities.map(vuln => ({
        scan_id: scanData.id,
        vulnerability_type: vuln.type,
        severity: vuln.severity,
        description: vuln.description,
        location: vuln.location,
        proof_of_concept: vuln.proof_of_concept,
        remediation: vuln.remediation
      }))

      await supabaseClient
        .from('vulnerability_details')
        .insert(vulnDetails)
    }

    return new Response(
      JSON.stringify({
        success: true,
        scan_id: scanData.id,
        target_url,
        vulnerabilities_found: vulnerabilities.length,
        risk_score: riskScore,
        scan_duration: scanDuration,
        summary: {
          pages_scanned: pagesScanned,
          forms_found: formsFound,
          inputs_tested: inputsTested,
          critical: vulnerabilities.filter(v => v.severity === 'critical').length,
          high: vulnerabilities.filter(v => v.severity === 'high').length,
          medium: vulnerabilities.filter(v => v.severity === 'medium').length,
          low: vulnerabilities.filter(v => v.severity === 'low').length
        },
        vulnerabilities: vulnerabilities.slice(0, 10), // Return first 10 for preview
        recommendations: generateWebSecurityRecommendations(vulnerabilities)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Web scanner error:', error)
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

async function analyzeHTTPResponse(url: string): Promise<{ vulnerabilities: WebVulnerability[], headers_checked: number, cookies_analyzed: number }> {
  const vulnerabilities: WebVulnerability[] = []
  let headersChecked = 0
  let cookiesAnalyzed = 0

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebSecurityScanner/1.0)' }
    })

    // Count headers manually since size property doesn't exist on Headers
    let headerCount = 0;
    response.headers.forEach(() => headerCount++);
    headersChecked = headerCount;

    // Check for information disclosure in headers
    const serverHeader = response.headers.get('server')
    if (serverHeader && (serverHeader.includes('Apache/') || serverHeader.includes('nginx/') || serverHeader.includes('IIS/'))) {
      vulnerabilities.push({
        type: 'Information Disclosure',
        severity: 'low',
        description: 'Server version information disclosed in headers',
        location: 'HTTP Headers',
        proof_of_concept: `Server: ${serverHeader}`,
        remediation: 'Configure server to hide version information',
        owasp_category: 'A09:2021 – Security Logging and Monitoring Failures'
      })
    }

    // Check for X-Powered-By header
    const poweredBy = response.headers.get('x-powered-by')
    if (poweredBy) {
      vulnerabilities.push({
        type: 'Information Disclosure',
        severity: 'low',
        description: 'Technology stack information disclosed',
        location: 'HTTP Headers',
        proof_of_concept: `X-Powered-By: ${poweredBy}`,
        remediation: 'Remove or obfuscate X-Powered-By header',
        owasp_category: 'A09:2021 – Security Logging and Monitoring Failures'
      })
    }

    // Analyze cookies
    const setCookieHeaders = response.headers.getSetCookie?.() || []
    cookiesAnalyzed = setCookieHeaders.length

    setCookieHeaders.forEach(cookie => {
      if (!cookie.includes('Secure')) {
        vulnerabilities.push({
          type: 'Insecure Cookie',
          severity: 'medium',
          description: 'Cookie missing Secure flag',
          location: 'Set-Cookie Header',
          proof_of_concept: cookie,
          remediation: 'Add Secure flag to all cookies',
          owasp_category: 'A02:2021 – Cryptographic Failures'
        })
      }

      if (!cookie.includes('HttpOnly')) {
        vulnerabilities.push({
          type: 'Insecure Cookie',
          severity: 'medium',
          description: 'Cookie missing HttpOnly flag',
          location: 'Set-Cookie Header',
          proof_of_concept: cookie,
          remediation: 'Add HttpOnly flag to prevent XSS cookie theft',
          owasp_category: 'A03:2021 – Injection'
        })
      }

      if (!cookie.includes('SameSite')) {
        vulnerabilities.push({
          type: 'Insecure Cookie',
          severity: 'low',
          description: 'Cookie missing SameSite attribute',
          location: 'Set-Cookie Header',
          proof_of_concept: cookie,
          remediation: 'Add SameSite attribute to prevent CSRF attacks',
          owasp_category: 'A01:2021 – Broken Access Control'
        })
      }
    })

  } catch (error) {
    console.error('HTTP analysis error:', error)
  }

  return { vulnerabilities, headers_checked: headersChecked, cookies_analyzed: cookiesAnalyzed }
}

async function analyzeSecurityHeaders(url: string): Promise<{ vulnerabilities: WebVulnerability[] }> {
  const vulnerabilities: WebVulnerability[] = []

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebSecurityScanner/1.0)' }
    })

    // Check for missing security headers
    const securityHeaders = [
      { name: 'X-Frame-Options', severity: 'medium' as const, description: 'Missing X-Frame-Options header allows clickjacking attacks' },
      { name: 'X-Content-Type-Options', severity: 'low' as const, description: 'Missing X-Content-Type-Options header allows MIME sniffing' },
      { name: 'X-XSS-Protection', severity: 'low' as const, description: 'Missing X-XSS-Protection header' },
      { name: 'Strict-Transport-Security', severity: 'high' as const, description: 'Missing HSTS header allows protocol downgrade attacks' },
      { name: 'Content-Security-Policy', severity: 'high' as const, description: 'Missing CSP header allows XSS and data injection attacks' },
      { name: 'Referrer-Policy', severity: 'low' as const, description: 'Missing Referrer-Policy header may leak sensitive information' }
    ]

    securityHeaders.forEach(header => {
      if (!response.headers.get(header.name.toLowerCase())) {
        vulnerabilities.push({
          type: 'Missing Security Header',
          severity: header.severity,
          description: header.description,
          location: 'HTTP Response Headers',
          remediation: `Implement ${header.name} header with appropriate values`,
          owasp_category: 'A05:2021 – Security Misconfiguration'
        })
      }
    })

    // Check CSP if present
    const csp = response.headers.get('content-security-policy')
    if (csp) {
      if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) {
        vulnerabilities.push({
          type: 'Weak Content Security Policy',
          severity: 'medium',
          description: 'CSP contains unsafe directives',
          location: 'Content-Security-Policy Header',
          proof_of_concept: csp,
          remediation: 'Remove unsafe-inline and unsafe-eval from CSP',
          owasp_category: 'A03:2021 – Injection'
        })
      }
    }

  } catch (error) {
    console.error('Security headers analysis error:', error)
  }

  return { vulnerabilities }
}

async function analyzeSSLConfiguration(url: string): Promise<{ vulnerabilities: WebVulnerability[] }> {
  const vulnerabilities: WebVulnerability[] = []

  try {
    const urlObj = new URL(url)
    
    if (urlObj.protocol === 'http:') {
      vulnerabilities.push({
        type: 'Insecure Protocol',
        severity: 'high',
        description: 'Website uses HTTP instead of HTTPS',
        location: 'Protocol',
        proof_of_concept: `URL: ${url}`,
        remediation: 'Implement HTTPS with valid SSL certificate',
        owasp_category: 'A02:2021 – Cryptographic Failures'
      })
    }

  } catch (error) {
    console.error('SSL analysis error:', error)
  }

  return { vulnerabilities }
}

async function analyzePageContent(url: string, depth: number): Promise<{ vulnerabilities: WebVulnerability[], pages_scanned: number, forms_found: number, inputs_tested: number }> {
  const vulnerabilities: WebVulnerability[] = []
  let pagesScanned = 1
  let formsFound = 0
  let inputsTested = 0

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebSecurityScanner/1.0)' }
    })

    const content = await response.text()

    // Check for common XSS patterns in content
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ]

    xssPatterns.forEach(pattern => {
      const matches = content.match(pattern)
      if (matches && matches.length > 0) {
        vulnerabilities.push({
          type: 'Potential XSS',
          severity: 'medium',
          description: 'Potential Cross-Site Scripting vulnerability detected',
          location: 'Page Content',
          proof_of_concept: matches[0].substring(0, 100),
          remediation: 'Implement proper input validation and output encoding',
          owasp_category: 'A03:2021 – Injection'
        })
      }
    })

    // Analyze forms
    const formMatches = content.match(/<form[^>]*>.*?<\/form>/gis)
    if (formMatches) {
      formsFound = formMatches.length
      
      formMatches.forEach(form => {
        // Check for forms without CSRF protection
        if (!form.includes('csrf') && !form.includes('token')) {
          vulnerabilities.push({
            type: 'Missing CSRF Protection',
            severity: 'medium',
            description: 'Form lacks CSRF protection',
            location: 'HTML Form',
            proof_of_concept: form.substring(0, 200),
            remediation: 'Implement CSRF tokens in all forms',
            owasp_category: 'A01:2021 – Broken Access Control'
          })
        }

        // Count inputs
        const inputMatches = form.match(/<input[^>]*>/gi)
        if (inputMatches) {
          inputsTested += inputMatches.length
        }
      })
    }

    // Check for sensitive information disclosure
    const sensitivePatterns = [
      /password\s*[:=]\s*['"]\w+['"]/gi,
      /api[_-]?key\s*[:=]\s*['"]\w+['"]/gi,
      /secret\s*[:=]\s*['"]\w+['"]/gi,
      /token\s*[:=]\s*['"]\w+['"]/gi
    ]

    sensitivePatterns.forEach(pattern => {
      const matches = content.match(pattern)
      if (matches && matches.length > 0) {
        vulnerabilities.push({
          type: 'Information Disclosure',
          severity: 'high',
          description: 'Sensitive information exposed in page content',
          location: 'Page Content',
          proof_of_concept: matches[0],
          remediation: 'Remove sensitive information from client-side code',
          owasp_category: 'A09:2021 – Security Logging and Monitoring Failures'
        })
      }
    })

  } catch (error) {
    console.error('Content analysis error:', error)
  }

  return { vulnerabilities, pages_scanned: pagesScanned, forms_found: formsFound, inputs_tested: inputsTested }
}

async function checkCommonVulnerabilities(url: string): Promise<{ vulnerabilities: WebVulnerability[] }> {
  const vulnerabilities: WebVulnerability[] = []

  try {
    // Test for SQL injection in URL parameters
    const urlObj = new URL(url)
    if (urlObj.search) {
      const testPayload = "'"
      const testUrl = `${url}${url.includes('?') ? '&' : '?'}test=${testPayload}`
      
      try {
        const response = await fetch(testUrl)
        const content = await response.text()
        
        if (content.includes('SQL') || content.includes('mysql') || content.includes('ORA-') || content.includes('PostgreSQL')) {
          vulnerabilities.push({
            type: 'SQL Injection',
            severity: 'critical',
            description: 'Potential SQL injection vulnerability detected',
            location: 'URL Parameters',
            proof_of_concept: testUrl,
            remediation: 'Use parameterized queries and input validation',
            owasp_category: 'A03:2021 – Injection'
          })
        }
      } catch (error) {
        // Ignore fetch errors for this test
      }
    }

    // Test for directory traversal
    const traversalPaths = ['../../../etc/passwd', '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts']
    
    for (const path of traversalPaths) {
      try {
        const testUrl = `${url}${url.includes('?') ? '&' : '?'}file=${encodeURIComponent(path)}`
        const response = await fetch(testUrl)
        const content = await response.text()
        
        if (content.includes('root:') || content.includes('[drivers]')) {
          vulnerabilities.push({
            type: 'Directory Traversal',
            severity: 'high',
            description: 'Directory traversal vulnerability detected',
            location: 'File Parameter',
            proof_of_concept: testUrl,
            remediation: 'Implement proper input validation and file access controls',
            owasp_category: 'A01:2021 – Broken Access Control'
          })
          break
        }
      } catch (error) {
        // Ignore fetch errors for this test
      }
    }

  } catch (error) {
    console.error('Common vulnerabilities check error:', error)
  }

  return { vulnerabilities }
}

async function performDirectoryEnumeration(url: string): Promise<{ vulnerabilities: WebVulnerability[] }> {
  const vulnerabilities: WebVulnerability[] = []

  try {
    const urlObj = new URL(url)
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`
    
    // Common sensitive directories and files
    const sensitiveFiles = [
      '/admin',
      '/administrator',
      '/wp-admin',
      '/phpmyadmin',
      '/.git',
      '/.env',
      '/config.php',
      '/backup',
      '/test',
      '/debug'
    ]

    for (const file of sensitiveFiles) {
      try {
        const testUrl = `${baseUrl}${file}`
        const response = await fetch(testUrl, { method: 'HEAD' })
        
        if (response.status === 200 || response.status === 403) {
          vulnerabilities.push({
            type: 'Sensitive Directory/File Exposure',
            severity: response.status === 200 ? 'medium' : 'low',
            description: `Sensitive directory or file accessible: ${file}`,
            location: testUrl,
            proof_of_concept: `HTTP ${response.status} response for ${testUrl}`,
            remediation: 'Restrict access to sensitive directories and files',
            owasp_category: 'A05:2021 – Security Misconfiguration'
          })
        }
      } catch (error) {
        // Ignore fetch errors for this test
      }
    }

  } catch (error) {
    console.error('Directory enumeration error:', error)
  }

  return { vulnerabilities }
}

function calculateWebRiskScore(vulnerabilities: WebVulnerability[]): number {
  let score = 0
  
  vulnerabilities.forEach(vuln => {
    switch (vuln.severity) {
      case 'critical': score += 25; break
      case 'high': score += 15; break
      case 'medium': score += 8; break
      case 'low': score += 3; break
    }
  })
  
  return Math.min(score, 100)
}

function generateWebSecurityRecommendations(vulnerabilities: WebVulnerability[]): string[] {
  const recommendations: string[] = []
  const vulnTypes = new Set(vulnerabilities.map(v => v.type))
  
  if (vulnTypes.has('SQL Injection')) {
    recommendations.push('Implement parameterized queries and input validation to prevent SQL injection')
  }
  
  if (vulnTypes.has('Potential XSS')) {
    recommendations.push('Implement proper output encoding and Content Security Policy to prevent XSS')
  }
  
  if (vulnTypes.has('Missing Security Header')) {
    recommendations.push('Configure all recommended security headers (CSP, HSTS, X-Frame-Options, etc.)')
  }
  
  if (vulnTypes.has('Insecure Cookie')) {
    recommendations.push('Configure cookies with Secure, HttpOnly, and SameSite attributes')
  }
  
  if (vulnTypes.has('Missing CSRF Protection')) {
    recommendations.push('Implement CSRF tokens in all state-changing forms')
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Continue monitoring for new vulnerabilities and keep security measures up to date')
  }
  
  return recommendations
}

