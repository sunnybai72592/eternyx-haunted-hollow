import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { toolExecutionService } from '@/services/toolExecutionService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Loader2, 
  Shield, 
  Target, 
  Globe, 
  Lock, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Eye
} from 'lucide-react';

interface ToolExecutorProps {
  toolId: string;
  toolName: string;
  onExecutionComplete?: (result: any) => void;
}

export const ToolExecutor: React.FC<ToolExecutorProps> = ({ 
  toolId, 
  toolName, 
  onExecutionComplete 
}) => {
  const { user } = useAuthStore();
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, any>>({});

  const handleParameterChange = (key: string, value: any) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const executeTool = async () => {
    if (!user) {
      setError('Please log in to use this tool');
      return;
    }

    setIsExecuting(true);
    setError('');
    setResult(null);

    try {
      let executionResult;

      switch (toolId) {
        case 'vuln-scanner':
          executionResult = await toolExecutionService.executeVulnerabilityScanner({
            target_url: parameters.target_url,
            scan_type: parameters.scan_type || 'comprehensive',
            user_id: user.id,
          });
          break;

        case 'port-scanner':
          executionResult = await toolExecutionService.executePortScanner({
            target: parameters.target,
            ports: parameters.ports ? parameters.ports.split(',').map((p: string) => parseInt(p.trim())) : undefined,
            scan_type: parameters.scan_type || 'stealth',
            user_id: user.id,
          });
          break;

        case 'ssl-analyzer':
          executionResult = await toolExecutionService.executeSSLAnalyzer({
            hostname: parameters.hostname,
            user_id: user.id,
          });
          break;

        case 'web-scanner':
          executionResult = await toolExecutionService.executeWebScanner({
            target_url: parameters.target_url,
            scan_depth: parameters.scan_depth ? parseInt(parameters.scan_depth) : 2,
            user_id: user.id,
          });
          break;

        case 'dns-analyzer':
          executionResult = await toolExecutionService.executeDNSAnalyzer({
            domain: parameters.domain,
            user_id: user.id,
          });
          break;

        default:
          throw new Error(`Tool ${toolId} is not implemented yet`);
      }

      if (executionResult.success) {
        setResult(executionResult.data);
        onExecutionComplete?.(executionResult.data);
      } else {
        setError(executionResult.error || 'Tool execution failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsExecuting(false);
    }
  };

  const renderParameterInputs = () => {
    switch (toolId) {
      case 'vuln-scanner':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="target_url">Target URL</Label>
              <Input
                id="target_url"
                placeholder="https://example.com"
                value={parameters.target_url || ''}
                onChange={(e) => handleParameterChange('target_url', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scan_type">Scan Type</Label>
              <Select onValueChange={(value) => handleParameterChange('scan_type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scan type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprehensive">Comprehensive</SelectItem>
                  <SelectItem value="quick">Quick Scan</SelectItem>
                  <SelectItem value="deep">Deep Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'port-scanner':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="target">Target Host</Label>
              <Input
                id="target"
                placeholder="example.com or 192.168.1.1"
                value={parameters.target || ''}
                onChange={(e) => handleParameterChange('target', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ports">Ports (optional)</Label>
              <Input
                id="ports"
                placeholder="80,443,22,21 (leave empty for common ports)"
                value={parameters.ports || ''}
                onChange={(e) => handleParameterChange('ports', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scan_type">Scan Type</Label>
              <Select onValueChange={(value) => handleParameterChange('scan_type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scan type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stealth">Stealth Scan</SelectItem>
                  <SelectItem value="connect">Connect Scan</SelectItem>
                  <SelectItem value="udp">UDP Scan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'ssl-analyzer':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="hostname">Hostname</Label>
              <Input
                id="hostname"
                placeholder="example.com"
                value={parameters.hostname || ''}
                onChange={(e) => handleParameterChange('hostname', e.target.value)}
              />
            </div>
          </div>
        );

      case 'web-scanner':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="target_url">Target URL</Label>
              <Input
                id="target_url"
                placeholder="https://example.com"
                value={parameters.target_url || ''}
                onChange={(e) => handleParameterChange('target_url', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scan_depth">Scan Depth</Label>
              <Select onValueChange={(value) => handleParameterChange('scan_depth', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scan depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Surface (1 level)</SelectItem>
                  <SelectItem value="2">Standard (2 levels)</SelectItem>
                  <SelectItem value="3">Deep (3 levels)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'dns-analyzer':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={parameters.domain || ''}
                onChange={(e) => handleParameterChange('domain', e.target.value)}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center text-muted-foreground">
            Tool configuration not available yet
          </div>
        );
    }
  };

  const renderResults = () => {
    if (!result) return null;

    return (
      <Card className="p-6 mt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-green-400">Execution Results</h3>
            <Badge variant="outline" className="text-green-400 border-green-400">
              <CheckCircle className="w-4 h-4 mr-1" />
              Completed
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-400">Execution Time</div>
              <div className="text-lg font-semibold text-white">
                {result.scan_duration || result.analysis_duration || 'N/A'}s
              </div>
            </div>
            
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-400">Risk Score</div>
              <div className="text-lg font-semibold text-white">
                {result.risk_score || result.security_score || 'N/A'}/100
              </div>
            </div>
            
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-400">Issues Found</div>
              <div className="text-lg font-semibold text-white">
                {result.vulnerabilities_found || result.vulnerabilities?.length || 0}
              </div>
            </div>
          </div>

          {result.summary && (
            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-md font-semibold text-green-400 mb-2">Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {Object.entries(result.summary).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-gray-400 capitalize">{key.replace(/_/g, ' ')}</div>
                    <div className="text-white font-semibold">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendations && result.recommendations.length > 0 && (
            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-md font-semibold text-green-400 mb-2">Recommendations</h4>
              <ul className="space-y-2">
                {result.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="text-sm text-gray-300 flex items-start">
                    <span className="text-green-400 mr-2">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.executionId && (
            <div className="text-xs text-gray-500">
              Execution ID: {result.executionId}
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-green-400" />
            <h2 className="text-xl font-semibold text-white">{toolName}</h2>
          </div>

          {renderParameterInputs()}

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 p-4 rounded-lg flex items-center">
              <XCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          <Button
            onClick={executeTool}
            disabled={isExecuting || !user}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Execute Tool
              </>
            )}
          </Button>

          {!user && (
            <div className="text-center text-yellow-400 text-sm">
              Please log in to use this tool
            </div>
          )}
        </div>
      </Card>

      {renderResults()}
    </div>
  );
};

