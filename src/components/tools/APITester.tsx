import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Send, Copy, Download, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface APITestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  responseTime: number;
  timestamp: string;
}

export const APITester: React.FC = () => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<APITestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const presetAPIs = [
    {
      name: 'GitHub User Info',
      method: 'GET',
      url: 'https://api.github.com/users/octocat',
      headers: '{\n  "Accept": "application/vnd.github.v3+json"\n}',
      body: ''
    },
    {
      name: 'JSONPlaceholder Posts',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      headers: '{\n  "Content-Type": "application/json"\n}',
      body: ''
    },
    {
      name: 'HTTPBin POST Test',
      method: 'POST',
      url: 'https://httpbin.org/post',
      headers: '{\n  "Content-Type": "application/json"\n}',
      body: '{\n  "message": "Hello from Eternyx API Tester",\n  "timestamp": "' + new Date().toISOString() + '"\n}'
    },
    {
      name: 'CoinGecko Bitcoin Price',
      method: 'GET',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      headers: '{\n  "Accept": "application/json"\n}',
      body: ''
    }
  ];

  const loadPreset = (preset: typeof presetAPIs[0]) => {
    setMethod(preset.method);
    setUrl(preset.url);
    setHeaders(preset.headers);
    setBody(preset.body);
    setResult(null);
    setError(null);
  };

  const executeRequest = async () => {
    if (!url.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a URL',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        console.warn('Invalid headers JSON, using default headers');
      }

      const requestOptions: RequestInit = {
        method,
        headers: parsedHeaders,
      };

      if (method !== 'GET' && method !== 'HEAD' && body.trim()) {
        requestOptions.body = body;
      }

      const response = await fetch(url, requestOptions);
      const responseTime = Date.now() - startTime;
      
      // Get response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Try to parse response as JSON, fallback to text
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch (e) {
          responseData = await response.text();
        }
      } else {
        responseData = await response.text();
      }

      const result: APITestResult = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData,
        responseTime,
        timestamp: new Date().toISOString()
      };

      setResult(result);
      
      toast({
        title: 'Request Completed',
        description: `${response.status} ${response.statusText} (${responseTime}ms)`,
        variant: response.ok ? 'default' : 'destructive'
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast({
        title: 'Request Failed',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      toast({
        title: 'Copied!',
        description: 'Response copied to clipboard'
      });
    }
  };

  const downloadResponse = () => {
    if (result) {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `api-response-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Downloaded!',
        description: 'Response saved to file'
      });
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (status >= 300 && status < 400) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (status >= 400 && status < 500) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  return (
    <div className="w-full space-y-4">
      <Card className="bg-gray-900/50 border-purple-500/30">
        <CardHeader>
          <CardTitle className="text-purple-400 flex items-center gap-2">
            <Send className="w-5 h-5" />
            API Tester - Live HTTP Client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="request" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800/50">
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
            </TabsList>

            <TabsContent value="request" className="space-y-4">
              {/* Method and URL */}
              <div className="flex gap-2">
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="w-32 bg-gray-800 border-purple-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-purple-500/30">
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="HEAD">HEAD</SelectItem>
                    <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Enter API URL (e.g., https://api.github.com/users/octocat)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-gray-800 border-purple-500/30"
                />
                <Button
                  onClick={executeRequest}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Headers */}
              <div>
                <label className="text-sm font-medium text-purple-400 mb-2 block">Headers (JSON)</label>
                <Textarea
                  placeholder="Enter headers as JSON"
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  className="bg-gray-800 border-purple-500/30 font-mono text-sm"
                  rows={4}
                />
              </div>

              {/* Body */}
              {method !== 'GET' && method !== 'HEAD' && (
                <div>
                  <label className="text-sm font-medium text-purple-400 mb-2 block">Request Body</label>
                  <Textarea
                    placeholder="Enter request body (JSON, XML, etc.)"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="bg-gray-800 border-purple-500/30 font-mono text-sm"
                    rows={6}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="presets" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presetAPIs.map((preset, index) => (
                  <Card key={index} className="bg-gray-800/50 border-purple-500/20 hover:border-purple-400/50 transition-colors cursor-pointer"
                        onClick={() => loadPreset(preset)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-white">{preset.name}</h4>
                        <Badge className="bg-purple-500/20 text-purple-400">{preset.method}</Badge>
                      </div>
                      <p className="text-sm text-gray-400 truncate">{preset.url}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="response" className="space-y-4">
              {result && (
                <div className="space-y-4">
                  {/* Status and Timing */}
                  <div className="flex items-center gap-4">
                    <Badge className={getStatusColor(result.status)}>
                      {result.status >= 200 && result.status < 300 ? (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {result.status} {result.statusText}
                    </Badge>
                    <Badge className="bg-blue-500/20 text-blue-400">
                      {result.responseTime}ms
                    </Badge>
                    <div className="flex gap-2 ml-auto">
                      <Button
                        onClick={copyResponse}
                        variant="outline"
                        size="sm"
                        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={downloadResponse}
                        variant="outline"
                        size="sm"
                        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Response Headers */}
                  <div>
                    <h4 className="text-purple-400 font-medium mb-2">Response Headers</h4>
                    <pre className="bg-black/50 p-4 rounded-lg border border-gray-700 text-sm text-gray-300 overflow-x-auto">
                      {JSON.stringify(result.headers, null, 2)}
                    </pre>
                  </div>

                  {/* Response Body */}
                  <div>
                    <h4 className="text-purple-400 font-medium mb-2">Response Body</h4>
                    <pre className="bg-black/50 p-4 rounded-lg border border-gray-700 text-sm text-green-400 overflow-x-auto max-h-96 overflow-y-auto">
                      {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <h4 className="text-red-400 font-medium mb-2">Error</h4>
                  <p className="text-red-300">{error}</p>
                </div>
              )}

              {!result && !error && (
                <div className="text-center py-8 text-gray-400">
                  No response yet. Make a request to see results here.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default APITester;

