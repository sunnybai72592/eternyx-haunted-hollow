import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Shield, 
  Zap, 
  Database, 
  Globe, 
  TrendingUp, 
  Clock,
  Cpu,
  HardDrive,
  Wifi,
  Eye,
  AlertTriangle
} from 'lucide-react';

interface MetricData {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
}

interface SystemMetrics {
  cpu: MetricData;
  memory: MetricData;
  network: MetricData;
  security: MetricData;
  uptime: MetricData;
  threats: MetricData;
}

const CyberMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: { label: 'CPU Usage', value: 45, max: 100, unit: '%', status: 'normal', trend: 'stable' },
    memory: { label: 'Memory', value: 68, max: 100, unit: '%', status: 'warning', trend: 'up' },
    network: { label: 'Network', value: 234, max: 1000, unit: 'Mbps', status: 'normal', trend: 'up' },
    security: { label: 'Security Score', value: 94, max: 100, unit: '%', status: 'normal', trend: 'stable' },
    uptime: { label: 'Uptime', value: 99.8, max: 100, unit: '%', status: 'normal', trend: 'stable' },
    threats: { label: 'Threats Blocked', value: 1247, max: 2000, unit: '', status: 'normal', trend: 'up' }
  });

  const [realTimeData, setRealTimeData] = useState({
    activeConnections: 42,
    dataProcessed: 15.7,
    systemLoad: 0.65,
    lastScan: new Date().toLocaleTimeString()
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        cpu: { ...prev.cpu, value: Math.max(20, Math.min(90, prev.cpu.value + (Math.random() - 0.5) * 10)) },
        memory: { ...prev.memory, value: Math.max(30, Math.min(95, prev.memory.value + (Math.random() - 0.5) * 5)) },
        network: { ...prev.network, value: Math.max(50, Math.min(800, prev.network.value + (Math.random() - 0.5) * 50)) }
      }));

      setRealTimeData(prev => ({
        ...prev,
        activeConnections: Math.max(20, Math.min(100, prev.activeConnections + Math.floor((Math.random() - 0.5) * 6))),
        dataProcessed: Math.max(5, Math.min(50, prev.dataProcessed + (Math.random() - 0.5) * 2)),
        systemLoad: Math.max(0.1, Math.min(2.0, prev.systemLoad + (Math.random() - 0.5) * 0.2)),
        lastScan: new Date().toLocaleTimeString()
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-400 border-red-400';
      case 'warning': return 'text-yellow-400 border-yellow-400';
      default: return 'text-cyber-green border-cyber-green';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-3 w-3 text-cyber-green" />;
      case 'down': return <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />;
      default: return <Activity className="h-3 w-3 text-cyber-blue" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Status Bar */}
      <div className="bg-card/50 backdrop-blur-sm border border-primary/20 rounded-lg p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-cyber-green rounded-full animate-pulse"></div>
              <span className="text-cyber-green">SYSTEM ONLINE</span>
            </div>
            <div className="text-muted-foreground">
              Active Connections: <span className="text-cyber-blue font-mono">{realTimeData.activeConnections}</span>
            </div>
            <div className="text-muted-foreground">
              Data Processed: <span className="text-cyber-blue font-mono">{realTimeData.dataProcessed.toFixed(1)} GB</span>
            </div>
          </div>
          <div className="text-muted-foreground">
            Last Scan: <span className="text-cyber-green font-mono">{realTimeData.lastScan}</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(metrics).map(([key, metric]) => (
          <Card key={key} className="bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-foreground flex items-center space-x-2">
                  {key === 'cpu' && <Cpu className="h-4 w-4 text-cyber-blue" />}
                  {key === 'memory' && <HardDrive className="h-4 w-4 text-cyber-blue" />}
                  {key === 'network' && <Wifi className="h-4 w-4 text-cyber-blue" />}
                  {key === 'security' && <Shield className="h-4 w-4 text-cyber-blue" />}
                  {key === 'uptime' && <Clock className="h-4 w-4 text-cyber-blue" />}
                  {key === 'threats' && <Eye className="h-4 w-4 text-cyber-blue" />}
                  <span>{metric.label}</span>
                </CardTitle>
                <div className="flex items-center space-x-1">
                  {getTrendIcon(metric.trend)}
                  <Badge variant="outline" className={`text-xs ${getStatusColor(metric.status)}`}>
                    {metric.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold text-cyber-green font-mono">
                    {metric.value.toFixed(key === 'uptime' ? 1 : 0)}
                  </span>
                  <span className="text-sm text-muted-foreground">{metric.unit}</span>
                  {metric.max > 0 && (
                    <span className="text-xs text-muted-foreground">
                      / {metric.max}{metric.unit}
                    </span>
                  )}
                </div>
                {metric.max > 0 && (
                  <Progress 
                    value={(metric.value / metric.max) * 100} 
                    className="h-2"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* System Load Indicator */}
      <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-cyber-green flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>System Load Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Load Average</span>
              <span className="text-lg font-mono text-cyber-blue">{realTimeData.systemLoad.toFixed(2)}</span>
            </div>
            <Progress 
              value={Math.min(100, (realTimeData.systemLoad / 2.0) * 100)} 
              className="h-3"
            />
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <div className="text-cyber-green font-mono">1 min</div>
                <div className="text-muted-foreground">{(realTimeData.systemLoad * 0.9).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-cyber-blue font-mono">5 min</div>
                <div className="text-muted-foreground">{(realTimeData.systemLoad * 1.1).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-purple-400 font-mono">15 min</div>
                <div className="text-muted-foreground">{(realTimeData.systemLoad * 0.8).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Alerts */}
      <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-cyber-green flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5" />
            <span>Security Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-cyber-green/10 border border-cyber-green/20 rounded">
              <div className="flex items-center space-x-3">
                <Shield className="h-4 w-4 text-cyber-green" />
                <span className="text-sm">Firewall Active</span>
              </div>
              <Badge className="bg-cyber-green/20 text-cyber-green">SECURE</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-cyber-blue/10 border border-cyber-blue/20 rounded">
              <div className="flex items-center space-x-3">
                <Eye className="h-4 w-4 text-cyber-blue" />
                <span className="text-sm">Intrusion Detection</span>
              </div>
              <Badge className="bg-cyber-blue/20 text-cyber-blue">MONITORING</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span className="text-sm">SSL Certificate Expires in 30 days</span>
              </div>
              <Badge className="bg-yellow-500/20 text-yellow-400">WARNING</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CyberMetrics;

