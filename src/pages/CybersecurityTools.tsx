import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import CyberpunkBackground from '@/components/CyberpunkBackground';
import CryptoTool from '@/components/tools/CryptoTool';
import NetworkScanner from '@/components/tools/NetworkScanner';
import {
  Shield, Scan, Database, Key, Lock, Globe, 
  Terminal, ExternalLink, FileCode, AlertTriangle, Search, Zap
} from 'lucide-react';

interface CyberTool {
  id: string;
  name: string;
  description: string;
  type: 'Tool' | 'API' | 'Library' | 'CLI';
  category: 'Web Security' | 'Vulnerability Assessment' | 'Encryption' | 'Threat Intelligence';
  icon: React.ReactNode;
  features: string[];
  link?: string;
  documentation?: string;
  installation?: string;
  riskLevel: 'Low' | 'Medium' | 'High';
}

const cyberTools: CyberTool[] = [
  {
    id: 'owasp-zap',
    name: 'OWASP ZAP',
    description: 'Open-source web application security scanner with API automation capabilities',
    type: 'Tool',
    category: 'Web Security',
    icon: React.createElement(Shield),
    features: ['Automated scanning', 'Manual testing tools', 'API automation', 'Proxy functionality', 'Extensible'],
    link: 'https://www.zaproxy.org/',
    documentation: 'https://www.zaproxy.org/docs/',
    installation: 'Download from official website or Docker',
    riskLevel: 'Medium'
  },
  {
    id: 'nikto',
    name: 'Nikto',
    description: 'Web server scanner that tests for dangerous files, outdated versions, and security issues',
    type: 'CLI',
    category: 'Web Security',
    icon: React.createElement(Scan),
    features: ['Web server scanning', '6700+ potentially dangerous files', 'Version detection', 'Plugin support', 'Multiple output formats'],
    link: 'https://cirt.net/Nikto2',
    documentation: 'https://github.com/sullo/nikto/wiki',
    installation: 'apt-get install nikto or from GitHub',
    riskLevel: 'Medium'
  },
  {
    id: 'sqlmap',
    name: 'SQLMap',
    description: 'Automatic SQL injection and database takeover tool',
    type: 'CLI',
    category: 'Vulnerability Assessment',
    icon: React.createElement(Database),
    features: ['Automatic SQL injection detection', 'Database fingerprinting', 'Data extraction', 'File system access', 'Out-of-band connections'],
    link: 'https://sqlmap.org/',
    documentation: 'https://github.com/sqlmapproject/sqlmap/wiki',
    installation: 'git clone https://github.com/sqlmapproject/sqlmap.git',
    riskLevel: 'High'
  },
  {
    id: 'virustotal-api',
    name: 'VirusTotal API',
    description: 'API for analyzing suspicious files and URLs with multiple antivirus engines',
    type: 'API',
    category: 'Threat Intelligence',
    icon: React.createElement(Search),
    features: ['Multi-engine scanning', 'File analysis', 'URL scanning', 'Domain/IP reputation', 'Behavioral analysis'],
    link: 'https://www.virustotal.com/gui/home/upload',
    documentation: 'https://developers.virustotal.com/reference/overview',
    installation: 'API key required - REST API',
    riskLevel: 'Low'
  },
  {
    id: 'haveibeenpwned-api',
    name: 'HaveIBeenPwned API',
    description: 'Check if email addresses or passwords have been compromised in data breaches',
    type: 'API',
    category: 'Threat Intelligence',
    icon: React.createElement(AlertTriangle),
    features: ['Breach detection', 'Password checking', 'Domain monitoring', 'Paste monitoring', 'Subscription service'],
    link: 'https://haveibeenpwned.com/',
    documentation: 'https://haveibeenpwned.com/API/v3',
    installation: 'REST API - API key required for some features',
    riskLevel: 'Low'
  },
  {
    id: 'openssl',
    name: 'OpenSSL',
    description: 'Robust toolkit for SSL/TLS protocols and general-purpose cryptography library',
    type: 'Library',
    category: 'Encryption',
    icon: React.createElement(Lock),
    features: ['SSL/TLS implementation', 'Cryptographic functions', 'Certificate management', 'Key generation', 'Digital signatures'],
    link: 'https://www.openssl.org/',
    documentation: 'https://www.openssl.org/docs/',
    installation: 'Pre-installed on most systems or compile from source',
    riskLevel: 'Low'
  },
  {
    id: 'cryptojs',
    name: 'CryptoJS',
    description: 'JavaScript library of crypto standards for client-side encryption',
    type: 'Library',
    category: 'Encryption',
    icon: React.createElement(Key),
    features: ['AES encryption', 'Hash functions', 'HMAC', 'PBKDF2', 'Cipher modes'],
    link: 'https://cryptojs.gitbook.io/docs/',
    documentation: 'https://cryptojs.gitbook.io/docs/',
    installation: 'npm install crypto-js',
    riskLevel: 'Low'
  }
];

const CybersecurityTools = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [scanningEffect, setScanningEffect] = useState(false);
  const { toast } = useToast();

  // Scanning effect animation
  useEffect(() => {
    const interval = setInterval(() => {
      setScanningEffect(true);
      setTimeout(() => setScanningEffect(false), 2000);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const categories = [
    { id: 'all', name: 'All Tools', icon: <Shield className="w-4 h-4" /> },
    { id: 'Web Security', name: 'Web Security', icon: <Globe className="w-4 h-4" /> },
    { id: 'Vulnerability Assessment', name: 'Vulnerability Assessment', icon: <Scan className="w-4 h-4" /> },
    { id: 'Encryption', name: 'Encryption', icon: <Lock className="w-4 h-4" /> },
    { id: 'Threat Intelligence', name: 'Threat Intelligence', icon: <Search className="w-4 h-4" /> }
  ];

  const filteredTools = selectedCategory === 'all' 
    ? cyberTools 
    : cyberTools.filter(tool => tool.category === selectedCategory);

  const handleToolAction = (tool: CyberTool) => {
    if (tool.link) {
      window.open(tool.link, '_blank');
    }
    toast({
      title: `${tool.name} Accessed`,
      description: `Opening ${tool.name} - Use responsibly and ethically`,
    });
  };

  const getTypeColor = (type: string) => {
    const colors = {
      'Tool': 'bg-red-500/20 text-red-400 border-red-500/30',
      'API': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Library': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'CLI': 'bg-green-500/20 text-green-400 border-green-500/30'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getRiskColor = (risk: string) => {
    const colors = {
      'Low': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Medium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'High': 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[risk as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 relative overflow-hidden">
      <CyberpunkBackground variant="matrix" color="#ff4444" intensity="medium" />
      
      {/* Scanning line effect */}
      {scanningEffect && (
        <div className="fixed inset-0 pointer-events-none z-10">
          <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse"
               style={{
                 top: '50%',
                 boxShadow: '0 0 20px #ff4444, 0 0 40px #ff4444',
                 animation: 'scan 2s linear'
               }} />
        </div>
      )}
      
      <div className="max-w-7xl mx-auto relative z-20">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent mb-4 animate-pulse">
            <Zap className="inline-block w-8 h-8 mr-2 text-red-400" />
            Cybersecurity Tools
          </h1>
          <p className="text-gray-300 text-lg">
            Professional security testing and analysis tools - Use responsibly and ethically
          </p>
          <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg backdrop-blur-sm">
            <p className="text-red-400 text-sm animate-pulse">
              ⚠️ <strong>Warning:</strong> These tools are for authorized security testing only. 
              Ensure you have proper permission before using on any systems.
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-8">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 bg-gray-900/50 border border-red-500/30">
            {categories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="flex items-center gap-2 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400"
              >
                {category.icon}
                <span className="hidden sm:inline">{category.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTools.map((tool, index) => (
            <Card key={tool.id} className="bg-gray-900/50 border-red-500/30 hover:border-red-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 backdrop-blur-sm group">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded-lg text-red-400 group-hover:animate-pulse">
                      {tool.icon}
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg group-hover:text-red-400 transition-colors">
                        {tool.name}
                      </CardTitle>
                      <div className="flex gap-2 mt-1">
                        <Badge className={getTypeColor(tool.type)}>
                          {tool.type}
                        </Badge>
                        <Badge className={getRiskColor(tool.riskLevel)}>
                          {tool.riskLevel} Risk
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">{tool.description}</p>
                
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-red-400 mb-2">Key Features:</h4>
                  <ul className="text-sm text-gray-300 space-y-1">
                    {tool.features.slice(0, 3).map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-red-400 rounded-full animate-pulse"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {tool.installation && (
                  <div className="mb-4 p-2 bg-black/50 rounded border border-gray-700 backdrop-blur-sm">
                    <p className="text-xs text-gray-400 mb-1">Installation:</p>
                    <code className="text-xs text-green-400 font-mono">{tool.installation}</code>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleToolAction(tool)}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Access
                  </Button>
                  {tool.documentation && (
                    <Button
                      onClick={() => window.open(tool.documentation, '_blank')}
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all duration-300"
                    >
                      <FileCode className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTools.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No tools found in this category.</p>
          </div>
        )}

        {/* Embedded Functional Security Tools */}
        <div className="mt-12 space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent mb-4">
              <Shield className="inline-block w-8 h-8 mr-2 text-red-400" />
              Interactive Security Tools
            </h2>
            <p className="text-gray-300 text-lg">
              Fully functional security tools for testing, analysis, and education
            </p>
            <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg backdrop-blur-sm">
              <p className="text-red-400 text-sm animate-pulse">
                ⚠️ <strong>Ethical Use Only:</strong> These tools are for authorized testing and educational purposes only.
              </p>
            </div>
          </div>

          {/* Cryptography Tool */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold text-red-400 flex items-center gap-2">
              <Lock className="w-6 h-6" />
              Cryptography & Hashing Tool
            </h3>
            <CryptoTool />
          </div>

          {/* Network Scanner */}
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold text-red-400 flex items-center gap-2">
              <Scan className="w-6 h-6" />
              Network Scanner & Analyzer
            </h3>
            <NetworkScanner />
          </div>
        </div>
      </div>
      
      {/* Add custom CSS for scanning animation */}
      <style jsx>{`
        @keyframes scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

export default CybersecurityTools;

