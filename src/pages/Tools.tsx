import React, { useState, useEffect } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { ToolsGrid } from '@/components/ToolsGrid';
import { cybersecurityTools } from '@/data/cybersecurityTools';
import { webDevelopmentTools } from '@/data/webDevelopmentTools';
import { innovationTools } from '@/data/innovationTools';
import {
  Shield, Target, Code, Server, Brain, Smartphone, FileSearch, Network,
  Scan, Key, Globe, Bot, Crosshair, Wifi, Database, Layers, Cloud,
  MemoryStick, HardDrive, Radio, Gamepad2, PlayCircle, CheckCircle,
  Grid, List
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const Tools = () => {
  const [activeCategory, setActiveCategory] = useState('cybersecurity');
  const [runningScans, setRunningScans] = useState<{ [key: string]: number }>({});
  const [viewMode, setViewMode] = useState<'grid' | 'tabs'>('grid');
  const { toast } = useToast();

  const categories = [
    { id: 'cybersecurity', name: 'Cybersecurity Arsenal', icon: <Shield className="w-4 h-4" /> },
    { id: 'penetration', name: 'Penetration Testing', icon: <Target className="w-4 h-4" /> },
    { id: 'development', name: 'Full Stack Development', icon: <Code className="w-4 h-4" /> },
    { id: 'infrastructure', name: 'Infrastructure & DevOps', icon: <Server className="w-4 h-4" /> }
  ];

  const navigateToTool = (toolId: string) => {
    if (toolId === 'vuln-scanner') {
      window.location.href = '/vulnerability-scanner';
      return;
    }
    // For other tools, execute them
    simulateToolExecution(toolId);
  };

  const simulateToolExecution = async (toolId: string, target?: string) => {
    const allToolsData = [...cybersecurityTools, ...webDevelopmentTools, ...innovationTools];
    const tool = allToolsData.find(t => t.id === toolId);
    const executionTime = tool?.executionTime || '5-15 minutes';
    
    setRunningScans(prev => ({ ...prev, [toolId]: 0 }));

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || crypto.randomUUID(); // Generate a UUID for anonymous users

    try {
      let response;
      let functionName;
      let payload: any = { user_id: userId };

      switch (toolId) {
        case 'vuln-scanner':
          functionName = 'vulnerability-scanner';
          payload.target_url = target || 'https://example.com'; // Default target if not provided
          payload.scan_type = 'full';
          break;
        case 'port-scanner':
          functionName = 'port-scanner';
          payload.target = target || 'scanme.nmap.org'; // Default target if not provided
          payload.scan_type = 'stealth';
          break;
        case 'ssl-analyzer':
          functionName = 'ssl-analyzer';
          payload.hostname = target || 'example.com'; // Default target if not provided
          break;
        default:
          // Fallback to simulation for other tools
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
                    title: "Tool Execution Complete",
                    description: `${tool?.name || 'Tool'} execution completed successfully. Estimated time: ${executionTime}`,
                  });
                }, 1000);
                return prev;
              }
              return { ...prev, [toolId]: current + Math.random() * 3 + 1 };
            });
          }, 200);
          return;
      }

      // Simulate progress for real tools
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 5 + 1;
        if (progress >= 95) progress = 95; // Cap before completion
        setRunningScans(prev => ({ ...prev, [toolId]: progress }));
      }, 500);

      response = await fetch(`https://wcncuarekaofmfurbtbh.supabase.co/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` // Use anon key for Edge Function calls
        },
        body: JSON.stringify(payload),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to execute tool');
      }

      const result = await response.json();
      
      setRunningScans(prev => ({ ...prev, [toolId]: 100 }));
      setTimeout(() => {
        setRunningScans(prev => {
          const { [toolId]: removed, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Tool Execution Complete",
          description: `${tool?.name || 'Tool'} execution completed successfully. Results: ${JSON.stringify(result.summary || result.message || result)}`,
        });
      }, 1000);

    } catch (error: any) {
      setRunningScans(prev => {
        const { [toolId]: removed, ...rest } = prev;
        return rest;
      });
      toast({
        title: "Tool Execution Failed",
        description: `Error executing ${tool?.name || 'tool'}: ${error.message}`,
        variant: "destructive",
      });
      console.error(error);
    }
  };

  // Combine all tools
  const allTools = [...cybersecurityTools, ...webDevelopmentTools, ...innovationTools];

  const filteredTools = allTools.filter(tool => tool.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary mb-4 neon-text">
            ETERNYX TOOLS ARSENAL
          </h1>
          <p className="text-xl text-muted-foreground">
            Professional-grade cybersecurity and development tools
          </p>
          <div className="mt-4 text-sm text-muted-foreground">
            <span className="text-primary font-mono">{allTools.length}</span> Advanced Tools Available
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-card/50 backdrop-blur-sm border border-primary/20 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="hover-glow transition-all"
            >
              <Grid className="w-4 h-4 mr-2" />
              Unified Grid
            </Button>
            <Button
              variant={viewMode === 'tabs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tabs')}
              className="hover-glow transition-all"
            >
              <List className="w-4 h-4 mr-2" />
              Category Tabs
            </Button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <ToolsGrid 
            tools={allTools} 
            runningScans={runningScans} 
            onExecuteTool={simulateToolExecution} 
          />
        ) : (
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="grid w-full grid-cols-4 mb-8">
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={category.id} className="transition-all duration-300 ease-in-out">
                  {category.icon}
                  <span className="ml-2">{category.name.split(" ")[0]}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => (
              <TabsContent key={category.id} value={category.id} className="animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTools.map((tool) => (
                    <Card key={tool.id} className="group hover-glow gradient-border transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary animate-float">
                            {tool.icon}
                          </div>
                          <Badge 
                            variant={tool.tier === 'free' ? 'secondary' : 'default'}
                            className={`
                              ${tool.tier === 'elite' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black' : ''}
                              ${tool.tier === 'premium' ? 'bg-gradient-to-r from-purple-400 to-pink-500' : ''}
                            `}
                          >
                            {tool.tier}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg">{tool.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{tool.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {tool.difficulty}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {tool.executionTime}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-primary">Key Features:</h4>
                          <ul className="text-xs space-y-1 text-muted-foreground">
                            {tool.features.slice(0, 3).map((feature, index) => (
                              <li key={index} className="flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                                <span className="truncate">{feature}</span>
                              </li>
                            ))}
                            {tool.features.length > 3 && (
                              <li className="text-xs text-primary">+{tool.features.length - 3} more features</li>
                            )}
                          </ul>
                        </div>

        {runningScans[tool.id] !== undefined ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-primary">Running...</span>
              <span className="text-primary font-mono">{Math.round(runningScans[tool.id])}%</span>
            </div>
            <Progress value={runningScans[tool.id]} className="w-full animate-pulse-glow" />
          </div>
        ) : (
          <Button 
            onClick={() => navigateToTool(tool.id)}
            className="w-full hover-glow gradient-border group-hover:scale-105 transition-all"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {tool.id === 'vuln-scanner' ? 'Launch Scanner' : 'Execute Tool'}
          </Button>
        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Tools;