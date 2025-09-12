import React, { useState } from 'react';
import { 
  Shield, ExternalLink, Download, Copy, CheckCircle, AlertTriangle, 
  Lock, Key, Search, Zap, Database, Globe, Terminal, Eye, 
  Skull, Bug, Wifi, Network, FileSearch, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CyberCard from '@/components/ui/cyber-card';
import CyberGrid, { CyberGridItem } from '@/components/ui/cyber-grid';
import CyberSection from '@/components/ui/cyber-section';
import { ResponsiveText } from '@/components/ui/responsive-text';
import { EnhancedButton } from '@/components/ui/enhanced-button';
import CryptoTool from '@/components/tools/CryptoTool';
import NetworkScanner from '@/components/tools/NetworkScanner';
import { useToast } from '@/hooks/use-toast';

interface SecurityTool {
  id: string;
  name: string;
  category: string;
  type: string;
  pricing: string;
  description: string;
  features: string[];
  installation: string;
  link: string;
  icon: React.ComponentType<any>;
  color: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  popularity: number;
}

const CybersecurityToolsEnhanced = () => {
  const [activeCategory, setActiveCategory] = useState('All Tools');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);
  const { toast } = useToast();

  const categories = [
    { id: 'All Tools', name: 'All Tools', icon: Shield, count: 7, color: 'red' },
    { id: 'Web Security', name: 'Web Security', icon: Globe, count: 3, color: 'orange' },
    { id: 'Vulnerability Assessment', name: 'Vulnerability Assessment', icon: Bug, count: 2, color: 'yellow' },
    { id: 'Encryption', name: 'Encryption', icon: Lock, count: 2, color: 'green' },
    { id: 'Threat Intelligence', name: 'Threat Intelligence', icon: Eye, count: 2, color: 'purple' }
  ];

  const tools: SecurityTool[] = [
    {
      id: 'owasp-zap',
      name: 'OWASP ZAP',
      category: 'Web Security',
      type: 'Tool',
      pricing: 'Free',
      description: 'Open-source web application security scanner with API automation capabilities',
      features: ['Automated scanning', 'Manual testing tools', 'API automation', 'Proxy functionality', 'Vulnerability detection'],
      installation: 'Download from official website or Docker',
      link: 'https://zaproxy.org/',
      icon: Shield,
      color: 'red',
      difficulty: 'Intermediate',
      riskLevel: 'Medium',
      popularity: 94
    },
    {
      id: 'nikto',
      name: 'Nikto',
      category: 'Web Security',
      type: 'Tool',
      pricing: 'Free',
      description: 'Web server scanner that tests for dangerous files, outdated versions, and security issues',
      features: ['Web server scanning', '6700+ potentially dangerous files', 'Version detection', 'Plugin support', 'Multiple output formats'],
      installation: 'apt-get install nikto or from GitHub',
      link: 'https://cirt.net/Nikto2',
      icon: Search,
      color: 'orange',
      difficulty: 'Beginner',
      riskLevel: 'Low',
      popularity: 87
    },
    {
      id: 'sqlmap',
      name: 'SQLMap',
      category: 'Web Security',
      type: 'Tool',
      pricing: 'Free',
      description: 'Automatic SQL injection and database takeover tool',
      features: ['Automatic SQL injection detection', 'Database fingerprinting', 'Data extraction', 'File system access', 'Command execution'],
      installation: 'git clone https://github.com/sqlmapproject/sqlmap.git',
      link: 'https://sqlmap.org/',
      icon: Database,
      color: 'red',
      difficulty: 'Advanced',
      riskLevel: 'High',
      popularity: 91
    },
    {
      id: 'virustotal-api',
      name: 'VirusTotal API',
      category: 'Threat Intelligence',
      type: 'API',
      pricing: 'Freemium',
      description: 'API for analyzing suspicious files and URLs with multiple antivirus engines',
      features: ['Multi-engine scanning', 'File analysis', 'URL scanning', 'Domain/IP reputation', 'Threat intelligence'],
      installation: 'API Key required - REST API',
      link: 'https://www.virustotal.com/gui/home/upload',
      icon: Bug,
      color: 'purple',
      difficulty: 'Beginner',
      riskLevel: 'Low',
      popularity: 96
    },
    {
      id: 'haveibeenpwned-api',
      name: 'HaveIBeenPwned API',
      category: 'Threat Intelligence',
      type: 'API',
      pricing: 'Freemium',
      description: 'Check if email addresses or passwords have been compromised in data breaches',
      features: ['Breach detection', 'Password checking', 'Domain monitoring', 'Notification service', 'Historical data'],
      installation: 'REST API - API key required for some features',
      link: 'https://haveibeenpwned.com/API/v3',
      icon: AlertTriangle,
      color: 'yellow',
      difficulty: 'Beginner',
      riskLevel: 'Low',
      popularity: 89
    },
    {
      id: 'openssl',
      name: 'OpenSSL',
      category: 'Encryption',
      type: 'Library',
      pricing: 'Free',
      description: 'Robust toolkit for SSL/TLS protocols and general-purpose cryptography library',
      features: ['SSL/TLS implementation', 'Cryptographic functions', 'Certificate management', 'Key generation', 'Digital signatures'],
      installation: 'Pre-installed on most systems or compile from source',
      link: 'https://www.openssl.org/',
      icon: Lock,
      color: 'green',
      difficulty: 'Advanced',
      riskLevel: 'Low',
      popularity: 98
    },
    {
      id: 'cryptojs',
      name: 'CryptoJS',
      category: 'Encryption',
      type: 'Library',
      pricing: 'Free',
      description: 'JavaScript library of crypto standards for client-side encryption',
      features: ['AES encryption', 'Hash functions', 'HMAC', 'PBKDF2', 'Base64 encoding'],
      installation: 'npm install crypto-js',
      link: 'https://cryptojs.gitbook.io/docs/',
      icon: Key,
      color: 'green',
      difficulty: 'Intermediate',
      riskLevel: 'Low',
      popularity: 92
    }
  ];

  const filteredTools = activeCategory === 'All Tools' 
    ? tools 
    : tools.filter(tool => tool.category === activeCategory);

  const handleCopyInstallation = (installation: string, toolName: string) => {
    navigator.clipboard.writeText(installation);
    setCopiedTool(toolName);
    toast({
      title: "Copied to clipboard!",
      description: `Installation command for ${toolName} copied.`,
    });
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'text-green-400';
      case 'Intermediate': return 'text-yellow-400';
      case 'Advanced': return 'text-orange-400';
      case 'Expert': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Low': return 'text-green-400';
      case 'Medium': return 'text-yellow-400';
      case 'High': return 'text-orange-400';
      case 'Critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getPopularityWidth = (popularity: number) => {
    return `${popularity}%`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900/20 via-black to-orange-900/20">
      {/* Hero Section */}
      <CyberSection
        variant="hero"
        title="Cybersecurity Tools"
        subtitle="Security Arsenal"
        description="Professional security testing and analysis tools - Use responsibly and ethically"
        icon={<Shield className="w-16 h-16" />}
        glowColor="red"
        background="gradient"
        className="min-h-[60vh]"
      >
        {/* Warning Banner */}
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 mb-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-red-300">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <div>
              <ResponsiveText variant="h6" className="text-red-200 font-semibold mb-1">
                ⚠️ Ethical Use Only
              </ResponsiveText>
              <ResponsiveText variant="body" className="text-red-300">
                These tools are for authorized security testing and educational purposes only. Ensure you have proper permission before using on any systems.
              </ResponsiveText>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <CyberGrid cols={4} gap="md" className="mt-12">
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="red" className="text-center">
              <ResponsiveText variant="h3" className="text-red-400 font-bold">7+</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Security Tools</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="orange" className="text-center">
              <ResponsiveText variant="h3" className="text-orange-400 font-bold">5</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Categories</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="yellow" className="text-center">
              <ResponsiveText variant="h3" className="text-yellow-400 font-bold">98%</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Industry Standard</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="green" className="text-center">
              <ResponsiveText variant="h3" className="text-green-400 font-bold">24/7</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Threat Detection</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>

      {/* Category Filter Section */}
      <CyberSection
        title="Security Categories"
        subtitle="Filter & Explore"
        glowColor="red"
        padding="lg"
      >
        <CyberGrid cols={5} gap="md">
          {categories.map((category) => (
            <CyberGridItem key={category.id}>
              <CyberCard
                variant={activeCategory === category.id ? "neon" : "default"}
                glowColor={category.color as any}
                interactive
                className="cursor-pointer"
                onClick={() => setActiveCategory(category.id)}
              >
                <div className="text-center p-4">
                  <category.icon className={`w-8 h-8 mx-auto mb-3 text-${category.color}-400`} />
                  <ResponsiveText variant="h6" className="text-white font-semibold mb-1">
                    {category.name}
                  </ResponsiveText>
                  <Badge variant="secondary" className="text-xs">
                    {category.count} tools
                  </Badge>
                </div>
              </CyberCard>
            </CyberGridItem>
          ))}
        </CyberGrid>
      </CyberSection>

      {/* Tools Grid Section */}
      <CyberSection
        title={`${activeCategory} (${filteredTools.length})`}
        subtitle="Available Tools"
        glowColor="red"
        padding="lg"
      >
        <CyberGrid cols={3} gap="lg">
          {filteredTools.map((tool) => (
            <CyberGridItem key={tool.id}>
              <CyberCard
                variant="neon"
                glowColor={tool.color as any}
                title={tool.name}
                subtitle={`${tool.type} • ${tool.pricing}`}
                icon={<tool.icon className="w-6 h-6" />}
                interactive
              >
                <div className="space-y-4">
                  {/* Description */}
                  <ResponsiveText variant="body" className="text-gray-300">
                    {tool.description}
                  </ResponsiveText>

                  {/* Difficulty, Risk Level & Popularity */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${getDifficultyColor(tool.difficulty)}`}>
                          {tool.difficulty}
                        </span>
                        <span className="text-xs text-gray-500">Difficulty</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${getRiskLevelColor(tool.riskLevel)}`}>
                          {tool.riskLevel} Risk
                        </span>
                        <span className="text-xs text-gray-500">Usage Risk</span>
                      </div>
                    </div>
                  </div>

                  {/* Popularity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Popularity</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full bg-${tool.color}-400 transition-all duration-300`}
                        style={{ width: getPopularityWidth(tool.popularity) }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{tool.popularity}%</span>
                  </div>

                  {/* Features */}
                  <div>
                    <ResponsiveText variant="caption" className="text-gray-400 font-medium mb-2">
                      Key Features:
                    </ResponsiveText>
                    <div className="flex flex-wrap gap-1">
                      {tool.features.slice(0, 3).map((feature, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {tool.features.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{tool.features.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Installation */}
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <ResponsiveText variant="caption" className="text-gray-400 font-medium">
                        Installation:
                      </ResponsiveText>
                      <EnhancedButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyInstallation(tool.installation, tool.name)}
                        className="h-6 px-2"
                      >
                        {copiedTool === tool.name ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </EnhancedButton>
                    </div>
                    <code className="text-xs text-green-400 font-mono break-all">
                      {tool.installation}
                    </code>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <EnhancedButton
                      variant="glitch"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(tool.link, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Access
                    </EnhancedButton>
                    <EnhancedButton
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(tool.link, '_blank')}
                    >
                      <Download className="w-4 h-4" />
                    </EnhancedButton>
                  </div>
                </div>
              </CyberCard>
            </CyberGridItem>
          ))}
        </CyberGrid>
      </CyberSection>

      {/* Interactive Security Tools Section */}
      <CyberSection
        title="Interactive Security Tools"
        subtitle="Embedded Tools"
        description="Fully functional security tools for testing, analysis, and education"
        glowColor="red"
        background="dark"
        padding="xl"
      >
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <ResponsiveText variant="caption" className="font-medium">
              Ethical Use Only: These tools are for authorized testing and educational purposes only.
            </ResponsiveText>
          </div>
        </div>

        <CyberGrid cols={2} gap="xl">
          <CyberGridItem>
            <CyberCard
              variant="glitch"
              title="Cryptography & Hashing Tool"
              subtitle="Encryption, decryption, and hashing"
              icon={<Lock className="w-6 h-6" />}
            >
              <CryptoTool />
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard
              variant="neon"
              glowColor="orange"
              title="Network Scanner & Analyzer"
              subtitle="Network reconnaissance and analysis"
              icon={<Network className="w-6 h-6" />}
            >
              <NetworkScanner />
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>
    </div>
  );
};

export default CybersecurityToolsEnhanced;

