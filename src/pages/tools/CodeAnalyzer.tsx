import React from 'react';
import { Code, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const CodeAnalyzer: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-cyber-green/20 rounded-lg border border-cyber-green/30">
              <Code className="h-8 w-8 text-cyber-green" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-cyber-green">Code Analyzer</h1>
              <p className="text-gray-400">Static and dynamic code analysis for security vulnerabilities</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Interface */}
          <div className="cyber-card p-6">
            <h2 className="text-xl font-bold text-cyber-green mb-4">Upload Code</h2>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-cyber-green/30 rounded-lg p-8 text-center">
                <Code className="h-12 w-12 text-cyber-green mx-auto mb-4" />
                <p className="text-gray-400 mb-2">Drop your code files here</p>
                <p className="text-sm text-gray-500">Supports: .js, .py, .java, .cpp, .cs</p>
                <button className="mt-4 px-4 py-2 bg-cyber-green/20 border border-cyber-green text-cyber-green rounded-lg hover:bg-cyber-green/30 transition-colors">
                  Browse Files
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Analysis Type</label>
                <select className="w-full px-3 py-2 bg-black/50 border border-cyber-green/30 rounded-lg text-cyber-green focus:border-cyber-green focus:outline-none">
                  <option>Security Vulnerabilities</option>
                  <option>Code Quality</option>
                  <option>Performance Issues</option>
                  <option>Comprehensive Analysis</option>
                </select>
              </div>
            </div>
          </div>

          {/* Analysis Results */}
          <div className="lg:col-span-2 cyber-card p-6">
            <h2 className="text-xl font-bold text-cyber-green mb-4">Analysis Results</h2>
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-red-400">3</div>
                  <div className="text-sm text-gray-400">Critical Issues</div>
                </div>
                <div className="text-center p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-yellow-400">7</div>
                  <div className="text-sm text-gray-400">Warnings</div>
                </div>
                <div className="text-center p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-green-400">15</div>
                  <div className="text-sm text-gray-400">Passed Checks</div>
                </div>
              </div>

              {/* Detailed Issues */}
              <div className="space-y-3">
                {[
                  { type: 'critical', file: 'auth.js', line: 42, issue: 'SQL Injection vulnerability detected', severity: 'Critical' },
                  { type: 'critical', file: 'user.js', line: 128, issue: 'Hardcoded credentials found', severity: 'Critical' },
                  { type: 'warning', file: 'utils.js', line: 67, issue: 'Potential XSS vulnerability', severity: 'Medium' },
                  { type: 'warning', file: 'config.js', line: 15, issue: 'Insecure random number generation', severity: 'Low' }
                ].map((issue, index) => (
                  <div key={index} className={`p-4 border rounded-lg ${
                    issue.type === 'critical' 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : 'bg-yellow-500/10 border-yellow-500/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {issue.type === 'critical' ? (
                          <XCircle className="h-5 w-5 text-red-400" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-400" />
                        )}
                        <div>
                          <div className="font-mono text-sm text-gray-300">{issue.file}:{issue.line}</div>
                          <div className="text-white">{issue.issue}</div>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        issue.severity === 'Critical' 
                          ? 'bg-red-500/20 text-red-400' 
                          : issue.severity === 'Medium'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {issue.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeAnalyzer;

