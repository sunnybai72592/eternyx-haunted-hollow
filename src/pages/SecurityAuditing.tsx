import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  Download,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Settings,
  Database,
  Network,
  Lock,
  Key,
  Users,
  Server,
  Globe,
  Zap
} from 'lucide-react';

interface AuditResult {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  recommendation: string;
  status: 'passed' | 'failed' | 'warning';
  timestamp: string;
}

interface AuditCategory {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  description: string;
  tests: number;
  passed: number;
  failed: number;
  warnings: number;
}

const SecurityAuditing = () => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [currentTest, setCurrentTest] = useState('');
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const auditCategories: AuditCategory[] = [
    {
      id: 'authentication',
      name: 'Authentication & Authorization',
      icon: Key,
      description: 'User authentication and access control mechanisms',
      tests: 15,
      passed: 12,
      failed: 2,
      warnings: 1
    },
    {
      id: 'network',
      name: 'Network Security',
      icon: Network,
      description: 'Network configuration and firewall rules',
      tests: 20,
      passed: 18,
      failed: 1,
      warnings: 1
    },
    {
      id: 'encryption',
      name: 'Data Encryption',
      icon: Lock,
      description: 'Encryption standards and implementation',
      tests: 12,
      passed: 10,
      failed: 1,
      warnings: 1
    },
    {
      id: 'database',
      name: 'Database Security',
      icon: Database,
      description: 'Database configuration and access controls',
      tests: 18,
      passed: 15,
      failed: 2,
      warnings: 1
    },
    {
      id: 'web',
      name: 'Web Application Security',
      icon: Globe,
      description: 'Web application vulnerabilities and configurations',
      tests: 25,
      passed: 20,
      failed: 3,
      warnings: 2
    },
    {
      id: 'server',
      name: 'Server Configuration',
      icon: Server,
      description: 'Server hardening and configuration security',
      tests: 22,
      passed: 19,
      failed: 2,
      warnings: 1
    }
  ];

  const sampleResults: AuditResult[] = [
    {
      id: '1',
      category: 'authentication',
      severity: 'critical',
      title: 'Weak Password Policy',
      description: 'Password policy allows weak passwords with minimum 6 characters',
      recommendation: 'Implement strong password policy with minimum 12 characters, special characters, and numbers',
      status: 'failed',
      timestamp: new Date().toISOString()
    },
    {
      id: '2',
      category: 'network',
      severity: 'high',
      title: 'Open SSH Port',
      description: 'SSH port 22 is open to all IP addresses',
      recommendation: 'Restrict SSH access to specific IP ranges or use VPN',
      status: 'failed',
      timestamp: new Date().toISOString()
    },
    {
      id: '3',
      category: 'encryption',
      severity: 'medium',
      title: 'TLS Version',
      description: 'Server supports TLS 1.1 which is deprecated',
      recommendation: 'Disable TLS 1.1 and enforce TLS 1.2 or higher',
      status: 'warning',
      timestamp: new Date().toISOString()
    },
    {
      id: '4',
      category: 'database',
      severity: 'high',
      title: 'Database Backup Encryption',
      description: 'Database backups are not encrypted',
      recommendation: 'Enable encryption for all database backups',
      status: 'failed',
      timestamp: new Date().toISOString()
    },
    {
      id: '5',
      category: 'web',
      severity: 'medium',
      title: 'Missing Security Headers',
      description: 'X-Frame-Options header is not set',
      recommendation: 'Add X-Frame-Options: DENY header to prevent clickjacking',
      status: 'warning',
      timestamp: new Date().toISOString()
    }
  ];

  const startAudit = async () => {
    setIsAuditing(true);
    setAuditProgress(0);
    setAuditResults([]);

    const tests = [
      'Checking authentication mechanisms...',
      'Analyzing password policies...',
      'Scanning network configurations...',
      'Testing firewall rules...',
      'Verifying encryption standards...',
      'Auditing database security...',
      'Checking web application security...',
      'Analyzing server configurations...',
      'Testing access controls...',
      'Generating security report...'
    ];

    for (let i = 0; i < tests.length; i++) {
      setCurrentTest(tests[i]);
      setAuditProgress((i + 1) / tests.length * 100);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setAuditResults(sampleResults);
    setIsAuditing(false);
    setCurrentTest('Audit completed');
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const filteredResults = selectedCategory === 'all' 
    ? auditResults 
    : auditResults.filter(result => result.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Security Auditing
            </h1>
            <p className="text-gray-400 mt-2">
              Comprehensive security assessment and compliance checking
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Tests</p>
                  <p className="text-2xl font-bold text-white">112</p>
                </div>
                <Search className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Passed</p>
                  <p className="text-2xl font-bold text-green-400">94</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Failed</p>
                  <p className="text-2xl font-bold text-red-400">11</p>
                </div>
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Warnings</p>
                  <p className="text-2xl font-bold text-yellow-400">7</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit Control Panel */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Audit Control Panel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex gap-4">
                <Button
                  onClick={startAudit}
                  disabled={isAuditing}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  {isAuditing ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Running Audit...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Security Audit
                    </>
                  )}
                </Button>

                <Button variant="outline" className="border-gray-600 text-gray-300">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>

                <Button variant="outline" className="border-gray-600 text-gray-300">
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </Button>
              </div>

              {isAuditing && (
                <div className="w-full md:w-1/3">
                  <div className="mb-2">
                    <p className="text-sm text-gray-400">{currentTest}</p>
                  </div>
                  <Progress value={auditProgress} className="h-2" />
                  <p className="text-xs text-gray-500 mt-1">{Math.round(auditProgress)}% Complete</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audit Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {auditCategories.map((category) => (
            <Card 
              key={category.id} 
              className={`bg-gray-800/50 border-gray-700 cursor-pointer transition-all duration-300 hover:bg-gray-700/50 ${
                selectedCategory === category.id ? 'ring-2 ring-purple-500' : ''
              }`}
              onClick={() => setSelectedCategory(category.id)}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <category.icon className="w-6 h-6 text-purple-400" />
                  <h3 className="font-semibold text-white">{category.name}</h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">{category.description}</p>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-green-400 font-bold">{category.passed}</p>
                    <p className="text-xs text-gray-500">Passed</p>
                  </div>
                  <div>
                    <p className="text-red-400 font-bold">{category.failed}</p>
                    <p className="text-xs text-gray-500">Failed</p>
                  </div>
                  <div>
                    <p className="text-yellow-400 font-bold">{category.warnings}</p>
                    <p className="text-xs text-gray-500">Warnings</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Audit Results */}
        {auditResults.length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Audit Results
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={selectedCategory === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory('all')}
                    className="border-gray-600"
                  >
                    All
                  </Button>
                  {auditCategories.map((category) => (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(category.id)}
                      className="border-gray-600"
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredResults.map((result) => (
                  <div
                    key={result.id}
                    className="p-4 bg-gray-900/50 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(result.status)}
                        <h4 className="font-semibold text-white">{result.title}</h4>
                        <Badge className={`${getSeverityColor(result.severity)} text-white`}>
                          {result.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <p className="text-gray-400 mb-3">{result.description}</p>
                    
                    <div className="bg-gray-800/50 p-3 rounded border-l-4 border-blue-500">
                      <p className="text-sm text-gray-300">
                        <strong>Recommendation:</strong> {result.recommendation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SecurityAuditing;

