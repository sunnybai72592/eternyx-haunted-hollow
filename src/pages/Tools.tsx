import React, { useState } from 'react';
import Navigation from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Target, Code, Server, Brain, Smartphone, FileSearch, Network,
  Scan, Key, Globe, Bot, Crosshair, Wifi, Database, Layers, Cloud,
  MemoryStick, HardDrive, Radio, Gamepad2, PlayCircle, CheckCircle
} from 'lucide-react';

const Tools = () => {
  const [activeCategory, setActiveCategory] = useState('cybersecurity');
  const [runningScans, setRunningScans] = useState<{ [key: string]: number }>({});
  const { toast } = useToast();

  const categories = [
    { id: 'cybersecurity', name: 'Cybersecurity Arsenal', icon: <Shield className="w-4 h-4" /> },
    { id: 'penetration', name: 'Penetration Testing', icon: <Target className="w-4 h-4" /> },
    { id: 'development', name: 'Full Stack Development', icon: <Code className="w-4 h-4" /> },
    { id: 'infrastructure', name: 'Infrastructure & DevOps', icon: <Server className="w-4 h-4" /> }
  ];

  const simulateToolExecution = (toolId: string) => {
    setRunningScans(prev => ({ ...prev, [toolId]: 0 }));
    
    const interval = setInterval(() => {
      setRunningScans(prev => {
        const current = prev[toolId] || 0;
        if (current >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setRunningScans(prev => {
              const { [toolId]: removed, ...rest } = prev;
              return rest;
            });
            toast({
              title: "Scan Complete",
              description: `Tool execution completed successfully.`,
            });
          }, 1000);
          return prev;
        }
        return { ...prev, [toolId]: current + 2 };
      });
    }, 100);
  };

  const tools = [
    {
      id: 'vuln-scanner',
      name: 'Advanced Vulnerability Scanner',
      description: 'Military-grade vulnerability detection with AI-powered analysis',
      category: 'cybersecurity',
      icon: <Scan className="w-6 h-6" />,
      features: ['Zero-day detection', 'CVE database integration', 'Custom exploit generation'],
      tier: 'elite'
    },
    {
      id: 'quantum-encryption',
      name: 'Quantum Encryption Utility',
      description: 'Post-quantum cryptography implementation',
      category: 'cybersecurity',
      icon: <Key className="w-6 h-6" />,
      features: ['Quantum-resistant algorithms', 'Key exchange protocols'],
      tier: 'elite'
    },
    {
      id: 'web-scanner',
      name: 'Web Application Scanner',
      description: 'OWASP Top 10 vulnerability scanner',
      category: 'penetration',
      icon: <Globe className="w-6 h-6" />,
      features: ['SQL injection detection', 'XSS analysis'],
      tier: 'free'
    },
    {
      id: 'code-analyzer',
      name: 'Secure Code Analyzer',
      description: 'Static and dynamic code analysis',
      category: 'development',
      icon: <Code className="w-6 h-6" />,
      features: ['SAST/DAST integration', 'Dependency scanning'],
      tier: 'premium'
    }
  ];

  const filteredTools = tools.filter(tool => tool.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary mb-4">
            ETERNYX TOOLS ARSENAL
          </h1>
          <p className="text-xl text-muted-foreground">
            Professional-grade cybersecurity and development tools
          </p>
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="grid w-full grid-cols-4 mb-8">
            {categories.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                {category.icon}
                <span className="ml-2">{category.name.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((category) => (
            <TabsContent key={category.id} value={category.id}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTools.map((tool) => (
                  <Card key={tool.id} className="group hover:shadow-lg transition-all">
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          {tool.icon}
                        </div>
                        <Badge variant={tool.tier === 'free' ? 'secondary' : 'default'}>
                          {tool.tier}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{tool.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Key Features:</h4>
                        <ul className="text-xs space-y-1 text-muted-foreground">
                          {tool.features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-green-400" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {runningScans[tool.id] !== undefined ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Running...</span>
                            <span>{runningScans[tool.id]}%</span>
                          </div>
                          <Progress value={runningScans[tool.id]} />
                        </div>
                      ) : (
                        <Button 
                          onClick={() => simulateToolExecution(tool.id)}
                          className="w-full"
                        >
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Execute Tool
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default Tools;