import { useState } from 'react';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function BackendDevelopment() {
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [requestBody, setRequestBody] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [jsonInput, setJsonInput] = useState('');
  const [validationResult, setValidationResult] = useState('');

  const [language, setLanguage] = useState('nodejs');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [codeExecutionResult, setCodeExecutionResult] = useState('');

  const [apiName, setApiName] = useState('');
  const [apiEndpoints, setApiEndpoints] = useState('');
  const [generatedApiDoc, setGeneratedApiDoc] = useState('');

  const [microserviceName, setMicroserviceName] = useState('');
  const [microserviceDependencies, setMicroserviceDependencies] = useState('');
  const [generatedMicroserviceConfig, setGeneratedMicroserviceConfig] = useState('');

  const testEndpoint = async () => {
    setLoading(true);
    setResponse('');
    setError('');
    try {
      const options: RequestInit = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
      };
      if (method !== 'GET' && requestBody) {
        options.body = requestBody;
      }
      const res = await fetch(url, options);
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

  const executeCode = () => {
    // This is a simulated execution. In a real app, this would call a backend service.
    if (language === 'nodejs') {
      setCodeExecutionResult(`Simulated Node.js execution of:\n\n${codeSnippet}\n\nOutput: Node.js code executed successfully. (e.g., console.log output)`);
    } else if (language === 'python') {
      setCodeExecutionResult(`Simulated Python execution of:\n\n${codeSnippet}\n\nOutput: Python script ran successfully. (e.g., print output)`);
    }
  };

  const generateApiDocumentation = () => {
    if (!apiName || !apiEndpoints) {
      setGeneratedApiDoc('Please enter API Name and Endpoints.');
      return;
    }
    const endpointsArray = apiEndpoints.split('\n').filter(line => line.trim() !== '');
    const doc = `## API Documentation for ${apiName}\n\nThis API provides scalable access to ${apiName} resources.\n\n### Authentication:\n- API Key (Header: X-API-Key)\n- OAuth2 (Bearer Token)\n\n### Rate Limiting:\n- 100 requests per minute per IP address.\n\n### Endpoints:\n${endpointsArray.map(e => `- ${e.trim()}`).join("\n")}\n\nThis is a simulated API documentation with considerations for scalability.`;
    setGeneratedApiDoc(doc);
  };

  const generateMicroserviceConfig = () => {
    if (!microserviceName) {
      setGeneratedMicroserviceConfig('Please enter a microservice name.');
      return;
    }
    const dependenciesArray = microserviceDependencies.split(',').map(d => d.trim()).filter(d => d !== '');
    const config = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${microserviceName}-service\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: ${microserviceName}\n  template:\n    metadata:\n      labels:\n        app: ${microserviceName}\n    spec:\n      containers:\n      - name: ${microserviceName}\n        image: your-repo/${microserviceName}:latest\n        ports:\n        - containerPort: 8080\n        env:\n${dependenciesArray.map(dep => `        - name: ${dep.toUpperCase()}_SERVICE_URL\n          value: http://${dep}-service`).join('\n')}\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${microserviceName}-service\nspec:\n  selector:\n    app: ${microserviceName}\n  ports:\n    - protocol: TCP\n      port: 80\n      targetPort: 8080\n  type: ClusterIP\n`;
    setGeneratedMicroserviceConfig(config);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Backend Development Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Test your API endpoints, validate JSON, execute code, generate API documentation, and simulate cloud-native microservices.
        </p>

        <Tabs defaultValue="api-tester" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="api-tester">API Endpoint Tester</TabsTrigger>
            <TabsTrigger value="json-validator">JSON Validator</TabsTrigger>
            <TabsTrigger value="code-executor">Code Executor</TabsTrigger>
            <TabsTrigger value="api-doc-generator">API Doc Generator</TabsTrigger>
            <TabsTrigger value="microservice-config">Microservice Config</TabsTrigger>
          </TabsList>
          <TabsContent value="api-tester" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">API Endpoint Tester</h2>
            <Label htmlFor="api-url">API URL:</Label>
            <Input
              id="api-url"
              type="text"
              placeholder="Enter API URL (e.g., https://jsonplaceholder.typicode.com/todos/1)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="http-method">HTTP Method:</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            {(method === 'POST' || method === 'PUT') && (
              <>
                <Label htmlFor="request-body">Request Body (JSON):</Label>
                <Textarea
                  id="request-body"
                  placeholder="Enter JSON request body..."
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[100px]"
                />
              </>
            )}
            <Button onClick={testEndpoint} disabled={loading} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              {loading ? 'Testing...' : 'Test Endpoint'}
            </Button>
            {error && <p className="text-red-500">Error: {error}</p>}
            <Label htmlFor="api-response">API Response:</Label>
            <Textarea
              id="api-response"
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
          <TabsContent value="code-executor" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-accent">Code Executor (Simulated)</h2>
            <Label htmlFor="code-language">Select Language:</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nodejs">Node.js</SelectItem>
                <SelectItem value="python">Python</SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="code-snippet">Enter Code Snippet:</Label>
            <Textarea
              id="code-snippet"
              placeholder="Enter your code snippet here..."
              value={codeSnippet}
              onChange={(e) => setCodeSnippet(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[200px]"
            />
            <Button onClick={executeCode} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Execute Code
            </Button>
            {codeExecutionResult && (
              <Textarea
                readOnly
                value={codeExecutionResult}
                className="bg-input-background border-input-border text-input-foreground min-h-[150px]"
              />
            )}
          </TabsContent>
          <TabsContent value="api-doc-generator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">API Documentation Generator (Simulated)</h2>
            <Label htmlFor="api-name">API Name:</Label>
            <Input
              id="api-name"
              type="text"
              placeholder="e.g., User Management API"
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="api-endpoints">API Endpoints (one per line, e.g., GET /users):</Label>
            <Textarea
              id="api-endpoints"
              placeholder="e.g.,\nGET /users\nPOST /users\nGET /users/{id}"
              value={apiEndpoints}
              onChange={(e) => setApiEndpoints(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[150px]"
            />
            <Button onClick={generateApiDocumentation} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Generate Documentation
            </Button>
            {generatedApiDoc && (
              <Textarea
                readOnly
                value={generatedApiDoc}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
          <TabsContent value="microservice-config" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">Cloud-Native Microservice Config Generator (Simulated)</h2>
            <Label htmlFor="microservice-name">Microservice Name:</Label>
            <Input
              id="microservice-name"
              type="text"
              placeholder="e.g., user-service"
              value={microserviceName}
              onChange={(e) => setMicroserviceName(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="microservice-dependencies">Dependencies (comma-separated, e.g., auth, product):</Label>
            <Input
              id="microservice-dependencies"
              type="text"
              placeholder="e.g., auth, product"
              value={microserviceDependencies}
              onChange={(e) => setMicroserviceDependencies(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={generateMicroserviceConfig} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Generate Kubernetes Config
            </Button>
            {generatedMicroserviceConfig && (
              <Textarea
                readOnly
                value={generatedMicroserviceConfig}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


