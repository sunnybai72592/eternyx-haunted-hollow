import React, { useState } from 'react';
import Navigation from '@/components/Navigation';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AIAdvisor from '@/components/AIAdvisor';
import DevSecOpsHub from '@/components/DevSecOpsHub';
import GamifiedChallenges from '@/components/GamifiedChallenges';
import {
  Brain, Server, Gamepad2, Zap, Target, Crown, 
  Shield, Rocket, Star, TrendingUp
} from 'lucide-react';

const KillerEdge = () => {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState('overview');

  const features = [
    {
      id: 'ai-advisor',
      name: 'AI Security Advisor',
      icon: <Brain className="w-6 h-6" />,
      description: 'Intelligent threat analysis and personalized security recommendations',
      color: 'from-purple-500 to-pink-500',
      stats: { accuracy: '94%', threats: '2.3K', recommendations: '156' }
    },
    {
      id: 'devsecops-hub',
      name: 'DevSecOps Hub',
      icon: <Server className="w-6 h-6" />,
      description: 'Unified dashboard for CI/CD pipelines and security monitoring',
      color: 'from-blue-500 to-cyan-500',
      stats: { pipelines: '12', deployments: '847', uptime: '99.9%' }
    },
    {
      id: 'gamified-challenges',
      name: 'Gamified Challenges',
      icon: <Gamepad2 className="w-6 h-6" />,
      description: 'Interactive security challenges with scoring and achievements',
      color: 'from-green-500 to-emerald-500',
      stats: { challenges: '50+', users: '15K', completion: '78%' }
    }
  ];

  return (
    <div className="min-h-screen bg-black text-green-400">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500/20 to-blue-500/20 px-6 py-2 rounded-full border border-green-500/30 mb-6">
            <Crown className="w-5 h-5 text-yellow-400" />
            <span className="text-sm font-semibold text-green-400">KILLER EDGE FEATURES</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            ./killer_edge_suite
          </h1>
          
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
            Revolutionary AI-powered security features that set Eternyx apart from the competition. 
            Experience the future of cybersecurity with intelligent automation, unified workflows, and gamified learning.
          </p>
          
          <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-green-400" />
              <span>Real-time Analysis</span>
            </div>
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-blue-400" />
              <span>Automated Workflows</span>
            </div>
          </div>
        </div>

        {/* Feature Overview Cards */}
        {activeFeature === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {features.map((feature) => (
              <Card 
                key={feature.id}
                className="bg-black/40 border-green-500/30 hover-glow cursor-pointer transition-all duration-300 hover:scale-105"
                onClick={() => setActiveFeature(feature.id)}
              >
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${feature.color} flex items-center justify-center mb-4`}>
                    {feature.icon}
                  </div>
                  <CardTitle className="text-green-400">{feature.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 mb-6">{feature.description}</p>
                  
                  <div className="space-y-2">
                    {Object.entries(feature.stats).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-gray-400 capitalize">{key}:</span>
                        <span className="text-green-400 font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    className="w-full mt-4 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold"
                    onClick={() => {
                      setActiveFeature(feature.id);
                      toast.success(`Launching ${feature.name}...`);
                    }}
                  >
                    Launch Feature
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Feature Tabs */}
        <Tabs value={activeFeature} onValueChange={setActiveFeature} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-black/40 border border-green-500/30">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <Star className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="ai-advisor" 
              className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <Brain className="w-4 h-4 mr-2" />
              AI Advisor
            </TabsTrigger>
            <TabsTrigger 
              value="devsecops-hub" 
              className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <Server className="w-4 h-4 mr-2" />
              DevSecOps Hub
            </TabsTrigger>
            <TabsTrigger 
              value="gamified-challenges" 
              className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <Gamepad2 className="w-4 h-4 mr-2" />
              Challenges
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Performance Metrics */}
            <Card className="bg-black/40 border-green-500/30 hover-glow">
              <CardHeader>
                <CardTitle className="text-green-400 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Killer Edge Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400 mb-2">99.7%</div>
                    <div className="text-sm text-gray-300">Threat Detection Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400 mb-2">45%</div>
                    <div className="text-sm text-gray-300">Faster Incident Response</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400 mb-2">78%</div>
                    <div className="text-sm text-gray-300">Reduced False Positives</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-400 mb-2">15K+</div>
                    <div className="text-sm text-gray-300">Active Users</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Feature Comparison */}
            <Card className="bg-black/40 border-green-500/30 hover-glow">
              <CardHeader>
                <CardTitle className="text-green-400">Why Killer Edge Features Matter</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-green-100 mb-3">Traditional Approach</h3>
                    <ul className="space-y-2 text-gray-300">
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        Manual threat analysis and response
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        Fragmented security tools and dashboards
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        Static training materials and documentation
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        Reactive security posture
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-400 mb-3">Eternyx Killer Edge</h3>
                    <ul className="space-y-2 text-gray-300">
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        AI-powered intelligent threat analysis
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        Unified DevSecOps workflow automation
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        Interactive gamified learning experiences
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        Proactive security with predictive insights
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai-advisor">
            <AIAdvisor />
          </TabsContent>

          <TabsContent value="devsecops-hub">
            <DevSecOpsHub />
          </TabsContent>

          <TabsContent value="gamified-challenges">
            <GamifiedChallenges />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default KillerEdge;

