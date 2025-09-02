import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ToolCard from '@/components/ToolCard';
import InteractiveButton from '@/components/InteractiveButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/useAppStore';
import {
  Shield,
  Zap,
  Terminal,
  Code,
  Database,
  Globe,
  TrendingUp,
  Users,
  Settings,
  Search,
  Filter,
  Star,
  Cpu,
  HardDrive,
  Wifi,
  Eye,
  AlertTriangle,
  BarChart3,
  Lock,
  Scan,
  Bug,
  Wrench,
  Layers,
  Cloud,
  Smartphone,
  Puzzle
} from 'lucide-react';

const CyberDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { addNotification } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Mock user stats
  const userStats = {
    level: 15,
    xp: 12750,
    maxXp: 15000,
    totalTools: 24,
    completedMissions: 47,
    hackingStreak: 12,
  };

  // Tool categories
  const tools = [
    {
      id: 'vulnerability-scanner',
      title: 'Vulnerability Scanner',
      description: 'Advanced penetration testing and vulnerability assessment tools.',
      icon: <Shield className="h-6 w-6" />,
      xp: 1250,
      maxXp: 2000,
      level: 8,
      lastUsed: '2 hours ago',
      usageCount: 47,
      glowColor: 'cyan' as const,
      category: 'security',
    },
    {
      id: 'ai-threat-analysis',
      title: 'AI Threat Analysis',
      description: 'Machine learning powered threat detection and analysis.',
      icon: <Eye className="h-6 w-6" />,
      xp: 890,
      maxXp: 1500,
      level: 6,
      lastUsed: '1 day ago',
      usageCount: 23,
      glowColor: 'green' as const,
      category: 'ai',
    },
    {
      id: 'quantum-encryption',
      title: 'Quantum Encryption',
      description: 'Next-generation quantum-resistant encryption protocols.',
      icon: <Layers className="h-6 w-6" />,
      xp: 2100,
      maxXp: 3000,
      level: 12,
      lastUsed: '3 hours ago',
      usageCount: 89,
      glowColor: 'purple' as const,
      category: 'encryption',
    },
    {
      id: 'network-mapper',
      title: 'Network Mapper',
      description: 'Comprehensive network topology and device discovery.',
      icon: <Wifi className="h-6 w-6" />,
      xp: 670,
      maxXp: 1000,
      level: 4,
      lastUsed: '5 hours ago',
      usageCount: 31,
      glowColor: 'orange' as const,
      category: 'network',
    },
    {
      id: 'code-analyzer',
      title: 'Code Analyzer',
      description: 'Static and dynamic code analysis for security vulnerabilities.',
      icon: <Code className="h-6 w-6" />,
      xp: 1450,
      maxXp: 2000,
      level: 9,
      lastUsed: '1 hour ago',
      usageCount: 65,
      glowColor: 'cyan' as const,
      category: 'development',
    },
    {
      id: 'data-forensics',
      title: 'Data Forensics',
      description: 'Digital forensics and data recovery tools.',
      icon: <HardDrive className="h-6 w-6" />,
      xp: 980,
      maxXp: 1500,
      level: 7,
      lastUsed: '6 hours ago',
      usageCount: 42,
      glowColor: 'pink' as const,
      category: 'forensics',
    },
    {
      id: 'exploit-framework',
      title: 'Exploit Framework',
      description: 'Advanced exploitation and payload generation toolkit.',
      icon: <Bug className="h-6 w-6" />,
      xp: 1780,
      maxXp: 2500,
      level: 10,
      lastUsed: '4 hours ago',
      usageCount: 76,
      glowColor: 'green' as const,
      category: 'exploitation',
      isLocked: false,
    },
    {
      id: 'cloud-security',
      title: 'Cloud Security Suite',
      description: 'Multi-cloud security assessment and monitoring.',
      icon: <Cloud className="h-6 w-6" />,
      xp: 0,
      maxXp: 1000,
      level: 1,
      lastUsed: 'Never',
      usageCount: 0,
      glowColor: 'purple' as const,
      category: 'cloud',
      isLocked: true,
      requiredLevel: 20,
    },
  ];

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleToolClick = (toolId: string) => {
    addNotification({
      type: 'info',
      title: 'Tool Activated',
      message: `Launching ${tools.find(t => t.id === toolId)?.title}...`,
    });
    
    // Navigate to specific tool page or show tool interface
    // navigate(`/tools/${toolId}`);
  };

  const categories = [
    { id: 'all', label: 'All Tools', count: tools.length },
    { id: 'security', label: 'Security', count: tools.filter(t => t.category === 'security').length },
    { id: 'ai', label: 'AI/ML', count: tools.filter(t => t.category === 'ai').length },
    { id: 'encryption', label: 'Encryption', count: tools.filter(t => t.category === 'encryption').length },
    { id: 'network', label: 'Network', count: tools.filter(t => t.category === 'network').length },
    { id: 'development', label: 'Development', count: tools.filter(t => t.category === 'development').length },
  ];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Matrix Rain */}
        <div className="absolute inset-0 overflow-hidden opacity-10">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-matrix-rain text-cyber-green font-mono text-xs"
              style={{
                left: `${i * 5}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${15 + Math.random() * 10}s`
              }}
            >
              {Array.from({ length: 50 }, () => 
                Math.random() > 0.5 ? '1' : '0'
              ).join('')}
            </div>
          ))}
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-cyber-cyan rounded-full opacity-60 animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 p-6">
        {/* Header Stats */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyber-cyan to-neon-green mb-2">
                Cyber Arsenal
              </h1>
              <p className="text-cyber-cyan font-mono">
                Welcome back, {profile?.username || 'Agent'}. Ready to hack the matrix?
              </p>
            </div>
            
            <div className="flex items-center space-x-4 mt-4 lg:mt-0">
              <Badge variant="outline" className="border-neon-green text-neon-green font-mono">
                Level {userStats.level}
              </Badge>
              <Badge variant="outline" className="border-cyber-cyan text-cyber-cyan font-mono">
                {userStats.hackingStreak} Day Streak
              </Badge>
            </div>
          </div>

          {/* XP Progress */}
          <Card className="bg-black/70 backdrop-blur-sm border-2 border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-mono text-cyber-cyan">Experience Progress</span>
                <span className="text-sm font-mono text-neon-green">
                  {userStats.xp}/{userStats.maxXp} XP
                </span>
              </div>
              <Progress 
                value={(userStats.xp / userStats.maxXp) * 100} 
                className="h-3 bg-gray-800"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                <span>{userStats.completedMissions} missions completed</span>
                <span>{userStats.totalTools} tools unlocked</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-cyber-cyan" />
              <Input
                placeholder="Search tools..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/70 border-cyber-cyan/30 text-cyber-cyan placeholder-cyber-cyan/50 focus:border-neon-green transition-all duration-300"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map((category) => (
                <InteractiveButton
                  key={category.id}
                  variant={selectedCategory === category.id ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="font-mono"
                >
                  {category.label} ({category.count})
                </InteractiveButton>
              ))}
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              title={tool.title}
              description={tool.description}
              icon={tool.icon}
              xp={tool.xp}
              maxXp={tool.maxXp}
              level={tool.level}
              lastUsed={tool.lastUsed}
              usageCount={tool.usageCount}
              onClick={() => handleToolClick(tool.id)}
              glowColor={tool.glowColor}
              isLocked={tool.isLocked}
              requiredLevel={tool.requiredLevel}
            />
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-neon-green mb-6 font-mono">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <InteractiveButton
              variant="outline"
              glowColor="cyan"
              className="p-6 h-auto flex-col space-y-2"
              onClick={() => addNotification({ type: 'success', title: 'Scan initiated', message: 'Network vulnerability scan started' })}
            >
              <Scan className="h-8 w-8" />
              <span>Quick Scan</span>
            </InteractiveButton>
            
            <InteractiveButton
              variant="outline"
              glowColor="green"
              className="p-6 h-auto flex-col space-y-2"
              onClick={() => addNotification({ type: 'info', title: 'Analysis started', message: 'AI threat analysis in progress' })}
            >
              <BarChart3 className="h-8 w-8" />
              <span>Threat Analysis</span>
            </InteractiveButton>
            
            <InteractiveButton
              variant="outline"
              glowColor="purple"
              className="p-6 h-auto flex-col space-y-2"
              onClick={() => addNotification({ type: 'warning', title: 'Encryption active', message: 'Quantum encryption protocols enabled' })}
            >
              <Lock className="h-8 w-8" />
              <span>Secure Mode</span>
            </InteractiveButton>
            
            <InteractiveButton
              variant="outline"
              glowColor="orange"
              className="p-6 h-auto flex-col space-y-2"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-8 w-8" />
              <span>Settings</span>
            </InteractiveButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CyberDashboard;

