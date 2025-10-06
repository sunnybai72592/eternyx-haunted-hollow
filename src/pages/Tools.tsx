import React, { useState, useEffect } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { ToolsGrid } from '@/components/ToolsGrid';
import { baseTools, toolActions } from '@/lib/tools';
import {
  Shield, Target, Code, Server, Brain, Smartphone, FileSearch, Network,
  Scan, Key, Globe, Bot, Crosshair, Wifi, Database, Layers, Cloud,
  MemoryStick, HardDrive, Radio, Gamepad2, PlayCircle, CheckCircle,
  Grid, List, Lightbulb, Wrench
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const Tools = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [runningScans, setRunningScans] = useState<{ [key: string]: number }>({});
  const [viewMode, setViewMode] = useState<'grid' | 'tabs'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const { toast } = useToast();

  const categories = [
    { id: 'all', name: 'All Tools', icon: <Grid className="w-4 h-4" /> },
    ...Array.from(new Set(baseTools.map(tool => tool.category))).map(category => {
      let icon;
      let name;
      switch (category) {
        case 'cybersecurity':
          icon = <Shield className="w-4 h-4" />;
          name = 'Cybersecurity Arsenal';
          break;
        case 'penetration':
          icon = <Target className="w-4 h-4" />;
          name = 'Penetration Testing';
          break;
        case 'development':
          icon = <Code className="w-4 h-4" />;
          name = 'Full Stack Development';
          break;
        case 'infrastructure':
          icon = <Server className="w-4 h-4" />;
          name = 'Infrastructure & DevOps';
          break;
        case 'innovation':
          icon = <Lightbulb className="w-4 h-4" />;
          name = 'Digital Innovation';
          break;
        default:
          icon = <Wrench className="w-4 h-4" />;
          name = category;
      }
      return { id: category, name, icon };
    })
  ];

  const tiers = ['all', 'free', 'basic', 'premium', 'elite'];

  const navigateToTool = (toolId: string) => {
    if (toolId === 'vuln-scanner') {
      window.location.href = '/vulnerability-scanner';
      return;
    }
    // For other tools, execute them
    simulateToolExecution(toolId);
  };

  const simulateToolExecution = async (toolId: string, target?: string) => {
    const tool = baseTools.find(t => t.id === toolId);
    const executionTime = tool?.executionTime || '5-15 minutes';
    
    setRunningScans(prev => ({ ...prev, [toolId]: 0 }));

    try {
      const action = toolActions[toolId];
      if (!action) {
        throw new Error(`No action defined for tool: ${toolId}`);
      }

      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 5 + 1;
        if (progress >= 95) progress = 95; // Cap before completion
        setRunningScans(prev => ({ ...prev, [toolId]: progress }));
      }, 500);

      const result = await action();

      clearInterval(progressInterval);
      
      setRunningScans(prev => ({ ...prev, [toolId]: 100 }));
      setTimeout(() => {
        setRunningScans(prev => {
          const { [toolId]: removed, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Tool Execution Complete",
          description: `${tool?.title || 'Tool'} execution completed successfully. Results: ${JSON.stringify(result.message || result)}`,
        });
      }, 1000);

    } catch (error: any) {
      setRunningScans(prev => {
        const { [toolId]: removed, ...rest } = prev;
        return rest;
      });
      toast({
        title: "Tool Execution Failed",
        description: `Error executing ${tool?.title || 'tool'}: ${error.message}`,
        variant: "destructive",
      });
      console.error(error);
    }
  };

  const filteredTools = baseTools.filter(tool => {
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    const matchesTier = selectedTier === 'all' || tool.tier === selectedTier;
    const matchesSearch = !searchQuery || 
      tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesCategory && matchesTier && matchesSearch;
  });

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
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
            <Badge variant="outline" className="border-primary/30">
              <span className="text-primary font-mono">{baseTools.length}</span>
              <span className="ml-1">Total Tools</span>
            </Badge>
            <Badge variant="outline" className="border-cyan-500/30">
              <span className="text-cyan-400 font-mono">{filteredTools.length}</span>
              <span className="ml-1">Filtered</span>
            </Badge>
            <Badge variant="outline" className="border-green-500/30">
              <span className="text-green-400 font-mono">{categories.length - 1}</span>
              <span className="ml-1">Categories</span>
            </Badge>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="mb-8 bg-card/50 border-primary/20 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="Search tools by name, description, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-primary/20 rounded-lg focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              
              {/* Tier Filter */}
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="px-4 py-2 bg-background border border-primary/20 rounded-lg focus:outline-none focus:border-primary/50 transition-colors capitalize"
              >
                {tiers.map(tier => (
                  <option key={tier} value={tier}>{tier === 'all' ? 'All Tiers' : tier}</option>
                ))}
              </select>
            </div>
            
            {(searchQuery || selectedTier !== 'all' || activeCategory !== 'all') && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    Search: {searchQuery}
                    <button onClick={() => setSearchQuery('')} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {selectedTier !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Tier: {selectedTier}
                    <button onClick={() => setSelectedTier('all')} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {activeCategory !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Category: {categories.find(c => c.id === activeCategory)?.name}
                    <button onClick={() => setActiveCategory('all')} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTier('all');
                    setActiveCategory('all');
                  }}
                  className="ml-auto text-xs"
                >
                  Clear All
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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
            tools={baseTools} 
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

