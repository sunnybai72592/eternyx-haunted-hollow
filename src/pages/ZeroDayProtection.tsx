import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import { 
  AlertTriangle, 
  Globe, 
  Shield, 
  Radar, 
  ArrowLeft,
  Clock,
  TrendingUp,
  Zap,
  Eye,
  Activity
} from "lucide-react";

const ZeroDayProtection = () => {
  const navigate = useNavigate();
  const [threatFeed, setThreatFeed] = useState<any[]>([]);
  const [selectedThreat, setSelectedThreat] = useState<string | null>(null);

  const threatIntelligence = [
    {
      id: "ZD-2024-001",
      title: "Advanced Persistent Threat Campaign",
      severity: "Critical",
      location: "Global",
      description: "Sophisticated APT group targeting financial institutions",
      timestamp: "2 minutes ago",
      indicators: ["192.168.1.100", "malicious-domain.com", "SHA256: abc123..."],
      color: "red"
    },
    {
      id: "ZD-2024-002", 
      title: "Zero-Day Browser Exploit",
      severity: "High",
      location: "North America",
      description: "Remote code execution vulnerability in popular browser",
      timestamp: "15 minutes ago",
      indicators: ["CVE-2024-XXXX", "exploit-kit.js", "SHA256: def456..."],
      color: "orange"
    },
    {
      id: "ZD-2024-003",
      title: "IoT Botnet Activity",
      severity: "Medium", 
      location: "Asia Pacific",
      description: "Coordinated botnet targeting smart home devices",
      timestamp: "1 hour ago",
      indicators: ["Port 23", "telnet-bruteforce", "SHA256: ghi789..."],
      color: "yellow"
    },
    {
      id: "ZD-2024-004",
      title: "Cryptocurrency Mining Malware",
      severity: "Low",
      location: "Europe",
      description: "Cryptojacking campaign using compromised websites",
      timestamp: "3 hours ago", 
      indicators: ["coinhive.js", "mining-pool.com", "SHA256: jkl012..."],
      color: "blue"
    }
  ];

  const protectionSystems = [
    {
      name: "Quantum Threat Detection Engine",
      status: "Active",
      accuracy: "99.7%",
      threatsBlocked: "1,247",
      description: "AI-powered system analyzing billions of data points"
    },
    {
      name: "Neural Network Behavioral Analysis", 
      status: "Active",
      accuracy: "98.3%",
      threatsBlocked: "892",
      description: "Deep learning models detecting anomalous behavior"
    },
    {
      name: "Predictive Threat Intelligence",
      status: "Active", 
      accuracy: "96.8%",
      threatsBlocked: "634",
      description: "Forecasting emerging threats before they manifest"
    }
  ];

  const historicalThreats = [
    {
      year: "2024",
      name: "Quantum Cipher Break",
      impact: "Global encryption compromise",
      mitigation: "Quantum-resistant algorithms deployed"
    },
    {
      year: "2023", 
      name: "AI Poisoning Campaign",
      impact: "Machine learning model corruption",
      mitigation: "Enhanced model validation protocols"
    },
    {
      year: "2022",
      name: "Supply Chain Infiltration",
      impact: "Widespread software compromise", 
      mitigation: "Zero-trust architecture implementation"
    },
    {
      year: "2021",
      name: "Cloud Infrastructure Attack",
      impact: "Multi-tenant environment breach",
      mitigation: "Micro-segmentation and isolation"
    }
  ];

  useEffect(() => {
    // Simulate real-time threat feed updates
    const interval = setInterval(() => {
      const newThreat = {
        id: `LIVE-${Date.now()}`,
        title: "Real-time Threat Detected",
        severity: Math.random() > 0.7 ? "High" : Math.random() > 0.4 ? "Medium" : "Low",
        location: ["Global", "North America", "Europe", "Asia Pacific"][Math.floor(Math.random() * 4)],
        description: "Automated threat detection system identified suspicious activity",
        timestamp: "Just now",
        color: Math.random() > 0.7 ? "red" : Math.random() > 0.4 ? "orange" : "yellow"
      };
      
      setThreatFeed(prev => [newThreat, ...prev.slice(0, 9)]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
              text="Stay ahead of unknown threats with proprietary detection systems"
              speed={80}
              className="text-yellow-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our advanced threat intelligence platform identifies and neutralizes zero-day exploits 
            before they can impact your systems. Real-time monitoring and predictive analytics 
            keep you protected from the unknown.
          </p>
        </div>
      </section>

      {/* Real-Time Threat Dashboard */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-yellow-400">
            <Globe className="inline mr-2 h-8 w-8" />
            Global Threat Intelligence Center
          </h2>
          <p className="text-muted-foreground">
            Real-time monitoring of emerging threats worldwide
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Live Threat Feed */}
          <div className="lg:col-span-2">
            <Card className="bg-card/50 border-yellow-500/20">
              <CardHeader>
                <CardTitle className="text-yellow-400 flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  Live Threat Feed
                  <Badge className="ml-2 bg-yellow-600 animate-pulse">LIVE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {[...threatFeed, ...threatIntelligence].map((threat, index) => (
                    <div 
                      key={threat.id}
                      className={`p-4 bg-background/50 rounded-lg border border-${threat.color}-500/20 cursor-pointer transition-all duration-300 hover:border-${threat.color}-500/40`}
                      onClick={() => setSelectedThreat(selectedThreat === threat.id ? null : threat.id)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className={`font-semibold text-${threat.color}-300`}>{threat.title}</h3>
                        <div className="flex space-x-2">
                          <Badge variant="outline" className={`border-${threat.color}-500 text-${threat.color}-400`}>
                            {threat.severity}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {threat.location}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{threat.description}</p>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{threat.id}</span>
                        <span className={`text-${threat.color}-400`}>{threat.timestamp}</span>
                      </div>
                      
                      {selectedThreat === threat.id && threat.indicators && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <h4 className="font-semibold text-yellow-300 mb-2">Threat Indicators:</h4>
                          <div className="space-y-1">
                            {threat.indicators.map((indicator: string, idx: number) => (
                              <div key={idx} className="text-xs font-mono bg-background/50 p-2 rounded">
                                {indicator}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Protection Systems Status */}
          <div>
            <Card className="bg-card/50 border-yellow-500/20">
              <CardHeader>
                <CardTitle className="text-yellow-400 flex items-center">
                  <Shield className="mr-2 h-5 w-5" />
                  Protection Systems
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {protectionSystems.map((system, index) => (
                  <div key={index} className="p-4 bg-background/50 rounded-lg border border-green-500/20">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-green-300 text-sm">{system.name}</h3>
                      <Badge className="bg-green-600 text-xs">
                        {system.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{system.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Accuracy:</span>
                        <span className="text-green-400">{system.accuracy}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Threats Blocked:</span>
                        <span className="text-yellow-400">{system.threatsBlocked}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Historical Timeline */}
      <section className="py-16 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-yellow-400">
            <Clock className="inline mr-2 h-8 w-8" />
            Zero-Day Timeline
          </h2>
          <p className="text-muted-foreground">
            Historical analysis of major zero-day exploits and our response
          </p>
        </div>

        <div className="space-y-6">
          {historicalThreats.map((threat, index) => (
            <Card key={index} className="bg-card/50 border-yellow-500/20">
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center">
                      <span className="text-yellow-400 font-bold">{threat.year}</span>
                    </div>
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-lg font-semibold text-yellow-300 mb-2">{threat.name}</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold text-red-300 mb-1">Impact:</h4>
                        <p className="text-sm text-muted-foreground">{threat.impact}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-green-300 mb-1">Our Response:</h4>
                        <p className="text-sm text-muted-foreground">{threat.mitigation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 px-4 text-center bg-gradient-to-t from-yellow-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-6 text-yellow-400">
            Don't Wait for the Unknown
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Zero-day exploits can strike without warning. Our proactive threat intelligence 
            and advanced detection systems ensure you're protected from threats that don't exist yet.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              className="bg-yellow-600 hover:bg-yellow-700 text-black neon-border"
            >
              <Eye className="mr-2 h-5 w-5" />
              Enable Protection
            </Button>
            <Button 
              variant="outline"
              size="lg"
              className="border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/10"
            >
              <TrendingUp className="mr-2 h-5 w-5" />
              View Intelligence Report
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ZeroDayProtection;

