import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Globe, 
  AlertTriangle, 
  Shield, 
  Zap, 
  Eye,
  Activity,
  MapPin,
  Wifi,
  Target
} from 'lucide-react';

interface ThreatEvent {
  id: string;
  type: 'ddos' | 'malware' | 'intrusion' | 'phishing' | 'apt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceCountry: string;
  targetCountry: string;
  sourceIP: string;
  targetIP: string;
  timestamp: Date;
  blocked: boolean;
  coordinates: {
    source: { lat: number; lng: number };
    target: { lat: number; lng: number };
  };
}

interface ThreatStats {
  total: number;
  blocked: number;
  critical: number;
  active: number;
}

export const ThreatMapVisualization = () => {
  const [threats, setThreats] = useState<ThreatEvent[]>([]);
  const [stats, setStats] = useState<ThreatStats>({ total: 0, blocked: 0, critical: 0, active: 0 });
  const [selectedThreat, setSelectedThreat] = useState<ThreatEvent | null>(null);
  const [isLive, setIsLive] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);

  // Simulate real-time threat data
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const newThreat: ThreatEvent = {
        id: Date.now().toString(),
        type: ['ddos', 'malware', 'intrusion', 'phishing', 'apt'][Math.floor(Math.random() * 5)] as any,
        severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any,
        sourceCountry: ['Russia', 'China', 'North Korea', 'Iran', 'Unknown'][Math.floor(Math.random() * 5)],
        targetCountry: 'United States',
        sourceIP: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        targetIP: `192.168.1.${Math.floor(Math.random() * 255)}`,
        timestamp: new Date(),
        blocked: Math.random() > 0.3,
        coordinates: {
          source: { lat: Math.random() * 180 - 90, lng: Math.random() * 360 - 180 },
          target: { lat: 39.8283, lng: -98.5795 } // US center
        }
      };

      setThreats(prev => {
        const updated = [newThreat, ...prev].slice(0, 50); // Keep last 50 threats
        
        // Update stats
        const newStats = {
          total: updated.length,
          blocked: updated.filter(t => t.blocked).length,
          critical: updated.filter(t => t.severity === 'critical').length,
          active: updated.filter(t => !t.blocked).length
        };
        setStats(newStats);
        
        return updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isLive]);

  const getThreatIcon = (type: string) => {
    switch (type) {
      case 'ddos': return <Wifi className="h-4 w-4" />;
      case 'malware': return <AlertTriangle className="h-4 w-4" />;
      case 'intrusion': return <Target className="h-4 w-4" />;
      case 'phishing': return <Eye className="h-4 w-4" />;
      case 'apt': return <Zap className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 border-red-400/50';
      case 'high': return 'text-orange-400 border-orange-400/50';
      case 'medium': return 'text-yellow-400 border-yellow-400/50';
      case 'low': return 'text-green-400 border-green-400/50';
      default: return 'text-blue-400 border-blue-400/50';
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full">
      {/* Main Threat Map */}
      <div className="xl:col-span-2">
        <Card className="h-[700px] bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
          <div className="p-4 border-b border-primary/20 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Globe className="h-6 w-6 text-primary animate-pulse" />
              <div>
                <h3 className="font-bold text-primary">Global Threat Map</h3>
                <p className="text-xs text-muted-foreground">Real-time cyber attack visualization</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLive(!isLive)}
                className={isLive ? 'text-green-400 border-green-400/50' : 'text-red-400 border-red-400/50'}
              >
                <Activity className="h-4 w-4 mr-1" />
                {isLive ? 'LIVE' : 'PAUSED'}
              </Button>
            </div>
          </div>

          {/* Simulated World Map */}
          <div 
            ref={mapRef}
            className="relative h-[600px] bg-gradient-to-b from-background to-card/50 overflow-hidden"
          >
            {/* Matrix background effect */}
            <div className="absolute inset-0 matrix-bg opacity-20"></div>
            
            {/* Simulated world map outline */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-full max-w-4xl max-h-96 relative">
                {/* Continents outline simulation */}
                <div className="absolute top-1/4 left-1/4 w-32 h-20 border border-primary/30 rounded-lg"></div>
                <div className="absolute top-1/3 right-1/4 w-24 h-16 border border-primary/30 rounded"></div>
                <div className="absolute bottom-1/3 left-1/3 w-20 h-12 border border-primary/30 rounded"></div>
                
                {/* Threat indicators */}
                {threats.slice(0, 20).map((threat, index) => (
                  <div
                    key={threat.id}
                    className={`absolute w-3 h-3 rounded-full cursor-pointer transition-all duration-300 hover:scale-150 ${
                      threat.blocked ? 'bg-green-400' : 'bg-red-400'
                    } animate-ping`}
                    style={{
                      left: `${Math.random() * 80 + 10}%`,
                      top: `${Math.random() * 60 + 20}%`,
                      animationDelay: `${index * 0.1}s`
                    }}
                    onClick={() => setSelectedThreat(threat)}
                  >
                    <div className={`absolute inset-0 rounded-full ${
                      threat.blocked ? 'bg-green-400' : 'bg-red-400'
                    }`}></div>
                  </div>
                ))}
                
                {/* Attack vectors (animated lines) */}
                {threats.slice(0, 5).map((threat, index) => (
                  <div
                    key={`vector-${threat.id}`}
                    className="absolute w-px h-20 bg-gradient-to-b from-red-400 to-transparent animate-pulse"
                    style={{
                      left: `${Math.random() * 80 + 10}%`,
                      top: `${Math.random() * 40 + 30}%`,
                      transform: `rotate(${Math.random() * 360}deg)`,
                      animationDelay: `${index * 0.3}s`
                    }}
                  ></div>
                ))}
              </div>
            </div>

            {/* Scanning line effect */}
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-primary to-transparent animate-scan opacity-50"></div>
          </div>
        </Card>
      </div>

      {/* Threat Details & Stats */}
      <div className="space-y-4">
        {/* Live Stats */}
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-4">
          <h3 className="font-bold text-primary mb-4 flex items-center">
            <Activity className="h-4 w-4 mr-2" />
            Live Statistics
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-background/50 rounded border border-primary/20">
              <div className="text-2xl font-bold text-primary">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Threats</div>
            </div>
            <div className="text-center p-3 bg-background/50 rounded border border-green-400/20">
              <div className="text-2xl font-bold text-green-400">{stats.blocked}</div>
              <div className="text-xs text-muted-foreground">Blocked</div>
            </div>
            <div className="text-center p-3 bg-background/50 rounded border border-red-400/20">
              <div className="text-2xl font-bold text-red-400">{stats.critical}</div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </div>
            <div className="text-center p-3 bg-background/50 rounded border border-orange-400/20">
              <div className="text-2xl font-bold text-orange-400">{stats.active}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
          </div>
        </Card>

        {/* Recent Threats */}
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-4">
          <h3 className="font-bold text-primary mb-4 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Recent Threats
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {threats.slice(0, 10).map((threat) => (
              <div
                key={threat.id}
                className={`p-2 rounded border cursor-pointer transition-all duration-300 hover:scale-105 ${
                  selectedThreat?.id === threat.id 
                    ? 'border-primary bg-primary/10' 
                    : `${getSeverityColor(threat.severity)} bg-background/30`
                }`}
                onClick={() => setSelectedThreat(threat)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    {getThreatIcon(threat.type)}
                    <span className="text-xs font-medium uppercase">{threat.type}</span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${threat.blocked ? 'text-green-400 border-green-400/50' : 'text-red-400 border-red-400/50'}`}
                  >
                    {threat.blocked ? 'BLOCKED' : 'ACTIVE'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  <div>{threat.sourceCountry} → {threat.targetCountry}</div>
                  <div>{threat.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Threat Details */}
        {selectedThreat && (
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-4">
            <h3 className="font-bold text-primary mb-4 flex items-center">
              <MapPin className="h-4 w-4 mr-2" />
              Threat Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Badge variant="outline" className={getSeverityColor(selectedThreat.severity)}>
                  {selectedThreat.type.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Severity:</span>
                <Badge variant="outline" className={getSeverityColor(selectedThreat.severity)}>
                  {selectedThreat.severity.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Source:</span>
                <span className="text-sm font-mono">{selectedThreat.sourceIP}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Target:</span>
                <span className="text-sm font-mono">{selectedThreat.targetIP}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge 
                  variant="outline" 
                  className={selectedThreat.blocked ? 'text-green-400 border-green-400/50' : 'text-red-400 border-red-400/50'}
                >
                  {selectedThreat.blocked ? 'NEUTRALIZED' : 'MONITORING'}
                </Badge>
              </div>
              <div className="pt-2 space-y-2">
                <Button size="sm" variant="outline" className="w-full">
                  <Shield className="h-4 w-4 mr-2" />
                  Block Source
                </Button>
                <Button size="sm" variant="outline" className="w-full">
                  <Eye className="h-4 w-4 mr-2" />
                  Deep Analysis
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ThreatMapVisualization;
