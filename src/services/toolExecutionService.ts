import { supabase } from '@/integrations/supabase/client';

export interface ToolExecutionRequest {
  toolId: string;
  parameters: Record<string, any>;
  userId: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionId?: string;
}

class ToolExecutionService {
  private baseUrl = 'https://wcncuarekaofmfurbtbh.supabase.co/functions/v1';

  async executeVulnerabilityScanner(params: {
    vendor?: string;
    product: string;
    version?: string;
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return { success: false, error: 'Your session has expired. Please sign in again.' };
      }

      // Use the configured Supabase client so the project apikey and the
      // current user's Authorization token are both attached consistently.
      const { data, error } = await supabase.functions.invoke('vulnerability-scanner', {
        body: params,
      });

      if (error) {
        let message = error.message || 'CVE research failed';
        if ('context' in error && error.context instanceof Response) {
          try {
            const payload = await error.context.clone().json();
            if (typeof payload?.error === 'string') message = payload.error;
            else if (typeof payload?.message === 'string') message = payload.message;
          } catch {
            // Keep the SDK error message when the response has no JSON body.
          }
        }
        return { success: false, error: message };
      }

      if (!data || data.success !== true) {
        return {
          success: false,
          error: typeof data?.error === 'string' ? data.error : 'CVE research returned an unexpected response.',
        };
      }

      return { success: true, data, executionId: data.scan_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async executePortScanner(params: {
    target: string;
    ports?: number[];
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return { success: false, error: 'Your session has expired. Please sign in again.' };
      }
      const response = await fetch(`${this.baseUrl}/port-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ target: params.target, ports: params.ports }),
      });
      const result = await response.json();
      if (!response.ok) return { success: false, error: result.error || 'Port scan failed' };
      return { success: true, data: result, executionId: result.lookup_id || result.scan_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async executeSSLAnalyzer(params: { hostname: string }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return { success: false, error: 'Your session has expired. Please sign in again.' };
      }

      const { data, error } = await supabase.functions.invoke('ssl-analyzer', {
        body: { hostname: params.hostname },
      });

      if (error) {
        let message = error.message || 'SSL analysis failed';
        if ('context' in error && error.context instanceof Response) {
          try {
            const payload = await error.context.clone().json();
            if (typeof payload?.error === 'string') message = payload.error;
          } catch {
            // Keep the SDK error message when the response has no JSON body.
          }
        }
        return { success: false, error: message };
      }

      if (!data || data.success !== true) {
        return {
          success: false,
          error: typeof data?.error === 'string' ? data.error : 'SSL Labs did not return a completed assessment.',
        };
      }

      return { success: true, data, executionId: data.analysis_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async executeWebScanner(params: { target_url: string; scan_depth?: number; user_id: string }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${this.baseUrl}/web-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify(params),
      });
      const result = await response.json();
      if (!response.ok) return { success: false, error: result.error || 'Web application scan failed' };
      return { success: true, data: result, executionId: result.scan_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async executeDNSAnalyzer(params: { domain: string; user_id: string }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${this.baseUrl}/dns-analyzer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify(params),
      });
      const result = await response.json();
      if (!response.ok) return { success: false, error: result.error || 'DNS analysis failed' };
      return { success: true, data: result, executionId: result.analysis_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async getExecutionHistory(userId: string, limit: number = 10): Promise<ToolExecutionResult> {
    try {
      const { data, error } = await supabase
        .from('vulnerability_scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async getExecutionDetails(executionId: string): Promise<ToolExecutionResult> {
    try {
      const { data, error } = await supabase
        .from('vulnerability_scans')
        .select(`*, vulnerability_details (*)`)
        .eq('id', executionId)
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }
}

export const toolExecutionService = new ToolExecutionService();
