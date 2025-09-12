import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Wifi, Globe, Server, AlertTriangle, CheckCircle, XCircle, Loader2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ScanResult {
  host: string;
  port?: number;
  status: 'online' | 'offline' | 'timeout' | 'error';
  responseTime?: number;
  error?: string;
  timestamp: string;
}

interface DNSResult {
  domain: string;
  ip?: string;
  error?: string;
  timestamp: string;
}

export const NetworkScanner: React.FC = () => {
  const [targetHost, setTargetHost] = useState('');
  const [portRange, setPortRange] = useState('80,443,22,21,25,53,110,993,995');
  const [scanType, setScanType] = useState('ping');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [dnsResults, setDnsResults] = useState<DNSResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const abortController = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Ping function using fetch with timeout
  const pingHost = async (host: string, timeout: number = 5000): Promise<ScanResult> => {
    const startTime = Date.now();
    
    try {
      // Try to fetch a common endpoint or use a CORS-enabled service
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Use a CORS proxy or try direct connection
      let testUrl = '';
      
      if (host.startsWith('http://') || host.startsWith('https://')) {
        testUrl = host;
      } else {
        // Try HTTPS first, then HTTP
        testUrl = `https://${host}`;
      }
      
      const response = await fetch(testUrl, {
        method: 'HEAD',
        mode: 'no-cors', // This allows cross-origin requests but limits response access
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      return {
        host,
        status: 'online',
        responseTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        return {
          host,
          status: 'timeout',
          responseTime,
          error: 'Request timeout',
          timestamp: new Date().toISOString()
        };
      }
      
      // For no-cors mode, network errors might indicate the host is unreachable
      // But we can't distinguish between CORS issues and actual network problems
      return {
        host,
        status: 'offline',
        responseTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  };

  // Port scan simulation (limited by browser security)
  const scanPort = async (host: string, port: number): Promise<ScanResult> => {
    const startTime = Date.now();
    
    try {
      // Browser-based port scanning is very limited due to security restrictions
      // We can only test common web ports using fetch
      if ([80, 443, 8080, 8443].includes(port)) {
        const protocol = [443, 8443].includes(port) ? 'https' : 'http';
        const url = `${protocol}://${host}:${port}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        
        return {
          host,
          port,
          status: 'online',
          responseTime,
          timestamp: new Date().toISOString()
        };
      } else {
        // For non-web ports, we simulate the scan
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        const responseTime = Date.now() - startTime;
        
        // Simulate some ports being open based on common configurations
        const commonPorts = [22, 21, 25, 53, 110, 993, 995];
        const isOpen = commonPorts.includes(port) && Math.random() > 0.7;
        
        return {
          host,
          port,
          status: isOpen ? 'online' : 'offline',
          responseTime,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        host,
        port,
        status: 'offline',
        responseTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  };

  // DNS lookup using a public DNS API
  const dnsLookup = async (domain: string): Promise<DNSResult> => {
    try {
      // Use a public DNS API service
      const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
      const data = await response.json();
      
      if (data.Answer && data.Answer.length > 0) {
        const ip = data.Answer[0].data;
        return {
          domain,
          ip,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          domain,
          error: 'No A record found',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        domain,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  };

  const startScan = async () => {
    if (!targetHost.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a target host',
        variant: 'destructive'
      });
      return;
    }

    setScanning(true);
    setProgress(0);
    setResults([]);
    setLogs([]);
    abortController.current = new AbortController();

    addLog(`Starting ${scanType} scan for ${targetHost}`);

    try {
      if (scanType === 'ping') {
        addLog('Performing ping test...');
        const result = await pingHost(targetHost);
        setResults([result]);
        setProgress(100);
        addLog(`Ping completed: ${result.status} (${result.responseTime}ms)`);
        
      } else if (scanType === 'port') {
        const ports = portRange.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
        addLog(`Scanning ${ports.length} ports...`);
        
        const scanResults: ScanResult[] = [];
        
        for (let i = 0; i < ports.length; i++) {
          if (abortController.current?.signal.aborted) break;
          
          const port = ports[i];
          addLog(`Scanning port ${port}...`);
          
          const result = await scanPort(targetHost, port);
          scanResults.push(result);
          setResults([...scanResults]);
          
          const progressPercent = ((i + 1) / ports.length) * 100;
          setProgress(progressPercent);
          
          addLog(`Port ${port}: ${result.status}`);
        }
        
      } else if (scanType === 'dns') {
        addLog('Performing DNS lookup...');
        const result = await dnsLookup(targetHost);
        setDnsResults([result]);
        setProgress(100);
        addLog(`DNS lookup completed: ${result.ip || result.error}`);
      }
      
      toast({
        title: 'Scan Completed',
        description: `${scanType} scan finished successfully`
      });
      
    } catch (error) {
      addLog(`Scan error: ${error.message}`);
      toast({
        title: 'Scan Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setScanning(false);
    }
  };

  const stopScan = () => {
    if (abortController.current) {
      abortController.current.abort();
      addLog('Scan stopped by user');
      setScanning(false);
      toast({
        title: 'Scan Stopped',
        description: 'Network scan has been cancelled'
      });
    }
  };

  const exportResults = () => {
    const data = {
      scanType,
      target: targetHost,
      timestamp: new Date().toISOString(),
      results: scanType === 'dns' ? dnsResults : results,
      logs
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `network-scan-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Results Exported',
      description: 'Scan results saved to file'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'offline':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'timeout':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default:
        return <XCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'offline':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'timeout':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const presetTargets = [
    'google.com',
    'github.com',
    'stackoverflow.com',
    'localhost'
  ];

  return (
    <div className="w-full space-y-4">
      <Card className="bg-gray-900/50 border-cyan-500/30">
        <CardHeader>
          <CardTitle className="text-cyan-400 flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Network Scanner & Analyzer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="scan" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800/50">
              <TabsTrigger value="scan">Scanner</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="space-y-4">
              {/* Target Host */}
              <div>
                <label className="text-sm font-medium text-cyan-400 mb-2 block">Target Host</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter hostname or IP address"
                    value={targetHost}
                    onChange={(e) => setTargetHost(e.target.value)}
                    className="flex-1 bg-gray-800 border-cyan-500/30"
                  />
                  <Select value={scanType} onValueChange={setScanType}>
                    <SelectTrigger className="w-32 bg-gray-800 border-cyan-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-cyan-500/30">
                      <SelectItem value="ping">Ping</SelectItem>
                      <SelectItem value="port">Port Scan</SelectItem>
                      <SelectItem value="dns">DNS Lookup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {presetTargets.map((target, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => setTargetHost(target)}
                      className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-xs"
                    >
                      {target}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Port Range (only for port scan) */}
              {scanType === 'port' && (
                <div>
                  <label className="text-sm font-medium text-cyan-400 mb-2 block">Ports to Scan</label>
                  <Input
                    placeholder="80,443,22,21,25,53,110,993,995"
                    value={portRange}
                    onChange={(e) => setPortRange(e.target.value)}
                    className="bg-gray-800 border-cyan-500/30"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated port numbers. Note: Browser security limits port scanning capabilities.
                  </p>
                </div>
              )}

              {/* Scan Controls */}
              <div className="flex gap-2">
                <Button
                  onClick={startScan}
                  disabled={scanning}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                >
                  {scanning ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Server className="w-4 h-4 mr-2" />
                  )}
                  {scanning ? 'Scanning...' : `Start ${scanType} Scan`}
                </Button>
                {scanning && (
                  <Button
                    onClick={stopScan}
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                  >
                    Stop
                  </Button>
                )}
              </div>

              {/* Progress */}
              {scanning && (
                <div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Scanning Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="bg-gray-800" />
                </div>
              )}

              {/* Disclaimer */}
              <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm">
                  ⚠️ <strong>Note:</strong> Browser-based network scanning has limitations due to security restrictions. 
                  This tool provides basic connectivity testing and simulated port scanning for educational purposes.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              {/* Export Button */}
              {(results.length > 0 || dnsResults.length > 0) && (
                <div className="flex justify-end">
                  <Button
                    onClick={exportResults}
                    variant="outline"
                    className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Results
                  </Button>
                </div>
              )}

              {/* DNS Results */}
              {scanType === 'dns' && dnsResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-cyan-400 font-medium">DNS Lookup Results</h4>
                  {dnsResults.map((result, index) => (
                    <Card key={index} className="bg-gray-800/30 border-cyan-500/20">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">{result.domain}</div>
                            {result.ip ? (
                              <div className="text-green-400 font-mono">{result.ip}</div>
                            ) : (
                              <div className="text-red-400">{result.error}</div>
                            )}
                          </div>
                          <Badge className={result.ip ? getStatusColor('online') : getStatusColor('offline')}>
                            {result.ip ? 'Resolved' : 'Failed'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Ping/Port Scan Results */}
              {(scanType === 'ping' || scanType === 'port') && results.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-cyan-400 font-medium">
                    {scanType === 'ping' ? 'Ping Results' : 'Port Scan Results'}
                  </h4>
                  <div className="grid gap-2">
                    {results.map((result, index) => (
                      <Card key={index} className="bg-gray-800/30 border-cyan-500/20">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(result.status)}
                              <div>
                                <div className="font-medium text-white">
                                  {result.host}
                                  {result.port && `:${result.port}`}
                                </div>
                                {result.responseTime && (
                                  <div className="text-sm text-gray-400">
                                    Response time: {result.responseTime}ms
                                  </div>
                                )}
                                {result.error && (
                                  <div className="text-sm text-red-400">{result.error}</div>
                                )}
                              </div>
                            </div>
                            <Badge className={getStatusColor(result.status)}>
                              {result.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {results.length === 0 && dnsResults.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No scan results yet. Run a scan to see results here.
                </div>
              )}
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <div>
                <h4 className="text-cyan-400 font-medium mb-2">Scan Logs</h4>
                <Textarea
                  value={logs.join('\n')}
                  readOnly
                  className="bg-gray-800 border-cyan-500/30 font-mono text-sm text-green-400 min-h-64"
                  placeholder="Scan logs will appear here..."
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default NetworkScanner;

