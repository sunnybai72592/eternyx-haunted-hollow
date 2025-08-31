import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  AlertTriangle, 
  Shield,
  Activity,
  Target,
  Zap,
  Eye,
  Clock,
  BarChart3,
  PieChart,
  LineChart,
  Globe,
  Users,
  Database,
  Network
} from 'lucide-react';

interface PredictionModel {
  id: string;
  name: string;
  type: 'threat_prediction' | 'anomaly_detection' | 'risk_assessment' | 'behavior_analysis';
  accuracy: number;
  lastTrained: Date;
  status: 'active' | 'training' | 'offline';
  predictions: number;
}

interface ThreatPrediction {
  id: string;
  threatType: string;
  probability: number;
  timeframe: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  indicators: string[];
  mitigationSteps: string[];
  estimatedImpact: string;
}

interface SecurityTrend {
  id: string;
  metric: string;
  currentValue: number;
  previousValue: number;
  trend: 'up' | 'down' | 'stable';
  changePercentage: number;
  timeframe: string;
}

interface AnomalyDetection {
  id: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  detectedAt: Date;
  affectedSystems: string[];
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
}

export const PredictiveAnalytics = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [models, setModels] = useState<PredictionModel[]>([]);
  const [predictions, setPredictions] = useState<ThreatPrediction[]>([]);
  const [trends, setTrends] = useState<SecurityTrend[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyDetection[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    // Initialize predictive analytics data
    setModels([
      {
        id: 'threat-predictor',
        name: 'Neural Threat Predictor',
        type: 'threat_prediction',
        accuracy: 94.7,
        lastTrained: new Date(Date.now() - 86400000),
        status: 'active',
        predictions: 1247
      },
      {
        id: 'anomaly-detector',
        name: 'Behavioral Anomaly Engine',
        type: 'anomaly_detection',
        accuracy: 89.3,
        lastTrained: new Date(Date.now() - 172800000),
        status: 'active',
        predictions: 856
      },
      {
        id: 'risk-assessor',
        name: 'Dynamic Risk Calculator',
        type: 'risk_assessment',
        accuracy: 91.8,
        lastTrained: new Date(Date.now() - 259200000),
        status: 'training',
        predictions: 634
      }
    ]);

    setPredictions([
      {
        id: '1',
        threatType: 'DDoS Attack',
        probability: 0.78,
        timeframe: 'Next 24 hours',
        riskLevel: 'high',
        confidence: 0.87,
        indicators: [
          'Increased reconnaissance activity from known botnets',
          'Unusual traffic patterns to critical infrastructure',
          'Social media chatter about planned attacks'
        ],
        mitigationSteps: [
          'Enable DDoS protection services',
          'Increase monitoring sensitivity',
          'Prepare incident response team',
          'Review bandwidth capacity and scaling options'
        ],
        estimatedImpact: 'Service disruption for 2-4 hours, potential revenue loss of $50K-100K'
      },
      {
        id: '2',
        threatType: 'Advanced Persistent Threat',
        probability: 0.45,
        timeframe: 'Next 7 days',
        riskLevel: 'critical',
        confidence: 0.72,
        indicators: [
          'Spear-phishing emails targeting key personnel',
          'Unusual authentication patterns from executive accounts',
          'Lateral movement indicators in network logs'
        ],
        mitigationSteps: [
          'Enhance email security filtering',
          'Implement additional MFA for executives',
          'Increase network segmentation',
          'Deploy advanced endpoint detection'
        ],
        estimatedImpact: 'Potential data breach, intellectual property theft, regulatory fines'
      },
      {
        id: '3',
        threatType: 'Supply Chain Attack',
        probability: 0.32,
        timeframe: 'Next 30 days',
        riskLevel: 'medium',
        confidence: 0.65,
        indicators: [
          'Compromised third-party vendor detected',
          'Unusual software update requests',
          'Suspicious code commits in dependencies'
        ],
        mitigationSteps: [
          'Audit all third-party dependencies',
          'Implement software bill of materials (SBOM)',
          'Enable code signing verification',
          'Isolate vendor access to critical systems'
        ],
        estimatedImpact: 'Potential backdoor installation, data integrity compromise'
      }
    ]);

    setTrends([
      {
        id: '1',
        metric: 'Threat Detection Rate',
        currentValue: 97.3,
        previousValue: 94.1,
        trend: 'up',
        changePercentage: 3.4,
        timeframe: 'Last 7 days'
      },
      {
        id: '2',
        metric: 'False Positive Rate',
        currentValue: 2.1,
        previousValue: 3.8,
        trend: 'down',
        changePercentage: -44.7,
        timeframe: 'Last 7 days'
      },
      {
        id: '3',
        metric: 'Mean Time to Detection',
        currentValue: 4.2,
        previousValue: 6.7,
        trend: 'down',
        changePercentage: -37.3,
        timeframe: 'Last 30 days'
      },
      {
        id: '4',
        metric: 'Security Score',
        currentValue: 94.8,
        previousValue: 92.1,
        trend: 'up',
        changePercentage: 2.9,
        timeframe: 'Last 30 days'
      }
    ]);

    setAnomalies([
      {
        id: '1',
        type: 'Network Traffic Anomaly',
        description: 'Unusual outbound traffic spike to external IPs during off-hours',
        severity: 'high',
        confidence: 0.89,
        detectedAt: new Date(Date.now() - 1800000),
        affectedSystems: ['web-server-01', 'database-primary'],
        status: 'investigating'
      },
      {
        id: '2',
        type: 'Authentication Anomaly',
        description: 'Multiple failed login attempts from geographically diverse locations',
        severity: 'medium',
        confidence: 0.76,
        detectedAt: new Date(Date.now() - 3600000),
        affectedSystems: ['auth-service'],
        status: 'new'
      },
      {
        id: '3',
        type: 'Process Behavior Anomaly',
        description: 'Unexpected process execution patterns on critical servers',
        severity: 'critical',
        confidence: 0.92,
        detectedAt: new Date(Date.now() - 7200000),
        affectedSystems: ['app-server-02', 'app-server-03'],
        status: 'resolved'
      }
    ]);
  }, []);

  const runPredictiveAnalysis = async () => {
    setIsAnalyzing(true);
    
    // Simulate AI analysis process
    setTimeout(() => {
      setIsAnalyzing(false);
      // In real implementation, this would trigger actual AI analysis
      console.log('Predictive analysis completed');
    }, 3000);
  };

  const getModelStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 border-green-400/50';
      case 'training': return 'text-yellow-400 border-yellow-400/50';
      case 'offline': return 'text-red-400 border-red-400/50';
      default: return 'text-gray-400 border-gray-400/50';
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-400 border-red-400/50 bg-red-500/10';
      case 'high': return 'text-orange-400 border-orange-400/50 bg-orange-500/10';
      case 'medium': return 'text-yellow-400 border-yellow-400/50 bg-yellow-500/10';
      case 'low': return 'text-green-400 border-green-400/50 bg-green-500/10';
      default: return 'text-blue-400 border-blue-400/50 bg-blue-500/10';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-400" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-400" />;
      default: return <Activity className="h-4 w-4 text-blue-400" />;
    }
  };

  const getAnomalyStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'text-red-400 border-red-400/50';
      case 'investigating': return 'text-yellow-400 border-yellow-400/50';
      case 'resolved': return 'text-green-400 border-green-400/50';
      case 'false_positive': return 'text-gray-400 border-gray-400/50';
      default: return 'text-blue-400 border-blue-400/50';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-primary mb-2 glitch" data-text="PREDICTIVE ANALYTICS">
              PREDICTIVE ANALYTICS
            </h2>
            <p className="text-muted-foreground">
              AI-powered threat prediction and security intelligence
            </p>
          </div>
          <Button
            onClick={runPredictiveAnalysis}
            disabled={isAnalyzing}
            className="bg-primary hover:bg-primary/80 neon-border"
          >
            <Brain className="h-4 w-4 mr-2" />
            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-primary/20">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="predictions" className="data-[state=active]:bg-primary/20">
            <Brain className="h-4 w-4 mr-2" />
            Predictions
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-primary/20">
            <LineChart className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="anomalies" className="data-[state=active]:bg-primary/20">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Anomalies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* AI Models Status */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
            <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
              <Brain className="h-5 w-5 mr-2" />
              AI Models Status
            </h3>
            
            <div className="grid md:grid-cols-3 gap-4">
              {models.map((model) => (
                <Card key={model.id} className="p-4 bg-background/30 border border-primary/20">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-primary text-sm">{model.name}</h4>
                    <Badge variant="outline" className={getModelStatusColor(model.status)}>
                      {model.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accuracy:</span>
                      <span className="text-green-400">{model.accuracy}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Predictions:</span>
                      <span className="text-blue-400">{model.predictions.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Trained:</span>
                      <span className="text-purple-400">{model.lastTrained.toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          {/* Key Metrics */}
          <div className="grid md:grid-cols-4 gap-6">
            <Card className="p-4 bg-card/50 backdrop-blur-sm border-green-400/20 text-center">
              <Shield className="h-8 w-8 text-green-400 mx-auto mb-2 animate-pulse" />
              <div className="text-2xl font-bold text-green-400">94.7%</div>
              <div className="text-xs text-muted-foreground">Threat Detection Accuracy</div>
            </Card>
            
            <Card className="p-4 bg-card/50 backdrop-blur-sm border-blue-400/20 text-center">
              <Eye className="h-8 w-8 text-blue-400 mx-auto mb-2 animate-pulse" />
              <div className="text-2xl font-bold text-blue-400">2.3s</div>
              <div className="text-xs text-muted-foreground">Mean Detection Time</div>
            </Card>
            
            <Card className="p-4 bg-card/50 backdrop-blur-sm border-purple-400/20 text-center">
              <Brain className="h-8 w-8 text-purple-400 mx-auto mb-2 animate-pulse" />
              <div className="text-2xl font-bold text-purple-400">1,247</div>
              <div className="text-xs text-muted-foreground">AI Predictions Today</div>
            </Card>
            
            <Card className="p-4 bg-card/50 backdrop-blur-sm border-orange-400/20 text-center">
              <AlertTriangle className="h-8 w-8 text-orange-400 mx-auto mb-2 animate-pulse" />
              <div className="text-2xl font-bold text-orange-400">7</div>
              <div className="text-xs text-muted-foreground">Active Anomalies</div>
            </Card>
          </div>

          {/* Real-time Analysis */}
          <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-400/20 neon-border p-6">
            <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Real-time AI Analysis
            </h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-green-400/20">
                  <Shield className="h-5 w-5 text-green-400" />
                  <div>
                    <div className="text-sm font-medium">Network Security</div>
                    <div className="text-xs text-muted-foreground">All systems nominal</div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-yellow-400/20">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  <div>
                    <div className="text-sm font-medium">Threat Intelligence</div>
                    <div className="text-xs text-muted-foreground">3 new indicators detected</div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-blue-400/20">
                  <Brain className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="text-sm font-medium">Behavioral Analysis</div>
                    <div className="text-xs text-muted-foreground">Learning new patterns</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-background/50 rounded p-4 border border-primary/20">
                <h4 className="text-sm font-bold text-primary mb-3">AI Processing Queue</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Threat correlation analysis</span>
                    <span className="text-green-400">Completed</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Behavioral pattern learning</span>
                    <span className="text-yellow-400">Processing...</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Risk score recalculation</span>
                    <span className="text-blue-400">Queued</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Predictive model training</span>
                    <span className="text-purple-400">Scheduled</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-6">
          <div className="space-y-4">
            {predictions.map((prediction) => (
              <Card key={prediction.id} className={`p-6 border ${getRiskLevelColor(prediction.riskLevel)}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-1">{prediction.threatType}</h3>
                    <p className="text-sm text-muted-foreground">{prediction.timeframe}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={getRiskLevelColor(prediction.riskLevel)}>
                      {prediction.riskLevel.toUpperCase()}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      Confidence: {Math.round(prediction.confidence * 100)}%
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Probability</span>
                    <span className="text-sm font-bold">{Math.round(prediction.probability * 100)}%</span>
                  </div>
                  <Progress value={prediction.probability * 100} className="h-2" />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-bold text-primary mb-2 text-sm">Threat Indicators</h4>
                    <ul className="space-y-1">
                      {prediction.indicators.map((indicator, index) => (
                        <li key={index} className="text-xs text-muted-foreground flex items-start space-x-2">
                          <Target className="h-3 w-3 mt-0.5 text-red-400 flex-shrink-0" />
                          <span>{indicator}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-bold text-primary mb-2 text-sm">Mitigation Steps</h4>
                    <ul className="space-y-1">
                      {prediction.mitigationSteps.map((step, index) => (
                        <li key={index} className="text-xs text-muted-foreground flex items-start space-x-2">
                          <Shield className="h-3 w-3 mt-0.5 text-green-400 flex-shrink-0" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-background/50 rounded border border-primary/20">
                  <h4 className="font-bold text-primary mb-1 text-sm">Estimated Impact</h4>
                  <p className="text-xs text-muted-foreground">{prediction.estimatedImpact}</p>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {trends.map((trend) => (
              <Card key={trend.id} className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-primary">{trend.metric}</h3>
                  {getTrendIcon(trend.trend)}
                </div>
                
                <div className="flex items-baseline space-x-2 mb-2">
                  <span className="text-3xl font-bold text-primary">{trend.currentValue}</span>
                  <span className="text-sm text-muted-foreground">
                    {trend.metric.includes('Rate') || trend.metric.includes('Score') ? '%' : 
                     trend.metric.includes('Time') ? 'min' : ''}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2 mb-3">
                  <span className={`text-sm font-medium ${
                    trend.trend === 'up' ? 'text-green-400' : 
                    trend.trend === 'down' ? 'text-red-400' : 'text-blue-400'
                  }`}>
                    {trend.changePercentage > 0 ? '+' : ''}{trend.changePercentage.toFixed(1)}%
                  </span>
                  <span className="text-xs text-muted-foreground">{trend.timeframe}</span>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Previous: {trend.previousValue}
                  {trend.metric.includes('Rate') || trend.metric.includes('Score') ? '%' : 
                   trend.metric.includes('Time') ? ' min' : ''}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="anomalies" className="space-y-6">
          <div className="space-y-4">
            {anomalies.map((anomaly) => (
              <Card key={anomaly.id} className={`p-6 border ${getRiskLevelColor(anomaly.severity)}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-1">{anomaly.type}</h3>
                    <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={getAnomalyStatusColor(anomaly.status)}>
                      {anomaly.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      Confidence: {Math.round(anomaly.confidence * 100)}%
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-4">
                  <div>
                    <h4 className="font-bold text-primary mb-2 text-sm">Affected Systems</h4>
                    <div className="space-y-1">
                      {anomaly.affectedSystems.map((system, index) => (
                        <div key={index} className="text-xs text-blue-400 font-mono">
                          {system}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-bold text-primary mb-2 text-sm">Detection Details</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Detected:</span>
                        <span className="text-yellow-400">{anomaly.detectedAt.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Severity:</span>
                        <span className={getRiskLevelColor(anomaly.severity).split(' ')[0]}>
                          {anomaly.severity.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button size="sm" variant="outline" className="border-blue-400/50 text-blue-400">
                    <Eye className="h-3 w-3 mr-1" />
                    Investigate
                  </Button>
                  <Button size="sm" variant="outline" className="border-green-400/50 text-green-400">
                    <Shield className="h-3 w-3 mr-1" />
                    Mitigate
                  </Button>
                  <Button size="sm" variant="outline" className="border-gray-400/50 text-gray-400">
                    <Clock className="h-3 w-3 mr-1" />
                    Mark False Positive
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

