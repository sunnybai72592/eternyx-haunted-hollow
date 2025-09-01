import { supabase } from '@/integrations/supabase/client';

export interface VulnerabilityScan {
  id: string;
  user_id: string;
  target_url: string;
  scan_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  results?: any;
  vulnerabilities_found: number;
  risk_score: number;
  scan_duration?: number;
}

export interface ThreatIntelligence {
  id: string;
  threat_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  indicator_type: string;
  indicator_value: string;
  description: string;
  confidence_score: number;
  is_active: boolean;
  tags: string[];
}

export interface SecurityIncident {
  id: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_ip?: string;
  target_system?: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  detected_at: string;
  resolved_at?: string;
}

export interface AISecurityAnalysis {
  id: string;
  user_id: string;
  analysis_type: string;
  input_data: any;
  results: any;
  confidence_score: number;
  model_version: string;
  processing_time: number;
}

export interface EncryptionKey {
  id: string;
  user_id: string;
  key_name: string;
  algorithm: string;
  key_size: number;
  public_key?: string;
  is_quantum_resistant: boolean;
  created_at: string;
  expires_at?: string;
}

class SecurityAPIService {
  // Vulnerability Scanning
  async createVulnerabilityScan(scanData: Partial<VulnerabilityScan>) {
    try {
      // Ensure required fields are present
      const completeScanData = {
        scan_type: scanData.scan_type || 'basic',
        target_url: scanData.target_url || '',
        user_id: scanData.user_id,
        status: scanData.status || 'pending',
        ...scanData
      };

      const { data, error } = await supabase
        .from('vulnerability_scans')
        .insert([completeScanData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating vulnerability scan:', error);
      return { data: null, error };
    }
  }

  async getVulnerabilityScans(userId: string, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('vulnerability_scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching vulnerability scans:', error);
      return { data: null, error };
    }
  }

  async updateVulnerabilityScan(scanId: string, updates: Partial<VulnerabilityScan>) {
    try {
      const { data, error } = await supabase
        .from('vulnerability_scans')
        .update(updates)
        .eq('id', scanId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error updating vulnerability scan:', error);
      return { data: null, error };
    }
  }

  // Threat Intelligence
  async getThreatIntelligence(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('threat_intelligence')
        .select('*')
        .eq('is_active', true)
        .order('first_seen', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching threat intelligence:', error);
      return { data: null, error };
    }
  }

  async searchThreatIntelligence(indicator: string) {
    try {
      const { data, error } = await supabase
        .from('threat_intelligence')
        .select('*')
        .ilike('indicator_value', `%${indicator}%`)
        .eq('is_active', true);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error searching threat intelligence:', error);
      return { data: null, error };
    }
  }

  // Security Incidents
  async createSecurityIncident(incidentData: Partial<SecurityIncident>) {
    try {
      // Ensure required fields are present
      const completeIncidentData = {
        incident_type: incidentData.incident_type || 'unauthorized_access',
        severity: incidentData.severity || 'medium',
        status: incidentData.status || 'open',
        ...incidentData
      };

      const { data, error } = await supabase
        .from('security_incidents')
        .insert([completeIncidentData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating security incident:', error);
      return { data: null, error };
    }
  }

  async getSecurityIncidents(status?: string, limit = 20) {
    try {
      let query = supabase
        .from('security_incidents')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching security incidents:', error);
      return { data: null, error };
    }
  }

  // AI Security Analysis
  async createAIAnalysis(analysisData: Partial<AISecurityAnalysis>) {
    try {
      // Ensure required fields are present
      const completeAnalysisData = {
        analysis_type: analysisData.analysis_type || 'threat_assessment',
        input_data: analysisData.input_data || {},
        results: analysisData.results || {},
        user_id: analysisData.user_id,
        ...analysisData
      };

      const { data, error } = await supabase
        .from('ai_security_analysis')
        .insert([completeAnalysisData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating AI analysis:', error);
      return { data: null, error };
    }
  }

  async getAIAnalysisHistory(userId: string, analysisType?: string, limit = 10) {
    try {
      let query = supabase
        .from('ai_security_analysis')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (analysisType) {
        query = query.eq('analysis_type', analysisType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching AI analysis history:', error);
      return { data: null, error };
    }
  }

  // Encryption Key Management
  async createEncryptionKey(keyData: Partial<EncryptionKey>) {
    try {
      // Ensure required fields are present
      const completeKeyData = {
        algorithm: keyData.algorithm || 'AES-256',
        key_name: keyData.key_name || 'default_key',
        key_size: keyData.key_size || 256,
        user_id: keyData.user_id,
        ...keyData
      };

      const { data, error } = await supabase
        .from('encryption_keys')
        .insert([completeKeyData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating encryption key:', error);
      return { data: null, error };
    }
  }

  async getEncryptionKeys(userId: string) {
    try {
      const { data, error } = await supabase
        .from('encryption_keys')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching encryption keys:', error);
      return { data: null, error };
    }
  }

  // Threat Monitoring Events
  async getThreatMonitoringEvents(limit = 100) {
    try {
      const { data, error } = await supabase
        .from('threat_monitoring_events')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching threat monitoring events:', error);
      return { data: null, error };
    }
  }

  async createThreatMonitoringEvent(eventData: any) {
    try {
      const { data, error } = await supabase
        .from('threat_monitoring_events')
        .insert([eventData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating threat monitoring event:', error);
      return { data: null, error };
    }
  }

  // Network Traffic Analysis
  async createNetworkAnalysis(analysisData: any) {
    try {
      const { data, error } = await supabase
        .from('network_traffic_analysis')
        .insert([analysisData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error creating network analysis:', error);
      return { data: null, error };
    }
  }

  async getNetworkAnalysis(userId: string, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('network_traffic_analysis')
        .select('*')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching network analysis:', error);
      return { data: null, error };
    }
  }

  // Dashboard Statistics
  async getDashboardStats(userId: string) {
    try {
      // Get various statistics in parallel
      const [scansResult, incidentsResult, keysResult, analysisResult] = await Promise.all([
        this.getVulnerabilityScans(userId, 5),
        this.getSecurityIncidents('open', 5),
        this.getEncryptionKeys(userId),
        this.getAIAnalysisHistory(userId, undefined, 5)
      ]);

      return {
        scans: scansResult.data || [],
        incidents: incidentsResult.data || [],
        keys: keysResult.data || [],
        analysis: analysisResult.data || [],
        error: null
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return {
        scans: [],
        incidents: [],
        keys: [],
        analysis: [],
        error
      };
    }
  }

  // Real-time subscriptions
  subscribeToThreatEvents(callback: (event: any) => void) {
    return supabase
      .channel('threat-events')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'threat_monitoring_events' 
        }, 
        callback
      )
      .subscribe();
  }

  subscribeToSecurityIncidents(callback: (incident: any) => void) {
    return supabase
      .channel('security-incidents')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'security_incidents' 
        }, 
        callback
      )
      .subscribe();
  }

  // Audit Logging
  async logAuditEvent(userId: string, action: string, resourceType: string, resourceId?: string, details?: any) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([{
          user_id: userId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          details,
          ip_address: '127.0.0.1', // In real app, get actual IP
          user_agent: navigator.userAgent
        }]);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error logging audit event:', error);
      return { data: null, error };
    }
  }
}

export const securityAPI = new SecurityAPIService();

