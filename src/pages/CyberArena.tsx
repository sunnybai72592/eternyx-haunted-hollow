import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import AdvancedTerminal from '@/components/AdvancedTerminal';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
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
  inputPlaceholder?: string;
  inputLabel?: string;
}

const CyberArena = () => {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated } = useAuthStore();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [toolInputs, setToolInputs] = useState<{[key: string]: string}>({});
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const username = profile?.username || profile?.full_name || 'Agent';

  // Verify administrator access through the trusted database assignment.
  useEffect(() => {
    let active = true;

    const verifyAdmin = async () => {
      if (!user) {
        if (active) setIsAdmin(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('is_admin');
        if (error) throw error;
        if (active) setIsAdmin(data === true);
      } catch (error) {
        console.error('Cyber Arena admin verification failed:', error);
        if (active) setIsAdmin(false);
      }
    };

    void verifyAdmin();
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const executeToolAction = async (toolId: string, input: string) => {
    if (!input.trim()) return;
    
    setIsScanning(true);
    setActiveTool(toolId);
    setScanResults(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let functionName = '';
      let payload: any = { user_id: user?.id };
      
      switch (toolId) {
        case 'port-scanner':
          functionName = 'port-scanner';
          delete payload.user_id; // Ownership is derived from the verified JWT.
          payload.target = input;
          break;
        case 'vuln-scanner':
          functionName = 'vulnerability-scanner';
          delete payload.user_id; // Ownership is derived from the verified JWT.
          payload.product = input;
          break;
        case 'dns-analyzer':
          functionName = 'dns-analyzer';
          payload.domain = input;
          break;
        case 'subdomain-discovery':
          functionName = 'subdomain-discovery';
          payload.domain = input;
          break;
        case 'ssl-analyzer':
          functionName = 'ssl-analyzer';
          delete payload.user_id; // The Edge Function derives ownership from the verified JWT.
          payload.hostname = input;
          break;
        case 'web-scanner':
          functionName = 'web-scanner';
          delete payload.user_id; // Ownership is derived from the verified JWT.
          payload.target_url = input;
          break;
        default:
          throw new Error('Unknown tool');
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload
      });

      if (error) throw error;
      
      setScanResults(data);
    } catch (error) {
      console.error(`${toolId} failed:`, error);
      setScanResults({
        error: true,
        message: error instanceof Error ? error.message : 'Tool execution failed'
      });
    }
    setIsScanning(false);
  };

  const tools: Tool[] = [
    // Scanning Tools
    {
      id: 'port-scanner',
      name: 'Shodan Host Exposure Lookup',
      description: 'Passive lookup of publicly observed host ports from Shodan; not a live port scan.',
      icon: Network,
      category: 'scan',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      inputPlaceholder: 'Enter a public IPv4 address',
      inputLabel: 'Target'
    },
    {
      id: 'vuln-scanner',
      name: 'CVE Research',
      description: 'Search public NVD CVE records for a software product; keyword matches require manual version verification.',
      icon: Shield,
      category: 'scan',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      inputPlaceholder: 'Enter software product and version',
      inputLabel: 'Product / version'
    },
    {
      id: 'subdomain-discovery',
      name: 'Passive Subdomain Discovery',
      description: 'Discover publicly logged subdomains from Certificate Transparency records; results are not a complete asset inventory or proof of live DNS.',
      icon: Search,
      category: 'analyze',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      inputPlaceholder: 'Enter an authorized domain (example.com)',
      inputLabel: 'Root domain'
    },
    {
      id: 'dns-analyzer',
      name: 'DNS Analyzer',
      description: 'DNS record, DNSSEC signal, and email security configuration analysis',
      icon: Globe,
      category: 'analyze',
      difficulty: 'basic',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      inputPlaceholder: 'Enter domain name',
      inputLabel: 'Domain'
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
      inputPlaceholder: 'Enter domain name',
      inputLabel: 'Domain'
    },
    {
      id: 'web-scanner',
      name: 'Web Configuration Inspector',
      description: 'Single-request passive HTTP security-header and cookie configuration inspection; no intrusive vulnerability probes.',
      icon: Code,
      category: 'scan',
      difficulty: 'advanced',
      requiresAuth: true,
      isPremium: false,
      isElite: false,
      inputPlaceholder: 'https://example.com',
      inputLabel: 'URL'
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
      inputPlaceholder: 'Enter target domain or IP',
      inputLabel: 'Target'
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
      inputPlaceholder: 'Enter target IP or service',
      inputLabel: 'Target'
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
      inputPlaceholder: 'Enter cipher text or key',
      inputLabel: 'Input'
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
      inputPlaceholder: 'Enter email or domain',
      inputLabel: 'Target'
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
      inputPlaceholder: 'Enter BSSID or ESSID',
      inputLabel: 'Network'
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
      inputPlaceholder: 'Enter binary or service',
      inputLabel: 'Target'
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
      inputPlaceholder: 'Enter campaign name',
      inputLabel: 'Campaign'
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
      inputPlaceholder: 'Enter quantum algorithm',
      inputLabel: 'Algorithm'
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
      inputPlaceholder: 'Enter data source',
      inputLabel: 'Source'
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
      inputPlaceholder: 'Enter contract address',
      inputLabel: 'Contract'
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
      inputPlaceholder: 'Enter hash to crack',
      inputLabel: 'Hash'
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
      inputPlaceholder: 'Enter network interface',
      inputLabel: 'Interface'
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
      inputPlaceholder: 'Enter payload type',
      inputLabel: 'Type'
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
      inputPlaceholder: 'Enter system IP',
      inputLabel: 'Target'
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
      inputPlaceholder: 'Enter IOC or hash',
      inputLabel: 'IOC'
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
    if (isAdmin) return true;
    
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
            Security workbenches with real, evidence-based execution
          </p>
          
          {/* Access Level Badge */}
          <div className="flex justify-center mt-4">
            <Badge className={`px-4 py-2 ${
              isAdmin ? 'bg-red-500/20 text-red-400 border-red-500/40' :
              profile?.access_level === 'elite' ? 'bg-pink-500/20 text-pink-400 border-pink-500/40' :
              profile?.access_level === 'premium' ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' :
              'bg-green-500/20 text-green-400 border-green-500/40'
            }`}>
              {isAdmin ? (
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
            const isActive = activeTool === tool.id && isScanning;
            return (
              <Card 
                key={tool.id}
                className={`relative bg-gray-900/50 border-gray-700 hover:border-cyan-500/50 transition-all duration-300 group ${
                  hasAccess ? 'hover:scale-105' : 'opacity-60'
                } ${isActive ? 'border-cyan-400 bg-gray-800/70' : ''}`}
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
                  
                  {/* Integrated Input Field */}
                  {hasAccess && tool.inputPlaceholder && (
                    <div className="space-y-3 mb-4">
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder={tool.inputPlaceholder}
                          value={toolInputs[tool.id] || ''}
                          onChange={(e) => setToolInputs(prev => ({
                            ...prev,
                            [tool.id]: e.target.value
                          }))}
                          className="bg-black/50 border-gray-600 text-white placeholder-gray-400 focus:border-cyan-400"
                          disabled={isScanning}
                        />
                        <span className="absolute -top-2 left-2 text-xs text-gray-500 bg-gray-900 px-1">
                          {tool.inputLabel}
                        </span>
                      </div>
                      <Button
                        onClick={() => executeToolAction(tool.id, toolInputs[tool.id] || '')}
                        disabled={isScanning || !toolInputs[tool.id]?.trim()}
                        className={`w-full ${
                          ['port-scanner', 'vuln-scanner', 'dns-analyzer', 'subdomain-discovery', 'ssl-analyzer', 'web-scanner'].includes(tool.id)
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500'
                            : tool.isPremium
                            ? 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500'
                            : tool.isElite
                            ? 'bg-gradient-to-r from-pink-500 to-red-600 hover:from-pink-400 hover:to-red-500'
                            : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600'
                        } transition-all duration-300`}
                      >
                        {isActive ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Executing...
                          </>
                        ) : (
                          <>
                            <Terminal className="w-4 h-4 mr-2" />
                            Execute
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  
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
                {activeTool === 'subdomain-discovery' ? 'Subdomain Discovery Results' : 'Scan Results'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeTool === 'dns-analyzer' &&
              !scanResults.error &&
              Array.isArray(scanResults.dns_records) ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                      {scanResults.domain || 'Analyzed domain'}
                    </Badge>
                    <Badge variant="outline" className="text-gray-300">
                      {scanResults.dns_records.length} DNS records observed
                    </Badge>
                    <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                      Risk score: {scanResults.risk_score ?? 'N/A'}/100
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Critical', value: scanResults.summary?.critical ?? 0, tone: 'text-red-300' },
                      { label: 'High', value: scanResults.summary?.high ?? 0, tone: 'text-orange-300' },
                      { label: 'Medium', value: scanResults.summary?.medium ?? 0, tone: 'text-amber-300' },
                      { label: 'Low', value: scanResults.summary?.low ?? 0, tone: 'text-gray-300' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-gray-700 bg-black/30 p-3">
                        <p className="text-xs text-gray-400">{item.label} findings</p>
                        <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Security findings</h3>
                    {Array.isArray(scanResults.vulnerabilities) && scanResults.vulnerabilities.length > 0 ? (
                      <div className="space-y-3">
                        {scanResults.vulnerabilities.map((finding: any, index: number) => {
                          const severityStyles: Record<string, string> = {
                            critical: 'bg-red-500/15 text-red-300 border-red-500/30',
                            high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
                            medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                            low: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
                          };
                          return (
                            <div key={`${finding.type}-${index}`} className="rounded-lg border border-gray-700 bg-black/20 p-4 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-white">{finding.type}</p>
                                <Badge className={severityStyles[finding.severity] || severityStyles.low}>
                                  {finding.severity || 'Unclassified'}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-300">{finding.description}</p>
                              <p className="text-xs text-gray-500">Location: {finding.location}</p>
                              {finding.proof_of_concept && (
                                <p className="text-xs text-cyan-300 font-mono break-all">{finding.proof_of_concept}</p>
                              )}
                              <p className="text-sm text-gray-400">Remediation: {finding.remediation}</p>
                            </div>
                          );
                        })}
                        {(scanResults.vulnerabilities_found ?? scanResults.vulnerabilities.length) > scanResults.vulnerabilities.length && (
                          <p className="text-xs text-gray-400">
                            Showing {scanResults.vulnerabilities.length} preview findings; {scanResults.vulnerabilities_found} were reported in total.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-gray-700 bg-black/20 p-4 text-sm text-gray-400">
                        No findings were returned by the checks completed. Review the coverage limitations below.
                      </p>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">DNS records</h3>
                    <div className="rounded-lg border border-gray-700 overflow-hidden">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 bg-black/40 px-4 py-3 text-xs uppercase tracking-wide text-gray-400">
                        <span>Type</span>
                        <span>Record name and value</span>
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
                        {scanResults.dns_records.map((record: any, index: number) => (
                          <div key={`${record.type}-${record.name}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3">
                            <Badge variant="outline" className="text-cyan-300 border-cyan-500/30">{record.type}</Badge>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-400 font-mono break-all">{record.name}</p>
                              <p className="text-sm text-white font-mono break-all">{record.value}</p>
                              {typeof record.ttl === 'number' && (
                                <p className="text-xs text-gray-500">TTL: {record.ttl}s</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {Array.isArray(scanResults.recommendations) && scanResults.recommendations.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-white">Recommendations</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300">
                        {scanResults.recommendations.map((recommendation: string, index: number) => (
                          <li key={index}>{recommendation}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {scanResults.security_features && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-white">Observed security configuration</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          ['DS record observed', scanResults.security_features.ds_record_present],
                          ['SPF configured', scanResults.security_features.spf_configured],
                          ['Default DKIM selector found', scanResults.security_features.default_dkim_selector_found],
                          ['DMARC configured', scanResults.security_features.dmarc_configured],
                          ['CAA configured', scanResults.security_features.caa_configured],
                        ].map(([label, configured]) => (
                          <div key={String(label)} className="flex items-center justify-between gap-3 rounded border border-gray-700 px-3 py-2">
                            <span className="text-xs text-gray-300">{label}</span>
                            <Badge className={configured ? 'bg-green-500/15 text-green-300 border-green-500/30' : 'bg-gray-500/15 text-gray-300 border-gray-500/30'}>
                              {configured ? 'Observed' : 'Not observed'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {Array.isArray(scanResults.coverage_limitations) && (
                    <section className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                      <h3 className="text-sm font-semibold text-amber-200">Coverage limitations</h3>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-gray-400">
                        {scanResults.coverage_limitations.map((limitation: string, index: number) => (
                          <li key={index}>{limitation}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              ) : activeTool === 'ssl-analyzer' &&
              !scanResults.error &&
              scanResults.success === true &&
              scanResults.ssl_result ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                      {scanResults.hostname || 'Assessed hostname'}
                    </Badge>
                    <Badge className="bg-sky-500/15 text-sky-300 border-sky-500/30">
                      SSL Labs grade: {scanResults.overall_grade || scanResults.ssl_result.grade || 'N/A'}
                    </Badge>
                    <Badge variant="outline" className="text-gray-300">
                      {scanResults.ssl_result.endpoints?.length ?? 0} endpoint(s)
                    </Badge>
                    <Badge variant="outline" className="text-gray-300">
                      {scanResults.ssl_result.vulnerabilities?.length ?? 0} finding(s)
                    </Badge>
                  </div>

                  <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      ['Certificate valid', scanResults.additional_checks?.certificate_valid],
                      ['TLS 1.3 supported', scanResults.additional_checks?.supports_tls13],
                      ['HSTS enabled', scanResults.additional_checks?.hsts_enabled],
                      ['Certificate transparency', scanResults.additional_checks?.certificate_transparency],
                      ['OCSP stapling', scanResults.additional_checks?.ocsp_stapling],
                      ['Perfect forward secrecy', scanResults.additional_checks?.perfect_forward_secrecy],
                      ['Certificate chain valid', scanResults.additional_checks?.certificate_chain_valid],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-black/20 px-3 py-3">
                        <span className="text-xs text-gray-300">{label}</span>
                        <Badge className={
                          value === true ? 'bg-green-500/15 text-green-300 border-green-500/30' :
                          value === false ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                          'bg-gray-500/15 text-gray-300 border-gray-500/30'
                        }>
                          {value === true ? 'Yes' : value === false ? 'No' : 'Unknown'}
                        </Badge>
                      </div>
                    ))}
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Certificate evidence</h3>
                    {Array.isArray(scanResults.ssl_result.certificates) && scanResults.ssl_result.certificates.length > 0 ? (
                      <div className="space-y-3">
                        {scanResults.ssl_result.certificates.map((certificate: any, index: number) => (
                          <div key={certificate.id || certificate.sha256Hash || index} className="rounded-lg border border-gray-700 bg-black/20 p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-white break-all">{certificate.subject || certificate.commonNames?.[0] || 'Certificate'}</p>
                              <Badge variant="outline" className="text-gray-300">Certificate {index + 1}</Badge>
                            </div>
                            {certificate.issuerLabel && <p className="text-xs text-gray-400">Issuer: {certificate.issuerLabel}</p>}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-300">
                              {typeof certificate.notBefore === 'number' && (
                                <p>Valid from: {new Date(certificate.notBefore * 1000).toLocaleString()}</p>
                              )}
                              {typeof certificate.notAfter === 'number' && (
                                <p>Expires: {new Date(certificate.notAfter * 1000).toLocaleString()}</p>
                              )}
                              {certificate.keyAlg && <p>Public key: {certificate.keyAlg}{typeof certificate.keySize === 'number' ? ` (${certificate.keySize}-bit)` : ''}</p>}
                              {certificate.sigAlg && <p>Signature: {certificate.sigAlg}</p>}
                            </div>
                            {certificate.sha256Hash && (
                              <p className="text-xs text-gray-500 font-mono break-all">SHA-256: {certificate.sha256Hash}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-gray-700 bg-black/20 p-4 text-sm text-gray-400">
                        No certificate details were included in the completed response.
                      </p>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Assessed endpoints</h3>
                    <div className="space-y-2">
                      {(Array.isArray(scanResults.ssl_result.endpoints) ? scanResults.ssl_result.endpoints : []).map((endpoint: any, index: number) => (
                        <div key={endpoint.ipAddress || index} className="rounded-lg border border-gray-700 bg-black/20 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-white font-mono">{endpoint.ipAddress || `Endpoint ${index + 1}`}</p>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-gray-300">{endpoint.statusMessage || 'Status unknown'}</Badge>
                              {endpoint.grade && <Badge className="bg-sky-500/15 text-sky-300 border-sky-500/30">Grade {endpoint.grade}</Badge>}
                            </div>
                          </div>
                          {typeof endpoint.duration === 'number' && (
                            <p className="mt-1 text-xs text-gray-500">Assessment duration: {endpoint.duration} ms</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">Protocol support</h3>
                      <span className="text-xs text-gray-500">{scanResults.ssl_result.protocols?.length ?? 0} protocol entries</span>
                    </div>
                    {Array.isArray(scanResults.ssl_result.protocols) && scanResults.ssl_result.protocols.length > 0 ? (
                      <div className="rounded-lg border border-gray-700 divide-y divide-gray-800">
                        {scanResults.ssl_result.protocols.map((protocol: any, index: number) => (
                          <div key={`${protocol.name}-${protocol.version}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span className="text-sm text-white">{protocol.name} {protocol.version}</span>
                            <Badge className={
                              protocol.q === 0 ? 'bg-red-500/15 text-red-300 border-red-500/30' :
                              protocol.q === 1 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                              'bg-gray-500/15 text-gray-300 border-gray-500/30'
                            }>
                              {protocol.q === 0 ? 'Insecure' : protocol.q === 1 ? 'Weak' : 'Reported'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No protocol details were returned.</p>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">Cipher suite evidence</h3>
                      <span className="text-xs text-gray-500">{scanResults.ssl_result.suites?.length ?? 0} suites reported</span>
                    </div>
                    {Array.isArray(scanResults.ssl_result.suites) && scanResults.ssl_result.suites.length > 0 ? (
                      <div className="rounded-lg border border-gray-700 divide-y divide-gray-800 max-h-72 overflow-y-auto">
                        {scanResults.ssl_result.suites.slice(0, 30).map((suite: any, index: number) => (
                          <div key={`${suite.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span className="text-xs text-gray-300 font-mono break-all">{suite.name || 'Unnamed cipher suite'}</span>
                            {typeof suite.cipherStrength === 'number' && (
                              <Badge variant="outline" className="text-gray-400">{suite.cipherStrength}-bit</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No cipher suite details were returned.</p>
                    )}
                    {(scanResults.ssl_result.suites?.length ?? 0) > 30 && (
                      <p className="text-xs text-gray-500">Showing 30 of {scanResults.ssl_result.suites.length} returned cipher suites.</p>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Security findings</h3>
                    {Array.isArray(scanResults.ssl_result.vulnerabilities) && scanResults.ssl_result.vulnerabilities.length > 0 ? (
                      <div className="space-y-2">
                        {scanResults.ssl_result.vulnerabilities.map((finding: any, index: number) => {
                          const severityStyles: Record<string, string> = {
                            critical: 'bg-red-500/15 text-red-300 border-red-500/30',
                            high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
                            medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                            low: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
                          };
                          return (
                            <div key={finding.id || index} className="rounded-lg border border-gray-700 bg-black/20 p-4 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-white">{finding.name || finding.id}</p>
                                <Badge className={severityStyles[String(finding.severity).toLowerCase()] || severityStyles.low}>
                                  {finding.severity || 'Unclassified'}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-300">{finding.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-gray-700 bg-black/20 p-4 text-sm text-gray-400">
                        No vulnerabilities were reported in the completed SSL Labs checks. This is limited to the checks represented in this assessment.
                      </p>
                    )}
                  </section>

                  {Array.isArray(scanResults.recommendations) && scanResults.recommendations.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-white">Recommendations</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300">
                        {scanResults.recommendations.map((recommendation: string, index: number) => (
                          <li key={index}>{recommendation}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {Array.isArray(scanResults.coverage_limitations) && (
                    <section className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                      <h3 className="text-sm font-semibold text-amber-200">Coverage limitations</h3>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-gray-400">
                        {scanResults.coverage_limitations.map((limitation: string, index: number) => (
                          <li key={index}>{limitation}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <p className="text-xs text-gray-500">
                    Source: {scanResults.source || 'Qualys SSL Labs API v3'}.
                    This is an external TLS configuration assessment, not an application vulnerability scan.
                  </p>
                </div>
              ) : activeTool === 'subdomain-discovery' &&
              !scanResults.error &&
              Array.isArray(scanResults.dns_verification?.results) ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                      {scanResults.domain || 'Requested domain'}
                    </Badge>
                    <Badge variant="outline" className="text-gray-300">
                      {scanResults.subdomains_returned ?? scanResults.subdomains?.length ?? 0} names discovered
                    </Badge>
                    {scanResults.results_truncated && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                        Discovery results capped
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Resolved', value: scanResults.dns_verification.summary?.resolved ?? 0, tone: 'text-green-300' },
                      { label: 'No A/AAAA records', value: scanResults.dns_verification.summary?.no_address_records ?? 0, tone: 'text-gray-300' },
                      { label: 'Inconclusive', value: scanResults.dns_verification.summary?.inconclusive ?? 0, tone: 'text-amber-300' },
                      { label: 'Not checked', value: scanResults.dns_verification.summary?.not_checked_limit ?? 0, tone: 'text-gray-400' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-gray-700 bg-black/30 p-3">
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-gray-700 overflow-hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-black/40 px-4 py-3 text-xs uppercase tracking-wide text-gray-400">
                      <span>Hostname and address evidence</span>
                      <span>DNS status</span>
                    </div>
                    <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-800">
                      {scanResults.dns_verification.results.map((item: any) => {
                        const statusStyles: Record<string, string> = {
                          resolved: 'bg-green-500/15 text-green-300 border-green-500/30',
                          no_address_records: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
                          inconclusive: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                          not_checked_limit: 'bg-gray-700/40 text-gray-400 border-gray-600',
                        };
                        const statusLabels: Record<string, string> = {
                          resolved: 'Resolved',
                          no_address_records: 'No A/AAAA',
                          inconclusive: 'Inconclusive',
                          not_checked_limit: 'Not checked',
                        };
                        return (
                          <div key={item.hostname} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm text-white font-mono break-all">{item.hostname}</p>
                              {Array.isArray(item.addresses) && item.addresses.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {item.addresses.map((address: any, index: number) => (
                                    <span key={`${address.type}-${address.address}-${index}`} className="text-xs text-cyan-300 font-mono break-all">
                                      {address.type}: {address.address}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-gray-500">
                                  {item.status === 'no_address_records'
                                    ? 'No A or AAAA address answer observed at lookup time.'
                                    : item.status === 'inconclusive'
                                    ? 'The DNS resolver did not provide a complete answer.'
                                    : 'This hostname was outside the verification limit.'}
                                </p>
                              )}
                            </div>
                            <Badge className={statusStyles[item.status] || statusStyles.inconclusive}>
                              {statusLabels[item.status] || 'Unknown'}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    DNS results are point-in-time observations from {scanResults.dns_verification.provider || 'the configured DNS-over-HTTPS resolver'}.
                    No A/AAAA answer does not prove a hostname is unused. Only up to {scanResults.dns_verification.maximum_verifications ?? 100} names are DNS-verified per run.
                  </p>
                  {Array.isArray(scanResults.limitations) && (
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-500">
                      {scanResults.limitations.map((limitation: string, index: number) => (
                        <li key={index}>{limitation}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <pre className="text-green-400 font-mono text-sm bg-black/50 p-4 rounded overflow-auto max-h-96">
                  {JSON.stringify(scanResults, null, 2)}
                </pre>
              )}
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