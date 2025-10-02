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
import ProfileSettings from '@/components/ProfileSettings';
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
  Wrench
} from 'lucide-react';

interface DashboardStats {
  projectsCreated: number;
  totalLogins: number;
  lastActivity: string;
  securityScore: number;
  performanceRating: number;
  accessLevel: string;
}

interface RecentActivity {
  id: string;
  type: 'login' | 'project' | 'security' | 'system';
  description: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, signOut } = useAuthStore();
  const { addNotification } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    // Temporarily bypass authentication for testing
    // if (!isAuthenticated) {
    //   navigate('/');
    //   return;
    // }

    // Simulate loading dashboard data
    const loadDashboardData = async () => {
      setIsLoading(true);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock data - in real app, this would come from your backend
      setStats({
        projectsCreated: (profile as any)?.stats?.projects_created || 12,
        totalLogins: (profile as any)?.stats?.login_count || 247,
        lastActivity: (profile as any)?.stats?.last_activity || new Date().toISOString(),
        securityScore: 95,
        performanceRating: 88,
        accessLevel: profile?.access_level || 'elite'
      });

      setRecentActivity([
        {
          id: '1',
          type: 'login',
          description: 'Successful login from secure terminal',
          timestamp: new Date().toISOString(),
          status: 'success'
        },
        {
          id: '2',
          type: 'security',
          description: 'Security scan completed - No threats detected',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          status: 'success'
        },
        {
          id: '3',
          type: 'system',
          description: 'System optimization completed',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          status: 'success'
        },
        {
          id: '4',
          type: 'project',
          description: 'New cybersecurity project initialized',
          timestamp: new Date(Date.now() - 10800000).toISOString(),
          status: 'success'
        },
        {
          id: '5',
          type: 'security',
          description: 'Firewall rules updated',
          timestamp: new Date(Date.now() - 14400000).toISOString(),
          status: 'warning'
        }
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <Shield className="h-4 w-4 text-accent" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-secondary" />;
      case 'error': return <Bug className="h-4 w-4 text-destructive" />;
      default: return <Activity className="h-4 w-4 text-primary" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading ETERNYX Dashboard..." />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Dashboard Error</h2>
          <p className="text-muted-foreground">Failed to load dashboard data</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
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
                  ETERNYX DASHBOARD
                </h1>
                <Badge className={`${getAccessLevelColor(stats.accessLevel)} bg-transparent text-xs sm:text-sm`}>
                  <Crown className="h-3 w-3 mr-1" />
                  {stats.accessLevel.toUpperCase()}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                <UserProfile />
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
            <TabsTrigger value="metrics" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Metrics</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive text-xs sm:text-sm">
              <Shield className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary text-xs sm:text-sm">
              <Code className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Projects</span>
            </TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-xs sm:text-sm">
              <Terminal className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Terminal</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm">
              <Settings className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
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

            {/* Recent Activity */}
            <HolographicCard title="Recent Activity" animated>
              <div className="space-y-3">
                {recentActivity && recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-card/30 rounded-lg border border-primary/20 hover:border-primary/40 transition-colors">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(activity.status)}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${
                      activity.status === 'success' ? 'border-accent text-accent' :
                      activity.status === 'warning' ? 'border-secondary text-secondary' :
                      'border-destructive text-destructive'
                    }`}>
                      {activity.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </HolographicCard>
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-6">
            <CyberMetrics />
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <HolographicCard title="Security Status" variant="danger" animated>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm sm:text-base">
                    <span>Firewall Status</span>
                    <Badge className="bg-accent/20 text-accent text-xs">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm sm:text-base">
                    <span>Intrusion Detection</span>
                    <Badge className="bg-primary/20 text-primary text-xs">MONITORING</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm sm:text-base">
                    <span>Encryption Level</span>
                    <Badge className="bg-secondary/20 text-secondary text-xs">AES-256</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm sm:text-base">
                    <span>Last Security Scan</span>
                    <span className="text-xs text-muted-foreground">2 hours ago</span>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Threat Analysis" variant="danger" animated>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl sm:text-4xl font-bold text-accent font-mono mb-2">0</div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Active Threats</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-xl sm:text-2xl font-bold text-primary font-mono">1,247</div>
                      <p className="text-xs text-muted-foreground">Blocked</p>
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold text-secondary font-mono">23</div>
                      <p className="text-xs text-muted-foreground">Quarantined</p>
                    </div>
                  </div>
                </div>
              </HolographicCard>
            </div>

            <HolographicCard title="Security Logs" animated>
              <TerminalWindow title="security-monitor.log">
                <div className="space-y-1 text-xs">
                  <div className="text-accent">[{new Date().toLocaleTimeString()}] Firewall: Connection blocked from 192.168.1.100</div>
                  <div className="text-primary">[{new Date(Date.now() - 60000).toLocaleTimeString()}] IDS: Scanning network traffic...</div>
                  <div className="text-secondary">[{new Date(Date.now() - 120000).toLocaleTimeString()}] Auth: Failed login attempt detected</div>
                  <div className="text-accent">[{new Date(Date.now() - 180000).toLocaleTimeString()}] System: Security scan completed successfully</div>
                </div>
              </TerminalWindow>
            </HolographicCard>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <HolographicCard title="Active Projects" variant="primary" animated>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Cyber Defense System</span>
                    <Badge className="bg-accent/20 text-accent text-xs">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Network Scanner</span>
                    <Badge className="bg-primary/20 text-primary text-xs">TESTING</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Encryption Tool</span>
                    <Badge className="bg-secondary/20 text-secondary text-xs">DEV</Badge>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Recent Deployments" variant="secondary" animated>
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-primary font-mono">3</div>
                    <p className="text-xs text-muted-foreground">This Week</p>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-accent font-mono">12</div>
                    <p className="text-xs text-muted-foreground">This Month</p>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Code Quality" variant="success" animated>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Test Coverage</span>
                    <span className="text-accent font-mono">94%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Code Quality</span>
                    <span className="text-primary font-mono">A+</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                     <span>Security Score</span>
                    <span className="text-accent font-mono">98%</span>
                  </div>
                </div>
              </HolographicCard>
            </div>

            <HolographicCard title="Project Timeline" animated>
              <TerminalWindow title="project-status.log">
                <div className="space-y-1 text-xs">
                  <div className="text-accent">[{new Date().toLocaleTimeString()}] Project: Cyber Defense System - Deployment successful</div>
                  <div className="text-primary">[{new Date(Date.now() - 3600000).toLocaleTimeString()}] Project: Network Scanner - Testing phase completed</div>
                  <div className="text-secondary">[{new Date(Date.now() - 7200000).toLocaleTimeString()}] Project: Encryption Tool - Development milestone reached</div>
                  <div className="text-secondary">[{new Date(Date.now() - 10800000).toLocaleTimeString()}] Project: New security module initialized</div>
                </div>
              </TerminalWindow>
            </HolographicCard>
          </TabsContent>

          {/* Terminal Tab */}
          <TabsContent value="terminal" className="space-y-6">
            <AdvancedTerminal 
              title="ETERNYX-COMMAND-CENTER"
              onCommand={(cmd) => {
                addNotification({
                  type: 'info',
                  message: `Command executed: ${cmd}`
                });
              }}
            />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <ProfileSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
