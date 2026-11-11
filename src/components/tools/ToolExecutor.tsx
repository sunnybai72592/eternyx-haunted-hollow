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
            vendor: parameters.vendor || '',
            product: parameters.product || '',
            version: parameters.version || '',
          });
          break;

        case 'port-scanner':
          executionResult = await toolExecutionService.executePortScanner({
            target: parameters.target,
            ports: parameters.ports?.trim() ? parameters.ports.split(',').map((p: string) => Number(p.trim())) : undefined,
          });
          break;

        case 'ssl-analyzer':
          executionResult = await toolExecutionService.executeSSLAnalyzer({
            hostname: parameters.hostname,
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
              <Label htmlFor="cve-vendor">Vendor (optional)</Label>
              <Input id="cve-vendor" placeholder="e.g. Microsoft" value={parameters.vendor || ''} onChange={(e) => handleParameterChange('vendor', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cve-product">Product name</Label>
              <Input id="cve-product" placeholder="e.g. Windows Server" value={parameters.product || ''} onChange={(e) => handleParameterChange('product', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cve-version">Version (optional)</Label>
              <Input id="cve-version" placeholder="e.g. 2019" value={parameters.version || ''} onChange={(e) => handleParameterChange('version', e.target.value)} />
            </div>
          </div>
        );

      case 'port-scanner':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="target">Public IPv4 address</Label>
              <Input
                id="target"
                placeholder="203.0.113.10 (public IPv4 only)"
                value={parameters.target || ''}
                onChange={(e) => handleParameterChange('target', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ports">Filter observed ports (optional)</Label>
              <Input
                id="ports"
                placeholder="80,443,22,21 (leave empty for all Shodan observations)"
                value={parameters.ports || ''}
                onChange={(e) => handleParameterChange('ports', e.target.value)}
              />
            </div>
            <p className="text-xs leading-5 text-amber-300/80">Passive Shodan lookup only. This does not send probes to the target and cannot confirm current port state. Hostnames, private IPs and reserved ranges are not accepted.</p>
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
            <h3 className="text-lg font-semibold text-green-400">{toolId === 'port-scanner' ? 'Lookup Results' : 'Execution Results'}</h3>
            <Badge variant="outline" className="text-green-400 border-green-400">
              <CheckCircle className="w-4 h-4 mr-1" />
              {toolId === 'port-scanner' ? 'Lookup complete' : 'Completed'}
            </Badge>
          </div>

          {toolId === 'port-scanner' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-800 p-4">
                <div className="text-sm text-gray-400">Lookup duration</div>
                <div className="text-lg font-semibold text-white">{typeof result.scan_duration_ms === 'number' ? (result.scan_duration_ms / 1000).toFixed(2) + 's' : 'N/A'}</div>
              </div>
              <div className="rounded-lg bg-gray-800 p-4">
                <div className="text-sm text-gray-400">Shodan-observed ports</div>
                <div className="text-lg font-semibold text-white">{Array.isArray(result.observed_ports) ? result.observed_ports.length : 0}</div>
              </div>
              <div className="rounded-lg bg-gray-800 p-4">
                <div className="text-sm text-gray-400">Risk assessment</div>
                <div className="text-lg font-semibold text-white">Not scored</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gray-800 p-4">
                <div className="text-sm text-gray-400">Execution Time</div>
                <div className="text-lg font-semibold text-white">{result.scan_duration || result.analysis_duration || 'N/A'}s</div>
              </div>
              <div className="rounded-lg bg-gray-800 p-4">
                <div className="text-sm text-gray-400">{toolId === 'vuln-scanner' ? 'Candidate CVE references' : toolId === 'ssl-analyzer' ? 'SSL Labs grade' : 'Risk Score'}</div>
                <div className="text-lg font-semibold text-white">{toolId === 'vuln-scanner' ? (result.results_returned ?? 0) : toolId === 'ssl-analyzer' ? (result.overall_grade ?? 'Not available') : `${result.risk_score ?? result.security_score ?? 'N/A'}/100`}</div>
              </div>
              <div className="rounded-lg bg-gray-800 p-4">
                <div className="text-sm text-gray-400">{toolId === 'vuln-scanner' ? 'Total matches in NVD' : 'Issues Found'}</div>
                <div className="text-lg font-semibold text-white">{toolId === 'vuln-scanner' ? (result.total_matches_reported_by_nvd ?? 0) : toolId === 'ssl-analyzer' ? (result.ssl_result?.vulnerabilities?.length ?? 0) : (result.vulnerabilities_found || result.vulnerabilities?.length || 0)}</div>
              </div>
            </div>
          )}

          {toolId === 'ssl-analyzer' && (
            <div className="space-y-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-cyan-300">Qualys SSL Labs assessment</h4>
                <Badge variant="outline" className="border-cyan-400/40 text-cyan-200">{result.source || 'SSL Labs API'}</Badge>
              </div>
              <p className="text-sm text-gray-300">Grade is the SSL Labs endpoint grade. ETERNYX does not convert it into an invented 0–100 risk or confidence score.</p>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="text-gray-300">Protocols observed: <span className="font-medium text-white">{result.ssl_result?.protocols?.length ?? 0}</span></p>
                <p className="text-gray-300">Cipher suites observed: <span className="font-medium text-white">{result.ssl_result?.suites?.length ?? 0}</span></p>
              </div>
              {Array.isArray(result.ssl_result?.endpoints) && (
                <div className="space-y-2">
                  <h5 className="text-sm font-semibold text-white">Endpoint assessments</h5>
                  {result.ssl_result.endpoints.map((endpoint: any, index: number) => (
                    <div key={`${endpoint.ipAddress || 'endpoint'}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-700 p-3 text-sm">
                      <span className="font-mono text-gray-200">{endpoint.ipAddress || 'IP not reported'}</span>
                      <span className="text-gray-300">{endpoint.statusMessage || 'Status not reported'}</span>
                      <span className="font-semibold text-white">{endpoint.grade || 'No grade'}</span>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(result.ssl_result?.vulnerabilities) && result.ssl_result.vulnerabilities.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-sm font-semibold text-amber-300">Issues reported by SSL Labs</h5>
                  {result.ssl_result.vulnerabilities.map((item: any) => (
                    <div key={item.id} className="rounded border border-amber-500/20 p-3">
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <span className="font-medium text-white">{item.name}</span>
                        <span className="uppercase text-amber-200">{item.severity}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-300">{item.description}</p>
                    </div>
                  ))}
                </div>
              )}
              {result.additional_checks && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(result.additional_checks).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3 rounded bg-gray-800 p-2 text-sm">
                      <span className="text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-white">{value === null ? 'Not reported' : value ? 'Yes' : 'No'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {toolId === 'port-scanner' && (
            <div className="space-y-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-cyan-300">Passive host observations</h4>
                <Badge variant="outline" className="border-cyan-400/40 text-cyan-200">Shodan Host API</Badge>
              </div>
              {result.message && <p className="text-sm text-gray-300">{result.message}</p>}
              <div className="grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
                <p>Target: <span className="font-medium text-white">{result.target || '—'}</span></p>
                <p>Organization: <span className="font-medium text-white">{result.organization || 'Not reported'}</span></p>
                <p>Location: <span className="font-medium text-white">{[result.city, result.country].filter(Boolean).join(', ') || 'Not reported'}</span></p>
                <p>Shodan last update: <span className="font-medium text-white">{result.shodan_last_update ? new Date(result.shodan_last_update).toLocaleString() : 'Not supplied'}</span></p>
              </div>
              {Array.isArray(result.observed_ports) && result.observed_ports.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-gray-400"><tr><th className="py-2 pr-3">Port</th><th className="py-2 pr-3">Transport</th><th className="py-2 pr-3">Service</th><th className="py-2">State evidence</th></tr></thead>
                    <tbody>{result.observed_ports.map((item: any) => <tr key={`${item.port}-${item.transport}`} className="border-t border-gray-700"><td className="py-2 pr-3 font-mono text-white">{item.port}</td><td className="py-2 pr-3">{item.transport || 'Unknown'}</td><td className="py-2 pr-3">{item.service || 'Unknown'}</td><td className="py-2 text-amber-200">Observed by Shodan</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-gray-400">No port observations were returned for this lookup/filter. This does not mean the target has no open ports.</p>}
              {Array.isArray(result.vulnerabilities_reported_by_shodan) && result.vulnerabilities_reported_by_shodan.length > 0 && <p className="text-xs text-amber-200">Shodan vulnerability references: {result.vulnerabilities_reported_by_shodan.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join(', ')}</p>}
              <p className="text-xs text-gray-400">Lookup completed: {result.lookup_completed_at ? new Date(result.lookup_completed_at).toLocaleString() : 'Not supplied'}</p>
            </div>
          )}

          {toolId !== 'port-scanner' && toolId !== 'vuln-scanner' && result.summary && (
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

          {toolId !== 'port-scanner' && Array.isArray(result.coverage_limitations) && result.coverage_limitations.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg">
              <h4 className="text-md font-semibold text-amber-300 mb-2">Coverage & Limitations</h4>
              <ul className="space-y-2">
                {result.coverage_limitations.map((item: string, index: number) => (
                  <li key={index} className="text-sm text-gray-300 flex items-start">
                    <span className="text-amber-300 mr-2">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toolId === 'port-scanner' && Array.isArray(result.limitations) && result.limitations.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <h4 className="mb-2 font-semibold text-amber-300">Interpretation limits</h4>
              <ul className="space-y-2">{result.limitations.map((item: string, index: number) => <li key={index} className="flex items-start text-sm text-gray-300"><span className="mr-2 text-amber-300">•</span>{item}</li>)}</ul>
            </div>
          )}

          {Array.isArray(result.coverage_limitations) && result.coverage_limitations.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg">
              <h4 className="text-md font-semibold text-amber-300 mb-2">Coverage & Limitations</h4>
              <ul className="space-y-2">
                {result.coverage_limitations.map((item: string, index: number) => (
                  <li key={index} className="text-sm text-gray-300 flex items-start">
                    <span className="text-amber-300 mr-2">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toolId !== 'vuln-scanner' && result.recommendations && result.recommendations.length > 0 && (
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

          {toolId === 'vuln-scanner' && Array.isArray(result.candidate_cves) && (
            <div className="space-y-3">
              <h4 className="font-semibold text-cyan-300">Candidate CVE references</h4>
              {result.candidate_cves.map((cve: any) => (
                <div key={cve.id} className="rounded-lg border border-gray-700 p-3">
                  <a href={cve.nvd_url} target="_blank" rel="noreferrer" className="font-medium text-cyan-300 hover:underline">{cve.id}</a>
                  <p className="mt-1 text-sm text-gray-300">{cve.description}</p>
                  <p className="mt-2 text-xs text-gray-500">{cve.cvss_severity || 'Not scored'}{cve.cvss_score !== null ? ` · CVSS ${cve.cvss_score}` : ''}</p>
                </div>
              ))}
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

