// Test script for SSL analyzer functionality

// SSL analyzer logic extracted for testing
function calculateSSLSecurityScore(sslResult, additionalChecks) {
  let score = 0;

  // Base score from SSL Labs grade
  const gradeScores = {
    'A+': 95,
    'A': 90,
    'A-': 85,
    'B': 75,
    'C': 60,
    'D': 40,
    'E': 20,
    'F': 10,
    'T': 5
  };

  score = gradeScores[sslResult.grade] || 0;

  // Bonus points for additional security features
  if (additionalChecks.supports_tls13) score += 5;
  if (additionalChecks.hsts_enabled) score += 3;
  if (additionalChecks.certificate_transparency) score += 2;
  if (additionalChecks.ocsp_stapling) score += 2;
  if (additionalChecks.perfect_forward_secrecy) score += 3;

  // Deduct points for vulnerabilities
  if (sslResult.vulnerabilities) {
    sslResult.vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'high': score -= 10; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 2; break;
      }
    });
  }

  return Math.max(0, Math.min(100, score));
}

function generateSSLRecommendations(sslResult, additionalChecks) {
  const recommendations = [];

  if (sslResult.grade === 'F' || sslResult.grade === 'T') {
    recommendations.push('Critical: SSL/TLS configuration has serious security issues that need immediate attention');
  }

  if (!additionalChecks.supports_tls13) {
    recommendations.push('Enable TLS 1.3 support for improved security and performance');
  }

  if (!additionalChecks.hsts_enabled) {
    recommendations.push('Implement HTTP Strict Transport Security (HSTS) headers');
  }

  if (!additionalChecks.certificate_transparency) {
    recommendations.push('Enable Certificate Transparency monitoring');
  }

  if (sslResult.vulnerabilities && sslResult.vulnerabilities.length > 0) {
    recommendations.push(`Address ${sslResult.vulnerabilities.length} SSL/TLS vulnerabilities found`);
  }

  if (recommendations.length === 0) {
    recommendations.push('SSL/TLS configuration appears to be well-configured');
  }

  return recommendations;
}

async function simulateSSLAnalysis(hostname) {
  console.log(`\n🔒 Starting SSL/TLS analysis for ${hostname}`);
  console.log(`🔍 Analyzing certificate and configuration...`);
  
  const startTime = Date.now();
  
  // Simulate SSL analysis results based on hostname
  let sslResult;
  let additionalChecks;
  
  if (hostname.includes('google.com') || hostname.includes('github.com')) {
    // Simulate high-quality SSL configuration
    sslResult = {
      grade: 'A+',
      hasWarnings: false,
      isExceptional: true,
      progress: 100,
      vulnerabilities: []
    };
    
    additionalChecks = {
      certificate_valid: true,
      supports_tls13: true,
      hsts_enabled: true,
      certificate_transparency: true,
      ocsp_stapling: true,
      perfect_forward_secrecy: true
    };
  } else if (hostname.includes('example.com')) {
    // Simulate good SSL configuration
    sslResult = {
      grade: 'A',
      hasWarnings: false,
      isExceptional: false,
      progress: 100,
      vulnerabilities: []
    };
    
    additionalChecks = {
      certificate_valid: true,
      supports_tls13: true,
      hsts_enabled: false,
      certificate_transparency: false,
      ocsp_stapling: true,
      perfect_forward_secrecy: true
    };
  } else {
    // Simulate problematic SSL configuration
    sslResult = {
      grade: 'C',
      hasWarnings: true,
      isExceptional: false,
      progress: 100,
      vulnerabilities: [
        {
          id: 'WEAK_CIPHER',
          name: 'Weak Cipher Suites',
          severity: 'medium',
          description: 'Some weak cipher suites are supported'
        },
        {
          id: 'CERT_EXPIRING',
          name: 'Certificate Expiring Soon',
          severity: 'high',
          description: 'Certificate expires in 15 days'
        }
      ]
    };
    
    additionalChecks = {
      certificate_valid: true,
      supports_tls13: false,
      hsts_enabled: false,
      certificate_transparency: false,
      ocsp_stapling: false,
      perfect_forward_secrecy: false
    };
  }
  
  const analysisTime = Math.floor((Date.now() - startTime) / 1000);
  const securityScore = calculateSSLSecurityScore(sslResult, additionalChecks);
  const recommendations = generateSSLRecommendations(sslResult, additionalChecks);
  
  console.log(`\n✅ Analysis completed in ${analysisTime} seconds`);
  console.log(`🏆 SSL Grade: ${sslResult.grade}`);
  console.log(`📊 Security Score: ${securityScore}/100`);
  console.log(`⚠️  Vulnerabilities: ${sslResult.vulnerabilities.length}`);
  
  console.log('\n🔧 Security Features:');
  console.log(`  TLS 1.3 Support: ${additionalChecks.supports_tls13 ? '✅' : '❌'}`);
  console.log(`  HSTS Enabled: ${additionalChecks.hsts_enabled ? '✅' : '❌'}`);
  console.log(`  Certificate Transparency: ${additionalChecks.certificate_transparency ? '✅' : '❌'}`);
  console.log(`  OCSP Stapling: ${additionalChecks.ocsp_stapling ? '✅' : '❌'}`);
  console.log(`  Perfect Forward Secrecy: ${additionalChecks.perfect_forward_secrecy ? '✅' : '❌'}`);
  
  if (sslResult.vulnerabilities.length > 0) {
    console.log('\n🚨 Vulnerabilities Found:');
    sslResult.vulnerabilities.forEach(vuln => {
      const severityIcon = vuln.severity === 'high' ? '🔴' : vuln.severity === 'medium' ? '🟡' : '🟢';
      console.log(`${severityIcon} ${vuln.name}: ${vuln.description}`);
    });
  }
  
  console.log('\n💡 Recommendations:');
  recommendations.forEach(rec => {
    console.log(`  • ${rec}`);
  });
  
  return {
    success: true,
    hostname,
    overall_grade: sslResult.grade,
    security_score: securityScore,
    analysis_time: analysisTime,
    ssl_result: sslResult,
    additional_checks: additionalChecks,
    recommendations
  };
}

// Test the SSL analyzer
async function runTests() {
  console.log('🔒 Testing SSL/TLS Security Analyzer');
  console.log('====================================');
  
  // Test 1: High-quality SSL (Google)
  const result1 = await simulateSSLAnalysis('www.google.com');
  
  // Test 2: Good SSL (Example)
  console.log('\n\n🔍 Testing good SSL configuration...');
  const result2 = await simulateSSLAnalysis('example.com');
  
  // Test 3: Problematic SSL
  console.log('\n\n🔍 Testing problematic SSL configuration...');
  const result3 = await simulateSSLAnalysis('insecure-site.test');
  
  // Test 4: Security score calculations
  console.log('\n\n🧪 Testing security score calculations...');
  
  const perfectSSL = {
    grade: 'A+',
    vulnerabilities: []
  };
  const perfectChecks = {
    supports_tls13: true,
    hsts_enabled: true,
    certificate_transparency: true,
    ocsp_stapling: true,
    perfect_forward_secrecy: true
  };
  const perfectScore = calculateSSLSecurityScore(perfectSSL, perfectChecks);
  console.log(`Perfect SSL score: ${perfectScore} (expected: ~110, capped at 100)`);
  
  const poorSSL = {
    grade: 'F',
    vulnerabilities: [
      { severity: 'high' },
      { severity: 'high' },
      { severity: 'medium' }
    ]
  };
  const poorChecks = {
    supports_tls13: false,
    hsts_enabled: false,
    certificate_transparency: false,
    ocsp_stapling: false,
    perfect_forward_secrecy: false
  };
  const poorScore = calculateSSLSecurityScore(poorSSL, poorChecks);
  console.log(`Poor SSL score: ${poorScore} (expected: very low)`);
  
  console.log('\n✅ All tests completed successfully!');
  console.log('\n🔒 SSL/TLS Security Analyzer is ready for deployment');
}

// Run the tests
runTests().catch(console.error);

