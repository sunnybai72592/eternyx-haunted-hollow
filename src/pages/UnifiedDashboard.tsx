
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { MobileViewport } from '@/components/MobileViewport';
import LoadingSpinner from '@/components/LoadingSpinner';
import HolographicCard from '@/components/HolographicCard';
import InteractiveButton from '@/components/InteractiveButton';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/useAppStore';
import {
  Activity,
  Shield,
  Zap,
  Crown,
  Terminal,
  Code,
  Globe,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  AlertTriangle,
  BarChart3,
  Eye,
  Lock,
  Scan,
  Bug,
  Bot,
  Bell,
  Target,
  Layers,
  Cloud,
  Wifi,
  HardDrive,
  Search,
  Filter,
  Star,
  Cpu,
  Smartphone,
  Puzzle,
  Monitor,
  Wrench
} from 'lucide-react';

// Lazy load components for performance
const AISecurityAssistant = lazy(() => import('@/components/enhanced/AISecurityAssistant'));
const ThreatMapVisualization = lazy(() => import('@/components/enhanced/ThreatMapVisualization'));
const CyberMetrics = lazy(() => import('@/components/CyberMetrics'));
const AdvancedTerminal = lazy(() => import('@/components/AdvancedTerminal'));
const ToolCard = lazy(() => import('@/components/ToolCard'));

interface DashboardStats {
  projectsCreated: number;
  totalLogins: number;
  lastActivity: string;
  securityScore: number;
  performanceRating: number;
  accessLevel: string;
  level: number;
  xp: number;
  maxXp: number;
  totalTools: number;
  completedMissions: number;
  hackingStreak: number;
}

interface RecentActivityItem {
  id: string;
  type: 'login' | 'project' | 'security' | 'system' | 'scan' | 'threat' | 'encryption' | 'challenge';
  description: string;
  timestamp: string | Date;
  status?: 'success' | 'warning' | 'error' | 'completed' | 'in-progress' | 'failed';
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface SecurityMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  icon: React.ReactNode;
}

interface SystemAlert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: Date;
  dismissed: boolean;
}

interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  xp: number;
  maxXp: number;
  level: number;
  lastUsed: string;
  usageCount: number;
  glowColor: 'cyan' | 'green' | 'purple' | 'orange' | 'pink';
  category: string;
  isLocked?: boolean;
  requiredLevel?: number;
}

const UnifiedDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, signOut } = useAuthStore();
  const { addNotification } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetric[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call delay

      // Combined Mock Data
      setStats({
        projectsCreated: (profile as any)?.stats?.projects_created || 12,
        totalLogins: (profile as any)?.stats?.login_count || 247,
        lastActivity: (profile as any)?.stats?.last_activity || new Date().toISOString(),
        securityScore: 95,
        performanceRating: 88,
        accessLevel: profile?.access_level || 'elite',
        level: 15,
        xp: 12750,
        maxXp: 15000,
        totalTools: 24,
        completedMissions: 47,
        hackingStreak: 12,
      });

      setRecentActivity([
        { id: '1', type: 'login', description: 'Successful login from secure terminal', timestamp: new Date().toISOString(), status: 'success' },
        { id: '2', type: 'security', description: 'Security scan completed - No threats detected', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'success' },
        { id: '3', type: 'system', description: 'System optimization completed', timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'success' },
        { id: '4', type: 'project', description: 'New cybersecurity project initialized', timestamp: new Date(Date.now() - 10800000).toISOString(), status: 'success' },
        { id: '5', type: 'security', description: 'Firewall rules updated', timestamp: new Date(Date.now() - 14400000).toISOString(), status: 'warning' },
        { id: '6', type: 'threat', description: 'DDoS attack detected and mitigated', timestamp: new Date(Date.now() - 600000), severity: 'high', status: 'completed' },
        { id: '7', type: 'encryption', description: 'New quantum key generated for client data', timestamp: new Date(Date.now() - 900000), severity: 'low', status: 'completed' },
      ]);

      setSecurityMetrics([
        { id: 'threat-level', name: 'Threat Level', value: 23, unit: '%', trend: 'down', status: 'good', icon: <Shield className="h-5 w-5" /> },
        { id: 'active-scans', name: 'Active Scans', value: 7, unit: '', trend: 'up', status: 'good', icon: <Eye className="h-5 w-5" /> },
        { id: 'vulnerabilities', name: 'Open Vulnerabilities', value: 3, unit: '', trend: 'stable', status: 'warning', icon: <AlertTriangle className="h-5 w-5" /> },
        { id: 'encryption-keys', name: 'Active Keys', value: 12, unit: '', trend: 'up', status: 'good', icon: <Lock className="h-5 w-5" /> }
      ]);

      setSystemAlerts([
        { id: '1', title: 'SSL Certificate Expiring', message: 'Your SSL certificate will expire in 7 days. Renew now to maintain secure connections.', severity: 'warning', timestamp: new Date(Date.now() - 3600000), dismissed: false },
        { id: '2', title: 'New Threat Intelligence', message: 'Critical vulnerability discovered in popular web framework. Update recommended.', severity: 'error', timestamp: new Date(Date.now() - 7200000), dismissed: false }
      ]);

      setTools([
        { id: 'vulnerability-scanner', title: 'Vulnerability Scanner', description: 'Advanced penetration testing and vulnerability assessment tools.', icon: <Shield className="h-6 w-6" />, xp: 1250, maxXp: 2000, level: 8, lastUsed: '2 hours ago', usageCount: 47, glowColor: 'cyan', category: 'security' },
        { id: 'ai-threat-analysis', title: 'AI Threat Analysis', description: 'Machine learning powered threat detection and analysis.', icon: <Eye className="h-6 w-6" />, xp: 890, maxXp: 1500, level: 6, lastUsed: '1 day ago', usageCount: 23, glowColor: 'green', category: 'ai' },
        { id: 'quantum-encryption', title: 'Quantum Encryption', description: 'Next-generation quantum-resistant encryption protocols.', icon: <Layers className="h-6 w-6" />, xp: 2100, maxXp: 3000, level: 12, lastUsed: '3 hours ago', usageCount: 89, glowColor: 'purple', category: 'encryption' },
        { id: 'network-mapper', title: 'Network Mapper', description: 'Comprehensive network topology and device discovery.', icon: <Wifi className="h-6 w-6" />, xp: 670, maxXp: 1000, level: 4, lastUsed: '5 hours ago', usageCount: 31, glowColor: 'orange', category: 'network' },
        { id: 'code-analyzer', title: 'Code Analyzer', description: 'Static and dynamic code analysis for security vulnerabilities.', icon: <Code className="h-6 w-6" />, xp: 1450, maxXp: 2000, level: 9, lastUsed: '1 hour ago', usageCount: 65, glowColor: 'cyan', category: 'development' },
        { id: 'data-forensics', title: 'Data Forensics', description: 'Digital forensics and data recovery tools.', icon: <HardDrive className="h-6 w-6" />, xp: 980, maxXp: 1500, level: 7, lastUsed: '6 hours ago', usageCount: 42, glowColor: 'pink', category: 'forensics' },
        { id: 'exploit-framework', title: 'Exploit Framework', description: 'Advanced exploitation and payload generation toolkit.', icon: <Bug className="h-6 w-6" />, xp: 1780, maxXp: 2500, level: 10, lastUsed: '4 hours ago', usageCount: 76, glowColor: 'green', category: 'exploitation', isLocked: false },
        { id: 'cloud-security', title: 'Cloud Security Suite', description: 'Multi-cloud security assessment and monitoring.', icon: <Cloud className="h-6 w-6" />, xp: 0, maxXp: 1000, level: 1, lastUsed: 'Never', usageCount: 0, glowColor: 'purple', category: 'cloud', isLocked: true, requiredLevel: 20 },
      ]);

      setIsLoading(false);
    };

    loadDashboardData();
  }, [isAuthenticated, navigate, profile]);

  const handleSignOut = async () => {
    try {
      await signOut();
      addNotification({
        type: 'success',
        message: 'Successfully logged out'
      });
      navigate('/');
    } catch (error) {
      addNotification({
        type: 'error',
        message: 'Error logging out'
      });
    }
  };

  const getAccessLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'elite': return 'text-accent border-accent';
      case 'premium': return 'text-primary border-primary';
      case 'basic': return 'text-secondary border-secondary';
      default: return 'text-muted-foreground border-muted-foreground';
    }
  };

  const getStatusIcon = (activityStatus: string | undefined, activityType: string | undefined) => {
    if (activityStatus === 'success' || activityStatus === 'completed') return <Shield className="h-4 w-4 text-accent" />;
    if (activityStatus === 'warning' || activityStatus === 'in-progress') return <AlertTriangle className="h-4 w-4 text-secondary" />;
    if (activityStatus === 'error' || activityStatus === 'failed') return <Bug className="h-4 w-4 text-destructive" />;
    
    switch (activityType) {
      case 'scan': return <Eye className="h-4 w-4" />;
      case 'threat': return <AlertTriangle className="h-4 w-4" />;
      case 'encryption': return <Lock className="h-4 w-4" />;
      case 'challenge': return <Target className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleString();
  };

  const getMetricStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-400 border-green-400/50';
      case 'warning': return 'text-yellow-400 border-yellow-400/50';
      case 'critical': return 'text-red-400 border-red-400/50';
      default: return 'text-blue-400 border-blue-400/50';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-green-400" />;
      case 'down': return <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />;
      default: return <Activity className="h-3 w-3 text-blue-400" />;
    }
  };

  const getAlertSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'border-red-400/50 bg-red-500/10';
      case 'warning': return 'border-yellow-400/50 bg-yellow-500/10';
      case 'info': return 'border-blue-400/50 bg-blue-500/10';
      default: return 'border-gray-400/50 bg-gray-500/10';
    }
  };

  const allToolCategories = Array.from(new Set(tools.map(tool => tool.category)));
  const toolCategories = [
    { id: 'all', label: 'All Tools', count: tools.length },
    ...allToolCategories.map(cat => ({
      id: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      count: tools.filter(t => t.category === cat).length
    }))
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
      message: `Launching ${tools.find(t => t.id === toolId)?.title}...`,
    });
    // In a real app, this would navigate to the tool's specific page or open a modal
    // navigate(`/tools/${toolId}`);
  };

  if (isLoading || !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Initializing ETERNYX Unified Dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card">
      <MobileViewport />
      
      {/* Professional Header */}
      <header className="sticky top-16 z-40 border-b border-border/40 bg-card/95 backdrop-blur-xl shadow-lg">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Left Section */}
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  Unified Dashboard
                </h1>
                <p className="text-sm text-muted-foreground font-mono">
                  {profile?.username || 'Elite Operator'} • Level {stats.level}
                </p>
              </div>
              <Badge className={`${getAccessLevelColor(stats.accessLevel)} px-4 py-1.5`}>
                <Crown className="h-3.5 w-3.5 mr-1.5" />
                {stats.accessLevel.toUpperCase()}
              </Badge>
            </div>
            
            {/* Right Section */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/settings')}
                className="hover:bg-primary/10"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Exit
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="container mx-auto px-6 lg:px-8 py-8 space-y-8">
        
        {/* XP Progress Bar - Horizontal Hero Section */}
        <Card className="bg-gradient-to-r from-card/80 via-card/60 to-card/80 backdrop-blur-sm border-primary/20 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary animate-pulse" />
                  <span className="text-lg font-bold text-primary">Level {stats.level}</span>
                </div>
                <span className="text-sm text-muted-foreground font-mono">
                  {stats.xp.toLocaleString()} / {stats.maxXp.toLocaleString()} XP
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-accent" />
                  <span className="text-muted-foreground">{stats.completedMissions} missions</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-secondary" />
                  <span className="text-muted-foreground">{stats.hackingStreak} day streak</span>
                </div>
              </div>
            </div>
            <Progress 
              value={(stats.xp / stats.maxXp) * 100} 
              className="h-3 bg-background/50"
            />
          </CardContent>
        </Card>

        {/* Horizontal Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="group hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Code className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                <TrendingUp className="h-4 w-4 text-accent" />
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold text-foreground">{stats.projectsCreated}</p>
                <p className="text-sm text-muted-foreground font-medium">Active Projects</p>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-accent/10 to-transparent border-accent/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Shield className="h-8 w-8 text-accent group-hover:scale-110 transition-transform" />
                <Badge variant="outline" className="border-accent text-accent text-xs">Excellent</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold text-foreground">{stats.securityScore}%</p>
                <p className="text-sm text-muted-foreground font-medium">Security Score</p>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-secondary/10 to-transparent border-secondary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Activity className="h-8 w-8 text-secondary group-hover:scale-110 transition-transform" />
                <TrendingUp className="h-4 w-4 text-accent" />
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold text-foreground">{stats.performanceRating}%</p>
                <p className="text-sm text-muted-foreground font-medium">Performance</p>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Users className="h-8 w-8 text-purple-400 group-hover:scale-110 transition-transform" />
                <Badge variant="outline" className="border-purple-400 text-purple-400 text-xs">Active</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold text-foreground">{stats.totalLogins}</p>
                <p className="text-sm text-muted-foreground font-medium">Total Sessions</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Professional Tabbed Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="inline-flex h-12 items-center justify-center rounded-xl bg-card/50 backdrop-blur-sm p-1.5 border border-border/40 gap-2">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-6 transition-all">
              <Monitor className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tools" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent rounded-lg px-6 transition-all">
              <Wrench className="h-4 w-4 mr-2" />
              Tools Arsenal
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive rounded-lg px-6 transition-all">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="ai-assistant" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg px-6 transition-all">
              <Bot className="h-4 w-4 mr-2" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="threat-map" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent rounded-lg px-6 transition-all">
              <Globe className="h-4 w-4 mr-2" />
              Threat Map
            </TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary rounded-lg px-6 transition-all">
              <Terminal className="h-4 w-4 mr-2" />
              Terminal
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-8">
            {/* System Alerts - Horizontal Layout */}
            {systemAlerts.filter(alert => !alert.dismissed).length > 0 && (
              <Card className="bg-card/50 backdrop-blur-sm border-border/40">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary animate-pulse" />
                    System Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {systemAlerts.filter(alert => !alert.dismissed).map((alert) => (
                    <div key={alert.id} className={`flex items-center justify-between p-4 rounded-lg border ${getAlertSeverityColor(alert.severity)} transition-all hover:scale-[1.02]`}>
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground mb-1">{alert.title}</h4>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                        </div>
                        <div className="flex-shrink-0 text-xs text-muted-foreground">
                          {formatTimestamp(alert.timestamp)}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="ml-4">×</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent Activity - Clean Horizontal List */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/40">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-accent" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border/40 hover:border-primary/40 transition-all">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-shrink-0">
                        {getStatusIcon(activity.status, activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`ml-4 text-xs ${
                      activity.status === 'success' || activity.status === 'completed' ? 'border-accent text-accent' :
                      activity.status === 'warning' || activity.status === 'in-progress' ? 'border-secondary text-secondary' :
                      'border-destructive text-destructive'
                    }`}>
                      {activity.status?.toUpperCase() || 'INFO'}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tools Tab - Clean Grid */}
          <TabsContent value="tools" className="space-y-6 mt-8">
            <Card className="bg-card/50 backdrop-blur-sm border-border/40 p-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search tools by name or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-12 bg-background border-border/60 focus:border-primary"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {toolCategories.map((category) => (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(category.id)}
                      className="font-medium"
                    >
                      {category.label} ({category.count})
                    </Button>
                  ))}
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading tools..." />}>
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
              </Suspense>
            </div>
          </TabsContent>

          {/* Security Tab - Professional Metrics */}
          <TabsContent value="security" className="space-y-6 mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {securityMetrics.map((metric) => (
                <Card key={metric.id} className={`bg-card/50 backdrop-blur-sm border hover:shadow-lg transition-all ${getMetricStatusColor(metric.status)}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 rounded-lg bg-background/50">
                        {metric.icon}
                      </div>
                      {getTrendIcon(metric.trend)}
                    </div>
                    <p className="text-3xl font-bold text-foreground mb-1">
                      {metric.value}{metric.unit}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium">{metric.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-card/50 backdrop-blur-sm border-border/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Security Monitor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading security logs..." />}>
                  <AdvancedTerminal title="security-monitor" />
                </Suspense>
              </CardContent>
            </Card>

            <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading metrics..." />}>
              <CyberMetrics />
            </Suspense>
          </TabsContent>

          {/* AI Assistant Tab */}
          <TabsContent value="ai-assistant" className="mt-8">
            <Suspense fallback={<LoadingSpinner variant="cyber" text="Initializing AI Assistant..." />}>
              <AISecurityAssistant />
            </Suspense>
          </TabsContent>

          {/* Threat Map Tab */}
          <TabsContent value="threat-map" className="mt-8">
            <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading Global Threat Map..." />}>
              <ThreatMapVisualization />
            </Suspense>
          </TabsContent>

          {/* Terminal Tab */}
          <TabsContent value="terminal" className="mt-8">
            <Card className="bg-card/50 backdrop-blur-sm border-border/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-accent" />
                  ETERNYX Terminal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<LoadingSpinner variant="cyber" text="Initializing Terminal..." />}>
                  <AdvancedTerminal />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default UnifiedDashboard;

