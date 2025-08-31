import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VulnerabilityLab } from '@/components/enhanced/VulnerabilityLab';
import { ThreatMapVisualization } from '@/components/enhanced/ThreatMapVisualization';
import { QuantumEncryptionUtility } from '@/components/enhanced/QuantumEncryptionUtility';
import { AISecurityAssistant } from '@/components/enhanced/AISecurityAssistant';
import { 
  Terminal, 
  Shield, 
  Zap, 
  Eye, 
  Target,
  Lock,
  Globe,
  Bot,
  Activity,
  Skull,
  Diamond,
  Atom
} from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'offensive' | 'defensive' | 'analysis' | 'crypto';
  tier: 'free' | 'premium' | 'elite';
  icon: React.ReactNode;
  component: React.ReactNode;
  status: 'active' | 'maintenance' | 'beta';
}

export default function CyberArsenal() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const tools: Tool[] = [
    {
      id: 'vulnerability-lab',
      name: 'Vulnerability Laboratory',
      description: 'Sandboxed environment for ethical hacking and penetration testing',
      category: 'offensive',
      tier: 'premium',
      icon: <Target className="h-6 w-6" />,
      component: <VulnerabilityLab />,
      status: 'active'
    },
    {
      id: 'threat-map',
      name: 'Global Threat Map',
      description: 'Real-time visualization of cyber attacks and threat intelligence',
      category: 'analysis',
      tier: 'free',
      icon: <Globe className="h-6 w-6" />,
      component: <ThreatMapVisualization />,
      status: 'active'
    },
    {
      id: 'quantum-crypto',
      name: 'Quantum Encryption',
      description: 'Post-quantum cryptography tools and key management',
      category: 'crypto',
      tier: 'elite',
      icon: <Atom className="h-6 w-6" />,
      component: <QuantumEncryptionUtility />,
      status: 'beta'
    },
    {
      id: 'ai-assistant',
      name: 'AI Security Assistant',
      description: 'Intelligent security recommendations and threat analysis',
      category: 'analysis',
      tier: 'premium',
      icon: <Bot className="h-6 w-6" />,
      component: <AISecurityAssistant />,
      status: 'active'
    }
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'offensive': return 'text-red-400 border-red-400/50';
      case 'defensive': return 'text-green-400 border-green-400/50';
      case 'analysis': return 'text-blue-400 border-blue-400/50';
      case 'crypto': return 'text-purple-400 border-purple-400/50';
      default: return 'text-gray-400 border-gray-400/50';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'text-blue-400 border-blue-400/50';
      case 'premium': return 'text-purple-400 border-purple-400/50';
      case 'elite': return 'text-orange-400 border-orange-400/50';
      default: return 'text-gray-400 border-gray-400/50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 border-green-400/50';
      case 'maintenance': return 'text-yellow-400 border-yellow-400/50';
      case 'beta': return 'text-blue-400 border-blue-400/50';
      default: return 'text-gray-400 border-gray-400/50';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-primary/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-primary glitch mb-2" data-text="CYBER ARSENAL">
                CYBER ARSENAL
              </h1>
              <p className="text-muted-foreground">
                Advanced cybersecurity tools for the digital underground
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="text-green-400 border-green-400/50">
                <Activity className="h-3 w-3 mr-1" />
                ALL SYSTEMS OPERATIONAL
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-card/50 border border-primary/20">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20">
              <Eye className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="vulnerability-lab" className="data-[state=active]:bg-primary/20">
              <Target className="h-4 w-4 mr-2" />
              Vuln Lab
            </TabsTrigger>
            <TabsTrigger value="threat-map" className="data-[state=active]:bg-primary/20">
              <Globe className="h-4 w-4 mr-2" />
              Threat Map
            </TabsTrigger>
            <TabsTrigger value="quantum-crypto" className="data-[state=active]:bg-primary/20">
              <Atom className="h-4 w-4 mr-2" />
              Quantum
            </TabsTrigger>
            <TabsTrigger value="ai-assistant" className="data-[state=active]:bg-primary/20">
              <Bot className="h-4 w-4 mr-2" />
              AI Assistant
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {tools.map((tool) => (
                <Card
                  key={tool.id}
                  className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
                  onClick={() => setActiveTab(tool.id)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`${getCategoryColor(tool.category).split(' ')[0]} animate-pulse`}>
                      {tool.icon}
                    </div>
                    <Badge variant="outline" className={getStatusColor(tool.status)}>
                      {tool.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <h3 className="text-lg font-bold text-primary mb-2">{tool.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{tool.description}</p>
                  
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={getCategoryColor(tool.category)}>
                      {tool.category.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className={getTierColor(tool.tier)}>
                      {tool.tier.toUpperCase()}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>

            {/* Quick Stats */}
            <div className="grid md:grid-cols-4 gap-6">
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-green-400/20 text-center">
                <Shield className="h-8 w-8 text-green-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-green-400">127</div>
                <div className="text-xs text-muted-foreground">Threats Blocked Today</div>
              </Card>
              
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-blue-400/20 text-center">
                <Eye className="h-8 w-8 text-blue-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-blue-400">23</div>
                <div className="text-xs text-muted-foreground">Active Scans</div>
              </Card>
              
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-purple-400/20 text-center">
                <Lock className="h-8 w-8 text-purple-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-purple-400">1.2TB</div>
                <div className="text-xs text-muted-foreground">Data Encrypted</div>
              </Card>
              
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-orange-400/20 text-center">
                <Zap className="h-8 w-8 text-orange-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-orange-400">99.9%</div>
                <div className="text-xs text-muted-foreground">System Uptime</div>
              </Card>
            </div>

            {/* Featured Tool */}
            <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-400/20 neon-border p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-primary mb-2">Featured: Quantum Encryption Lab</h3>
                  <p className="text-muted-foreground">
                    Experience next-generation post-quantum cryptography in our secure testing environment.
                  </p>
                </div>
                <Diamond className="h-12 w-12 text-purple-400 animate-pulse" />
              </div>
              
              <div className="flex space-x-4">
                <Button 
                  onClick={() => setActiveTab('quantum-crypto')}
                  className="bg-purple-500 hover:bg-purple-600 text-white neon-border"
                >
                  <Atom className="h-4 w-4 mr-2" />
                  Launch Quantum Lab
                </Button>
                <Button variant="outline" className="border-purple-400/50 text-purple-400">
                  <Eye className="h-4 w-4 mr-2" />
                  Learn More
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="vulnerability-lab">
            <VulnerabilityLab />
          </TabsContent>

          <TabsContent value="threat-map">
            <ThreatMapVisualization />
          </TabsContent>

          <TabsContent value="quantum-crypto">
            <QuantumEncryptionUtility />
          </TabsContent>

          <TabsContent value="ai-assistant">
            <AISecurityAssistant />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

