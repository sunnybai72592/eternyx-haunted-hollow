import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UserProfile } from '@/components/auth/UserProfile';
import { TerminalWindow } from '@/components/TerminalWindow';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
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
  Star
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    // Simulate loading dashboard data
    const loadDashboardData = async () => {
      setIsLoading(true);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock data - in real app, this would come from your backend
      setStats({
        projectsCreated: profile?.stats?.projects_created || 0,
        totalLogins: profile?.stats?.login_count || 1,
        lastActivity: profile?.stats?.last_activity || new Date().toISOString(),
        securityScore: 95,
        performanceRating: 88,
        accessLevel: profile?.access_level || 'basic'
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
        }
      ]);

      setIsLoading(false);
    };

    loadDashboardData();
  }, [isAuthenticated, navigate, profile]);

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case 'elite':
        return 'text-yellow-500';
      case 'premium':
        return 'text-blue-500';
      default:
        return 'text-green-500';
    }
  };

  const getAccessLevelIcon = (level: string) => {
    switch (level) {
      case 'elite':
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 'premium':
        return <Zap className="h-5 w-5 text-blue-500" />;
      default:
        return <Shield className="h-5 w-5 text-green-500" />;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'login':
        return <Terminal className="h-4 w-4" />;
      case 'project':
        return <Code className="h-4 w-4" />;
      case 'security':
        return <Shield className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Initializing dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-primary hover:text-primary/80"
            >
              <Terminal className="mr-2 h-5 w-5" />
              ETERNYX
            </Button>
            <div className="hidden sm:block text-muted-foreground">
              / Dashboard
            </div>
          </div>
          
          <UserProfile />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="space-y-4">
          <TerminalWindow title="system-status.exe">
            <div className="space-y-2">
              <div className="text-cyber-green text-lg font-bold">
                Welcome back, {profile?.username}
              </div>
              <div className="text-muted-foreground">
                System Status: <span className="text-green-500">ONLINE</span> • 
                Security Level: <span className="text-green-500">SECURE</span> • 
                Access Level: <span className={getAccessLevelColor(stats?.accessLevel || 'basic')}>
                  {stats?.accessLevel?.toUpperCase()}
                </span>
              </div>
            </div>
          </TerminalWindow>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Access Level</CardTitle>
              {getAccessLevelIcon(stats?.accessLevel || 'basic')}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getAccessLevelColor(stats?.accessLevel || 'basic')}`}>
                {stats?.accessLevel?.toUpperCase()}
              </div>
              <p className="text-xs text-muted-foreground">
                Network clearance level
              </p>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projects</CardTitle>
              <Code className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.projectsCreated}</div>
              <p className="text-xs text-muted-foreground">
                Total projects created
              </p>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Security Score</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats?.securityScore}%</div>
              <Progress value={stats?.securityScore} className="mt-2" />
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Performance</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">{stats?.performanceRating}%</div>
              <Progress value={stats?.performanceRating} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Your latest system interactions and events
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center space-x-4 p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className={`${getActivityColor(activity.status)}`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(activity.timestamp)}
                        </p>
                      </div>
                      <Badge variant={activity.status === 'success' ? 'default' : 'destructive'}>
                        {activity.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Frequently used operations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" variant="outline">
                  <Code className="mr-2 h-4 w-4" />
                  New Project
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Database className="mr-2 h-4 w-4" />
                  Database Access
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Globe className="mr-2 h-4 w-4" />
                  Deploy Service
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Settings className="mr-2 h-4 w-4" />
                  System Config
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {/* Account Info */}
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle>Account Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total Logins</span>
                  <span className="font-bold">{stats?.totalLogins}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Member Since</span>
                  <span className="font-bold">
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Last Login</span>
                  <span className="font-bold">
                    {stats?.lastActivity ? formatTimeAgo(stats.lastActivity) : 'N/A'}
                  </span>
                </div>
                
                {stats?.accessLevel === 'basic' && (
                  <div className="pt-4 border-t border-border">
                    <Button className="w-full" variant="outline">
                      <Crown className="mr-2 h-4 w-4" />
                      Upgrade Access
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* System Information */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Terminal className="mr-2 h-5 w-5" />
              System Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TerminalWindow title="system-info.log">
              <div className="space-y-1 text-xs font-mono">
                <div className="text-cyber-green">$ system --status</div>
                <div>ETERNYX Network v2.1.0</div>
                <div>User ID: {user?.id}</div>
                <div>Session: Active</div>
                <div>Encryption: AES-256</div>
                <div>Firewall: Enabled</div>
                <div>Intrusion Detection: Active</div>
                <div className="text-green-500">All systems operational</div>
                <div className="text-cyber-green animate-pulse">$</div>
              </div>
            </TerminalWindow>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

