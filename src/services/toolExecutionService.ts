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
    target_url: string;
    scan_type: string;
    user_id: string;
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${this.baseUrl}/vulnerability-scanner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Vulnerability scan failed',
        };
      }

      return {
        success: true,
        data: result,
        executionId: result.scan_id,
      };
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
    scan_type: string;
    user_id: string;
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${this.baseUrl}/port-scanner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Port scan failed',
        };
      }

      return {
        success: true,
        data: result,
        executionId: result.scan_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async executeSSLAnalyzer(params: {
    hostname: string;
    user_id: string;
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${this.baseUrl}/ssl-analyzer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'SSL analysis failed',
        };
      }

      return {
        success: true,
        data: result,
        executionId: result.analysis_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async executeWebScanner(params: {
    target_url: string;
    scan_depth?: number;
    user_id: string;
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${this.baseUrl}/web-scanner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Web application scan failed',
        };
      }

      return {
        success: true,
        data: result,
        executionId: result.scan_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async executeDNSAnalyzer(params: {
    domain: string;
    user_id: string;
  }): Promise<ToolExecutionResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${this.baseUrl}/dns-analyzer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'DNS analysis failed',
        };
      }

      return {
        success: true,
        data: result,
        executionId: result.analysis_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
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

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async getExecutionDetails(executionId: string): Promise<ToolExecutionResult> {
    try {
      const { data, error } = await supabase
        .from('vulnerability_scans')
        .select(`
          *,
          vulnerability_details (*)
        `)
        .eq('id', executionId)
        .single();

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

export const toolExecutionService = new ToolExecutionService();

