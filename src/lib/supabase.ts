import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Ensure environment variables are loaded
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase environment variables are not loaded. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
  // Fallback to hardcoded values for local development if needed, or throw an error
  // For production, this check should ideally prevent the app from starting without proper config
}

// Create Supabase client with enhanced configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: {
      'X-Client-Info': 'eternyx-app'
    }
  }
});

// Enhanced database types
export interface User {
  id: string;
  email: string;
  name: string;
  access_level: 'basic' | 'premium' | 'elite';
  created_at: string;
  updated_at: string;
  last_login: string;
  preferences: {
    theme: string;
    notifications: boolean;
    analytics: boolean;
  };
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  status: 'pending' | 'processed' | 'responded';
  created_at: string;
  user_agent: string;
  ip_address: string;
  metadata: Record<string, any>;
}

export interface SecurityLog {
  id: string;
  event_type: 'login' | 'logout' | 'failed_login' | 'suspicious_activity' | 'data_access';
  user_id?: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export interface PerformanceMetric {
  id: string;
  metric_type: 'page_load' | 'api_response' | 'error_rate' | 'user_engagement';
  value: number;
  metadata: Record<string, any>;
  user_id?: string;
  session_id: string;
  created_at: string;
}

// Enhanced API functions with error handling and caching
export class SupabaseAPI {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  // Cache helper
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttl: number = 5 * 60 * 1000) {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  // Authentication methods
  async signUp(email: string, password: string, metadata?: Record<string, any>) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });

      if (error) throw error;

      // Log security event
      await this.logSecurityEvent('login', undefined, {
        email,
        success: true,
        action: 'signup'
      });

      return { data, error: null };
    } catch (error) {
      await this.logSecurityEvent('login', undefined, {
        email,
        success: false,
        action: 'signup',
        error: (error as Error).message
      });
      return { data: null, error };
    }
  }

  async signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Log successful login
      await this.logSecurityEvent('login', data.user?.id, {
        email,
        success: true
      });

      return { data, error: null };
    } catch (error) {
      // Log failed login
      await this.logSecurityEvent('failed_login', undefined, {
        email,
        success: false,
        error: (error as Error).message
      });
      return { data: null, error };
    }
  }

  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Log logout
      await this.logSecurityEvent('logout', undefined, {
        success: true
      });

      return { error: null };
    } catch (error) {
      return { error };
    }
  }

  // Contact form submission with enhanced features
  async submitContactForm(formData: {
    name: string;
    email: string;
    message: string;
  }) {
    try {
      const submission: Partial<ContactSubmission> = {
        ...formData,
        status: 'pending',
        user_agent: navigator.userAgent,
        metadata: {
          timestamp: Date.now(),
          page_url: window.location.href,
          referrer: document.referrer
        }
      };

      const { data, error } = await supabase
        .from('contact_submissions')
        .insert([submission])
        .select()
        .single();

      if (error) throw error;

      // Trigger background processing
      await this.processContactSubmission(data.id);

      return { data, error: null };
    } catch (error) {
      console.error('Contact form submission error:', error);
      return { data: null, error };
    }
  }

  // Security logging
  async logSecurityEvent(
    eventType: SecurityLog['event_type'],
    userId?: string,
    details: Record<string, any> = {},
    severity: SecurityLog['severity'] = 'low'
  ) {
    try {
      const logEntry: Partial<SecurityLog> = {
        event_type: eventType,
        user_id: userId,
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        details,
        severity
      };

      await supabase
        .from('security_logs')
        .insert([logEntry]);

      // Alert on high severity events
      if (severity === 'high' || severity === 'critical') {
        await this.sendSecurityAlert(logEntry);
      }
    } catch (error) {
      console.error('Security logging error:', error);
    }
  }

  // Performance metrics
  async recordPerformanceMetric(
    metricType: PerformanceMetric['metric_type'],
    value: number,
    metadata: Record<string, any> = {}
  ) {
    try {
      const metric: Partial<PerformanceMetric> = {
        metric_type: metricType,
        value,
        metadata,
        session_id: this.getSessionId()
      };

      await supabase
        .from('performance_metrics')
        .insert([metric]);
    } catch (error) {
      console.error('Performance metric recording error:', error);
    }
  }

  // Real-time subscriptions
  subscribeToUserUpdates(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`user-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`
      }, callback)
      .subscribe();
  }

  subscribeToSecurityAlerts(callback: (payload: any) => void) {
    return supabase
      .channel('security-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'security_logs',
        filter: 'severity=in.(high,critical)'
      }, callback)
      .subscribe();
  }

  // Analytics and insights
  async getUserAnalytics(userId: string, timeRange: string = '7d') {
    const cacheKey = `analytics-${userId}-${timeRange}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .rpc('get_user_analytics', {
          user_id: userId,
          time_range: timeRange
        });

      if (error) throw error;

      this.setCache(cacheKey, data, 10 * 60 * 1000); // Cache for 10 minutes
      return data;
    } catch (error) {
      console.error('Analytics error:', error);
      return null;
    }
  }

  // Helper methods
  private async getClientIP(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('eternyx-session-id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('eternyx-session-id', sessionId);
    }
    return sessionId;
  }

  private async processContactSubmission(submissionId: string) {
    // This would trigger a background job or webhook
    // For now, we'll simulate with a simple status update
    setTimeout(async () => {
      await supabase
        .from('contact_submissions')
        .update({ status: 'processed' })
        .eq('id', submissionId);
    }, 5000);
  }

  private async sendSecurityAlert(logEntry: Partial<SecurityLog>) {
    // This would integrate with alerting systems
    console.warn('Security Alert:', logEntry);
    
    // Could integrate with services like:
    // - Slack webhooks
    // - Email notifications
    // - PagerDuty
    // - Discord webhooks
  }
}

// Export singleton instance
export const supabaseAPI = new SupabaseAPI();


