import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Brain, Shield, AlertTriangle, CheckCircle, TrendingUp, 
  Target, Zap, Eye, Lock, Globe, Database, Server
} from 'lucide-react';

interface SecurityInsight {
  id: string;
  type: 'threat' | 'recommendation' | 'vulnerability' | 'optimization';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  actionable: boolean;
  estimatedTime: string;
}

interface AIAnalysis {
  overallScore: number;
  insights: SecurityInsight[];
  recommendations: string[];
  trendAnalysis: {
    threatLevel: number;
    securityPosture: number;
    complianceScore: number;
  };
}

const AIAdvisor: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const { toast } = useToast();

  const mockInsights: SecurityInsight[] = [
    {
      id: '1',
      type: 'vulnerability',
      title: 'Outdated SSL/TLS Configuration Detected',
      description: 'Your web application is using TLS 1.1 which is deprecated. Upgrade to TLS 1.3 for enhanced security.',
      severity: 'high',
      category: 'Network Security',
      actionable: true,
      estimatedTime: '2-4 hours'
    },
    {
      id: '2',
      type: 'threat',
      title: 'Unusual Login Patterns Detected',
      description: 'AI has identified 15% increase in failed login attempts from suspicious IP ranges in the last 24 hours.',
      severity: 'medium',
      category: 'Access Control',
      actionable: true,
      estimatedTime: '30 minutes'
    },
    {
      id: '3',
      type: 'recommendation',
      title: 'Implement Zero Trust Architecture',
      description: 'Based on your current infrastructure, implementing Zero Trust would reduce attack surface by 60%.',
      severity: 'medium',
      category: 'Architecture',
      actionable: true,
      estimatedTime: '2-3 weeks'
    },
    {
      id: '4',
      type: 'optimization',
      title: 'Security Monitoring Enhancement',
      description: 'Deploy advanced SIEM rules to improve threat detection accuracy by 40% and reduce false positives.',
      severity: 'low',
      category: 'Monitoring',
      actionable: true,
      estimatedTime: '1-2 days'
    }
  ];

  const runAIAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    // Simulate AI analysis process
    const analysisSteps = [
      'Scanning network infrastructure...',
      'Analyzing security configurations...',
      'Processing threat intelligence feeds...',
      'Evaluating compliance posture...',
      'Generating personalized recommendations...',
      'Finalizing security insights...'
    ];

    for (let i = 0; i < analysisSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setAnalysisProgress((i + 1) * (100 / analysisSteps.length));
      
      if (i < analysisSteps.length - 1) {
        toast({
          title: "AI Analysis in Progress",
          description: analysisSteps[i],
        });
      }
    }

    // Generate mock analysis results
    const mockAnalysis: AIAnalysis = {
      overallScore: 78,
      insights: mockInsights,
      recommendations: [
        'Prioritize SSL/TLS upgrade to address high-severity vulnerability',
        'Implement rate limiting to mitigate brute force attacks',
        'Deploy multi-factor authentication for admin accounts',
        'Schedule regular security assessments using automated tools',
        'Establish incident response procedures and team training'
      ],
      trendAnalysis: {
        threatLevel: 65,
        securityPosture: 78,
        complianceScore: 82
      }
    };

    setAnalysis(mockAnalysis);
    setIsAnalyzing(false);
    
    toast({
      title: "AI Analysis Complete",
      description: `Security analysis completed. Overall security score: ${mockAnalysis.overallScore}/100`,
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityIcon = (type: string) => {
    switch (type) {
      case 'vulnerability': return <AlertTriangle className="w-4 h-4" />;
      case 'threat': return <Shield className="w-4 h-4" />;
      case 'recommendation': return <CheckCircle className="w-4 h-4" />;
      case 'optimization': return <TrendingUp className="w-4 h-4" />;
      default: return <Eye className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Advisor Header */}
      <Card className="bg-black/40 border-green-500/30 hover-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-green-400">
            <Brain className="w-6 h-6" />
            AI-Powered Security Advisor
          </CardTitle>
          <p className="text-gray-300 text-sm">
            Advanced AI analysis of your security posture with personalized recommendations
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button 
              onClick={runAIAnalysis}
              disabled={isAnalyzing}
              className="bg-green-600 hover:bg-green-700 text-black font-semibold"
            >
              {isAnalyzing ? (
                <>
                  <Brain className="w-4 h-4 mr-2 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run AI Analysis
                </>
              )}
            </Button>
            <div className="flex-1">
              <Textarea
                placeholder="Ask the AI advisor about specific security concerns..."
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                className="bg-black/20 border-green-500/30 text-green-100 placeholder-gray-400"
                rows={2}
              />
            </div>
          </div>
          
          {isAnalyzing && (
            <div className="space-y-2">
              <Progress value={analysisProgress} className="h-2" />
              <p className="text-sm text-green-400">
                AI is analyzing your security infrastructure... {Math.round(analysisProgress)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <>
          {/* Security Score Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-black/40 border-green-500/30 hover-glow">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-400 mb-1">
                  {analysis.overallScore}/100
                </div>
                <div className="text-sm text-gray-300">Overall Security Score</div>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-yellow-500/30 hover-glow">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400 mb-1">
                  {analysis.trendAnalysis.threatLevel}%
                </div>
                <div className="text-sm text-gray-300">Threat Level</div>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-blue-500/30 hover-glow">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-400 mb-1">
                  {analysis.trendAnalysis.securityPosture}%
                </div>
                <div className="text-sm text-gray-300">Security Posture</div>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-purple-500/30 hover-glow">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-400 mb-1">
                  {analysis.trendAnalysis.complianceScore}%
                </div>
                <div className="text-sm text-gray-300">Compliance Score</div>
              </CardContent>
            </Card>
          </div>

          {/* Security Insights */}
          <Card className="bg-black/40 border-green-500/30 hover-glow">
            <CardHeader>
              <CardTitle className="text-green-400 flex items-center gap-2">
                <Target className="w-5 h-5" />
                AI Security Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysis.insights.map((insight) => (
                  <div 
                    key={insight.id}
                    className="border border-green-500/20 rounded-lg p-4 bg-black/20 hover:bg-black/30 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(insight.type)}
                        <h3 className="font-semibold text-green-100">{insight.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${getSeverityColor(insight.severity)} text-white text-xs`}>
                          {insight.severity.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                          {insight.category}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-gray-300 text-sm mb-3">{insight.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Estimated time: {insight.estimatedTime}
                      </span>
                      {insight.actionable && (
                        <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                          Take Action
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Recommendations */}
          <Card className="bg-black/40 border-green-500/30 hover-glow">
            <CardHeader>
              <CardTitle className="text-green-400 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.recommendations.map((recommendation, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-3 p-3 border border-green-500/20 rounded-lg bg-black/20"
                  >
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-green-400 text-xs font-bold">{index + 1}</span>
                    </div>
                    <p className="text-gray-300 text-sm">{recommendation}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AIAdvisor;

