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
import { supabase } from '@/integrations/supabase/client';
import { fetchTools, toolActions, Tool } from '@/lib/tools.tsx';
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

      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user data:', userError);
        addNotification({ type: 'error', message: 'Failed to load user data.' });
        setIsLoading(false);
        return;
      }

      const profileData = userData;

      // Fetch project requests count
      const { count: projectsCreatedCount, error: projectsError } = await supabase
        .from('project_requests')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);

      if (projectsError) console.error('Error fetching projects count:', projectsError);

      // Fetch vulnerability scans count
      const { count: completedMissionsCount, error: scansError } = await supabase
        .from('vulnerability_scans')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('status', 'completed');

      if (scansError) console.error('Error fetching completed scans count:', scansError);

      // Fetch total tools (mock for now, will be dynamic later)
      const totalToolsCount = 24; // This will be dynamic when tools are implemented

      setStats({
        projectsCreated: projectsCreatedCount || 0,
        totalLogins: 0, // Will be tracked separately when implemented
        lastActivity: new Date().toISOString(),
        securityScore: 95, // Default value
        performanceRating: 88, // Default value
        accessLevel: 'elite',
        level: 15,
        xp: 12750,
        maxXp: 15000,
        totalTools: totalToolsCount,
        completedMissions: completedMissionsCount || 0,
        hackingStreak: 12, // Default value
      });

      const { data: auditLogs, error: auditLogsError } = await supabase
        .from("audit_logs")
        .select("action, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (auditLogsError) console.error("Error fetching audit logs:", auditLogsError);

      const { data: securityIncidents, error: incidentsError } = await supabase
        .from("security_incidents")
        .select("incident_type, description, detected_at, severity, status")
        .order("detected_at", { ascending: false })
        .limit(5);

      if (incidentsError) console.error("Error fetching security incidents:", incidentsError);

      const combinedActivity: RecentActivityItem[] = [];

      auditLogs?.forEach((log) => {
        combinedActivity.push({
          id: log.created_at + log.action,
          type: log.action.includes("login") ? "login" : "system",
          description: log.action,
          timestamp: log.created_at,
          status: "success",
        });
      });

      securityIncidents?.forEach((incident) => {
        combinedActivity.push({
          id: incident.detected_at + incident.incident_type,
          type: "threat",
          description: incident.description,
          timestamp: incident.detected_at,
          status: incident.status as any,
          severity: incident.severity as any,
        });
      });

      combinedActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setRecentActivity(combinedActivity.slice(0, 7));

      const { data: threatStats, error: threatStatsError } = await supabase.rpc(
        "get_threat_statistics",
        { days: 7 }
      );
      if (threatStatsError) console.error("Error fetching threat statistics:", threatStatsError);

      const { count: activeScansCount, error: activeScansError } = await supabase
        .from("vulnerability_scans")
        .select("id", { count: "exact" })
        .in("status", ["pending", "in-progress"]);
      if (activeScansError) console.error("Error fetching active scans:", activeScansError);

      const { count: openVulnerabilitiesCount, error: openVulnerabilitiesError } = await supabase
        .from("vulnerability_details")
        .select("id", { count: "exact" })
        .neq("remediation", "completed"); // Assuming 'remediation' field indicates resolution
      if (openVulnerabilitiesError) console.error("Error fetching open vulnerabilities:", openVulnerabilitiesError);

      const { count: activeKeysCount, error: activeKeysError } = await supabase
        .from("encryption_keys")
        .select("id", { count: "exact" })
        .eq("is_quantum_resistant", false); // Check for any encryption keys
      if (activeKeysError) console.error("Error fetching active keys:", activeKeysError);

      setSecurityMetrics([
        { id: 'threat-level', name: 'Threat Level', value: threatStats?.[0]?.total_threats || 0, unit: '', trend: 'stable', status: threatStats?.[0]?.critical_threats > 0 ? 'critical' : threatStats?.[0]?.high_threats > 0 ? 'warning' : 'good', icon: <Shield className="h-5 w-5" /> },
        { id: 'active-scans', name: 'Active Scans', value: activeScansCount || 0, unit: '', trend: 'stable', status: activeScansCount > 0 ? 'warning' : 'good', icon: <Eye className="h-5 w-5" /> },
        { id: 'vulnerabilities', name: 'Open Vulnerabilities', value: openVulnerabilitiesCount || 0, unit: '', trend: 'stable', status: openVulnerabilitiesCount > 0 ? 'critical' : 'good', icon: <AlertTriangle className="h-5 w-5" /> },
        { id: 'encryption-keys', name: 'Active Keys', value: activeKeysCount || 0, unit: '', trend: 'up', status: 'good', icon: <Lock className="h-5 w-5" /> }
      ]);

      const { data: alertsData, error: alertsError } = await supabase
        .from("security_incidents")
        .select("id, incident_type, description, severity, detected_at, status")
        .order("detected_at", { ascending: false })
        .limit(2);

      if (alertsError) console.error("Error fetching system alerts:", alertsError);

      const mappedAlerts: SystemAlert[] = alertsData?.map(alert => ({
        id: alert.id,
        title: alert.incident_type,
        message: alert.description,
        severity: alert.severity as SystemAlert["severity"],
        timestamp: new Date(alert.detected_at),
        dismissed: alert.status === "resolved",
      })) || [];

      setSystemAlerts(mappedAlerts);

      const fetchedTools = await fetchTools(user.id);
      setTools(fetchedTools);

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

  const handleToolClick = async (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return;

    addNotification({
      type: 'info',
      message: `Launching ${tool.title}...`,
    });

    if (tool.action) {
      try {
        const result = await tool.action();
        addNotification({
          type: 'success',
          message: `${tool.title} executed successfully: ${result.message}`,
        });
        // Optionally, re-fetch dashboard data to update metrics after tool use
        // loadDashboardData(); 
      } catch (error: any) {
        addNotification({
          type: 'error',
          message: `Failed to execute ${tool.title}: ${error.message || 'Unknown error'}`,
        });
      }
    } else {
      addNotification({
        type: 'warning',
        message: `${tool.title} has no defined action yet.`,
      });
    }
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
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">{stats.projectsCreated} projects</span>
                </div>
              </div>
            </div>
            <Progress value={(stats.xp / stats.maxXp) * 100} className="h-2 bg-primary/20" />
          </CardContent>
        </Card>

        {/* Main Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-card/50 backdrop-blur-sm border border-border/40">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Overview</TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Security</TabsTrigger>
            <TabsTrigger value="tools" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Tools</TabsTrigger>
            <TabsTrigger value="ai-assistant" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">AI Assistant</TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Terminal</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Security Score Card */}
              <HolographicCard title="Security Score" className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Security Score</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-accent">{stats.securityScore}%</div>
                  <p className="text-xs text-muted-foreground">+20.1% from last month</p>
                  <Progress value={stats.securityScore} className="mt-4 h-2 bg-accent/20" />
                </CardContent>
              </HolographicCard>

              {/* Performance Rating Card */}
              <HolographicCard title="Performance Rating">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Performance Rating</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-secondary">{stats.performanceRating}%</div>
                  <p className="text-xs text-muted-foreground">+15.3% from last month</p>
                  <Progress value={stats.performanceRating} className="mt-4 h-2 bg-secondary/20" />
                </CardContent>
              </HolographicCard>
            </div>

            {/* Recent Activity & System Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Activity */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
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

              {/* System Alerts */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    System Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {systemAlerts.map((alert) => (
                    <div key={alert.id} className={`flex items-start p-4 rounded-lg border ${getAlertSeverityColor(alert.severity)}`}>
                      <AlertTriangle className={`h-5 w-5 mr-3 flex-shrink-0 ${
                        alert.severity === 'error' ? 'text-destructive' :
                        alert.severity === 'warning' ? 'text-secondary' :
                        'text-primary'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{alert.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatTimestamp(alert.timestamp)}</p>
                      </div>
                      {!alert.dismissed && (
                        <Button variant="ghost" size="sm" className="ml-4 flex-shrink-0">
                          Dismiss
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Cyber Metrics & Threat Map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card/50 backdrop-blur-sm border-border/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Cyber Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading metrics..." />}>
                    <CyberMetrics />
                  </Suspense>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-border/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Global Threat Map
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<LoadingSpinner variant="cyber" text="Loading Global Threat Map..." />}>
                    <ThreatMapVisualization />
                  </Suspense>
                </CardContent>
              </Card>
            </div>
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

