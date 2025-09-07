import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AdvancedTerminal from '@/components/AdvancedTerminal';
import { useAuthStore } from '@/store/authStore';
import { 
  Terminal, 
  Shield, 
  Scan, 
  Globe, 
  Lock, 
  Eye, 
  Search, 
  Code, 
  Database, 
  Network,
  Zap,
  Bug,
  Key,
  Fingerprint,
  Wifi,
  Server,
  Activity,
  AlertTriangle,
  Settings,
  Crown,
  Star
} from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  category: 'scan' | 'exploit' | 'analyze' | 'monitor' | 'secure';
  difficulty: 'basic' | 'advanced' | 'expert' | 'elite';
  requiresAuth: boolean;
  isPremium: boolean;
  isElite: boolean;
  action: () => void;
}

const CyberArena = () => {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated } = useAuthStore();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);

  const username = profile?.username || profile?.full_name || 'Agent';

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const executePortScan = async (target: string) => {
    setIsScanning(true);
    try {
      const response = await fetch('/functions/v1/port-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const result = await response.json();
      setScanResults(result);
    } catch (error) {
      console.error('Port scan failed:', error);
    }
    setIsScanning(false);
  };

  const executeVulnScan = async (target: string) => {
    setIsScanning(true);
    try {
      const response = await fetch('/functions/v1/vulnerability-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const result = await response.json();
      setScanResults(result);
    } catch (error) {
      console.error('Vulnerability scan failed:', error);
    }
    setIsScanning(false);
  };

  const executeDNSAnalysis = async (domain: string) => {
    setIsScanning(true);
    try {
      const response = await fetch('/functions/v1/dns-analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      const result = await response.json();
      setScanResults(result);
    } catch (error) {
      console.error('DNS analysis failed:', error);
    }
    setIsScanning(false);
  };

  const executeSSLAnalysis = async (domain: string) => {
    setIsScanning(true);
    try {
      const response = await fetch('/functions/v1/ssl-analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });  
      const result = await response.json();
      setScanResults(result);
    } catch (error) {
      console.error('SSL analysis failed:', error);
    }
    setIsScanning(false);
  };

  const executeWebScan = async (url: string) => {
    setIsScanning(true);
    try {
      const response = await fetch('/functions/v1/web-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const result = await response.json();
      setScanResults(result);
    } catch (error) {
      console.error('Web scan failed:', error);
    }
    setIsScanning(false);
  };

  const tools: Tool[] = [
    // Scanning Tools
    {
      id: 'port-scanner',
      name: 'Port Scanner',
      description: 'Advanced TCP/UDP port scanning with service detection',
      icon: Network,
      category: 'scan',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => {
        const target = prompt('Enter target IP or hostname:');
        if (target) executePortScan(target);
      }
    },
    {
      id: 'vuln-scanner',
      name: 'Vulnerability Scanner',
      description: 'Comprehensive vulnerability assessment and CVE detection',
      icon: Shield,
      category: 'scan',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => {
        const target = prompt('Enter target URL or IP:');
        if (target) executeVulnScan(target);
      }
    },
    {
      id: 'dns-analyzer',
      name: 'DNS Analyzer',
      description: 'Deep DNS record analysis and subdomain enumeration',
      icon: Globe,
      category: 'analyze',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => {
        const domain = prompt('Enter domain name:');
        if (domain) executeDNSAnalysis(domain);
      }
    },
    {
      id: 'ssl-analyzer',
      name: 'SSL/TLS Analyzer',
      description: 'Certificate analysis and SSL configuration assessment',
      icon: Lock,
      category: 'analyze',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => {
        const domain = prompt('Enter domain name:');
        if (domain) executeSSLAnalysis(domain);
      }
    },
    {
      id: 'web-scanner',
      name: 'Web Application Scanner',
      description: 'OWASP Top 10 vulnerability scanning for web applications',
      icon: Code,
      category: 'scan',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => {
        const url = prompt('Enter web application URL:');
        if (url) executeWebScan(url);
      }
    },
    // Premium Tools
    {
      id: 'advanced-recon',
      name: 'Advanced Reconnaissance',
      description: 'OSINT gathering and target profiling suite',
      icon: Eye,
      category: 'analyze',
      difficulty: 'expert',
      requiresAuth: true,
      isPremium: true,
      isElite: false,
      action: () => alert('Advanced Reconnaissance - Premium Feature')
    },
    {
      id: 'exploit-framework',
      name: 'Exploit Framework',
      description: 'Metasploit-style exploitation framework',
      icon: Bug,
      category: 'exploit',
      difficulty: 'expert',
      requiresAuth: true,
      isPremium: true,
      isElite: false,
      action: () => alert('Exploit Framework - Premium Feature')
    },
    {
      id: 'crypto-analyzer',
      name: 'Cryptographic Analyzer',
      description: 'Advanced cryptographic weakness detection',
      icon: Key,
      category: 'analyze',
      difficulty: 'expert',
      requiresAuth: true,
      isPremium: true,
      isElite: false,
      action: () => alert('Crypto Analyzer - Premium Feature')
    },
    {
      id: 'social-engineering',
      name: 'Social Engineering Toolkit',
      description: 'Phishing and social engineering simulation tools',
      icon: Fingerprint,
      category: 'exploit',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: true,
      isElite: false,
      action: () => alert('Social Engineering Toolkit - Premium Feature')
    },
    {
      id: 'wireless-auditor',
      name: 'Wireless Security Auditor',
      description: 'WiFi security assessment and penetration testing',
      icon: Wifi,
      category: 'scan',
      difficulty: 'expert',
      requiresAuth: true,
      isPremium: true,
      isElite: false,
      action: () => alert('Wireless Auditor - Premium Feature')
    },
    // Elite Tools
    {
      id: 'zero-day-hunter',
      name: 'Zero-Day Hunter',
      description: 'AI-powered zero-day vulnerability discovery',
      icon: Zap,
      category: 'scan',
      difficulty: 'elite',
      requiresAuth: true,
      isPremium: false,
      isElite: true,
      action: () => alert('Zero-Day Hunter - Elite Feature')
    },
    {
      id: 'advanced-persistent-threat',
      name: 'APT Simulator',
      description: 'Advanced Persistent Threat simulation and detection',
      icon: Server,
      category: 'exploit',
      difficulty: 'elite',
      requiresAuth: true,
      isPremium: false,
      isElite: true,
      action: () => alert('APT Simulator - Elite Feature')
    },
    {
      id: 'quantum-cryptanalysis',
      name: 'Quantum Cryptanalysis',
      description: 'Post-quantum cryptography analysis tools',
      icon: Database,
      category: 'analyze',
      difficulty: 'elite',
      requiresAuth: true,
      isPremium: false,
      isElite: true,
      action: () => alert('Quantum Cryptanalysis - Elite Feature')
    },
    {
      id: 'ai-threat-prediction',
      name: 'AI Threat Prediction',
      description: 'Machine learning-based threat prediction system',
      icon: Activity,
      category: 'monitor',
      difficulty: 'elite',
      requiresAuth: true,
      isPremium: false,
      isElite: true,
      action: () => alert('AI Threat Prediction - Elite Feature')
    },
    {
      id: 'blockchain-auditor',
      name: 'Blockchain Security Auditor',
      description: 'Smart contract and blockchain vulnerability assessment',
      icon: Shield,
      category: 'analyze',
      difficulty: 'elite',
      requiresAuth: true,
      isPremium: false,
      isElite: true,
      action: () => alert('Blockchain Auditor - Elite Feature')
    },
    // Additional Basic Tools
    {
      id: 'hash-cracker',
      name: 'Hash Cracker',
      description: 'Multi-algorithm hash cracking with wordlists',
      icon: Key,
      category: 'exploit',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => alert('Hash Cracker - Basic Tool')
    },
    {
      id: 'network-monitor',
      name: 'Network Monitor',  
      description: 'Real-time network traffic analysis and monitoring',
      icon: Activity,
      category: 'monitor',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => alert('Network Monitor - Basic Tool')
    },
    {
      id: 'payload-generator',
      name: 'Payload Generator',
      description: 'Custom payload generation for penetration testing',
      icon: Code,
      category: 'exploit',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => alert('Payload Generator - Advanced Tool')
    },
    {
      id: 'security-scanner',
      name: 'Security Configuration Scanner',
      description: 'System configuration and hardening assessment',
      icon: Settings,
      category: 'scan',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => alert('Security Scanner - Basic Tool')
    },
    {
      id: 'threat-intel',
      name: 'Threat Intelligence Feed',
      description: 'Real-time threat intelligence and IOC monitoring',
      icon: AlertTriangle,
      category: 'monitor',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      action: () => alert('Threat Intelligence - Advanced Tool')
    }
  ];

  const categories = [
    { id: 'all', name: 'All Tools', icon: Terminal },
    { id: 'scan', name: 'Scanning', icon: Scan },
    { id: 'exploit', name: 'Exploitation', icon: Bug },
    { id: 'analyze', name: 'Analysis', icon: Search },
    { id: 'monitor', name: 'Monitoring', icon: Activity },
    { id: 'secure', name: 'Security', icon: Shield }
  ];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'basic': return 'bg-green-500/20 text-green-400 border-green-500/40';
      case 'advanced': return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'expert': return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'elite': return 'bg-pink-500/20 text-pink-400 border-pink-500/40';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    }
  };

  const filteredTools = tools.filter(tool => 
    activeCategory === 'all' || tool.category === activeCategory
  );

  const canAccessTool = (tool: Tool) => {
    if (!tool.requiresAuth) return true;
    if (!isAuthenticated) return false;
    
    // Admin can access everything
    if (profile?.role === 'admin') return true;
    
    // Check premium/elite access
    if (tool.isPremium && profile?.access_level !== 'premium' && profile?.access_level !== 'elite') return false;
    if (tool.isElite && profile?.access_level !== 'elite') return false;
    
    return true;
  };

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden pt-16">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Matrix rain effect */}
        <div className="matrix-rain opacity-10"></div>
        
        {/* Holographic grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5"></div>
        
        {/* Floating particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-cyan-400 rounded-full opacity-60 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${4 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-4">
            CYBER ARENA
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            Welcome to the battlefield, <span className="text-cyan-400 font-bold">{username}</span>
          </p>
          <p className="text-gray-400 font-mono">
            20 Elite Cybersecurity Tools at Your Command
          </p>
          
          {/* Access Level Badge */}
          <div className="flex justify-center mt-4">
            <Badge className={`px-4 py-2 ${
              profile?.role === 'admin' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
              profile?.access_level === 'elite' ? 'bg-pink-500/20 text-pink-400 border-pink-500/40' :
              profile?.access_level === 'premium' ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' :
              'bg-green-500/20 text-green-400 border-green-500/40'
            }`}>
              {profile?.role === 'admin' ? (
                <><Crown className="w-4 h-4 mr-2" />ADMIN ACCESS</>
              ) : profile?.access_level === 'elite' ? (
                <><Star className="w-4 h-4 mr-2" />ELITE ACCESS</>
              ) : profile?.access_level === 'premium' ? (
                <><Crown className="w-4 h-4 mr-2" />PREMIUM ACCESS</>
              ) : (
                <>BASIC ACCESS</>
              )}
            </Badge>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {categories.map((category) => (
            <Button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              variant={activeCategory === category.id ? "default" : "outline"}
              className={`${
                activeCategory === category.id
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                  : 'border-gray-600 text-gray-300 hover:bg-gray-800/50'
              } transition-all duration-300`}
            >
              <category.icon className="w-4 h-4 mr-2" />
              {category.name}
            </Button>
          ))}
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
          {filteredTools.map((tool) => {
            const hasAccess = canAccessTool(tool);
            return (
              <Card 
                key={tool.id}
                className={`relative bg-gray-900/50 border-gray-700 hover:border-cyan-500/50 transition-all duration-300 group ${
                  hasAccess ? 'cursor-pointer hover:scale-105' : 'opacity-60'
                }`}
                onClick={hasAccess ? tool.action : () => {}}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <tool.icon className={`w-8 h-8 ${
                      tool.isElite ? 'text-pink-400' :
                      tool.isPremium ? 'text-purple-400' :
                      'text-cyan-400'
                    }`} />
                    <Badge className={getDifficultyColor(tool.difficulty)}>
                      {tool.difficulty.toUpperCase()}
                    </Badge>
                  </div>
                  <CardTitle className="text-white text-lg">{tool.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400 text-sm mb-4">{tool.description}</p>
                  
                  <div className="flex justify-between items-center">
                    <Badge variant="outline" className="text-xs">
                      {tool.category.toUpperCase()}
                    </Badge>
                    
                    {(tool.isPremium || tool.isElite) && (
                      <Badge className={
                        tool.isElite ? 'bg-pink-500/20 text-pink-400' :
                        'bg-purple-500/20 text-purple-400'
                      }>
                        {tool.isElite ? 'ELITE' : 'PREMIUM'}
                      </Badge>
                    )}
                  </div>
                  
                  {!hasAccess && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
                      <div className="text-center">
                        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">
                          {tool.isPremium ? 'Premium Required' : 
                           tool.isElite ? 'Elite Required' : 'Access Denied'}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Terminal Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">ETERNYX TERMINAL</h2>
            <Button
              onClick={() => setTerminalVisible(!terminalVisible)}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500"
            >
              <Terminal className="w-4 h-4 mr-2" />
              {terminalVisible ? 'Hide Terminal' : 'Show Terminal'}
            </Button>
          </div>
          
          {terminalVisible && (
            <div className="animate-fade-in">
              <AdvancedTerminal 
                title={`ETERNYX@${username.toUpperCase()}`}
                className="max-w-full"
              />
            </div>
          )}
        </div>

        {/* Scan Results */}
        {scanResults && (
          <Card className="bg-gray-900/50 border-gray-700 mb-8">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Activity className="w-5 h-5 mr-2 text-cyan-400" />
                Scan Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-green-400 font-mono text-sm bg-black/50 p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(scanResults, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Loading Indicator */}
        {isScanning && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mb-4"></div>
              <p className="text-cyan-400 font-mono">Executing scan...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CyberArena;