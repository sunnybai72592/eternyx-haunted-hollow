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
      case 'elite': return 'text-cyber-green border-cyber-green';
      case 'premium': return 'text-cyber-blue border-cyber-blue';
      case 'basic': return 'text-yellow-400 border-yellow-400';
      default: return 'text-muted-foreground border-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <Shield className="h-4 w-4 text-cyber-green" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'error': return <Bug className="h-4 w-4 text-red-400" />;
      default: return <Activity className="h-4 w-4 text-cyber-blue" />;
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
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-20 sm:top-24 z-40 mt-20 sm:mt-24">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-cyber-green neon-text">
                ETERNYX DASHBOARD
              </h1>
              <Badge className={`${getAccessLevelColor(stats.accessLevel)} bg-transparent`}>
                <Crown className="h-3 w-3 mr-1" />
                {stats.accessLevel.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-4">
              <UserProfile />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="border-red-400/40 text-red-400 hover:bg-red-400/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Exit
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-card/50 backdrop-blur-sm">
            <TabsTrigger value="overview" className="data-[state=active]:bg-cyber-green/20 data-[state=active]:text-cyber-green">
              <Monitor className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="metrics" className="data-[state=active]:bg-cyber-blue/20 data-[state=active]:text-cyber-blue">
              <BarChart3 className="h-4 w-4 mr-2" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-red-400/20 data-[state=active]:text-red-400">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-purple-400/20 data-[state=active]:text-purple-400">
              <Code className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-yellow-400/20 data-[state=active]:text-yellow-400">
              <Terminal className="h-4 w-4 mr-2" />
              Terminal
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-400">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <HolographicCard title="Projects" variant="primary" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-cyber-green font-mono">
                      {stats.projectsCreated}
                    </div>
                    <p className="text-sm text-muted-foreground">Active Projects</p>
                  </div>
                  <Code className="h-8 w-8 text-cyber-green/60" />
                </div>
              </HolographicCard>

              <HolographicCard title="Security Score" variant="secondary" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-cyber-blue font-mono">
                      {stats.securityScore}%
                    </div>
                    <p className="text-sm text-muted-foreground">System Security</p>
                  </div>
                  <Shield className="h-8 w-8 text-cyber-blue/60" />
                </div>
              </HolographicCard>

              <HolographicCard title="Performance" variant="success" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-emerald-400 font-mono">
                      {stats.performanceRating}%
                    </div>
                    <p className="text-sm text-muted-foreground">System Performance</p>
                  </div>
                  <Zap className="h-8 w-8 text-emerald-400/60" />
                </div>
              </HolographicCard>

              <HolographicCard title="Total Logins" variant="danger" animated>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-red-400 font-mono">
                      {stats.totalLogins}
                    </div>
                    <p className="text-sm text-muted-foreground">Access Count</p>
                  </div>
                  <Users className="h-8 w-8 text-red-400/60" />
                </div>
              </HolographicCard>
            </div>

            {/* Recent Activity */}
            <HolographicCard title="Recent Activity" animated>
              <div className="space-y-4">
                {recentActivity && recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-card/30 rounded border border-primary/20">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(activity.status)}
                      <div>
                        <p className="text-sm font-medium text-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs ${
                      activity.status === 'success' ? 'border-cyber-green text-cyber-green' :
                      activity.status === 'warning' ? 'border-yellow-400 text-yellow-400' :
                      'border-red-400 text-red-400'
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HolographicCard title="Security Status" variant="danger" animated>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Firewall Status</span>
                    <Badge className="bg-cyber-green/20 text-cyber-green">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Intrusion Detection</span>
                    <Badge className="bg-cyber-blue/20 text-cyber-blue">MONITORING</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Encryption Level</span>
                    <Badge className="bg-purple-400/20 text-purple-400">AES-256</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Last Security Scan</span>
                    <span className="text-xs text-muted-foreground">2 hours ago</span>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Threat Analysis" variant="danger" animated>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-cyber-green font-mono mb-2">0</div>
                    <p className="text-sm text-muted-foreground">Active Threats</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-cyber-blue font-mono">1,247</div>
                      <p className="text-xs text-muted-foreground">Blocked</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-400 font-mono">23</div>
                      <p className="text-xs text-muted-foreground">Quarantined</p>
                    </div>
                  </div>
                </div>
              </HolographicCard>
            </div>

            <HolographicCard title="Security Logs" animated>
              <TerminalWindow title="security-monitor.log">
                <div className="space-y-1 text-xs">
                  <div className="text-cyber-green">[{new Date().toLocaleTimeString()}] Firewall: Connection blocked from 192.168.1.100</div>
                  <div className="text-cyber-blue">[{new Date(Date.now() - 60000).toLocaleTimeString()}] IDS: Scanning network traffic...</div>
                  <div className="text-yellow-400">[{new Date(Date.now() - 120000).toLocaleTimeString()}] Auth: Failed login attempt detected</div>
                  <div className="text-cyber-green">[{new Date(Date.now() - 180000).toLocaleTimeString()}] System: Security scan completed successfully</div>
                </div>
              </TerminalWindow>
            </HolographicCard>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <HolographicCard title="CyberDefense Suite" variant="primary" animated>
                <div className="space-y-3">
                  <Badge className="bg-cyber-green/20 text-cyber-green">ACTIVE</Badge>
                  <p className="text-sm text-muted-foreground">Advanced threat detection and response system</p>
                  <div className="flex items-center justify-between text-xs">
                    <span>Progress</span>
                    <span>85%</span>
                  </div>
                  <Progress value={85} className="h-2" />
                </div>
              </HolographicCard>

              <HolographicCard title="Neural Network AI" variant="secondary" animated>
                <div className="space-y-3">
                  <Badge className="bg-cyber-blue/20 text-cyber-blue">DEVELOPMENT</Badge>
                  <p className="text-sm text-muted-foreground">Machine learning security analysis</p>
                  <div className="flex items-center justify-between text-xs">
                    <span>Progress</span>
                    <span>62%</span>
                  </div>
                  <Progress value={62} className="h-2" />
                </div>
              </HolographicCard>

              <HolographicCard title="Quantum Encryption" variant="success" animated>
                <div className="space-y-3">
                  <Badge className="bg-emerald-400/20 text-emerald-400">TESTING</Badge>
                  <p className="text-sm text-muted-foreground">Next-gen quantum-resistant encryption</p>
                  <div className="flex items-center justify-between text-xs">
                    <span>Progress</span>
                    <span>94%</span>
                  </div>
                  <Progress value={94} className="h-2" />
                </div>
              </HolographicCard>
            </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HolographicCard title="System Preferences" variant="primary" animated>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Dark Mode</span>
                    <Badge className="bg-cyber-green/20 text-cyber-green">ENABLED</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Animations</span>
                    <Badge className="bg-cyber-blue/20 text-cyber-blue">ENABLED</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sound Effects</span>
                    <Badge className="bg-yellow-400/20 text-yellow-400">DISABLED</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto-Save</span>
                    <Badge className="bg-cyber-green/20 text-cyber-green">ENABLED</Badge>
                  </div>
                </div>
              </HolographicCard>

              <HolographicCard title="Security Settings" variant="danger" animated>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Two-Factor Auth</span>
                    <Badge className="bg-cyber-green/20 text-cyber-green">ENABLED</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Session Timeout</span>
                    <span className="text-xs text-muted-foreground">30 minutes</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Login Notifications</span>
                    <Badge className="bg-cyber-blue/20 text-cyber-blue">ENABLED</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">API Access</span>
                    <Badge className="bg-red-400/20 text-red-400">RESTRICTED</Badge>
                  </div>
                </div>
              </HolographicCard>
            </div>

            <HolographicCard title="Advanced Configuration" animated>
              <TerminalWindow title="config.json">
                <pre className="text-xs text-cyber-green">
{`{
  "theme": "cyberpunk",
  "security_level": "maximum",
  "encryption": "AES-256",
  "logging": "verbose",
  "auto_backup": true,
  "session_timeout": 1800,
  "max_login_attempts": 3,
  "firewall_enabled": true
}`}
                </pre>
              </TerminalWindow>
            </HolographicCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;

