import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AISecurityAssistant } from '@/components/enhanced/AISecurityAssistant';
import { ThreatMapVisualization } from '@/components/enhanced/ThreatMapVisualization';
import { 
  Shield, 
  Activity, 
  Zap, 
  Eye, 
  Target,
  Globe,
  Bot,
  Bell,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  Lock,
  Unlock,
  Diamond,
  Crown
} from 'lucide-react';

interface SecurityMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  icon: React.ReactNode;
}

interface RecentActivity {
  id: string;
  type: 'scan' | 'threat' | 'encryption' | 'challenge';
  description: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'completed' | 'in-progress' | 'failed';
}

interface SystemAlert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: Date;
  dismissed: boolean;
}

export default function EnhancedDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [metrics, setMetrics] = useState<SecurityMetric[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);

  useEffect(() => {
    // Initialize dashboard data
    setMetrics([
      {
        id: 'threat-level',
        name: 'Threat Level',
        value: 23,
        unit: '%',
        trend: 'down',
        status: 'good',
        icon: <Shield className="h-5 w-5" />
      },
      {
        id: 'active-scans',
        name: 'Active Scans',
        value: 7,
        unit: '',
        trend: 'up',
        status: 'good',
        icon: <Eye className="h-5 w-5" />
      },
      {
        id: 'vulnerabilities',
        name: 'Open Vulnerabilities',
        value: 3,
        unit: '',
        trend: 'stable',
        status: 'warning',
        icon: <AlertTriangle className="h-5 w-5" />
      },
      {
        id: 'encryption-keys',
        name: 'Active Keys',
        value: 12,
        unit: '',
        trend: 'up',
        status: 'good',
        icon: <Lock className="h-5 w-5" />
      }
    ]);

    setRecentActivity([
      {
        id: '1',
        type: 'scan',
        description: 'Vulnerability scan completed on production server',
        timestamp: new Date(Date.now() - 300000),
        severity: 'medium',
        status: 'completed'
      },
      {
        id: '2',
        type: 'threat',
        description: 'DDoS attack detected and mitigated',
        timestamp: new Date(Date.now() - 600000),
        severity: 'high',
        status: 'completed'
      },
      {
        id: '3',
        type: 'encryption',
        description: 'New quantum key generated for client data',
        timestamp: new Date(Date.now() - 900000),
        severity: 'low',
        status: 'completed'
      },
      {
        id: '4',
        type: 'challenge',
        description: 'SQL injection challenge completed',
        timestamp: new Date(Date.now() - 1200000),
        severity: 'low',
        status: 'completed'
      }
    ]);

    setSystemAlerts([
      {
        id: '1',
        title: 'SSL Certificate Expiring',
        message: 'Your SSL certificate will expire in 7 days. Renew now to maintain secure connections.',
        severity: 'warning',
        timestamp: new Date(Date.now() - 3600000),
        dismissed: false
      },
      {
        id: '2',
        title: 'New Threat Intelligence',
        message: 'Critical vulnerability discovered in popular web framework. Update recommended.',
        severity: 'error',
        timestamp: new Date(Date.now() - 7200000),
        dismissed: false
      }
    ]);
  }, []);

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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'scan': return <Eye className="h-4 w-4" />;
      case 'threat': return <AlertTriangle className="h-4 w-4" />;
      case 'encryption': return <Lock className="h-4 w-4" />;
      case 'challenge': return <Target className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-blue-400';
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-primary/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-primary glitch mb-2" data-text="COMMAND CENTER">
                COMMAND CENTER
              </h1>
              <p className="text-muted-foreground">
                AI-powered cybersecurity operations dashboard
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="text-green-400 border-green-400/50">
                <Bot className="h-3 w-3 mr-1" />
                AI ACTIVE
              </Badge>
              <Badge variant="outline" className="text-blue-400 border-blue-400/50">
                <Activity className="h-3 w-3 mr-1" />
                MONITORING
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-primary/20">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20">
              <Activity className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="threats" className="data-[state=active]:bg-primary/20">
              <Globe className="h-4 w-4 mr-2" />
              Threats
            </TabsTrigger>
            <TabsTrigger value="ai-assistant" className="data-[state=active]:bg-primary/20">
              <Bot className="h-4 w-4 mr-2" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-primary/20">
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
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
                          {alert.timestamp.toLocaleString()}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-muted-foreground">
                        ×
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Security Metrics */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {metrics.map((metric) => (
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

            {/* Quick Actions */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                onClick={() => navigate('/cyber-arsenal')}
                className="h-20 bg-card/50 hover:bg-primary/20 border border-primary/20 neon-border flex flex-col items-center justify-center space-y-2"
                variant="outline"
              >
                <Target className="h-6 w-6 text-red-400" />
                <span className="text-sm">Launch Vuln Lab</span>
              </Button>
              
              <Button
                onClick={() => setActiveTab('threats')}
                className="h-20 bg-card/50 hover:bg-primary/20 border border-primary/20 neon-border flex flex-col items-center justify-center space-y-2"
                variant="outline"
              >
                <Globe className="h-6 w-6 text-blue-400" />
                <span className="text-sm">Threat Map</span>
              </Button>
              
              <Button
                onClick={() => navigate('/quantum-encryption')}
                className="h-20 bg-card/50 hover:bg-primary/20 border border-primary/20 neon-border flex flex-col items-center justify-center space-y-2"
                variant="outline"
              >
                <Lock className="h-6 w-6 text-purple-400" />
                <span className="text-sm">Quantum Crypto</span>
              </Button>
              
              <Button
                onClick={() => setActiveTab('ai-assistant')}
                className="h-20 bg-card/50 hover:bg-primary/20 border border-primary/20 neon-border flex flex-col items-center justify-center space-y-2"
                variant="outline"
              >
                <Bot className="h-6 w-6 text-green-400" />
                <span className="text-sm">AI Assistant</span>
              </Button>
            </div>

            {/* Recent Activity */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Recent Activity
              </h3>
              
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center space-x-4 p-3 bg-background/50 rounded border border-primary/20">
                    <div className={getSeverityColor(activity.severity)}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{activity.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {activity.timestamp.toLocaleString()}
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={activity.status === 'completed' ? 'text-green-400 border-green-400/50' : 'text-yellow-400 border-yellow-400/50'}
                    >
                      {activity.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="threats">
            <ThreatMapVisualization />
          </TabsContent>

          <TabsContent value="ai-assistant">
            <AISecurityAssistant />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Performance Analytics */}
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Performance Analytics</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">CPU Usage</span>
                    <span className="text-blue-400">23%</span>
                  </div>
                  <Progress value={23} className="h-2" />
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Memory Usage</span>
                    <span className="text-green-400">67%</span>
                  </div>
                  <Progress value={67} className="h-2" />
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Network I/O</span>
                    <span className="text-purple-400">45%</span>
                  </div>
                  <Progress value={45} className="h-2" />
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Disk Usage</span>
                    <span className="text-orange-400">89%</span>
                  </div>
                  <Progress value={89} className="h-2" />
                </div>
              </Card>

              {/* Security Score */}
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Security Posture</h3>
                
                <div className="text-center mb-6">
                  <div className="relative inline-block">
                    <div className="w-24 h-24 rounded-full border-4 border-primary/20 flex items-center justify-center">
                      <div className="text-2xl font-bold text-primary">A+</div>
                    </div>
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
                  </div>
                  <p className="text-muted-foreground mt-2">Overall Security Score</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-4 w-4 text-green-400" />
                      <span className="text-sm">Firewall Protection</span>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Lock className="h-4 w-4 text-green-400" />
                      <span className="text-sm">Encryption Status</span>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Eye className="h-4 w-4 text-green-400" />
                      <span className="text-sm">Monitoring Active</span>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      <span className="text-sm">Patch Management</span>
                    </div>
                    <Clock className="h-4 w-4 text-yellow-400" />
                  </div>
                </div>
              </Card>
            </div>

            {/* Predictive Analytics */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Predictive Threat Analysis</h3>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-background/50 rounded border border-red-400/20">
                  <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2 animate-pulse" />
                  <div className="text-xl font-bold text-red-400">High Risk</div>
                  <div className="text-xs text-muted-foreground">Next 24 hours</div>
                  <div className="text-xs text-red-400 mt-1">DDoS probability: 78%</div>
                </div>
                
                <div className="text-center p-4 bg-background/50 rounded border border-yellow-400/20">
                  <Eye className="h-8 w-8 text-yellow-400 mx-auto mb-2 animate-pulse" />
                  <div className="text-xl font-bold text-yellow-400">Medium Risk</div>
                  <div className="text-xs text-muted-foreground">Next 7 days</div>
                  <div className="text-xs text-yellow-400 mt-1">APT activity: 45%</div>
                </div>
                
                <div className="text-center p-4 bg-background/50 rounded border border-green-400/20">
                  <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2 animate-pulse" />
                  <div className="text-xl font-bold text-green-400">Low Risk</div>
                  <div className="text-xs text-muted-foreground">Next 30 days</div>
                  <div className="text-xs text-green-400 mt-1">Zero-day: 12%</div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

