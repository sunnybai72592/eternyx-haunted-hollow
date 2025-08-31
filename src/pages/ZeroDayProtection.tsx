import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import { Progress } from "@/components/ui/progress";
import { 
  AlertTriangle, 
  ArrowLeft,
  Globe,
  Activity,
  Shield,
  Bell,
  Database,
  Clock,
  Target,
  Eye
} from "lucide-react";

const ZeroDayProtection = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [threatFeed, setThreatFeed] = useState<any[]>([]);

  // Simulated real-time threat data
  const initialThreats = [
    {
      id: 1,
      type: "New Ransomware Variant",
      severity: "critical",
      description: "Detected a novel ransomware strain exploiting a previously unknown vulnerability in Windows SMB. Spreading rapidly.",
      source: "DarkNet Forums",
      date: "2025-08-30 10:30:00",
      ioc: "SHA256:a1b2c3d4e5f67890...",
      status: "Active"
    },
    {
      id: 2,
      type: "Supply Chain Attack",
      severity: "high",
      description: "Compromise of a popular open-source library used in critical infrastructure. Potential for widespread impact.",
      source: "Private Intelligence",
      date: "2025-08-30 09:15:00",
      ioc: "Domain: malicious-lib.com",
      status: "Active"
    },
    {
      id: 3,
      type: "Zero-Click Exploit",
      severity: "critical",
      description: "Exploit chain targeting iOS messaging application. No user interaction required for compromise.",
      source: "Government Agency",
      date: "2025-08-30 08:00:00",
      ioc: "CVE-2025-XXXX",
      status: "Active"
    },
    {
      id: 4,
      type: "IoT Botnet Expansion",
      severity: "medium",
      description: "New IoT devices being recruited into an existing botnet via default credentials.",
      source: "Honeypot Network",
      date: "2025-08-30 07:30:00",
      ioc: "IP Range: 192.0.2.0/24",
      status: "Active"
    },
    {
      id: 5,
      type: "Phishing Campaign",
      severity: "low",
      description: "Highly sophisticated phishing campaign targeting financial institutions. Uses deepfake audio.",
      source: "Email Security Vendor",
      date: "2025-08-30 06:00:00",
      ioc: "URL: fakebank.com",
      status: "Active"
    }
  ];

  useEffect(() => {
    setThreatFeed(initialThreats);
    const interval = setInterval(() => {
      const newThreat = {
        id: threatFeed.length + 1,
        type: `Simulated Threat ${threatFeed.length + 1}`,
        severity: ["critical", "high", "medium", "low"][Math.floor(Math.random() * 4)],
        description: `A new simulated threat has been detected at ${new Date().toLocaleTimeString()}.`,
        source: "ETERNYX AI",
        date: new Date().toISOString().slice(0, 19).replace("T", " "),
        ioc: `SIM-IOC-${Math.random().toString(36).substring(7).toUpperCase()}`,
        status: "Active"
      };
      setThreatFeed(prev => [newThreat, ...prev.slice(0, 9)]); // Keep last 10 threats
    }, 10000); // Add a new threat every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-600 text-white';
      case 'medium': return 'bg-yellow-600 text-white';
      case 'low': return 'bg-green-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-yellow-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            <h1 className="text-xl font-bold text-yellow-400">Zero-Day Protection</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-yellow-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-16 w-16 text-yellow-500" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-yellow-400 glitch" data-text="ZERO-DAY">
            ZERO-DAY
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-yellow-300">
            PROTECTION
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Stay ahead of unknown threats with our proprietary detection systems"
              speed={80}
              className="text-yellow-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our advanced threat intelligence and proprietary detection systems identify and neutralize 
            zero-day exploits before they can compromise your systems.
          </p>
        </div>
      </section>

      {/* Protection Interface */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card/50">
            <TabsTrigger value="overview" className="data-[state=active]:bg-yellow-600">
              <Activity className="mr-2 h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="threat-feed" className="data-[state=active]:bg-yellow-600">
              <Bell className="mr-2 h-4 w-4" />
              Live Threat Feed
            </TabsTrigger>
            <TabsTrigger value="research" className="data-[state=active]:bg-yellow-600">
              <Database className="mr-2 h-4 w-4" />
              Research & Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-yellow-500/20">
                <CardHeader>
                  <CardTitle className="text-yellow-400 flex items-center">
                    <Shield className="mr-2 h-5 w-5" />
                    Protection Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Zero-Day Detections (Last 24h)</span>
                      <span className="text-yellow-400 font-bold">3</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Threats Neutralized</span>
                      <span className="text-yellow-400 font-bold">12</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>System Coverage</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={98} className="w-24" />
                        <span className="text-yellow-400">98%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Threat Intelligence Sync</span>
                      <span className="text-green-400">Real-time</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-yellow-500/20">
                <CardHeader>
                  <CardTitle className="text-yellow-400 flex items-center">
                    <Globe className="mr-2 h-5 w-5" />
                    Global Threat Landscape
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { region: "Asia-Pacific", threats: 65, percentage: 40 },
                      { region: "North America", threats: 40, percentage: 25 },
                      { region: "Europe", threats: 30, percentage: 18 },
                      { region: "Middle East", threats: 15, percentage: 10 },
                      { region: "Other", threats: 10, percentage: 7 }
                    ].map((item, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span>{item.region}</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={item.percentage} className="w-20" />
                          <span className="text-yellow-400 w-8 text-right">{item.threats}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8">
              <TerminalWindow title="zero-day-log.txt">
                <div className="space-y-1 text-sm max-h-64 overflow-y-auto">
                  <div className="text-yellow-400">[2025-08-30 10:30:00] CRITICAL: New Ransomware Variant detected (Windows SMB) - Auto-patching initiated.</div>
                  <div className="text-orange-400">[2025-08-30 09:15:00] HIGH: Supply Chain Attack identified (Open-source library) - Isolation protocol engaged.</div>
                  <div className="text-red-400">[2025-08-30 08:00:00] CRITICAL: Zero-Click Exploit targeting iOS messaging - Emergency patch deployed.</div>
                  <div className="text-yellow-400">[2025-08-30 07:30:00] MEDIUM: IoT Botnet Expansion detected - Device hardening recommendations issued.</div>
                  <div className="text-green-400">[2025-08-30 06:00:00] LOW: Phishing Campaign detected (Deepfake audio) - User awareness training triggered.</div>
                  <div className="text-blue-400">[2025-08-30 05:00:00] INFO: Threat intelligence feed updated - 15 new IoCs added.</div>
                  <div className="text-green-400">[2025-08-30 04:00:00] INFO: Predictive analytics model updated - Increased accuracy by 2%.</div>
                  <div className="text-yellow-400">[2025-08-30 03:00:00] WARNING: Anomalous network behavior detected - Further analysis required.</div>
                  <div className="text-green-400">[2025-08-30 02:00:00] INFO: System integrity check completed - No anomalies found.</div>
                </div>
              </TerminalWindow>
            </div>
          </TabsContent>

          <TabsContent value="threat-feed" className="mt-6">
            <div className="space-y-4">
              {threatFeed.map((threat) => (
                <Card key={threat.id} className="bg-card/50 border-yellow-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <Badge className={getSeverityColor(threat.severity)}>{threat.severity.toUpperCase()}</Badge>
                      <span className="text-muted-foreground text-sm">{threat.date}</span>
                    </div>
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">{threat.type}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{threat.description}</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span>
                        <span className="block text-yellow-400 font-mono">{threat.source}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IOC:</span>
                        <span className="block text-yellow-400 font-mono break-all">{threat.ioc}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="research" className="mt-6">
            <div className="space-y-6">
              <Card className="bg-card/50 border-yellow-500/20">
                <CardHeader>
                  <CardTitle className="text-yellow-400 flex items-center">
                    <Target className="mr-2 h-5 w-5" />
                    Zero-Day Research Initiatives
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Our dedicated research division continuously hunts for novel vulnerabilities and develops 
                    proactive countermeasures. We collaborate with leading security researchers globally.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>Advanced Fuzzing Techniques for Protocol Vulnerabilities</li>
                    <li>AI-Driven Anomaly Detection in Firmware</li>
                    <li>Hardware-Level Security Bypass Analysis</li>
                    <li>Post-Quantum Cryptography Vulnerability Assessment</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-yellow-500/20">
                <CardHeader>
                  <CardTitle className="text-yellow-400 flex items-center">
                    <Eye className="mr-2 h-5 w-5" />
                    Predictive Threat Modeling
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Leveraging machine learning and vast datasets, we predict emerging threat vectors 
                    and potential attack surfaces before they are exploited.
                  </p>
                  <TerminalWindow title="predictive-model-output.log">
                    <div className="space-y-1 text-sm">
                      <div className="text-yellow-400">[PREDICT] Next 72h: Increased likelihood of supply chain attacks (75% confidence)</div>
                      <div className="text-yellow-400">[PREDICT] Next 1 week: Elevated risk of IoT device exploitation (68% confidence)</div>
                      <div className="text-yellow-400">[PREDICT] Next 2 weeks: Potential for new browser zero-day (55% confidence)</div>
                      <div className="text-muted-foreground">[INFO] Model accuracy: 92.3%</div>
                      <div className="text-muted-foreground">[INFO] Last updated: 2025-08-30 23:00:00</div>
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

export default ZeroDayProtection;

