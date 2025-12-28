import { supabase as supabaseClient } from "@/integrations/supabase/client";

/**
 * Single shared Supabase client.
 * Avoids multiple GoTrueClient instances and auth/session inconsistencies.
 */
export const supabase = supabaseClient;

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
  company?: string;
  phone?: string;
  subject?: string;
  message: string;
  service_interested?: string;
  budget_range?: string;
  timeline?: string;
  status: 'new' | 'contacted' | 'in-progress' | 'completed' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  notes?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
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
    company?: string;
    phone?: string;
    subject?: string;
    service_interested?: string;
    budget_range?: string;
    timeline?: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('contact_submissions')
        .insert([{
          name: formData.name,
          email: formData.email,
          message: formData.message,
          subject: formData.subject || 'General Inquiry',
          company: formData.company,
          phone: formData.phone,
          service_interested: formData.service_interested,
          budget_range: formData.budget_range,
          timeline: formData.timeline,
          status: 'new',
        }])
        .select()
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Supabase insert error:', error);
      return { data: null, error };
    }
  }

  // Security logging
  async logSecurityEvent(
    eventType: string,
    userId?: string,
    details: Record<string, any> = {},
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ) {
    try {
      const severityMap: Record<string, 'info' | 'warning' | 'critical'> = {
        'low': 'info',
        'medium': 'warning',
        'high': 'critical',
        'critical': 'critical'
      };

      await supabase
        .from('security_logs')
        .insert([{
          event_type: eventType,
          user_id: userId || '',
          message: JSON.stringify(details),
          severity: severityMap[severity] || 'info',
          source_ip: await this.getClientIP()
        }]);

      // Alert on high severity events
      if (severity === 'high' || severity === 'critical') {
        await this.sendSecurityAlert({ eventType, userId, details, severity });
      }
    } catch (error) {
      console.error('Security logging error:', error);
    }
  }

  // Performance metrics (logged to console as no table exists)
  async recordPerformanceMetric(
    metricType: string,
    value: number,
    metadata: Record<string, any> = {}
  ) {
    try {
      // Log to console as there's no performance_metrics table
      console.log('Performance metric:', { metricType, value, metadata, sessionId: this.getSessionId() });
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

  // Analytics and insights (simplified - no RPC function)
  async getUserAnalytics(userId: string, timeRange: string = '7d') {
    const cacheKey = `analytics-${userId}-${timeRange}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // Return simulated analytics as there's no get_user_analytics RPC
      const analytics = {
        userId,
        timeRange,
        loginCount: 0,
        projectsCreated: 0,
        lastActivity: new Date().toISOString()
      };

      this.setCache(cacheKey, analytics, 10 * 60 * 1000);
      return analytics;
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

  private async sendSecurityAlert(logEntry: Record<string, any>) {
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


