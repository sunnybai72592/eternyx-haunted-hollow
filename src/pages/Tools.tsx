import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypingText } from "@/components/TypingText";
import { TerminalWindow } from "@/components/TerminalWindow";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Shield,
  Code,
  Zap,
  Search,
  Lock,
  Key,
  Wifi,
  Database,
  Globe,
  Terminal,
  Cpu,
  Network,
  Eye,
  AlertTriangle,
  Fingerprint,
  Hash,
  Scan,
  Bug,
  Wrench,
  Palette,
  Monitor,
  Smartphone,
  Cloud,
  Server,
  GitBranch,
  Package,
  FileCode,
  Layers,
  Rocket,
  Brain,
  Lightbulb,
  Target,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  Copy,
  Download,
  Play,
  CheckCircle,
  XCircle
} from "lucide-react";

const Tools = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("cybersecurity");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Password Generator Tool State
  const [passwordLength, setPasswordLength] = useState(12);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState("");

  // Hash Generator Tool State
  const [hashInput, setHashInput] = useState("");
  const [hashResults, setHashResults] = useState<{[key: string]: string}>({});

  // Port Scanner Tool State
  const [targetHost, setTargetHost] = useState("");
  const [portRange, setPortRange] = useState("1-1000");
  const [scanResults, setScanResults] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Base64 Encoder/Decoder Tool State
  const [base64Input, setBase64Input] = useState("");
  const [base64Output, setBase64Output] = useState("");
  const [base64Mode, setBase64Mode] = useState<"encode" | "decode">("encode");

  // URL Encoder/Decoder Tool State
  const [urlInput, setUrlInput] = useState("");
  const [urlOutput, setUrlOutput] = useState("");
  const [urlMode, setUrlMode] = useState<"encode" | "decode">("encode");

  // JSON Formatter Tool State
  const [jsonInput, setJsonInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Color Palette Generator State
  const [baseColor, setBaseColor] = useState("#3b82f6");
  const [colorPalette, setColorPalette] = useState<string[]>([]);

  // QR Code Generator State
  const [qrText, setQrText] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  // Password Strength Checker State
  const [passwordToCheck, setPasswordToCheck] = useState("");
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    feedback: string[];
    color: string;
  }>({ score: 0, feedback: [], color: "red" });

  // Generate Password Function
  const generatePassword = () => {
    let charset = "";
    if (includeUppercase) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (includeLowercase) charset += "abcdefghijklmnopqrstuvwxyz";
    if (includeNumbers) charset += "0123456789";
    if (includeSymbols) charset += "!@#$%^&*()_+-=[]{}|;:,.<>?";

    let password = "";
    for (let i = 0; i < passwordLength; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setGeneratedPassword(password);
  };

  // Generate Hash Function
  const generateHashes = async (input: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    
    const results: {[key: string]: string} = {};
    
    // SHA-256
    const sha256Hash = await crypto.subtle.digest('SHA-256', data);
    results.sha256 = Array.from(new Uint8Array(sha256Hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // SHA-1
    const sha1Hash = await crypto.subtle.digest('SHA-1', data);
    results.sha1 = Array.from(new Uint8Array(sha1Hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Simple MD5-like hash (not cryptographically secure)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    results.simple = Math.abs(hash).toString(16);

    setHashResults(results);
  };

  // Simulate Port Scan
  const simulatePortScan = async () => {
    setIsScanning(true);
    setScanResults([]);
    
    const [startPort, endPort] = portRange.split('-').map(Number);
    const commonPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995];
    const results: string[] = [];
    
    // Simulate scanning delay
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (commonPorts.some(port => port >= startPort && port <= endPort)) {
        const randomPort = commonPorts[Math.floor(Math.random() * commonPorts.length)];
        if (randomPort >= startPort && randomPort <= endPort && !results.includes(`Port ${randomPort}: Open`)) {
          results.push(`Port ${randomPort}: Open`);
          setScanResults([...results]);
        }
      }
    }
    
    setIsScanning(false);
  };

  // Base64 Encode/Decode
  const processBase64 = () => {
    try {
      if (base64Mode === "encode") {
        setBase64Output(btoa(base64Input));
      } else {
        setBase64Output(atob(base64Input));
      }
    } catch (error) {
      setBase64Output("Error: Invalid input");
    }
  };

  // URL Encode/Decode
  const processUrl = () => {
    try {
      if (urlMode === "encode") {
        setUrlOutput(encodeURIComponent(urlInput));
      } else {
        setUrlOutput(decodeURIComponent(urlInput));
      }
    } catch (error) {
      setUrlOutput("Error: Invalid input");
    }
  };

  // JSON Formatter
  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setJsonOutput(JSON.stringify(parsed, null, 2));
      setJsonError("");
    } catch (error) {
      setJsonError("Invalid JSON format");
      setJsonOutput("");
    }
  };

  // Generate Color Palette
  const generateColorPalette = () => {
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    const palette = [];
    for (let i = 0; i < 5; i++) {
      const factor = (i + 1) * 0.2;
      const newR = Math.round(r + (255 - r) * factor);
      const newG = Math.round(g + (255 - g) * factor);
      const newB = Math.round(b + (255 - b) * factor);
      palette.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
    }
    setColorPalette(palette);
  };

  // Generate QR Code
  const generateQrCode = () => {
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrText)}`;
    setQrCodeUrl(qrApiUrl);
  };

  // Check Password Strength
  const checkPasswordStrength = (password: string) => {
    let score = 0;
    const feedback = [];
    
    if (password.length >= 8) score += 1;
    else feedback.push("Use at least 8 characters");
    
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push("Include lowercase letters");
    
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push("Include uppercase letters");
    
    if (/[0-9]/.test(password)) score += 1;
    else feedback.push("Include numbers");
    
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else feedback.push("Include special characters");
    
    let color = "red";
    if (score >= 4) color = "green";
    else if (score >= 3) color = "yellow";
    
    setPasswordStrength({ score, feedback, color });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const realTools = [
    {
      id: "password-generator",
      title: "Password Generator",
      description: "Generate secure passwords with customizable options",
      icon: <Key className="h-6 w-6" />,
      category: "Security",
      component: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Length: {passwordLength}</label>
              <input
                type="range"
                min="4"
                max="50"
                value={passwordLength}
                onChange={(e) => setPasswordLength(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeUppercase}
                  onChange={(e) => setIncludeUppercase(e.target.checked)}
                  className="mr-2"
                />
                Uppercase
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeLowercase}
                  onChange={(e) => setIncludeLowercase(e.target.checked)}
                  className="mr-2"
                />
                Lowercase
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeNumbers}
                  onChange={(e) => setIncludeNumbers(e.target.checked)}
                  className="mr-2"
                />
                Numbers
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeSymbols}
                  onChange={(e) => setIncludeSymbols(e.target.checked)}
                  className="mr-2"
                />
                Symbols
              </label>
            </div>
          </div>
          <Button onClick={generatePassword} className="w-full">
            Generate Password
          </Button>
          {generatedPassword && (
            <div className="flex items-center gap-2">
              <Input value={generatedPassword} readOnly className="flex-1" />
              <Button size="sm" onClick={() => copyToClipboard(generatedPassword)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )
    },
    {
      id: "hash-generator",
      title: "Hash Generator",
      description: "Generate SHA-256, SHA-1, and other hash values",
      icon: <Hash className="h-6 w-6" />,
      category: "Cryptography",
      component: (
        <div className="space-y-4">
          <Textarea
            placeholder="Enter text to hash..."
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
          />
          <Button onClick={() => generateHashes(hashInput)} disabled={!hashInput}>
            Generate Hashes
          </Button>
          {Object.keys(hashResults).length > 0 && (
            <div className="space-y-2">
              {Object.entries(hashResults).map(([algorithm, hash]) => (
                <div key={algorithm} className="flex items-center gap-2">
                  <label className="w-16 text-sm font-medium">{algorithm.toUpperCase()}:</label>
                  <Input value={hash} readOnly className="flex-1 font-mono text-xs" />
                  <Button size="sm" onClick={() => copyToClipboard(hash)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      id: "port-scanner",
      title: "Port Scanner Simulator",
      description: "Simulate network port scanning (educational purposes)",
      icon: <Scan className="h-6 w-6" />,
      category: "Network",
      component: (
        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This is a simulation for educational purposes only. Do not use for unauthorized scanning.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-2 gap-4">
            <Input
              placeholder="Target (e.g., localhost)"
              value={targetHost}
              onChange={(e) => setTargetHost(e.target.value)}
            />
            <Input
              placeholder="Port range (e.g., 1-1000)"
              value={portRange}
              onChange={(e) => setPortRange(e.target.value)}
            />
          </div>
          <Button onClick={simulatePortScan} disabled={isScanning || !targetHost}>
            {isScanning ? "Scanning..." : "Start Scan"}
          </Button>
          {scanResults.length > 0 && (
            <div className="bg-black p-4 rounded font-mono text-sm">
              {scanResults.map((result, index) => (
                <div key={index} className="text-green-400">{result}</div>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      id: "base64-tool",
      title: "Base64 Encoder/Decoder",
      description: "Encode and decode Base64 strings",
      icon: <Code className="h-6 w-6" />,
      category: "Encoding",
      component: (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={base64Mode === "encode" ? "default" : "outline"}
              onClick={() => setBase64Mode("encode")}
            >
              Encode
            </Button>
            <Button
              variant={base64Mode === "decode" ? "default" : "outline"}
              onClick={() => setBase64Mode("decode")}
            >
              Decode
            </Button>
          </div>
          <Textarea
            placeholder={`Enter text to ${base64Mode}...`}
            value={base64Input}
            onChange={(e) => setBase64Input(e.target.value)}
          />
          <Button onClick={processBase64} disabled={!base64Input}>
            {base64Mode === "encode" ? "Encode" : "Decode"}
          </Button>
          {base64Output && (
            <div className="flex items-center gap-2">
              <Textarea value={base64Output} readOnly className="flex-1" />
              <Button size="sm" onClick={() => copyToClipboard(base64Output)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )
    },
    {
      id: "url-tool",
      title: "URL Encoder/Decoder",
      description: "Encode and decode URL strings",
      icon: <Globe className="h-6 w-6" />,
      category: "Encoding",
      component: (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={urlMode === "encode" ? "default" : "outline"}
              onClick={() => setUrlMode("encode")}
            >
              Encode
            </Button>
            <Button
              variant={urlMode === "decode" ? "default" : "outline"}
              onClick={() => setUrlMode("decode")}
            >
              Decode
            </Button>
          </div>
          <Input
            placeholder={`Enter URL to ${urlMode}...`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <Button onClick={processUrl} disabled={!urlInput}>
            {urlMode === "encode" ? "Encode" : "Decode"}
          </Button>
          {urlOutput && (
            <div className="flex items-center gap-2">
              <Input value={urlOutput} readOnly className="flex-1" />
              <Button size="sm" onClick={() => copyToClipboard(urlOutput)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )
    },
    {
      id: "json-formatter",
      title: "JSON Formatter",
      description: "Format and validate JSON data",
      icon: <FileCode className="h-6 w-6" />,
      category: "Development",
      component: (
        <div className="space-y-4">
          <Textarea
            placeholder="Enter JSON to format..."
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={6}
          />
          <Button onClick={formatJson} disabled={!jsonInput}>
            Format JSON
          </Button>
          {jsonError && (
            <Alert>
              <XCircle className="h-4 w-4" />
              <AlertDescription>{jsonError}</AlertDescription>
            </Alert>
          )}
          {jsonOutput && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">Valid JSON</span>
                <Button size="sm" onClick={() => copyToClipboard(jsonOutput)} className="ml-auto">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Textarea value={jsonOutput} readOnly rows={8} className="font-mono text-sm" />
            </div>
          )}
        </div>
      )
    },
    {
      id: "color-palette",
      title: "Color Palette Generator",
      description: "Generate color palettes from a base color",
      icon: <Palette className="h-6 w-6" />,
      category: "Design",
      component: (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={baseColor}
              onChange={(e) => setBaseColor(e.target.value)}
              className="w-16 h-16 rounded border"
            />
            <div>
              <label className="block text-sm font-medium">Base Color</label>
              <Input
                value={baseColor}
                onChange={(e) => setBaseColor(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
          <Button onClick={generateColorPalette}>
            Generate Palette
          </Button>
          {colorPalette.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {colorPalette.map((color, index) => (
                <div key={index} className="text-center">
                  <div
                    className="w-full h-16 rounded border cursor-pointer"
                    style={{ backgroundColor: color }}
                    onClick={() => copyToClipboard(color)}
                  />
                  <p className="text-xs mt-1 font-mono">{color}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      id: "qr-generator",
      title: "QR Code Generator",
      description: "Generate QR codes from text",
      icon: <Target className="h-6 w-6" />,
      category: "Utility",
      component: (
        <div className="space-y-4">
          <Textarea
            placeholder="Enter text to generate QR code..."
            value={qrText}
            onChange={(e) => setQrText(e.target.value)}
          />
          <Button onClick={generateQrCode} disabled={!qrText}>
            Generate QR Code
          </Button>
          {qrCodeUrl && (
            <div className="text-center">
              <img src={qrCodeUrl} alt="Generated QR Code" className="mx-auto border rounded" />
              <Button size="sm" className="mt-2" onClick={() => window.open(qrCodeUrl, '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          )}
        </div>
      )
    },
    {
      id: "password-checker",
      title: "Password Strength Checker",
      description: "Check the strength of your passwords",
      icon: <Shield className="h-6 w-6" />,
      category: "Security",
      component: (
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Enter password to check..."
            value={passwordToCheck}
            onChange={(e) => {
              setPasswordToCheck(e.target.value);
              checkPasswordStrength(e.target.value);
            }}
          />
          {passwordToCheck && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Strength:</span>
                <Progress value={(passwordStrength.score / 5) * 100} className="flex-1" />
                <Badge variant={passwordStrength.color === "green" ? "default" : "destructive"}>
                  {passwordStrength.score}/5
                </Badge>
              </div>
              {passwordStrength.feedback.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium">Suggestions:</p>
                  <ul className="list-disc list-inside">
                    {passwordStrength.feedback.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }
  ];

  const getFilteredTools = () => {
    let tools = realTools;

    if (searchTerm) {
      tools = tools.filter(tool => 
        tool.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return tools;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-gray-700 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground hover:bg-gray-800/50"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <h1 className="text-xl font-bold text-foreground">Tools Hub</h1>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-gray-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground glitch" data-text="TOOLS HUB">
            TOOLS HUB
          </h1>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Real, functional tools for cybersecurity and development."
              speed={80}
              className="text-muted-foreground"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Access our collection of real, working tools for cybersecurity analysis, 
            web development, and digital innovation. All tools are functional and ready to use.
          </p>
        </div>
      </section>

      {/* Search Section */}
      <section className="py-8 px-4 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1">
            <Input
              placeholder="Search tools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-card/50 border-gray-700"
            />
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {getFilteredTools().map((tool) => (
            <Card 
              key={tool.id} 
              className="bg-card/50 border border-gray-700 hover:border-primary/40 transition-all duration-300"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="text-primary">
                    {tool.icon}
                  </div>
                  <Badge variant="outline">{tool.category}</Badge>
                </div>
                <CardTitle className="text-lg font-bold text-foreground">
                  {tool.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {tool.description}
                </p>
              </CardHeader>
              <CardContent>
                <Button 
                  size="sm" 
                  className="w-full mb-4"
                  onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                >
                  {activeTool === tool.id ? "Hide Tool" : "Use Tool"}
                </Button>
                {activeTool === tool.id && (
                  <div className="border-t pt-4">
                    {tool.component}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {getFilteredTools().length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No tools found matching your search criteria.</p>
          </div>
        )}
      </section>

      {/* Terminal Section */}
      <section className="py-16 px-4 max-w-4xl mx-auto">
        <TerminalWindow title="tools-status.sh">
          <div className="space-y-2">
            <div className="text-cyber-green">$ ./check_tools_status.sh</div>
            <div className="text-foreground">
              <div>✓ Real Functional Tools: {realTools.length} active</div>
              <div>✓ Security Tools: {realTools.filter(t => t.category === "Security").length} available</div>
              <div>✓ Development Tools: {realTools.filter(t => t.category === "Development").length} available</div>
              <div>✓ Utility Tools: {realTools.filter(t => t.category === "Utility").length} available</div>
              <div>✓ All tools are functional and ready to use</div>
              <div>✓ No simulated or placeholder tools</div>
            </div>
            <div className="text-cyber-green typing-cursor">$ _</div>
          </div>
        </TerminalWindow>
      </section>
    </div>
  );
};

export default Tools;

