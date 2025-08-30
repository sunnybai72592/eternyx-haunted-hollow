import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import { 
  Wifi, 
  ArrowLeft,
  Activity,
  AlertTriangle,
  Shield,
  Eye,
  Globe,
  Server,
  Clock,
  TrendingUp,
  Zap,
  Target,
  Bell,
  CheckCircle,
  XCircle
} from "lucide-react";

const ThreatMonitoring = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [realTimeData, setRealTimeData] = useState({
    threatsBlocked: 1247,
    activeMonitoring: 156,
    responseTime: "< 30s",
    uptime: 99.98
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        ...prev,
        threatsBlocked: prev.threatsBlocked + Math.floor(Math.random() * 3),
        activeMonitoring: 156 + Math.floor(Math.random() * 10) - 5
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Current threats (simulated real-time data)
  const currentThreats = [
    {
      id: 1,
      type: "DDoS Attack",
      severity: "high",
      source: "185.220.101.42",
      target: "web-server-01",
      status: "mitigated",
      timestamp: "2024-08-30 23:35:12"
    },
    {
      id: 2,
      type: "Malware Detection",
      severity: "critical",
      source: "192.168.1.105",
      target: "workstation-15",
      status: "quarantined",
      timestamp: "2024-08-30 23:34:45"
    },
    {
      id: 3,
      type: "Suspicious Login",
      severity: "medium",
      source: "203.0.113.25",
      target: "admin-portal",
      status: "investigating",
      timestamp: "2024-08-30 23:33:28"
    },
    {
      id: 4,
      type: "Port Scan",
      severity: "low",
      source: "198.51.100.14",
      target: "firewall-01",
      status: "blocked",
      timestamp: "2024-08-30 23:32:15"
    }
  ];

  // Monitoring services
  const monitoringServices = [
    {
      name: "Network Intrusion Detection",
      status: "active",
      coverage: "100%",
      lastUpdate: "2024-08-30 23:35:00",
      threats: 45
    },
    {
      name: "Malware Protection",
      status: "active",
      coverage: "100%",
      lastUpdate: "2024-08-30 23:34:55",
      threats: 23
    },
    {
      name: "Web Application Firewall",
      status: "active",
      coverage: "100%",
      lastUpdate: "2024-08-30 23:35:02",
      threats: 78
    },
    {
      name: "Email Security Gateway",
      status: "active",
      coverage: "100%",
      lastUpdate: "2024-08-30 23:34:58",
      threats: 156
    },
    {
      name: "Endpoint Detection & Response",
      status: "active",
      coverage: "98%",
      lastUpdate: "2024-08-30 23:35:01",
      threats: 12
    },
    {
      name: "Cloud Security Monitoring",
      status: "active",
      coverage: "100%",
      lastUpdate: "2024-08-30 23:34:59",
      threats: 34
    }
  ];

  // SOC team status
  const socTeam = [
    { name: "Alpha Team", status: "active", analysts: 4, shift: "Day Shift (08:00-16:00)" },
    { name: "Bravo Team", status: "active", analysts: 4, shift: "Evening Shift (16:00-00:00)" },
    { name: "Charlie Team", status: "active", analysts: 3, shift: "Night Shift (00:00-08:00)" },
    { name: "Delta Team", status: "standby", analysts: 2, shift: "Emergency Response" }
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
      case 'low': return 'text-green-400 bg-green-500/20 border-green-500';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'mitigated': return 'text-green-400';
      case 'quarantined': return 'text-blue-400';
      case 'investigating': return 'text-yellow-400';
      case 'blocked': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-orange-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="flex items-center space-x-2">
            <Wifi className="h-6 w-6 text-orange-500" />
            <h1 className="text-xl font-bold text-orange-400">24/7 Threat Monitoring</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-orange-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-orange-500/10 border border-orange-500/20">
              <Wifi className="h-16 w-16 text-orange-500" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-orange-400 glitch" data-text="24/7">
            24/7
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-orange-300">
            THREAT MONITORING
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Round-the-clock security operations center monitoring your infrastructure"
              speed={80}
              className="text-orange-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our Security Operations Center (SOC) provides continuous monitoring, threat detection, 
            and incident response to protect your digital assets around the clock.
          </p>
        </div>
      </section>

      {/* Real-time Stats */}
      <section className="py-8 px-4 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-card/50 border-orange-500/20 text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-400 mb-2">{realTimeData.threatsBlocked.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Threats Blocked Today</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-orange-500/20 text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-400 mb-2">{realTimeData.activeMonitoring}</div>
              <div className="text-sm text-muted-foreground">Systems Monitored</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-orange-500/20 text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-400 mb-2">{realTimeData.responseTime}</div>
              <div className="text-sm text-muted-foreground">Avg Response Time</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-orange-500/20 text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-400 mb-2">{realTimeData.uptime}%</div>
              <div className="text-sm text-muted-foreground">SOC Uptime</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Monitoring Interface */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-card/50">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-orange-600">
              <Activity className="mr-2 h-4 w-4" />
              Live Dashboard
            </TabsTrigger>
            <TabsTrigger value="threats" className="data-[state=active]:bg-orange-600">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Active Threats
            </TabsTrigger>
            <TabsTrigger value="services" className="data-[state=active]:bg-orange-600">
              <Shield className="mr-2 h-4 w-4" />
              Monitoring Services
            </TabsTrigger>
            <TabsTrigger value="soc" className="data-[state=active]:bg-orange-600">
              <Eye className="mr-2 h-4 w-4" />
              SOC Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-orange-500/20">
                <CardHeader>
                  <CardTitle className="text-orange-400 flex items-center">
                    <TrendingUp className="mr-2 h-5 w-5" />
                    Threat Activity (Last 24 Hours)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>DDoS Attacks</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={75} className="w-24" />
                        <span className="text-orange-400">15</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Malware Detections</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={45} className="w-24" />
                        <span className="text-orange-400">9</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Suspicious Logins</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={60} className="w-24" />
                        <span className="text-orange-400">12</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Port Scans</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={90} className="w-24" />
                        <span className="text-orange-400">28</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-orange-500/20">
                <CardHeader>
                  <CardTitle className="text-orange-400 flex items-center">
                    <Globe className="mr-2 h-5 w-5" />
                    Geographic Threat Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { country: "Russia", threats: 45, percentage: 35 },
                      { country: "China", threats: 32, percentage: 25 },
                      { country: "North Korea", threats: 25, percentage: 20 },
                      { country: "Iran", threats: 15, percentage: 12 },
                      { country: "Other", threats: 10, percentage: 8 }
                    ].map((item, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span>{item.country}</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={item.percentage} className="w-20" />
                          <span className="text-orange-400 w-8 text-right">{item.threats}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8">
              <TerminalWindow title="soc-monitoring.log">
                <div className="space-y-1 text-sm max-h-64 overflow-y-auto">
                  <div className="text-orange-400">[23:35:12] ALERT: DDoS attack detected from 185.220.101.42 - Auto-mitigation activated</div>
                  <div className="text-green-400">[23:34:45] INFO: Malware quarantined on workstation-15 - User notified</div>
                  <div className="text-yellow-400">[23:33:28] WARN: Suspicious login attempt from 203.0.113.25 - Investigation initiated</div>
                  <div className="text-green-400">[23:32:15] INFO: Port scan blocked from 198.51.100.14 - Source IP blacklisted</div>
                  <div className="text-blue-400">[23:31:42] INFO: Firewall rules updated - New threat signatures deployed</div>
                  <div className="text-orange-400">[23:30:58] ALERT: Phishing email detected and quarantined - 15 recipients protected</div>
                  <div className="text-green-400">[23:29:33] INFO: Vulnerability scan completed - No critical issues found</div>
                  <div className="text-yellow-400">[23:28:17] WARN: Unusual network traffic pattern detected - Analyzing...</div>
                  <div className="text-green-400">[23:27:05] INFO: Backup verification completed successfully</div>
                  <div className="text-blue-400">[23:26:22] INFO: SOC team shift change - Bravo team taking over</div>
                </div>
              </TerminalWindow>
            </div>
          </TabsContent>

          <TabsContent value="threats" className="mt-6">
            <div className="space-y-4">
              {currentThreats.map((threat) => (
                <Card key={threat.id} className="bg-card/50 border-orange-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <Badge className={`${getSeverityColor(threat.severity)} border`}>
                          {threat.severity.toUpperCase()}
                        </Badge>
                        <h3 className="text-lg font-semibold text-orange-400">{threat.type}</h3>
                      </div>
                      <div className={`flex items-center space-x-2 ${getStatusColor(threat.status)}`}>
                        {threat.status === 'mitigated' || threat.status === 'blocked' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : threat.status === 'quarantined' ? (
                          <Shield className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                        <span className="capitalize">{threat.status}</span>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span>
                        <div className="text-orange-400 font-mono">{threat.source}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target:</span>
                        <div className="text-orange-400 font-mono">{threat.target}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Detected:</span>
                        <div className="text-orange-400">{threat.timestamp}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Threat ID:</span>
                        <div className="text-orange-400 font-mono">THR-{threat.id.toString().padStart(6, '0')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="services" className="mt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {monitoringServices.map((service, index) => (
                <Card key={index} className="bg-card/50 border-orange-500/20">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-orange-300 text-sm">{service.name}</CardTitle>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-green-400 text-xs">ACTIVE</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs">Coverage:</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={parseInt(service.coverage)} className="w-16 h-2" />
                          <span className="text-orange-400 text-xs">{service.coverage}</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Threats Today:</span>
                        <span className="text-orange-400">{service.threats}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Last Update:</span>
                        <span className="text-muted-foreground">{service.lastUpdate}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="soc" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {socTeam.map((team, index) => (
                <Card key={index} className="bg-card/50 border-orange-500/20">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-orange-400">{team.name}</CardTitle>
                      <Badge className={team.status === 'active' ? 'bg-green-600' : 'bg-yellow-600'}>
                        {team.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>Analysts on Duty:</span>
                        <span className="text-orange-400">{team.analysts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Shift:</span>
                        <span className="text-orange-400">{team.shift}</span>
                      </div>
                      <div className="flex items-center space-x-2 mt-4">
                        <div className={`w-2 h-2 rounded-full ${team.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                        <span className="text-sm text-muted-foreground">
                          {team.status === 'active' ? 'Currently monitoring' : 'On standby'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8">
              <Card className="bg-card/50 border-orange-500/20">
                <CardHeader>
                  <CardTitle className="text-orange-400">SOC Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">< 30s</div>
                      <div className="text-sm text-muted-foreground">Mean Time to Detection</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">< 2min</div>
                      <div className="text-sm text-muted-foreground">Mean Time to Response</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">99.8%</div>
                      <div className="text-sm text-muted-foreground">Threat Detection Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">0.02%</div>
                      <div className="text-sm text-muted-foreground">False Positive Rate</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

export default ThreatMonitoring;

