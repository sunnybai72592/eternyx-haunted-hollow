import { supabase } from './supabase';

// Types for our security features
export interface VulnerabilityScan {
  id?: string;
  user_id?: string;
  target_url: string;
  scan_type: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
  results?: any;
  vulnerabilities_found?: number;
  risk_score?: number;
  scan_duration?: number;
  created_at?: string;
}

export interface VulnerabilityDetail {
  id?: string;
  scan_id: string;
  vulnerability_type: string;
  severity: string;
  description?: string;
  location?: string;
  proof_of_concept?: string;
  remediation?: string;
  cvss_score?: number;
  cve_id?: string;
  created_at?: string;
}

export interface ThreatIntelligence {
  id?: string;
  threat_type: string;
  severity: string;
  source: string;
  indicator_type: string;
  indicator_value: string;
  description?: string;
  first_seen?: string;
  last_seen?: string;
  confidence_score?: number;
  is_active?: boolean;
  tags?: string[];
  created_at?: string;
}

export interface SecurityIncident {
  id?: string;
  incident_type: string;
  severity: string;
  source_ip?: string;
  target_system?: string;
  description?: string;
  status?: string;
  assigned_to?: string;
  detected_at?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at?: string;
}

export interface AISecurityAnalysis {
  id?: string;
  user_id?: string;
  analysis_type: string;
  input_data: any;
  results: any;
  confidence_score?: number;
  model_version?: string;
  processing_time?: number;
  created_at?: string;
}

export interface EncryptionKey {
  id?: string;
  user_id?: string;
  key_name: string;
  algorithm: string;
  key_size: number;
  public_key?: string;
  private_key_encrypted?: string;
  is_quantum_resistant?: boolean;
  created_at?: string;
  expires_at?: string;
}

export interface ProjectRequest {
  id?: string;
  user_id?: string;
  project_type: string;
  title: string;
  description: string;
  requirements?: string;
  timeline?: string;
  budget_range?: string;
  priority?: string;
  status?: string;
  assigned_team_member?: string;
  submitted_at?: string;
  updated_at?: string;
}

export interface ThreatMonitoringEvent {
  id?: string;
  event_type: string;
  severity: string;
  source_ip?: string;
  destination_ip?: string;
  source_port?: number;
  destination_port?: number;
  protocol?: string;
  event_data?: any;
  detected_at?: string;
  is_false_positive?: boolean;
  analyst_notes?: string;
  created_at?: string;
}

export interface NetworkTrafficAnalysis {
  id?: string;
  user_id?: string;
  analysis_name?: string;
  traffic_data: any;
  anomalies_detected?: number;
  risk_level?: string;
  analysis_results?: any;
  analyzed_at?: string;
  created_at?: string;
}

// Vulnerability Scanning Service
export class VulnerabilityScanService {
  static async createScan(scan: VulnerabilityScan) {
    const { data, error } = await supabase
      .from('vulnerability_scans')
      .insert([scan])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getScansByUser(userId: string) {
    const { data, error } = await supabase
      .from('vulnerability_scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  static async updateScanStatus(scanId: string, status: string, results?: any) {
    const updateData: any = { 
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null
    };
    
    if (results) {
      updateData.results = results;
      updateData.vulnerabilities_found = results.vulnerabilities?.length || 0;
      updateData.risk_score = results.risk_score || 0;
    }

    const { data, error } = await supabase
      .from('vulnerability_scans')
      .update(updateData)
      .eq('id', scanId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async addVulnerabilityDetails(details: VulnerabilityDetail[]) {
    const { data, error } = await supabase
      .from('vulnerability_details')
      .insert(details)
      .select();
    
    if (error) throw error;
    return data;
  }

  static async getVulnerabilityDetails(scanId: string) {
    const { data, error } = await supabase
      .from('vulnerability_details')
      .select('*')
      .eq('scan_id', scanId)
      .order('severity', { ascending: false });
    
    if (error) throw error;
    return data;
  }
}

// Threat Intelligence Service
export class ThreatIntelligenceService {
  static async getThreatIntelligence(limit: number = 100) {
    const { data, error } = await supabase
      .from('threat_intelligence')
      .select('*')
      .eq('is_active', true)
      .order('last_seen', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }

  static async searchThreats(indicator: string) {
    const { data, error } = await supabase
      .from('threat_intelligence')
      .select('*')
      .ilike('indicator_value', `%${indicator}%`)
      .eq('is_active', true);
    
    if (error) throw error;
    return data;
  }

  static async addThreatIndicator(threat: ThreatIntelligence) {
    const { data, error } = await supabase
      .from('threat_intelligence')
      .insert([threat])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getThreatsByType(threatType: string) {
    const { data, error } = await supabase
      .from('threat_intelligence')
      .select('*')
      .eq('threat_type', threatType)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false });
    
    if (error) throw error;
    return data;
  }
}

// AI Security Analysis Service
export class AISecurityService {
  static async saveAnalysis(analysis: AISecurityAnalysis) {
    const { data, error } = await supabase
      .from('ai_security_analysis')
      .insert([analysis])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getAnalysisByUser(userId: string, analysisType?: string) {
    let query = supabase
      .from('ai_security_analysis')
      .select('*')
      .eq('user_id', userId);
    
    if (analysisType) {
      query = query.eq('analysis_type', analysisType);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    return data;
  }

  static async getAnalysisStats(userId: string) {
    const { data, error } = await supabase
      .from('ai_security_analysis')
      .select('analysis_type, confidence_score, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  }
}

// Encryption Service
export class EncryptionService {
  static async createKey(key: EncryptionKey) {
    const { data, error } = await supabase
      .from('encryption_keys')
      .insert([key])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getKeysByUser(userId: string) {
    const { data, error } = await supabase
      .from('encryption_keys')
      .select('id, key_name, algorithm, key_size, is_quantum_resistant, created_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  static async deleteKey(keyId: string) {
    const { error } = await supabase
      .from('encryption_keys')
      .delete()
      .eq('id', keyId);
    
    if (error) throw error;
  }

  static async saveEncryptedData(data: any) {
    const { data: result, error } = await supabase
      .from('encrypted_data')
      .insert([data])
      .select()
      .single();
    
    if (error) throw error;
    return result;
  }

  static async getEncryptedDataByUser(userId: string) {
    const { data, error } = await supabase
      .from('encrypted_data')
      .select('id, data_name, original_size, encryption_algorithm, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
}

// Project Request Service
export class ProjectRequestService {
  static async createRequest(request: ProjectRequest) {
    const { data, error } = await supabase
      .from('project_requests')
      .insert([request])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getRequestsByUser(userId: string) {
    const { data, error } = await supabase
      .from('project_requests')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  static async updateRequestStatus(requestId: string, status: string, notes?: string) {
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (notes) updateData.resolution_notes = notes;

    const { data, error } = await supabase
      .from('project_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

// Threat Monitoring Service
export class ThreatMonitoringService {
  static async getRecentEvents(limit: number = 50) {
    const { data, error } = await supabase
      .from('threat_monitoring_events')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }

  static async addEvent(event: ThreatMonitoringEvent) {
    const { data, error } = await supabase
      .from('threat_monitoring_events')
      .insert([event])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getEventsByType(eventType: string, hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('threat_monitoring_events')
      .select('*')
      .eq('event_type', eventType)
      .gte('detected_at', since)
      .order('detected_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  static async getThreatStatistics(days: number = 7) {
    const { data, error } = await supabase
      .rpc('get_threat_statistics', { days });
    
    if (error) throw error;
    return data;
  }

  static async markAsFalsePositive(eventId: string, notes: string) {
    const { data, error } = await supabase
      .from('threat_monitoring_events')
      .update({ 
        is_false_positive: true, 
        analyst_notes: notes 
      })
      .eq('id', eventId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

// Network Traffic Analysis Service
export class NetworkTrafficService {
  static async saveAnalysis(analysis: NetworkTrafficAnalysis) {
    const { data, error } = await supabase
      .from('network_traffic_analysis')
      .insert([analysis])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getAnalysisByUser(userId: string) {
    const { data, error } = await supabase
      .from('network_traffic_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('analyzed_at', { ascending: false })
      .limit(20);
    
    if (error) throw error;
    return data;
  }

  static async deleteAnalysis(analysisId: string) {
    const { error } = await supabase
      .from('network_traffic_analysis')
      .delete()
      .eq('id', analysisId);
    
    if (error) throw error;
  }
}

// Security Incident Service
export class SecurityIncidentService {
  static async createIncident(incident: SecurityIncident) {
    const { data, error } = await supabase
      .from('security_incidents')
      .insert([incident])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getOpenIncidents() {
    const { data, error } = await supabase
      .from('security_incidents')
      .select('*')
      .neq('status', 'resolved')
      .order('detected_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  static async updateIncident(incidentId: string, updates: Partial<SecurityIncident>) {
    const { data, error } = await supabase
      .from('security_incidents')
      .update(updates)
      .eq('id', incidentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getIncidentsByStatus(status: string) {
    const { data, error } = await supabase
      .from('security_incidents')
      .select('*')
      .eq('status', status)
      .order('detected_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
}

// Audit Log Service
export class AuditLogService {
  static async logAction(action: string, resourceType?: string, resourceId?: string, details?: any) {
    const { data: { user } } = await supabase.auth.getUser();
    
    const logEntry = {
      user_id: user?.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: null, // Would be populated by backend
      user_agent: navigator.userAgent
    };

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([logEntry])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getUserAuditLogs(userId: string, limit: number = 100) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }
}

// Utility functions
export const SecurityUtils = {
  // Generate a secure random string
  generateSecureId: (length: number = 32): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Calculate risk score based on severity
  calculateRiskScore: (vulnerabilities: VulnerabilityDetail[]): number => {
    let score = 0;
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'critical': score += 10; break;
        case 'high': score += 7; break;
        case 'medium': score += 4; break;
        case 'low': score += 1; break;
      }
      if (vuln.cvss_score) {
        score += Math.round(vuln.cvss_score);
      }
    });
    return Math.min(score, 100);
  },

  // Format timestamp for display
  formatTimestamp: (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  },

  // Get severity color class
  getSeverityColor: (severity: string): string => {
    switch (severity) {
      case 'critical': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  }
};

