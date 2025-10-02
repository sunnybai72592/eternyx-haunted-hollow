
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
  Puzzle
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
  glowColor: 'cyan' | 'green' | 'purple' | 'orange' | 'pink' | 'red';
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
    <div className="min-h-screen bg-background matrix-bg preserve-cyberpunk android-scroll">
      <MobileViewport />
      
      {/* Header */}
      <div className="pt-20 sm:pt-24">
        <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-16 z-40">
          <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">
                  ETERNYX UNIFIED DASHBOARD
                </h1>
                <Badge className={`${getAccessLevelColor(stats.accessLevel)} bg-transparent text-xs sm:text-sm`}>
                  <Crown className="h-3 w-3 mr-1" />
                  {stats.accessLevel.toUpperCase()}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                {/* UserProfile component would go here if available */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Exit</span>
                </Button>
              </div>
            </div>
          </div>
        </header>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-card/50 backdrop-blur-sm p-2">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm">
              <Monitor className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-xs sm:text-sm">
              <Wrench className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Tools</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive text-xs sm:text-sm">
              <Shield className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="ai-assistant" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm">
              <Bot className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">AI Assistant</span>
            </TabsTrigger>
            <TabsTrigger value="threat-map" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-xs sm:text-sm">
              <Globe className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Threat Map</span>
            </TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-xs sm:text-sm">
              <Terminal className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Terminal</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* User XP and Level */}
            <Card className="bg-black/70 backdrop-blur-sm border-2 border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-mono text-cyber-cyan">Experience Progress</span>
                  <span className="text-sm font-mono text-neon-green">
                    {stats.xp}/{stats.maxXp} XP
                  </span>
                </div>
                <Progress 
                  value={(stats.xp / stats.maxXp) * 100} 
                  className="h-3 bg-gray-800"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                  <span>{stats.completedMissions} missions completed</span>
                  <span>{stats.totalTools} tools unlocked</span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <HolographicCard title="Projects" variant="primary" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-accent font-mono">
                      {stats.projectsCreated}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Active Projects</p>
                  </div>
                  <Code className="h-6 w-6 sm:h-8 sm:w-8 text-accent/60" />
                </div>
              </HolographicCard>

              <HolographicCard title="Security Score" variant="secondary" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-primary font-mono">
                      {stats.securityScore}%
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">System Security</p>
                  </div>
                  <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary/60" />
                </div>
              </HolographicCard>

              <HolographicCard title="Performance" variant="success" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-accent font-mono">
                      {stats.performanceRating}%
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">System Performance</p>
                  </div>
                  <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-accent/60" />
                </div>
              </HolographicCard>

              <HolographicCard title="Total Logins" variant="danger" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-secondary font-mono">
                      {stats.totalLogins}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Access Count</p>
                  </div>
                  <Users className="h-6 w-6 sm:h-8 sm:w-8 text-secondary/60" />
                </div>
              </HolographicCard>
            </div>

            {/* System Alerts */}
            {systemAlerts.filter(alert => !alert.dismissed).length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-primary flex items-center">
                  <Bell className="h-5 w-5 mr-2" />
                  System Alerts
                </h3>
                {systemAlerts.filter(alert => !alert.dismissed).map((alert) => (
                  <Card key={alert.id} className={`p-4 border ${getAlertSeverityColor(alert.severity)}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-primary mb-1">{alert.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">{alert.message}</p>
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(alert.timestamp)}
                        </div>
                      </div>
                      {/* Add dismiss functionality if needed */}
                      <Button size="sm" variant="ghost" className="text-muted-foreground">
                        ×
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Recent Activity */}
            <HolographicCard title="Recent Activity" animated>
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-card/30 rounded-lg border border-primary/20 hover:border-primary/40 transition-colors">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(activity.status, activity.type)}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${
                      activity.status === 'success' || activity.status === 'completed' ? 'border-accent text-accent' :
                      activity.status === 'warning' || activity.status === 'in-progress' ? 'border-secondary text-secondary' :
                      'border-destructive text-destructive'
                    }`}>
                      {activity.status?.toUpperCase() || activity.severity?.toUpperCase() || 'INFO'}
                    </Badge>
                  </div>
                ))}
              </div>
            </HolographicCard>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-6">
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
                  {toolCategories.map((category) => (
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

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {securityMetrics.map((metric) => (
                <Card key={metric.id} className={`p-4 bg-card/50 backdrop-blur-sm border ${getMetricStatusColor(metric.status)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={getMetricStatusColor(metric.status).split(' ')[0]}>
                      {metric.icon}
                    </div>
                    {getTrendIcon(metric.trend)}
                  </div>
                  <div className="text-2xl font-bold text-primary mb-1">
                    {metric.value}{metric.unit}
                  </div>
                  <div className="text-xs text-muted-foreground">{metric.name}</div>
                </Card>
              ))}
            </div>
            <HolographicCard title="Security Logs" animated>
              <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading security logs..." />}>
                <AdvancedTerminal title="security-monitor" initialOutput={[
                  "[INFO] Initializing security protocols...",
                  "[SUCCESS] Firewall active. All ports monitored.",
                  "[WARNING] Detected 3 suspicious login attempts from 192.168.1.100.",
                  "[SUCCESS] Threat intelligence updated. 12 new signatures added.",
                  "[INFO] System integrity check initiated.",
                  "[SUCCESS] System integrity check completed. No anomalies detected.",
                  "[ERROR] Failed to connect to external threat feed. Retrying in 30s."
                ]} />
              </Suspense>
            </HolographicCard>
            <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading cyber metrics..." />}>
              <CyberMetrics />
            </Suspense>
          </TabsContent>

          {/* AI Assistant Tab */}
          <TabsContent value="ai-assistant" className="space-y-6">
            <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading AI Assistant..." />}>
              <AISecurityAssistant />
            </Suspense>
          </TabsContent>

          {/* Threat Map Tab */}
          <TabsContent value="threat-map" className="space-y-6">
            <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading Threat Map..." />}>
              <ThreatMapVisualization />
            </Suspense>
          </TabsContent>

          {/* Terminal Tab */}
          <TabsContent value="terminal" className="space-y-6">
            <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading Terminal..." />}>
              <AdvancedTerminal />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default UnifiedDashboard;

