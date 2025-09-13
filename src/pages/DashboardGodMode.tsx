import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserProfile } from '@/components/auth/UserProfile';
import { TerminalWindow } from '@/components/TerminalWindow';
import LoadingSpinner from '@/components/LoadingSpinner';
import CyberMetrics from '@/components/CyberMetrics';
import HolographicCard from '@/components/HolographicCard';
import AdvancedTerminal from '@/components/AdvancedTerminal';
import { MobileViewport } from '@/components/MobileViewport';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/useAppStore';
import {
  Activity,
  Shield,
  Zap,
  Crown,
  Terminal,
  Code,
  Database,
  Globe,
  TrendingUp,
  Clock,
  Users,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Star,
  Cpu,
  HardDrive,
  Wifi,
  Eye,
  AlertTriangle,
  BarChart3,
  PieChart,
  LineChart,
  Monitor,
  Server,
  Lock,
  Unlock,
  Scan,
  Bug,
  Wrench,
  Target,
  Radar,
  Network,
  Brain,
  Rocket,
  Lightning,
  Flame,
  Sparkles,
  Layers,
  Command,
  Play,
  Pause,
  RotateCcw,
  Power,
  Gauge,
  Fingerprint,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  Maximize,
  Minimize,
  RefreshCw,
  Download,
  Upload,
  Share,
  Copy,
  ExternalLink
} from 'lucide-react';

interface DashboardStats {
  projectsCreated: number;
  totalLogins: number;
  lastActivity: string;
  securityScore: number;
  performanceRating: number;
  accessLevel: string;
  systemUptime: string;
  activeConnections: number;
  dataProcessed: string;
  threatsBlocked: number;
  cpuUsage: number;
  memoryUsage: number;
  networkActivity: number;
  storageUsed: number;
}

interface RecentActivity {
  id: string;
  type: 'login' | 'project' | 'security' | 'system' | 'network' | 'data';
  description: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error' | 'info';
  details?: string;
}

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'optimal' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
}

const DashboardGodMode = () => {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, signOut } = useAuthStore();
  const { addNotification } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [realTimeData, setRealTimeData] = useState({
    networkTraffic: 0,
    cpuLoad: 0,
    memoryUsage: 0,
    activeThreats: 0,
    systemHealth: 100
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    // Simulate loading dashboard data
    const loadDashboardData = async () => {
      setIsLoading(true);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Enhanced mock data
      setStats({
        projectsCreated: (profile as any)?.stats?.projects_created || 24,
        totalLogins: (profile as any)?.stats?.login_count || 1247,
        lastActivity: (profile as any)?.stats?.last_activity || new Date().toISOString(),
        securityScore: 98,
        performanceRating: 94,
        accessLevel: profile?.access_level || 'elite',
        systemUptime: '99.97%',
        activeConnections: 847,
        dataProcessed: '2.4TB',
        threatsBlocked: 15623,
        cpuUsage: 23,
        memoryUsage: 67,
        networkActivity: 89,
        storageUsed: 45
      });

      setRecentActivity([
        {
          id: '1',
          type: 'security',
          description: 'Advanced threat detected and neutralized',
          timestamp: new Date().toISOString(),
          status: 'success',
          details: 'Malicious payload intercepted from IP 192.168.1.100'
        },
        {
          id: '2',
          type: 'system',
          description: 'Neural network optimization completed',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          status: 'success',
          details: 'Performance increased by 15%'
        },
        {
          id: '3',
          type: 'network',
          description: 'Quantum encryption protocol activated',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          status: 'info',
          details: 'All communications now quantum-secured'
        },
        {
          id: '4',
          type: 'data',
          description: 'Data mining operation completed',
          timestamp: new Date(Date.now() - 5400000).toISOString(),
          status: 'success',
          details: '847 new threat signatures identified'
        },
        {
          id: '5',
          type: 'security',
          description: 'Firewall rules updated',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          status: 'warning',
          details: 'New vulnerability patches applied'
        }
      ]);

      setSystemMetrics([
        { name: 'CPU Load', value: 23, unit: '%', status: 'optimal', trend: 'stable' },
        { name: 'Memory Usage', value: 67, unit: '%', status: 'optimal', trend: 'up' },
        { name: 'Network I/O', value: 89, unit: 'Mbps', status: 'optimal', trend: 'up' },
        { name: 'Storage', value: 45, unit: '%', status: 'optimal', trend: 'stable' },
        { name: 'Temperature', value: 42, unit: '°C', status: 'optimal', trend: 'down' },
        { name: 'Power Draw', value: 78, unit: 'W', status: 'optimal', trend: 'stable' }
      ]);

      setIsLoading(false);
    };

    loadDashboardData();

    // Real-time data simulation
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        networkTraffic: Math.floor(Math.random() * 100),
        cpuLoad: Math.floor(Math.random() * 50) + 20,
        memoryUsage: Math.floor(Math.random() * 30) + 50,
        activeThreats: Math.floor(Math.random() * 5),
        systemHealth: Math.floor(Math.random() * 10) + 90
      }));
    }, 3000);

    return () => clearInterval(interval);
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
      case 'elite': return 'text-cyber-green border-cyber-green bg-cyber-green/10';
      case 'premium': return 'text-cyber-blue border-cyber-blue bg-cyber-blue/10';
      case 'basic': return 'text-yellow-400 border-yellow-400 bg-yellow-400/10';
      default: return 'text-muted-foreground border-muted-foreground bg-muted/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-cyber-green" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-400" />;
      case 'info': return <Info className="h-4 w-4 text-cyber-blue" />;
      default: return <Activity className="h-4 w-4 text-cyber-blue" />;
    }
  };

  const getMetricStatusColor = (status: string) => {
    switch (status) {
      case 'optimal': return 'text-cyber-green';
      case 'warning': return 'text-yellow-400';
      case 'critical': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-cyber-green" />;
      case 'down': return <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />;
      case 'stable': return <Activity className="h-3 w-3 text-cyber-blue" />;
      default: return <Activity className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-cyber-green/5" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%2300ff88" fill-opacity="0.03"%3E%3Ccircle cx="30" cy="30" r="1"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] animate-pulse" />
        
        <div className="relative z-10 text-center">
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto mb-4 relative">
              <div className="absolute inset-0 border-4 border-cyber-green/30 rounded-full animate-spin" />
              <div className="absolute inset-2 border-4 border-cyber-blue/30 rounded-full animate-spin animate-reverse" />
              <div className="absolute inset-4 border-4 border-purple-400/30 rounded-full animate-pulse" />
              <Brain className="absolute inset-6 text-cyber-green animate-pulse" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-cyber-green neon-text mb-2">INITIALIZING ETERNYX</h2>
          <p className="text-cyber-blue mb-4">Neural networks coming online...</p>
          <div className="w-64 mx-auto">
            <Progress value={85} className="h-2 bg-background border border-cyber-green/30" />
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-mono">Loading quantum-encrypted dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-bold text-foreground mb-2">SYSTEM ERROR</h2>
          <p className="text-muted-foreground mb-4">Failed to establish neural link</p>
          <Button onClick={() => window.location.reload()} className="bg-red-400/20 border-red-400 text-red-400 hover:bg-red-400/30">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Advanced animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-cyber-green/5" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%2300ff88" fill-opacity="0.02"%3E%3Cpath d="M50 50L0 0h100L50 50z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] animate-pulse" />
      
      {/* Scanning lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyber-green to-transparent animate-scan-horizontal" />
        <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-cyber-blue to-transparent animate-scan-vertical" />
      </div>

      <MobileViewport />
      
      {/* Enhanced Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-20 sm:top-24 z-40 mt-20 sm:mt-24 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-cyber-green/5 via-transparent to-cyber-blue/5" />
        <div className="container mx-auto px-4 py-4 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Brain className="h-8 w-8 text-cyber-green animate-pulse" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyber-green rounded-full animate-ping" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-cyber-green neon-text">
                    ETERNYX NEURAL CORE
                  </h1>
                  <p className="text-xs text-cyber-blue font-mono">Quantum Dashboard v2.0</p>
                </div>
              </div>
              <Badge className={`${getAccessLevelColor(stats.accessLevel)} border-2 px-3 py-1`}>
                <Crown className="h-3 w-3 mr-1" />
                {stats.accessLevel.toUpperCase()} ACCESS
              </Badge>
              <div className="hidden md:flex items-center space-x-4 text-xs">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-cyber-green rounded-full animate-pulse" />
                  <span className="text-cyber-green font-mono">ONLINE</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Gauge className="h-3 w-3 text-cyber-blue" />
                  <span className="text-cyber-blue font-mono">{realTimeData.systemHealth}%</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-xs">
                <div className="flex items-center space-x-1">
                  <Network className="h-3 w-3 text-cyber-green" />
                  <span className="text-cyber-green font-mono">{stats.activeConnections}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Shield className="h-3 w-3 text-cyber-blue" />
                  <span className="text-cyber-blue font-mono">{realTimeData.activeThreats}</span>
                </div>
              </div>
              <UserProfile />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="border-red-400/40 text-red-400 hover:bg-red-400/10 hover:border-red-400"
              >
                <Power className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 relative z-10">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-card/50 backdrop-blur-sm border border-border/50">
            <TabsTrigger value="overview" className="data-[state=active]:bg-cyber-green/20 data-[state=active]:text-cyber-green data-[state=active]:border-cyber-green border border-transparent">
              <Monitor className="h-4 w-4 mr-2" />
              Neural Core
            </TabsTrigger>
            <TabsTrigger value="metrics" className="data-[state=active]:bg-cyber-blue/20 data-[state=active]:text-cyber-blue data-[state=active]:border-cyber-blue border border-transparent">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-red-400/20 data-[state=active]:text-red-400 data-[state=active]:border-red-400 border border-transparent">
              <Shield className="h-4 w-4 mr-2" />
              Defense Grid
            </TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-purple-400/20 data-[state=active]:text-purple-400 data-[state=active]:border-purple-400 border border-transparent">
              <Code className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-yellow-400/20 data-[state=active]:text-yellow-400 data-[state=active]:border-yellow-400 border border-transparent">
              <Terminal className="h-4 w-4 mr-2" />
              Command
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-400 border border-transparent">
              <Settings className="h-4 w-4 mr-2" />
              Config
            </TabsTrigger>
          </TabsList>

          {/* Neural Core Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Real-time Status Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-card/50 backdrop-blur-sm border-cyber-green/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-cyber-green/10 to-transparent" />
                <CardContent className="p-4 relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-cyber-green font-mono">NETWORK TRAFFIC</p>
                      <p className="text-2xl font-bold text-cyber-green font-mono">{realTimeData.networkTraffic}%</p>
                    </div>
                    <Network className="h-8 w-8 text-cyber-green/60" />
                  </div>
                  <Progress value={realTimeData.networkTraffic} className="h-1 mt-2 bg-background" />
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-cyber-blue/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-cyber-blue/10 to-transparent" />
                <CardContent className="p-4 relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-cyber-blue font-mono">CPU LOAD</p>
                      <p className="text-2xl font-bold text-cyber-blue font-mono">{realTimeData.cpuLoad}%</p>
                    </div>
                    <Cpu className="h-8 w-8 text-cyber-blue/60" />
                  </div>
                  <Progress value={realTimeData.cpuLoad} className="h-1 mt-2 bg-background" />
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-purple-400/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400/10 to-transparent" />
                <CardContent className="p-4 relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-purple-400 font-mono">MEMORY USAGE</p>
                      <p className="text-2xl font-bold text-purple-400 font-mono">{realTimeData.memoryUsage}%</p>
                    </div>
                    <HardDrive className="h-8 w-8 text-purple-400/60" />
                  </div>
                  <Progress value={realTimeData.memoryUsage} className="h-1 mt-2 bg-background" />
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-red-400/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-red-400/10 to-transparent" />
                <CardContent className="p-4 relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-red-400 font-mono">ACTIVE THREATS</p>
                      <p className="text-2xl font-bold text-red-400 font-mono">{realTimeData.activeThreats}</p>
                    </div>
                    <Target className="h-8 w-8 text-red-400/60" />
                  </div>
                  <div className="flex items-center mt-2">
                    <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse mr-2" />
                    <span className="text-xs text-red-400 font-mono">MONITORING</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <HolographicCard title="Active Projects" variant="primary" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold text-cyber-green font-mono mb-1">
                      {stats.projectsCreated}
                    </div>
                    <p className="text-sm text-muted-foreground">Neural Networks</p>
                    <div className="flex items-center mt-2">
                      <TrendingUp className="h-3 w-3 text-cyber-green mr-1" />
                      <span className="text-xs text-cyber-green">+12% this week</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Code className="h-12 w-12 text-cyber-green/60" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyber-green rounded-full animate-ping" />
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Security Score" variant="secondary" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold text-cyber-blue font-mono mb-1">
                      {stats.securityScore}%
                    </div>
                    <p className="text-sm text-muted-foreground">Defense Rating</p>
                    <div className="flex items-center mt-2">
                      <Shield className="h-3 w-3 text-cyber-blue mr-1" />
                      <span className="text-xs text-cyber-blue">Quantum Encrypted</span>
                    </div>
                  </div>
                  <div className="relative">
                    <ShieldCheck className="h-12 w-12 text-cyber-blue/60" />
                    <div className="absolute inset-0 border-2 border-cyber-blue/30 rounded-full animate-pulse" />
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="System Performance" variant="success" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold text-emerald-400 font-mono mb-1">
                      {stats.performanceRating}%
                    </div>
                    <p className="text-sm text-muted-foreground">Neural Efficiency</p>
                    <div className="flex items-center mt-2">
                      <Lightning className="h-3 w-3 text-emerald-400 mr-1" />
                      <span className="text-xs text-emerald-400">Optimized</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Gauge className="h-12 w-12 text-emerald-400/60" />
                    <div className="absolute inset-2 border border-emerald-400/30 rounded-full animate-spin" />
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Network Activity" variant="danger" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold text-red-400 font-mono mb-1">
                      {stats.activeConnections}
                    </div>
                    <p className="text-sm text-muted-foreground">Active Nodes</p>
                    <div className="flex items-center mt-2">
                      <Wifi className="h-3 w-3 text-red-400 mr-1" />
                      <span className="text-xs text-red-400">Global Network</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Network className="h-12 w-12 text-red-400/60" />
                    <div className="absolute inset-0 animate-pulse">
                      <div className="absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full" />
                      <div className="absolute top-6 right-2 w-2 h-2 bg-red-400 rounded-full" />
                      <div className="absolute bottom-2 left-4 w-2 h-2 bg-red-400 rounded-full" />
                    </div>
                  </div>
                </div>
              </HolographicCard>
            </div>

            {/* System Metrics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HolographicCard title="System Metrics" animated>
                <div className="space-y-4">
                  {systemMetrics.map((metric, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20 hover:border-primary/40 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${getMetricStatusColor(metric.status)} bg-current`} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{metric.name}</p>
                          <p className="text-xs text-muted-foreground">Status: {metric.status}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-lg font-bold font-mono ${getMetricStatusColor(metric.status)}`}>
                          {metric.value}{metric.unit}
                        </span>
                        {getTrendIcon(metric.trend)}
                      </div>
                    </div>
                  ))}
                </div>
              </HolographicCard>

              <HolographicCard title="Neural Activity Feed" animated>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {recentActivity && recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start space-x-3 p-3 bg-card/30 rounded border border-primary/20 hover:border-primary/40 transition-colors">
                      <div className="flex-shrink-0 mt-0.5">
                        {getStatusIcon(activity.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{activity.description}</p>
                        {activity.details && (
                          <p className="text-xs text-muted-foreground mt-1">{activity.details}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-muted-foreground font-mono">{formatTimestamp(activity.timestamp)}</p>
                          <Badge variant="outline" className={`text-xs ${
                            activity.status === 'success' ? 'border-cyber-green text-cyber-green' :
                            activity.status === 'warning' ? 'border-yellow-400 text-yellow-400' :
                            activity.status === 'error' ? 'border-red-400 text-red-400' :
                            'border-cyber-blue text-cyber-blue'
                          }`}>
                            {activity.type.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </HolographicCard>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="metrics" className="space-y-6">
            <CyberMetrics />
          </TabsContent>

          {/* Defense Grid Tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HolographicCard title="Defense Matrix Status" variant="danger" animated>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-cyber-green/30">
                    <div className="flex items-center space-x-3">
                      <Shield className="h-5 w-5 text-cyber-green" />
                      <span className="text-sm font-medium">Quantum Firewall</span>
                    </div>
                    <Badge className="bg-cyber-green/20 text-cyber-green border-cyber-green">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-cyber-blue/30">
                    <div className="flex items-center space-x-3">
                      <Radar className="h-5 w-5 text-cyber-blue" />
                      <span className="text-sm font-medium">Intrusion Detection</span>
                    </div>
                    <Badge className="bg-cyber-blue/20 text-cyber-blue border-cyber-blue">SCANNING</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-purple-400/30">
                    <div className="flex items-center space-x-3">
                      <Fingerprint className="h-5 w-5 text-purple-400" />
                      <span className="text-sm font-medium">Neural Authentication</span>
                    </div>
                    <Badge className="bg-purple-400/20 text-purple-400 border-purple-400">SECURED</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-yellow-400/30">
                    <div className="flex items-center space-x-3">
                      <Lock className="h-5 w-5 text-yellow-400" />
                      <span className="text-sm font-medium">Data Encryption</span>
                    </div>
                    <Badge className="bg-yellow-400/20 text-yellow-400 border-yellow-400">AES-256</Badge>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Threat Intelligence" variant="danger" animated>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-6xl font-bold text-cyber-green font-mono mb-2">{realTimeData.activeThreats}</div>
                    <p className="text-sm text-muted-foreground">Active Threats Detected</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-cyber-green font-mono">{stats.threatsBlocked}</div>
                      <p className="text-xs text-muted-foreground">Neutralized</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-400 font-mono">23</div>
                      <p className="text-xs text-muted-foreground">Quarantined</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-cyber-blue font-mono">847</div>
                      <p className="text-xs text-muted-foreground">Analyzed</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Threat Level</span>
                      <span className="text-xs text-cyber-green font-mono">LOW</span>
                    </div>
                    <Progress value={15} className="h-2 bg-background border border-cyber-green/30" />
                  </div>
                </div>
              </HolographicCard>
            </div>

            <HolographicCard title="Security Event Log" animated>
              <TerminalWindow title="defense-grid.log">
                <div className="space-y-1 text-xs font-mono">
                  <div className="text-cyber-green">[{new Date().toLocaleTimeString()}] QUANTUM_FIREWALL: Malicious packet intercepted from 192.168.1.100</div>
                  <div className="text-cyber-blue">[{new Date(Date.now() - 30000).toLocaleTimeString()}] NEURAL_IDS: Deep packet inspection completed - 0 threats</div>
                  <div className="text-yellow-400">[{new Date(Date.now() - 60000).toLocaleTimeString()}] AUTH_MATRIX: Failed biometric authentication attempt</div>
                  <div className="text-cyber-green">[{new Date(Date.now() - 90000).toLocaleTimeString()}] CRYPTO_ENGINE: Quantum key exchange successful</div>
                  <div className="text-purple-400">[{new Date(Date.now() - 120000).toLocaleTimeString()}] NEURAL_NET: Threat pattern analysis updated</div>
                  <div className="text-cyber-blue">[{new Date(Date.now() - 150000).toLocaleTimeString()}] DEFENSE_GRID: All systems nominal</div>
                </div>
              </TerminalWindow>
            </HolographicCard>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <HolographicCard title="Neural Defense Suite" variant="primary" animated>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-cyber-green/20 text-cyber-green border-cyber-green">ACTIVE</Badge>
                    <span className="text-xs text-muted-foreground">v2.1.0</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Advanced AI-powered cybersecurity framework with quantum encryption protocols.</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Neural Training</span>
                      <span className="text-cyber-green">94%</span>
                    </div>
                    <Progress value={94} className="h-1" />
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" className="bg-cyber-green/20 text-cyber-green border-cyber-green hover:bg-cyber-green/30">
                      <Play className="h-3 w-3 mr-1" />
                      Deploy
                    </Button>
                    <Button size="sm" variant="outline" className="border-cyber-green/40 text-cyber-green">
                      <Eye className="h-3 w-3 mr-1" />
                      Monitor
                    </Button>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Quantum Encryptor" variant="secondary" animated>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-cyber-blue/20 text-cyber-blue border-cyber-blue">RUNNING</Badge>
                    <span className="text-xs text-muted-foreground">v1.8.3</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Next-generation quantum encryption system for ultra-secure communications.</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Quantum Stability</span>
                      <span className="text-cyber-blue">87%</span>
                    </div>
                    <Progress value={87} className="h-1" />
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" className="bg-cyber-blue/20 text-cyber-blue border-cyber-blue hover:bg-cyber-blue/30">
                      <Settings className="h-3 w-3 mr-1" />
                      Configure
                    </Button>
                    <Button size="sm" variant="outline" className="border-cyber-blue/40 text-cyber-blue">
                      <BarChart3 className="h-3 w-3 mr-1" />
                      Analytics
                    </Button>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Data Mining Engine" variant="success" animated>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-emerald-400/20 text-emerald-400 border-emerald-400">PROCESSING</Badge>
                    <span className="text-xs text-muted-foreground">v3.0.1</span>
                  </div>
                  <p className="text-sm text-muted-foreground">High-performance data analysis and pattern recognition system.</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Data Processing</span>
                      <span className="text-emerald-400">76%</span>
                    </div>
                    <Progress value={76} className="h-1" />
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" className="bg-emerald-400/20 text-emerald-400 border-emerald-400 hover:bg-emerald-400/30">
                      <Database className="h-3 w-3 mr-1" />
                      Query
                    </Button>
                    <Button size="sm" variant="outline" className="border-emerald-400/40 text-emerald-400">
                      <Download className="h-3 w-3 mr-1" />
                      Export
                    </Button>
                  </div>
                </div>
              </HolographicCard>
            </div>
          </TabsContent>

          {/* Command Terminal Tab */}
          <TabsContent value="terminal" className="space-y-6">
            <HolographicCard title="Neural Command Interface" animated>
              <AdvancedTerminal />
            </HolographicCard>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HolographicCard title="System Configuration" animated>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div>
                      <p className="text-sm font-medium">Neural Network Mode</p>
                      <p className="text-xs text-muted-foreground">Advanced AI processing</p>
                    </div>
                    <Badge className="bg-cyber-green/20 text-cyber-green border-cyber-green">ENABLED</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div>
                      <p className="text-sm font-medium">Quantum Encryption</p>
                      <p className="text-xs text-muted-foreground">256-bit quantum keys</p>
                    </div>
                    <Badge className="bg-cyber-blue/20 text-cyber-blue border-cyber-blue">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div>
                      <p className="text-sm font-medium">Real-time Monitoring</p>
                      <p className="text-xs text-muted-foreground">Live threat detection</p>
                    </div>
                    <Badge className="bg-yellow-400/20 text-yellow-400 border-yellow-400">SCANNING</Badge>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="User Preferences" animated>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div>
                      <p className="text-sm font-medium">Theme Mode</p>
                      <p className="text-xs text-muted-foreground">Cyberpunk aesthetic</p>
                    </div>
                    <span className="text-sm text-cyber-green font-mono">CYBERPUNK</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div>
                      <p className="text-sm font-medium">Notifications</p>
                      <p className="text-xs text-muted-foreground">System alerts</p>
                    </div>
                    <span className="text-sm text-cyber-blue font-mono">ENABLED</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div>
                      <p className="text-sm font-medium">Sound Effects</p>
                      <p className="text-xs text-muted-foreground">Audio feedback</p>
                    </div>
                    <span className="text-sm text-purple-400 font-mono">ENABLED</span>
                  </div>
                </div>
              </HolographicCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DashboardGodMode;

