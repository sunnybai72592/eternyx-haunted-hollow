// Comprehensive Security Service for ETERNYX
// Provides advanced security monitoring, threat detection, and protection

interface SecurityEvent {
  id: string;
  type: 'authentication' | 'authorization' | 'data_access' | 'suspicious_activity' | 'attack_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  userId?: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, any>;
  blocked: boolean;
  resolved: boolean;
}

interface ThreatIntelligence {
  ipAddress: string;
  riskScore: number;
  threatTypes: string[];
  lastSeen: number;
  country: string;
  isp: string;
  isVPN: boolean;
  isTor: boolean;
  isProxy: boolean;
}

interface SecurityPolicy {
  name: string;
  enabled: boolean;
  rules: Array<{
    condition: string;
    action: 'allow' | 'block' | 'monitor' | 'challenge';
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

interface SecurityMetrics {
  totalEvents: number;
  blockedRequests: number;
  suspiciousActivities: number;
  authenticatedUsers: number;
  failedLogins: number;
  threatsByType: Record<string, number>;
  topThreats: Array<{ type: string; count: number }>;
  riskScore: number;
}

export class SecurityService {
  private events: SecurityEvent[] = [];
  private threatIntelligence = new Map<string, ThreatIntelligence>();
  private blockedIPs = new Set<string>();
  private rateLimits = new Map<string, { count: number; resetTime: number }>();
  private securityPolicies: SecurityPolicy[] = [];
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeSecurityPolicies();
    this.startSecurityMonitoring();
  }

  // Initialize default security policies
  private initializeSecurityPolicies() {
    this.securityPolicies = [
      {
        name: 'Rate Limiting',
        enabled: true,
        rules: [
          {
            condition: 'requests_per_minute > 60',
            action: 'block',
            severity: 'medium'
          }
        ]
      },
      {
        name: 'SQL Injection Detection',
        enabled: true,
        rules: [
          {
            condition: 'contains_sql_patterns',
            action: 'block',
            severity: 'high'
          }
        ]
      },
      {
        name: 'XSS Protection',
        enabled: true,
        rules: [
          {
            condition: 'contains_script_tags',
            action: 'block',
            severity: 'high'
          }
        ]
      },
      {
        name: 'Brute Force Protection',
        enabled: true,
        rules: [
          {
            condition: 'failed_logins > 5',
            action: 'block',
            severity: 'high'
          }
        ]
      }
    ];
  }

  // Log security events
  logSecurityEvent(
    type: SecurityEvent['type'],
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    userId?: string
  ): string {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      type,
      severity,
      timestamp: Date.now(),
      userId,
      sessionId: this.sessionId,
      ipAddress: this.getCurrentIP(),
      userAgent: navigator.userAgent,
      details,
      blocked: false,
      resolved: false
    };

    this.events.push(event);
    this.processSecurityEvent(event);
    
    return event.id;
  }

  // Process security events in real-time
  private processSecurityEvent(event: SecurityEvent) {
    // Check against security policies
    this.evaluateSecurityPolicies(event);
    
    // Update threat intelligence
    this.updateThreatIntelligence(event);
    
    // Send alerts for high severity events
    if (event.severity === 'high' || event.severity === 'critical') {
      this.sendSecurityAlert(event);
    }
    
    // Auto-block based on patterns
    this.evaluateAutoBlock(event);
  }

  // Rate limiting
  checkRateLimit(identifier: string, limit: number = 60, windowMs: number = 60000): boolean {
    const now = Date.now();
    const key = `${identifier}_${Math.floor(now / windowMs)}`;
    
    const current = this.rateLimits.get(key) || { count: 0, resetTime: now + windowMs };
    current.count++;
    
    this.rateLimits.set(key, current);
    
    if (current.count > limit) {
      this.logSecurityEvent('suspicious_activity', 'medium', {
        type: 'rate_limit_exceeded',
        identifier,
        count: current.count,
        limit
      });
      return false;
    }
    
    return true;
  }

  // Input validation and sanitization
  validateInput(input: string, type: 'email' | 'text' | 'html' | 'sql' = 'text'): {
    isValid: boolean;
    sanitized: string;
    threats: string[];
  } {
    const threats: string[] = [];
    let sanitized = input;
    
    // SQL Injection detection
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
      /(--|\/\*|\*\/)/g,
      /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/gi
    ];
    
    sqlPatterns.forEach(pattern => {
      if (pattern.test(input)) {
        threats.push('sql_injection');
      }
    });
    
    // XSS detection
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi
    ];
    
    xssPatterns.forEach(pattern => {
      if (pattern.test(input)) {
        threats.push('xss');
      }
    });
    
    // Sanitize based on type
    switch (type) {
      case 'email':
        sanitized = input.replace(/[^a-zA-Z0-9@._-]/g, '');
        break;
      case 'text':
        sanitized = input.replace(/[<>]/g, '');
        break;
      case 'html':
        sanitized = this.sanitizeHTML(input);
        break;
    }
    
    if (threats.length > 0) {
      this.logSecurityEvent('attack_attempt', 'high', {
        type: 'malicious_input',
        threats,
        originalInput: input.substring(0, 100),
        inputType: type
      });
    }
    
    return {
      isValid: threats.length === 0,
      sanitized,
      threats
    };
  }

  // Content Security Policy
  generateCSPHeader(): string {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://api.openai.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' https:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
  }

  // Session security
  validateSession(sessionToken: string): boolean {
    // Implement session validation logic
    if (!sessionToken || sessionToken.length < 32) {
      this.logSecurityEvent('authentication', 'medium', {
        type: 'invalid_session_token',
        tokenLength: sessionToken?.length || 0
      });
      return false;
    }
    
    return true;
  }

  // Password security
  validatePassword(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;
    
    // Length check
    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters long');
    
    // Complexity checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Include lowercase letters');
    
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Include uppercase letters');
    
    if (/\d/.test(password)) score += 1;
    else feedback.push('Include numbers');
    
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    else feedback.push('Include special characters');
    
    // Common password check
    const commonPasswords = ['password', '123456', 'qwerty', 'admin'];
    if (commonPasswords.includes(password.toLowerCase())) {
      score = 0;
      feedback.push('Avoid common passwords');
    }
    
    return {
      isValid: score >= 4,
      score,
      feedback
    };
  }

  // Threat intelligence
  async checkThreatIntelligence(ipAddress: string): Promise<ThreatIntelligence | null> {
    // Check cache first
    const cached = this.threatIntelligence.get(ipAddress);
    if (cached && Date.now() - cached.lastSeen < 3600000) { // 1 hour cache
      return cached;
    }
    
    try {
      // In production, this would call threat intelligence APIs
      const mockThreatData: ThreatIntelligence = {
        ipAddress,
        riskScore: Math.random() * 100,
        threatTypes: [],
        lastSeen: Date.now(),
        country: 'Unknown',
        isp: 'Unknown',
        isVPN: false,
        isTor: false,
        isProxy: false
      };
      
      this.threatIntelligence.set(ipAddress, mockThreatData);
      return mockThreatData;
    } catch (error) {
      console.error('Threat intelligence lookup failed:', error);
      return null;
    }
  }

  // Anomaly detection
  detectAnomalies(userId: string, currentBehavior: Record<string, any>): string[] {
    const anomalies: string[] = [];
    
    // Implement behavioral analysis
    const userEvents = this.events.filter(e => e.userId === userId);
    
    // Check for unusual login times
    const currentHour = new Date().getHours();
    const usualHours = userEvents
      .filter(e => e.type === 'authentication')
      .map(e => new Date(e.timestamp).getHours());
    
    if (usualHours.length > 0) {
      const avgHour = usualHours.reduce((a, b) => a + b, 0) / usualHours.length;
      if (Math.abs(currentHour - avgHour) > 6) {
        anomalies.push('unusual_login_time');
      }
    }
    
    // Check for unusual location (would need geolocation data)
    // Check for unusual device/browser
    // Check for unusual access patterns
    
    if (anomalies.length > 0) {
      this.logSecurityEvent('suspicious_activity', 'medium', {
        type: 'behavioral_anomaly',
        anomalies,
        userId
      });
    }
    
    return anomalies;
  }

  // Security metrics
  getSecurityMetrics(timeRange: number = 24 * 60 * 60 * 1000): SecurityMetrics {
    const cutoff = Date.now() - timeRange;
    const recentEvents = this.events.filter(e => e.timestamp > cutoff);
    
    const threatsByType = recentEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topThreats = Object.entries(threatsByType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const riskScore = this.calculateRiskScore(recentEvents);
    
    return {
      totalEvents: recentEvents.length,
      blockedRequests: recentEvents.filter(e => e.blocked).length,
      suspiciousActivities: recentEvents.filter(e => e.type === 'suspicious_activity').length,
      authenticatedUsers: new Set(recentEvents.filter(e => e.userId).map(e => e.userId)).size,
      failedLogins: recentEvents.filter(e => e.type === 'authentication' && e.details.success === false).length,
      threatsByType,
      topThreats,
      riskScore
    };
  }

  // Security reporting
  generateSecurityReport(timeRange: number = 7 * 24 * 60 * 60 * 1000): string {
    const metrics = this.getSecurityMetrics(timeRange);
    const cutoff = Date.now() - timeRange;
    const recentEvents = this.events.filter(e => e.timestamp > cutoff);
    
    const report = `
# ETERNYX Security Report
Generated: ${new Date().toISOString()}
Time Range: ${Math.round(timeRange / (24 * 60 * 60 * 1000))} days

## Summary
- Total Security Events: ${metrics.totalEvents}
- Blocked Requests: ${metrics.blockedRequests}
- Suspicious Activities: ${metrics.suspiciousActivities}
- Failed Logins: ${metrics.failedLogins}
- Overall Risk Score: ${metrics.riskScore.toFixed(2)}/100

## Top Threats
${metrics.topThreats.map(t => `- ${t.type}: ${t.count} incidents`).join('\n')}

## Critical Events
${recentEvents
  .filter(e => e.severity === 'critical')
  .map(e => `- ${new Date(e.timestamp).toISOString()}: ${e.type} - ${JSON.stringify(e.details)}`)
  .join('\n')}

## Recommendations
${this.generateSecurityRecommendations(metrics)}
    `;
    
    return report.trim();
  }

  // Private helper methods
  private generateEventId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private getCurrentIP(): string {
    // In a real implementation, this would get the actual client IP
    return '127.0.0.1';
  }

  private evaluateSecurityPolicies(event: SecurityEvent) {
    this.securityPolicies.forEach(policy => {
      if (!policy.enabled) return;
      
      policy.rules.forEach(rule => {
        if (this.evaluateCondition(rule.condition, event)) {
          this.executeAction(rule.action, event, rule.severity);
        }
      });
    });
  }

  private evaluateCondition(condition: string, event: SecurityEvent): boolean {
    // Simple condition evaluation - in production, use a proper rule engine
    switch (condition) {
      case 'contains_sql_patterns':
        return event.details.threats?.includes('sql_injection');
      case 'contains_script_tags':
        return event.details.threats?.includes('xss');
      default:
        return false;
    }
  }

  private executeAction(action: string, event: SecurityEvent, severity: string) {
    switch (action) {
      case 'block':
        event.blocked = true;
        this.blockedIPs.add(event.ipAddress);
        break;
      case 'monitor':
        // Enhanced monitoring
        break;
      case 'challenge':
        // Implement CAPTCHA or similar
        break;
    }
  }

  private updateThreatIntelligence(event: SecurityEvent) {
    const existing = this.threatIntelligence.get(event.ipAddress);
    if (existing) {
      existing.lastSeen = event.timestamp;
      if (event.severity === 'high' || event.severity === 'critical') {
        existing.riskScore = Math.min(100, existing.riskScore + 10);
      }
    }
  }

  private sendSecurityAlert(event: SecurityEvent) {
    console.warn('🚨 Security Alert:', {
      type: event.type,
      severity: event.severity,
      details: event.details,
      timestamp: new Date(event.timestamp).toISOString()
    });
    
    // In production, integrate with alerting systems
  }

  private evaluateAutoBlock(event: SecurityEvent) {
    const recentEvents = this.events
      .filter(e => e.ipAddress === event.ipAddress && Date.now() - e.timestamp < 300000) // 5 minutes
      .length;
    
    if (recentEvents > 10) {
      this.blockedIPs.add(event.ipAddress);
      this.logSecurityEvent('suspicious_activity', 'high', {
        type: 'auto_blocked',
        reason: 'excessive_requests',
        eventCount: recentEvents
      });
    }
  }

  private sanitizeHTML(html: string): string {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }

  private calculateRiskScore(events: SecurityEvent[]): number {
    if (events.length === 0) return 0;
    
    const severityWeights = { low: 1, medium: 3, high: 7, critical: 15 };
    const totalWeight = events.reduce((sum, event) => {
      return sum + severityWeights[event.severity];
    }, 0);
    
    return Math.min(100, (totalWeight / events.length) * 2);
  }

  private generateSecurityRecommendations(metrics: SecurityMetrics): string {
    const recommendations: string[] = [];
    
    if (metrics.riskScore > 70) {
      recommendations.push('- Implement additional security measures immediately');
    }
    
    if (metrics.failedLogins > 50) {
      recommendations.push('- Review and strengthen authentication policies');
    }
    
    if (metrics.blockedRequests > 100) {
      recommendations.push('- Investigate blocked request patterns for potential attacks');
    }
    
    return recommendations.join('\n') || '- No specific recommendations at this time';
  }

  private startSecurityMonitoring() {
    // Start background monitoring tasks
    setInterval(() => {
      this.cleanupOldEvents();
      this.syncThreatIntelligence();
    }, 300000); // 5 minutes
  }

  private cleanupOldEvents() {
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    this.events = this.events.filter(e => e.timestamp > cutoff);
  }

  private syncThreatIntelligence() {
    // Update threat intelligence data
    // In production, this would sync with external threat feeds
  }
}

// Export singleton instance
export const securityService = new SecurityService();

