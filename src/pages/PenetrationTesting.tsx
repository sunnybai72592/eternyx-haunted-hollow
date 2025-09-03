import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Terminal, 
  Wifi, 
  Globe, 
  Server, 
  Lock, 
  Eye, 
  Zap,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  Square,
  Download,
  Upload,
  Settings,
  Target,
  Scan,
  Activity
} from 'lucide-react';

interface ScanResult {
  id: string;
  target: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  findings: number;
  startTime: Date;
  endTime?: Date;
}

interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  target: string;
  port?: number;
  cve?: string;
  solution: string;
}

const PenetrationTesting: React.FC = () => {
  const [activeTab, setActiveTab] = useState('scanner');
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [targetInput, setTargetInput] = useState('');
  const [scanType, setScanType] = useState('comprehensive');

  // Simulate real-time scanning
  useEffect(() => {
    if (isScanning) {
      const interval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 100) {
            setIsScanning(false);
            // Add completed scan to results
            const newScan: ScanResult = {
              id: Date.now().toString(),
              target: targetInput || '192.168.1.0/24',
              type: scanType,
              status: 'completed',
              progress: 100,
              findings: Math.floor(Math.random() * 15) + 5,
              startTime: new Date(Date.now() - 30000),
              endTime: new Date()
            };
            setScanResults(prev => [newScan, ...prev]);
            
            // Add some sample vulnerabilities
            const newVulns: Vulnerability[] = [
              {
                id: Date.now().toString() + '1',
                severity: 'critical',
                title: 'SQL Injection in Login Form',
                description: 'The login form is vulnerable to SQL injection attacks, allowing attackers to bypass authentication.',
                target: targetInput || '192.168.1.100',
                port: 80,
                cve: 'CVE-2023-1234',
                solution: 'Use parameterized queries and input validation.'
              },
              {
                id: Date.now().toString() + '2',
                severity: 'high',
                title: 'Unencrypted Admin Panel',
                description: 'Admin panel accessible over HTTP without encryption.',
                target: targetInput || '192.168.1.100',
                port: 8080,
                solution: 'Implement HTTPS and proper authentication.'
              },
              {
                id: Date.now().toString() + '3',
                severity: 'medium',
                title: 'Directory Traversal',
                description: 'Web application vulnerable to directory traversal attacks.',
                target: targetInput || '192.168.1.100',
                port: 80,
                solution: 'Implement proper input validation and file access controls.'
              }
            ];
            setVulnerabilities(prev => [...newVulns, ...prev]);
            return 100;
          }
          return prev + Math.random() * 5;
        });
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isScanning, targetInput, scanType]);

  const startScan = () => {
    if (!targetInput.trim()) {
      alert('Please enter a target to scan');
      return;
    }
    setIsScanning(true);
    setScanProgress(0);
  };

  const stopScan = () => {
    setIsScanning(false);
    setScanProgress(0);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'low': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  const renderScanner = () => (
    <div className="space-y-6">
      {/* Scan Configuration */}
      <div className="cyber-card p-6">
        <h3 className="text-xl font-bold text-cyber-cyan mb-4 flex items-center">
          <Target className="h-6 w-6 mr-2" />
          Scan Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="192.168.1.0/24 or example.com"
              className="w-full px-3 py-2 bg-black/50 border border-cyber-cyan/30 rounded-lg text-cyber-cyan focus:border-cyber-cyan focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Scan Type</label>
            <select 
              value={scanType}
              onChange={(e) => setScanType(e.target.value)}
              className="w-full px-3 py-2 bg-black/50 border border-cyber-cyan/30 rounded-lg text-cyber-cyan focus:border-cyber-cyan focus:outline-none"
            >
              <option value="quick">Quick Scan</option>
              <option value="comprehensive">Comprehensive Scan</option>
              <option value="stealth">Stealth Scan</option>
              <option value="aggressive">Aggressive Scan</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex space-x-3">
          {!isScanning ? (
            <button 
              onClick={startScan}
              className="flex items-center px-4 py-2 bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan rounded-lg hover:bg-cyber-cyan/30 transition-colors"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Scan
            </button>
          ) : (
            <button 
              onClick={stopScan}
              className="flex items-center px-4 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Scan
            </button>
          )}
          <button className="flex items-center px-4 py-2 bg-gray-500/20 border border-gray-500 text-gray-400 rounded-lg hover:bg-gray-500/30 transition-colors">
            <Settings className="h-4 w-4 mr-2" />
            Advanced
          </button>
        </div>
      </div>

      {/* Real-time Progress */}
      {isScanning && (
        <div className="cyber-card p-6">
          <h3 className="text-xl font-bold text-cyber-cyan mb-4 flex items-center">
            <Activity className="h-6 w-6 mr-2 animate-pulse" />
            Scanning in Progress
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(scanProgress)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-cyber-cyan h-2 rounded-full transition-all duration-500"
                style={{ width: `${scanProgress}%` }}
              ></div>
            </div>
            <div className="text-sm text-gray-400">
              Scanning {targetInput || '192.168.1.0/24'} - {scanType} mode
            </div>
          </div>
        </div>
      )}

      {/* Recent Scans */}
      <div className="cyber-card p-6">
        <h3 className="text-xl font-bold text-cyber-cyan mb-4 flex items-center">
          <Scan className="h-6 w-6 mr-2" />
          Recent Scans
        </h3>
        <div className="space-y-3">
          {scanResults.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No scans performed yet. Start your first scan above.
            </div>
          ) : (
            scanResults.map((scan) => (
              <div key={scan.id} className="p-4 bg-black/30 border border-cyber-cyan/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-cyber-cyan">{scan.target}</div>
                    <div className="text-sm text-gray-400">{scan.type} scan</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm px-2 py-1 rounded ${
                      scan.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      scan.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {scan.status}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {scan.findings} findings
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderVulnerabilities = () => (
    <div className="space-y-6">
      {/* Vulnerability Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['critical', 'high', 'medium', 'low'].map((severity) => {
          const count = vulnerabilities.filter(v => v.severity === severity).length;
          return (
            <div key={severity} className={`cyber-card p-4 text-center ${getSeverityColor(severity)}`}>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-sm capitalize">{severity}</div>
            </div>
          );
        })}
      </div>

      {/* Vulnerability List */}
      <div className="cyber-card p-6">
        <h3 className="text-xl font-bold text-cyber-cyan mb-4 flex items-center">
          <AlertTriangle className="h-6 w-6 mr-2" />
          Discovered Vulnerabilities
        </h3>
        <div className="space-y-4">
          {vulnerabilities.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No vulnerabilities found yet. Run a scan to discover security issues.
            </div>
          ) : (
            vulnerabilities.map((vuln) => (
              <div key={vuln.id} className={`p-4 border rounded-lg ${getSeverityColor(vuln.severity)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(vuln.severity)}`}>
                        {vuln.severity.toUpperCase()}
                      </span>
                      {vuln.cve && (
                        <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">
                          {vuln.cve}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-white mb-2">{vuln.title}</h4>
                    <p className="text-gray-300 text-sm mb-3">{vuln.description}</p>
                    <div className="text-xs text-gray-400 mb-2">
                      Target: {vuln.target}{vuln.port && `:${vuln.port}`}
                    </div>
                    <div className="text-sm">
                      <strong className="text-cyber-green">Solution:</strong> {vuln.solution}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6">
      <div className="cyber-card p-6">
        <h3 className="text-xl font-bold text-cyber-cyan mb-4 flex items-center">
          <Download className="h-6 w-6 mr-2" />
          Generate Reports
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="p-4 bg-black/30 border border-cyber-cyan/20 rounded-lg hover:bg-black/50 transition-colors text-left">
            <div className="font-bold text-cyber-cyan mb-2">Executive Summary</div>
            <div className="text-sm text-gray-400">High-level overview for management</div>
          </button>
          <button className="p-4 bg-black/30 border border-cyber-cyan/20 rounded-lg hover:bg-black/50 transition-colors text-left">
            <div className="font-bold text-cyber-cyan mb-2">Technical Report</div>
            <div className="text-sm text-gray-400">Detailed technical findings</div>
          </button>
          <button className="p-4 bg-black/30 border border-cyber-cyan/20 rounded-lg hover:bg-black/50 transition-colors text-left">
            <div className="font-bold text-cyber-cyan mb-2">Compliance Report</div>
            <div className="text-sm text-gray-400">Regulatory compliance assessment</div>
          </button>
          <button className="p-4 bg-black/30 border border-cyber-cyan/20 rounded-lg hover:bg-black/50 transition-colors text-left">
            <div className="font-bold text-cyber-cyan mb-2">Remediation Guide</div>
            <div className="text-sm text-gray-400">Step-by-step fix instructions</div>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-cyber-cyan/20 rounded-lg border border-cyber-cyan/30">
              <Shield className="h-8 w-8 text-cyber-cyan" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-cyber-cyan">Penetration Testing</h1>
              <p className="text-gray-400">Comprehensive security assessment and vulnerability discovery</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-black/30 p-1 rounded-lg">
            {[
              { id: 'scanner', label: 'Scanner', icon: Scan },
              { id: 'vulnerabilities', label: 'Vulnerabilities', icon: AlertTriangle },
              { id: 'reports', label: 'Reports', icon: Download }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/30'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'scanner' && renderScanner()}
        {activeTab === 'vulnerabilities' && renderVulnerabilities()}
        {activeTab === 'reports' && renderReports()}
      </div>
    </div>
  );
};

export default PenetrationTesting;

