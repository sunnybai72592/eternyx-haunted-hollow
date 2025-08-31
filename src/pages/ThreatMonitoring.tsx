import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Wifi,
  ArrowLeft,
  Activity,
  Globe,
  Bell,
  Shield,
  Clock,
  Target,
  Zap
} from "lucide-react";

const ThreatMonitoring = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [incidentCount, setIncidentCount] = useState(0);

  const initialEvents = [
    {
      id: 1,
      timestamp: "2025-08-30 14:01:23",
      type: "Intrusion Attempt",
      severity: "critical",
      source: "192.168.1.10",
      description: "Multiple failed login attempts on critical server.",
      status: "Active"
    },
    {
      id: 2,
      timestamp: "2025-08-30 13:55:40",
      type: "Malware Detected",
      severity: "high",
      source: "Workstation-007",
      description: "Known malware signature detected in user download.",
      status: "Quarantined"
    },
    {
      id: 3,
      timestamp: "2025-08-30 13:45:10",
      type: "DDoS Attack",
      severity: "critical",
      source: "External Botnet",
      description: "High volume traffic targeting web server. Mitigation active.",
      status: "Mitigating"
    },
    {
      id: 4,
      timestamp: "2025-08-30 13:30:05",
      type: "Phishing Alert",
      severity: "medium",
      source: "User: JohnDoe",
      description: "Suspicious email reported by user. Under investigation.",
      status: "Investigating"
    },
    {
      id: 5,
      timestamp: "2025-08-30 13:15:22",
      type: "Unauthorized Access",
      severity: "high",
      source: "VPN-Gateway",
      description: "Unusual access from unknown IP. Session terminated.",
      status: "Resolved"
    }
  ];

  useEffect(() => {
    setSecurityEvents(initialEvents);
    setIncidentCount(initialEvents.filter(e => e.status !== "Resolved").length);

    const interval = setInterval(() => {
      const newEvent = {
        id: securityEvents.length + 1,
        timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        type: ["Intrusion Attempt", "Malware Detected", "DDoS Attack", "Phishing Alert", "Unauthorized Access"][Math.floor(Math.random() * 5)],
        severity: ["critical", "high", "medium", "low"][Math.floor(Math.random() * 4)],
        source: `IP-${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        description: `Simulated event at ${new Date().toLocaleTimeString()}.`,
        status: ["Active", "Investigating", "Resolved", "Mitigating"][Math.floor(Math.random() * 4)]
      };
      setSecurityEvents(prev => [newEvent, ...prev.slice(0, 9)]); // Keep last 10 events
      setIncidentCount(prev => prev + (newEvent.status !== "Resolved" ? 1 : 0));
    }, 5000); // Add a new event every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-400";
      case "high": return "text-orange-400";
      case "medium": return "text-yellow-400";
      case "low": return "text-green-400";
      default: return "text-gray-400";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-red-600";
      case "Investigating": return "bg-yellow-600";
      case "Mitigating": return "bg-orange-600";
      case "Resolved": return "bg-green-600";
      default: return "bg-gray-600";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-red-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="flex items-center space-x-2">
            <Wifi className="h-6 w-6 text-red-500" />
            <h1 className="text-xl font-bold text-red-400">24/7 Threat Monitoring</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-red-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20">
              <Wifi className="h-16 w-16 text-red-500" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-red-400 glitch" data-text="24/7 THREAT">
            24/7 THREAT
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-red-300">
            MONITORING
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Round-the-clock security operations center monitoring your infrastructure"
              speed={80}
              className="text-red-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our Security Operations Center (SOC) provides continuous, real-time monitoring 
            and rapid response to cyber threats, ensuring your digital assets are always protected.
          </p>
        </div>
      </section>

      {/* Monitoring Dashboard */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card/50">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-red-600">
              <Activity className="mr-2 h-4 w-4" />
              SOC Dashboard
            </TabsTrigger>
            <TabsTrigger value="incidents" className="data-[state=active]:bg-red-600">
              <Bell className="mr-2 h-4 w-4" />
              Incident Log
            </TabsTrigger>
            <TabsTrigger value="response" className="data-[state=active]:bg-red-600">
              <Shield className="mr-2 h-4 w-4" />
              Response Protocols
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center">
                    <Globe className="mr-2 h-5 w-5" />
                    Global Threat Map
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-64 bg-background/50 rounded-md flex items-center justify-center text-muted-foreground">
                    [Interactive World Map with Live Attacks]
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Active Incidents:</span>
                      <span className="block text-red-400 font-bold text-xl">{incidentCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Threat Level:</span>
                      <span className="block text-red-400 font-bold text-xl">CRITICAL</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center">
                    <Activity className="mr-2 h-5 w-5" />
                    System Health & Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Network Traffic</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={85} className="w-24" />
                        <span className="text-red-400">85%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>CPU Utilization</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={60} className="w-24" />
                        <span className="text-red-400">60%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Memory Usage</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={70} className="w-24" />
                        <span className="text-red-400">70%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Security Alerts (Last Hour)</span>
                      <span className="text-red-400 font-bold">15</span>
                    </div>
                  </div>
                  <TerminalWindow title="system-alerts.log" className="mt-4">
                    <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                      <div className="text-red-400">[ALERT] High network latency detected on primary server.</div>
                      <div className="text-orange-400">[WARNING] Unusual file access pattern on data storage.</div>
                      <div className="text-red-400">[ALERT] Multiple failed VPN login attempts from external IP.</div>
                      <div className="text-yellow-400">[INFO] New threat intelligence feed update received.</div>
                    </div>
                  </TerminalWindow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="incidents" className="mt-6">
            <div className="space-y-4">
              {securityEvents.map((event) => (
                <Card key={event.id} className="bg-card/50 border-red-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <Badge className={getStatusBadgeColor(event.status)}>{event.status.toUpperCase()}</Badge>
                      <span className="text-muted-foreground text-sm">{event.timestamp}</span>
                    </div>
                    <h3 className={`text-lg font-bold ${getSeverityColor(event.severity)} mb-2`}>{event.type}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{event.description}</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span>
                        <span className="block text-red-400 font-mono">{event.source}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Severity:</span>
                        <span className={`block font-mono ${getSeverityColor(event.severity)}`}>{event.severity.toUpperCase()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="response" className="mt-6">
            <div className="space-y-6">
              <Card className="bg-card/50 border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center">
                    <Target className="mr-2 h-5 w-5" />
                    Incident Response Playbooks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Our automated and human-led response protocols ensure rapid containment and remediation of threats.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>**Automated Containment:** Immediate isolation of compromised systems.</li>
                    <li>**Threat Eradication:** Removal of malware and malicious access.</li>
                    <li>**System Recovery:** Restoration of affected services from secure backups.</li>
                    <li>**Post-Incident Analysis:** Root cause analysis and preventative measures.</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center">
                    <Zap className="mr-2 h-5 w-5" />
                    Rapid Response Team
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Our dedicated team of cybersecurity experts is available 24/7 to respond to critical incidents, 
                    providing hands-on support and expertise.
                  </p>
                  <TerminalWindow title="response-team-status.log">
                    <div className="space-y-1 text-sm">
                      <div className="text-green-400">[STATUS] Incident Response Team: Online and Ready</div>
                      <div className="text-green-400">[STATUS] Average Response Time: 3 minutes</div>
                      <div className="text-green-400">[STATUS] Global Coverage: Active</div>
                      <div className="text-muted-foreground">[INFO] Last Drill: 2025-08-29 10:00:00 (Successful)</div>
                    </div>
                  </TerminalWindow>
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

