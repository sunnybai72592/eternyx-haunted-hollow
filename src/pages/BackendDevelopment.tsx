import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function BackendDevelopment() {
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [jsonInput, setJsonInput] = useState('');
  const [validationResult, setValidationResult] = useState('');

  const testEndpoint = async () => {
    setLoading(true);
    setResponse('');
    setError('');
    try {
      const res = await fetch(url, {
        method: method,
        // Add headers/body for POST/PUT if needed
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const validateJson = () => {
    try {
      JSON.parse(jsonInput);
      setValidationResult('Valid JSON');
    } catch (e: any) {
      setValidationResult(`Invalid JSON: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Backend Development Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Test your API endpoints and validate JSON.
        </p>

        <Tabs defaultValue="api-tester" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-tester">API Endpoint Tester</TabsTrigger>
            <TabsTrigger value="json-validator">JSON Validator</TabsTrigger>
          </TabsList>
          <TabsContent value="api-tester" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">API Endpoint Tester</h2>
            <Input
              type="text"
              placeholder="Enter API URL (e.g., https://jsonplaceholder.typicode.com/todos/1)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 p-2 rounded-md w-full"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <Button onClick={testEndpoint} disabled={loading} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              {loading ? 'Testing...' : 'Test Endpoint'}
            </Button>
            {error && <p className="text-red-500">Error: {error}</p>}
            <Textarea
              readOnly
              value={response}
              placeholder="API Response"
              className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
            />
          </TabsContent>
          <TabsContent value="json-validator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">JSON Validator</h2>
            <Label htmlFor="json-input">Enter JSON here:</Label>
            <Textarea
              id="json-input"
              placeholder="Enter JSON to validate..."
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[200px]"
            />
            <Button onClick={validateJson} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Validate JSON
            </Button>
            {validationResult && (
              <p className={`font-bold ${validationResult.startsWith('Valid') ? 'text-cyber-green' : 'text-red-500'}`}>
                {validationResult}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


