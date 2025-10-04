import { supabase } from '@/integrations/supabase/client';
import { Shield, Eye, Layers, Wifi, Code, HardDrive, Bug, Cloud, Target, Zap, Brain, Smartphone, Puzzle, Monitor, Wrench } from 'lucide-react';
import React from 'react';

export interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  xp: number;
  maxXp: number;
  level: number;
  lastUsed: string;
  usageCount: number;
  glowColor: 'cyan' | 'green' | 'purple' | 'orange' | 'pink';
  category: string;
  isLocked?: boolean;
  requiredLevel?: number;
  action?: () => Promise<any>; // Function to execute when the tool is clicked
}

export const fetchTools = async (userId: string): Promise<Tool[]> => {
  const baseTools: Tool[] = [
    { id: 'vulnerability-scanner', title: 'Vulnerability Scanner', description: 'Advanced penetration testing and vulnerability assessment tools.', icon: <Shield className="h-6 w-6" />, xp: 1250, maxXp: 2000, level: 8, lastUsed: 'N/A', usageCount: 0, glowColor: 'cyan', category: 'security' },
    { id: 'ai-threat-analysis', title: 'AI Threat Analysis', description: 'Machine learning powered threat detection and analysis.', icon: <Eye className="h-6 w-6" />, xp: 890, maxXp: 1500, level: 6, lastUsed: 'N/A', usageCount: 0, glowColor: 'green', category: 'ai' },
    { id: 'quantum-encryption', title: 'Quantum Encryption', description: 'Next-generation quantum-resistant encryption protocols.', icon: <Layers className="h-6 w-6" />, xp: 2100, maxXp: 3000, level: 12, lastUsed: 'N/A', usageCount: 0, glowColor: 'purple', category: 'encryption' },
    { id: 'network-mapper', title: 'Network Mapper', description: 'Comprehensive network topology and device discovery.', icon: <Wifi className="h-6 w-6" />, xp: 670, maxXp: 1000, level: 4, lastUsed: 'N/A', usageCount: 0, glowColor: 'orange', category: 'network' },
    { id: 'code-analyzer', title: 'Code Analyzer', description: 'Static and dynamic code analysis for security vulnerabilities.', icon: <Code className="h-6 w-6" />, xp: 1450, maxXp: 2000, level: 9, lastUsed: 'N/A', usageCount: 0, glowColor: 'cyan', category: 'development' },
    { id: 'data-forensics', title: 'Data Forensics', description: 'Digital forensics and data recovery tools.', icon: <HardDrive className="h-6 w-6" />, xp: 980, maxXp: 1500, level: 7, lastUsed: 'N/A', usageCount: 0, glowColor: 'pink', category: 'forensics' },
    { id: 'exploit-framework', title: 'Exploit Framework', description: 'Advanced exploitation and payload generation toolkit.', icon: <Bug className="h-6 w-6" />, xp: 1780, maxXp: 2500, level: 10, lastUsed: 'N/A', usageCount: 0, glowColor: 'green', category: 'exploitation', isLocked: false },
    { id: 'cloud-security', title: 'Cloud Security Suite', description: 'Multi-cloud security assessment and monitoring.', icon: <Cloud className="h-6 w-6" />, xp: 0, maxXp: 1000, level: 1, lastUsed: 'N/A', usageCount: 0, glowColor: 'purple', category: 'cloud', isLocked: true, requiredLevel: 20 },
    { id: 'threat-intelligence-feed', title: 'Threat Intelligence Feed', description: 'Real-time updates on global cyber threats and vulnerabilities.', icon: <Target className="h-6 w-6" />, xp: 500, maxXp: 1000, level: 3, lastUsed: 'N/A', usageCount: 0, glowColor: 'orange', category: 'intelligence' },
    { id: 'security-orchestrator', title: 'Security Orchestrator', description: 'Automate security workflows and incident response.', icon: <Zap className="h-6 w-6" />, xp: 1800, maxXp: 2500, level: 11, lastUsed: 'N/A', usageCount: 0, glowColor: 'cyan', category: 'automation' },
    { id: 'ai-code-auditor', title: 'AI Code Auditor', description: 'AI-powered static and dynamic code analysis for security flaws.', icon: <Brain className="h-6 w-6" />, xp: 1600, maxXp: 2200, level: 9, lastUsed: 'N/A', usageCount: 0, glowColor: 'green', category: 'ai' },
    { id: 'mobile-security-analyzer', title: 'Mobile Security Analyzer', description: 'Analyze mobile applications for vulnerabilities and privacy issues.', icon: <Smartphone className="h-6 w-6" />, xp: 900, maxXp: 1400, level: 6, lastUsed: 'N/A', usageCount: 0, glowColor: 'pink', category: 'mobile' },
    { id: 'cryptocurrency-tracer', title: 'Cryptocurrency Tracer', description: 'Trace and analyze cryptocurrency transactions for illicit activities.', icon: <Puzzle className="h-6 w-6" />, xp: 1100, maxXp: 1800, level: 7, lastUsed: 'N/A', usageCount: 0, glowColor: 'purple', category: 'blockchain' },
    { id: 'dark-web-monitor', title: 'Dark Web Monitor', description: 'Monitor dark web forums for mentions of your organization or data.', icon: <Monitor className="h-6 w-6" />, xp: 1900, maxXp: 2800, level: 12, lastUsed: 'N/A', usageCount: 0, glowColor: 'orange', category: 'intelligence' },
    { id: 'custom-exploit-builder', title: 'Custom Exploit Builder', description: 'Develop and test custom exploits for zero-day vulnerabilities.', icon: <Wrench className="h-6 w-6" />, xp: 2500, maxXp: 3500, level: 15, lastUsed: 'N/A', usageCount: 0, glowColor: 'orange', category: 'exploitation', isLocked: true, requiredLevel: 15 },
  ];

  const toolsWithData = await Promise.all(baseTools.map(async (tool) => {
    let lastUsed = tool.lastUsed;
    let usageCount = tool.usageCount;

    switch (tool.id) {
      case 'vulnerability-scanner':
        const { data: scans, error: scansError } = await supabase
          .from('vulnerability_scans')
          .select('started_at, completed_at')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(1);
        if (scansError) console.error('Error fetching vulnerability scans:', scansError);
        if (scans && scans.length > 0) {
          const lastScan = scans[0];
          lastUsed = lastScan.completed_at ? new Date(lastScan.completed_at).toLocaleString() : new Date(lastScan.started_at).toLocaleString();
        }
        const { count: totalScans, error: totalScansError } = await supabase
          .from('vulnerability_scans')
          .select('id', { count: 'exact' })
          .eq('user_id', userId);
        if (!totalScansError) usageCount = totalScans || 0;
        break;
      case 'ai-threat-analysis':
        const { data: aiAnalyses, error: aiAnalysesError } = await supabase
          .from('ai_security_analysis')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (aiAnalysesError) console.error('Error fetching AI analyses:', aiAnalysesError);
        if (aiAnalyses && aiAnalyses.length > 0) {
          lastUsed = new Date(aiAnalyses[0].created_at).toLocaleString();
        }
        const { count: totalAiAnalyses, error: totalAiAnalysesError } = await supabase
          .from('ai_security_analysis')
          .select('id', { count: 'exact' })
          .eq('user_id', userId);
        if (!totalAiAnalysesError) usageCount = totalAiAnalyses || 0;
        break;
      case 'quantum-encryption':
        const { data: encryptionKeys, error: encryptionKeysError } = await supabase
          .from('encryption_keys')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (encryptionKeysError) console.error('Error fetching encryption keys:', encryptionKeysError);
        if (encryptionKeys && encryptionKeys.length > 0) {
          lastUsed = new Date(encryptionKeys[0].created_at).toLocaleString();
        }
        const { count: totalEncryptionKeys, error: totalEncryptionKeysError } = await supabase
          .from('encryption_keys')
          .select('id', { count: 'exact' })
          .eq('user_id', userId);
        if (!totalEncryptionKeysError) usageCount = totalEncryptionKeys || 0;
        break;
      case 'network-mapper':
        const { data: networkAnalyses, error: networkAnalysesError } = await supabase
          .from('network_traffic_analysis')
          .select('analyzed_at')
          .eq('user_id', userId)
          .order('analyzed_at', { ascending: false })
          .limit(1);
        if (networkAnalysesError) console.error('Error fetching network analyses:', networkAnalysesError);
        if (networkAnalyses && networkAnalyses.length > 0) {
          lastUsed = new Date(networkAnalyses[0].analyzed_at).toLocaleString();
        }
        const { count: totalNetworkAnalyses, error: totalNetworkAnalysesError } = await supabase
          .from('network_traffic_analysis')
          .select('id', { count: 'exact' })
          .eq('user_id', userId);
        if (!totalNetworkAnalysesError) usageCount = totalNetworkAnalyses || 0;
        break;
          case 'code-analyzer':
        const { data: projectRequests, error: projectRequestsError } = await supabase
          .from('project_requests')
          .select('submitted_at')
          .eq('user_id', userId)
          .eq('project_type', 'code_analysis')
          .order('submitted_at', { ascending: false })
          .limit(1);
        if (projectRequestsError) console.error('Error fetching code analysis requests:', projectRequestsError);
        if (projectRequests && projectRequests.length > 0) {
          lastUsed = new Date(projectRequests[0].submitted_at).toLocaleString();
        }
        const { count: totalCodeAnalyses, error: totalCodeAnalysesError } = await supabase
          .from('project_requests')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('project_type', 'code_analysis');
        if (!totalCodeAnalysesError) usageCount = totalCodeAnalyses || 0;
        break;
          case 'data-forensics':
        // Forensics functionality - placeholder
        break;
          case 'exploit-framework':
        // Exploit framework functionality - placeholder
        break;
          case 'cloud-security':
        // Cloud security functionality - placeholder
        break;
      case 'threat-intelligence-feed':
        const { data: threatIntel, error: threatIntelError } = await supabase
          .from('threat_intelligence')
          .select('last_seen')
          .order('last_seen', { ascending: false })
          .limit(1);
        if (threatIntelError) console.error('Error fetching threat intelligence:', threatIntelError);
        if (threatIntel && threatIntel.length > 0) {
          lastUsed = new Date(threatIntel[0].last_seen).toLocaleString();
        }
        const { count: totalThreatIntel, error: totalThreatIntelError } = await supabase
          .from('threat_intelligence')
          .select('id', { count: 'exact' });
        if (!totalThreatIntelError) usageCount = totalThreatIntel || 0;
        break;
      default:
        // Default case for tools without database integration
        break
        break;
    }

    return { ...tool, lastUsed, usageCount };
  }));

  return toolsWithData;
};

// Define actions for each tool
export const toolActions: { [key: string]: () => Promise<any> } = {
  'vulnerability-scanner': async () => {
    console.log('Running Vulnerability Scan...');
    // Simulate API call to start a scan
    const { data, error } = await supabase
      .from('vulnerability_scans')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        target_url: 'https://example.com', // Placeholder, ideally user input
        scan_type: 'full',
        status: 'in-progress',
      });
    if (error) throw error;
    return { message: 'Vulnerability scan initiated!', data };
  },
  'ai-threat-analysis': async () => {
    console.log('Initiating AI Threat Analysis...');
    // Simulate API call for AI analysis
    const { data, error } = await supabase
      .from('ai_security_analysis')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        analysis_type: 'threat_prediction',
        input_data: { system_logs: 'sample_log_data' }, // Placeholder
        results: { prediction: 'low_risk' }, // Placeholder
        confidence_score: 0.95,
        model_version: 'GPT-5-security-v1',
      });
    if (error) throw error;
    return { message: 'AI Threat Analysis initiated!', data };
  },
  'quantum-encryption': async () => {
    console.log('Generating Quantum Encryption Key...');
    // Simulate API call to generate key
    const { data, error } = await supabase
      .from('encryption_keys')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        key_name: `Quantum Key ${new Date().toISOString()}`,
        algorithm: 'Quantum-Safe-AES256',
        key_size: 256,
        is_quantum_resistant: true,
      });
    if (error) throw error;
    return { message: 'Quantum Encryption Key generated!', data };
  },
  'network-mapper': async () => {
    console.log('Starting Network Mapping...');
    // Simulate API call for network mapping
    const { data, error } = await supabase
      .from('network_traffic_analysis')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        analysis_name: `Network Map ${new Date().toISOString()}`,
        traffic_data: { network_segment: '192.168.1.0/24' }, // Placeholder
        anomalies_detected: 0,
        risk_level: 'low',
      });
    if (error) throw error;
    return { message: 'Network mapping initiated!', data };
  },
  'code-analyzer': async () => {
    console.log('Initiating Code Analysis...');
    const { data, error } = await supabase
      .from('project_requests')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        project_type: 'code_analysis',
        title: `Code Analysis Request ${new Date().toISOString()}`,
        description: 'Automated code analysis request.',
        priority: 'high',
        status: 'submitted',
      });
    if (error) throw error;
    return { message: 'Code analysis request submitted!', data };
  },
  'data-forensics': async () => {
    console.log('Starting Data Forensics...');
    return { message: 'Data forensics feature coming soon!' };
  },
  'exploit-framework': async () => {
    console.log('Launching Exploit Framework...');
    return { message: 'Exploit framework feature coming soon!' };
  },
  'cloud-security': async () => {
    console.log('Activating Cloud Security Suite...');
    return { message: 'Cloud Security Suite feature coming soon!' };
  },
  'threat-intelligence-feed': async () => {
    console.log('Refreshing Threat Intelligence Feed...');
    // Simulate fetching latest threat intel
    const { data, error } = await supabase
      .from('threat_intelligence')
      .select('*')
      .order('first_seen', { ascending: false })
      .limit(5);
    if (error) throw error;
    return { message: 'Threat intelligence feed refreshed!', data };
  },
  'security-orchestrator': async () => {
    console.log('Running Security Orchestration...');
    return { message: 'Security orchestrator feature coming soon!' };
  },
  'ai-code-auditor': async () => {
    console.log('Initiating AI Code Audit...');
    return { message: 'AI Code Auditor feature coming soon!' };
  },
  'mobile-security-analyzer': async () => {
    console.log('Starting Mobile Security Analysis...');
    return { message: 'Mobile Security Analyzer feature coming soon!' };
  },
  'cryptocurrency-tracer': async () => {
    console.log('Tracing Cryptocurrency Transactions...');
    return { message: 'Cryptocurrency Tracer feature coming soon!' };
  },
  'dark-web-monitor': async () => {
    console.log('Activating Dark Web Monitor...');
    return { message: 'Dark Web Monitor feature coming soon!' };
  },
  'custom-exploit-builder': async () => {
    console.log('Launching Custom Exploit Builder...');
    return { message: 'Custom Exploit Builder feature coming soon!' };
  },
};

