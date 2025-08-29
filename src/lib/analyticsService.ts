// Analytics and Personalization Service for ETERNYX
// Provides comprehensive user analytics, behavior tracking, and personalization

interface UserEvent {
  eventType: string;
  eventData: Record<string, any>;
  timestamp: number;
  sessionId: string;
  userId?: string;
  pageUrl: string;
  userAgent: string;
}

interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  pageViews: number;
  events: UserEvent[];
  referrer: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  deviceInfo: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
    screenResolution: string;
  };
}

interface AnalyticsMetrics {
  totalUsers: number;
  activeUsers: number;
  pageViews: number;
  sessionDuration: number;
  bounceRate: number;
  conversionRate: number;
  topPages: Array<{ page: string; views: number }>;
  topEvents: Array<{ event: string; count: number }>;
  userFlow: Array<{ from: string; to: string; count: number }>;
  performanceMetrics: {
    avgLoadTime: number;
    avgApiResponseTime: number;
    errorRate: number;
  };
}

interface PersonalizationProfile {
  userId: string;
  segment: string;
  interests: string[];
  behaviorScore: number;
  engagementLevel: 'low' | 'medium' | 'high';
  preferredContent: string[];
  lastActivity: number;
  conversionProbability: number;
  recommendedActions: string[];
}

export class AnalyticsService {
  private events: UserEvent[] = [];
  private currentSession: UserSession | null = null;
  private userId: string | null = null;
  private sessionId: string;
  private isTrackingEnabled: boolean = true;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeSession();
    this.setupEventListeners();
  }

  // Initialize tracking session
  private initializeSession() {
    const deviceInfo = this.getDeviceInfo();
    const urlParams = new URLSearchParams(window.location.search);
    
    this.currentSession = {
      sessionId: this.sessionId,
      startTime: Date.now(),
      pageViews: 0,
      events: [],
      referrer: document.referrer,
      utmSource: urlParams.get('utm_source') || undefined,
      utmMedium: urlParams.get('utm_medium') || undefined,
      utmCampaign: urlParams.get('utm_campaign') || undefined,
      deviceInfo
    };

    this.trackEvent('session_start', {
      referrer: document.referrer,
      landingPage: window.location.pathname
    });
  }

  // Set user ID for tracking
  setUserId(userId: string) {
    this.userId = userId;
    if (this.currentSession) {
      this.currentSession.userId = userId;
    }
    this.trackEvent('user_identified', { userId });
  }

  // Track custom events
  trackEvent(eventType: string, eventData: Record<string, any> = {}) {
    if (!this.isTrackingEnabled) return;

    const event: UserEvent = {
      eventType,
      eventData,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId || undefined,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent
    };

    this.events.push(event);
    
    if (this.currentSession) {
      this.currentSession.events.push(event);
    }

    // Send to analytics backend
    this.sendEventToBackend(event);

    // Real-time processing for certain events
    this.processEventRealTime(event);
  }

  // Track page views
  trackPageView(page?: string) {
    const currentPage = page || window.location.pathname;
    
    if (this.currentSession) {
      this.currentSession.pageViews++;
    }

    this.trackEvent('page_view', {
      page: currentPage,
      title: document.title,
      timestamp: Date.now()
    });
  }

  // Track user interactions
  trackInteraction(element: string, action: string, data: Record<string, any> = {}) {
    this.trackEvent('user_interaction', {
      element,
      action,
      ...data
    });
  }

  // Track form submissions
  trackFormSubmission(formName: string, formData: Record<string, any>) {
    this.trackEvent('form_submission', {
      formName,
      fields: Object.keys(formData),
      timestamp: Date.now()
    });
  }

  // Track errors
  trackError(error: Error, context?: string) {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
  }

  // Track performance metrics
  trackPerformance(metricName: string, value: number, metadata: Record<string, any> = {}) {
    this.trackEvent('performance_metric', {
      metricName,
      value,
      metadata,
      timestamp: Date.now()
    });
  }

  // Track conversion events
  trackConversion(conversionType: string, value?: number, metadata: Record<string, any> = {}) {
    this.trackEvent('conversion', {
      conversionType,
      value,
      metadata,
      timestamp: Date.now()
    });
  }

  // Get analytics data
  async getAnalytics(timeRange: string = '7d'): Promise<AnalyticsMetrics> {
    try {
      // In a real implementation, this would call your analytics API
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeRange, sessionId: this.sessionId })
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Analytics fetch error:', error);
    }

    // Return mock data for demonstration
    return this.getMockAnalytics();
  }

  // Get user personalization profile
  async getPersonalizationProfile(userId: string): Promise<PersonalizationProfile> {
    try {
      const response = await fetch(`/api/personalization/${userId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Personalization fetch error:', error);
    }

    // Return default profile
    return {
      userId,
      segment: 'general',
      interests: [],
      behaviorScore: 50,
      engagementLevel: 'medium',
      preferredContent: [],
      lastActivity: Date.now(),
      conversionProbability: 0.3,
      recommendedActions: ['explore_services']
    };
  }

  // A/B Testing
  getVariant(testName: string, variants: string[]): string {
    const hash = this.hashString(this.sessionId + testName);
    const index = hash % variants.length;
    const variant = variants[index];
    
    this.trackEvent('ab_test_assignment', {
      testName,
      variant,
      allVariants: variants
    });
    
    return variant;
  }

  // Funnel analysis
  trackFunnelStep(funnelName: string, step: string, stepNumber: number) {
    this.trackEvent('funnel_step', {
      funnelName,
      step,
      stepNumber,
      timestamp: Date.now()
    });
  }

  // Cohort analysis
  async getCohortAnalysis(cohortType: 'weekly' | 'monthly' = 'weekly') {
    try {
      const response = await fetch(`/api/analytics/cohort?type=${cohortType}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Cohort analysis error:', error);
    }
    return null;
  }

  // Heat map data
  trackHeatmapData(x: number, y: number, element?: string) {
    this.trackEvent('heatmap_click', {
      x,
      y,
      element,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });
  }

  // Session recording (privacy-compliant)
  startSessionRecording() {
    // This would integrate with session recording tools
    this.trackEvent('session_recording_start', {
      timestamp: Date.now()
    });
  }

  // Privacy controls
  enableTracking() {
    this.isTrackingEnabled = true;
    this.trackEvent('tracking_enabled', {});
  }

  disableTracking() {
    this.isTrackingEnabled = false;
    this.trackEvent('tracking_disabled', {});
  }

  // GDPR compliance
  exportUserData(userId: string) {
    return this.events.filter(event => event.userId === userId);
  }

  deleteUserData(userId: string) {
    this.events = this.events.filter(event => event.userId !== userId);
    this.trackEvent('user_data_deleted', { deletedUserId: userId });
  }

  // End session
  endSession() {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      this.trackEvent('session_end', {
        duration: this.currentSession.endTime - this.currentSession.startTime,
        pageViews: this.currentSession.pageViews,
        eventCount: this.currentSession.events.length
      });
    }
  }

  // Private helper methods
  private generateSessionId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  private getDeviceInfo() {
    const userAgent = navigator.userAgent;
    return {
      type: this.getDeviceType(),
      os: this.getOS(userAgent),
      browser: this.getBrowser(userAgent),
      screenResolution: `${screen.width}x${screen.height}`
    };
  }

  private getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) return 'mobile';
    return 'desktop';
  }

  private getOS(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private getBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private setupEventListeners() {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.trackEvent('page_visibility_change', {
        hidden: document.hidden
      });
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    // Track scroll depth
    let maxScrollDepth = 0;
    window.addEventListener('scroll', () => {
      const scrollDepth = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (scrollDepth > maxScrollDepth) {
        maxScrollDepth = scrollDepth;
        if (scrollDepth % 25 === 0) { // Track at 25%, 50%, 75%, 100%
          this.trackEvent('scroll_depth', { depth: scrollDepth });
        }
      }
    });

    // Track clicks
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      this.trackInteraction(target.tagName, 'click', {
        text: target.textContent?.slice(0, 100),
        className: target.className,
        id: target.id
      });
    });
  }

  private async sendEventToBackend(event: UserEvent) {
    try {
      // Batch events for efficiency
      if (this.events.length % 10 === 0) {
        await fetch('/api/analytics/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.events.slice(-10))
        });
      }
    } catch (error) {
      console.error('Analytics backend error:', error);
    }
  }

  private processEventRealTime(event: UserEvent) {
    // Real-time processing for specific events
    switch (event.eventType) {
      case 'form_submission':
        this.trackConversion('form_conversion');
        break;
      case 'error':
        // Alert on critical errors
        if (event.eventData.context === 'critical') {
          console.error('Critical error tracked:', event);
        }
        break;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getMockAnalytics(): AnalyticsMetrics {
    return {
      totalUsers: 1250,
      activeUsers: 89,
      pageViews: 3420,
      sessionDuration: 245,
      bounceRate: 0.32,
      conversionRate: 0.08,
      topPages: [
        { page: '/', views: 1200 },
        { page: '/hacked', views: 890 },
        { page: '/services', views: 450 }
      ],
      topEvents: [
        { event: 'page_view', count: 3420 },
        { event: 'user_interaction', count: 1890 },
        { event: 'form_submission', count: 156 }
      ],
      userFlow: [
        { from: '/', to: '/hacked', count: 567 },
        { from: '/hacked', to: '/', count: 234 },
        { from: '/', to: '/services', count: 189 }
      ],
      performanceMetrics: {
        avgLoadTime: 1.2,
        avgApiResponseTime: 0.8,
        errorRate: 0.02
      }
    };
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

