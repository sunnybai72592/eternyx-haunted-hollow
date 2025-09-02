import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  GitBranch, Server, Shield, Zap, Activity, Clock, 
  CheckCircle, XCircle, AlertTriangle, Play, Pause, 
  RotateCcw, Settings, Database, Cloud, Monitor
} from 'lucide-react';

interface Pipeline {
  id: string;
  name: string;
  status: 'running' | 'success' | 'failed' | 'pending';
  progress: number;
  duration: string;
  lastRun: string;
  branch: string;
  environment: string;
}

interface SecurityCheck {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning';
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface Deployment {
  id: string;
  application: string;
  version: string;
  environment: string;
  status: 'deploying' | 'deployed' | 'failed' | 'rollback';
  timestamp: string;
  health: number;
}

const DevSecOpsHub: React.FC = () => {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [securityChecks, setSecurityChecks] = useState<SecurityCheck[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Simulate loading data
    setTimeout(() => {
      setPipelines([
        {
          id: '1',
          name: 'eternyx-frontend-ci',
          status: 'running',
          progress: 65,
          duration: '4m 32s',
          lastRun: '2 minutes ago',
          branch: 'main',
          environment: 'production'
        },
        {
          id: '2',
          name: 'eternyx-api-security-scan',
          status: 'success',
          progress: 100,
          duration: '2m 15s',
          lastRun: '15 minutes ago',
          branch: 'develop',
          environment: 'staging'
        },
        {
          id: '3',
          name: 'eternyx-infrastructure-deploy',
          status: 'failed',
          progress: 45,
          duration: '8m 12s',
          lastRun: '1 hour ago',
          branch: 'feature/new-tools',
          environment: 'development'
        }
      ]);

      setSecurityChecks([
        {
          id: '1',
          name: 'SAST Code Analysis',
          status: 'passed',
          details: 'No critical vulnerabilities found in 1,247 files',
          severity: 'low'
        },
        {
          id: '2',
          name: 'Dependency Vulnerability Scan',
          status: 'warning',
          details: '3 medium-risk vulnerabilities in npm packages',
          severity: 'medium'
        },
        {
          id: '3',
          name: 'Container Security Scan',
          status: 'passed',
          details: 'Docker image passed all security policies',
          severity: 'low'
        },
        {
          id: '4',
          name: 'Infrastructure Compliance',
          status: 'failed',
          details: 'SSL certificate expires in 7 days',
          severity: 'high'
        }
      ]);

      setDeployments([
        {
          id: '1',
          application: 'eternyx-web-app',
          version: 'v2.1.3',
          environment: 'production',
          status: 'deployed',
          timestamp: '2024-01-15 14:30:00',
          health: 98
        },
        {
          id: '2',
          application: 'eternyx-api-gateway',
          version: 'v1.8.2',
          environment: 'staging',
          status: 'deploying',
          timestamp: '2024-01-15 14:45:00',
          health: 85
        },
        {
          id: '3',
          application: 'eternyx-tools-service',
          version: 'v3.0.1',
          environment: 'development',
          status: 'failed',
          timestamp: '2024-01-15 13:15:00',
          health: 0
        }
      ]);

      setIsLoading(false);
    }, 2000);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': case 'deploying': return <Activity className="w-4 h-4 animate-pulse" />;
      case 'success': case 'deployed': case 'passed': return <CheckCircle className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': case 'deploying': return 'text-blue-400';
      case 'success': case 'deployed': case 'passed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'pending': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const triggerPipeline = (pipelineId: string) => {
    toast({
      title: "Pipeline Triggered",
      description: `Starting pipeline execution for ${pipelines.find(p => p.id === pipelineId)?.name}`,
    });
  };

  const rollbackDeployment = (deploymentId: string) => {
    toast({
      title: "Rollback Initiated",
      description: `Rolling back deployment ${deploymentId} to previous version`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin text-green-400 mx-auto mb-4" />
          <p className="text-green-400">Loading DevSecOps Hub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hub Header */}
      <Card className="bg-black/40 border-green-500/30 hover-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-green-400">
            <Server className="w-6 h-6" />
            Unified DevSecOps Hub
          </CardTitle>
          <p className="text-gray-300 text-sm">
            Centralized dashboard for CI/CD pipelines, security monitoring, and deployment management
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">3</div>
              <div className="text-sm text-gray-300">Active Pipelines</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">2</div>
              <div className="text-sm text-gray-300">Security Warnings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">1</div>
              <div className="text-sm text-gray-300">Deploying</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">98%</div>
              <div className="text-sm text-gray-300">System Health</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Hub Tabs */}
      <Tabs defaultValue="pipelines" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-black/40 border border-green-500/30">
          <TabsTrigger value="pipelines" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <GitBranch className="w-4 h-4 mr-2" />
            Pipelines
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Shield className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="deployments" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Cloud className="w-4 h-4 mr-2" />
            Deployments
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Monitor className="w-4 h-4 mr-2" />
            Monitoring
          </TabsTrigger>
        </TabsList>

        {/* Pipelines Tab */}
        <TabsContent value="pipelines" className="space-y-4">
          {pipelines.map((pipeline) => (
            <Card key={pipeline.id} className="bg-black/40 border-green-500/30 hover-glow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={getStatusColor(pipeline.status)}>
                      {getStatusIcon(pipeline.status)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-100">{pipeline.name}</h3>
                      <p className="text-sm text-gray-400">
                        {pipeline.branch} → {pipeline.environment}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusColor(pipeline.status)} bg-transparent border`}>
                      {pipeline.status.toUpperCase()}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => triggerPipeline(pipeline.id)}>
                      <Play className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                {pipeline.status === 'running' && (
                  <div className="mb-3">
                    <Progress value={pipeline.progress} className="h-2" />
                    <p className="text-xs text-gray-400 mt-1">{pipeline.progress}% complete</p>
                  </div>
                )}
                
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Duration: {pipeline.duration}</span>
                  <span>Last run: {pipeline.lastRun}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          {securityChecks.map((check) => (
            <Card key={check.id} className="bg-black/40 border-green-500/30 hover-glow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={getStatusColor(check.status)}>
                      {getStatusIcon(check.status)}
                    </div>
                    <h3 className="font-semibold text-green-100">{check.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusColor(check.status)} bg-transparent border`}>
                      {check.status.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                      {check.severity.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-300">{check.details}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Deployments Tab */}
        <TabsContent value="deployments" className="space-y-4">
          {deployments.map((deployment) => (
            <Card key={deployment.id} className="bg-black/40 border-green-500/30 hover-glow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={getStatusColor(deployment.status)}>
                      {getStatusIcon(deployment.status)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-100">{deployment.application}</h3>
                      <p className="text-sm text-gray-400">
                        {deployment.version} → {deployment.environment}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusColor(deployment.status)} bg-transparent border`}>
                      {deployment.status.toUpperCase()}
                    </Badge>
                    {deployment.status === 'deployed' && (
                      <Button size="sm" variant="outline" onClick={() => rollbackDeployment(deployment.id)}>
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{deployment.timestamp}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Health:</span>
                    <span className={deployment.health > 90 ? 'text-green-400' : deployment.health > 70 ? 'text-yellow-400' : 'text-red-400'}>
                      {deployment.health}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-black/40 border-green-500/30 hover-glow">
              <CardHeader>
                <CardTitle className="text-green-400 text-lg">System Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">CPU Usage</span>
                  <span className="text-green-400">23%</span>
                </div>
                <Progress value={23} className="h-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Memory Usage</span>
                  <span className="text-yellow-400">67%</span>
                </div>
                <Progress value={67} className="h-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Disk Usage</span>
                  <span className="text-blue-400">45%</span>
                </div>
                <Progress value={45} className="h-2" />
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-green-500/30 hover-glow">
              <CardHeader>
                <CardTitle className="text-green-400 text-lg">Application Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Response Time</span>
                  <span className="text-green-400">145ms</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Error Rate</span>
                  <span className="text-green-400">0.02%</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Throughput</span>
                  <span className="text-blue-400">1.2K req/min</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Uptime</span>
                  <span className="text-green-400">99.98%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DevSecOpsHub;

