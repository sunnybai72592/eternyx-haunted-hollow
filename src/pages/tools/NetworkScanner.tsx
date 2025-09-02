import React from 'react';
import { Shield, Wifi, Globe, Server } from 'lucide-react';

const NetworkScanner: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-cyber-orange/20 rounded-lg border border-cyber-orange/30">
              <Wifi className="h-8 w-8 text-cyber-orange" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-cyber-orange">Network Scanner</h1>
              <p className="text-gray-400">Deep network analysis and topology discovery</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scanner Interface */}
          <div className="cyber-card p-6">
            <h2 className="text-xl font-bold text-cyber-orange mb-4">Network Discovery</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target Range</label>
                <input
                  type="text"
                  placeholder="192.168.1.0/24"
                  className="w-full px-3 py-2 bg-black/50 border border-cyber-orange/30 rounded-lg text-cyber-orange focus:border-cyber-orange focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Scan Type</label>
                <select className="w-full px-3 py-2 bg-black/50 border border-cyber-orange/30 rounded-lg text-cyber-orange focus:border-cyber-orange focus:outline-none">
                  <option>TCP SYN Scan</option>
                  <option>UDP Scan</option>
                  <option>Comprehensive Scan</option>
                  <option>Stealth Scan</option>
                </select>
              </div>
              <button className="w-full py-3 bg-cyber-orange/20 border border-cyber-orange text-cyber-orange rounded-lg hover:bg-cyber-orange/30 transition-colors">
                Start Scan
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="cyber-card p-6">
            <h2 className="text-xl font-bold text-cyber-orange mb-4">Discovered Hosts</h2>
            <div className="space-y-3">
              {[
                { ip: '192.168.1.1', hostname: 'router.local', os: 'Linux', ports: '22,80,443' },
                { ip: '192.168.1.100', hostname: 'workstation-01', os: 'Windows 10', ports: '135,445,3389' },
                { ip: '192.168.1.150', hostname: 'server-01', os: 'Ubuntu 20.04', ports: '22,80,443,3306' }
              ].map((host, index) => (
                <div key={index} className="p-3 bg-black/30 border border-cyber-orange/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Server className="h-5 w-5 text-cyber-orange" />
                      <div>
                        <div className="font-mono text-cyber-orange">{host.ip}</div>
                        <div className="text-sm text-gray-400">{host.hostname}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-300">{host.os}</div>
                      <div className="text-xs text-gray-500">Ports: {host.ports}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkScanner;

