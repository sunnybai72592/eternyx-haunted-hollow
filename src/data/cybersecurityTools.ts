import React from 'react';
import {
  Shield, Target, Scan, Key, Globe, Bot, Crosshair, Wifi, Database, 
  Network, FileSearch, Lock, Eye, AlertTriangle, Zap, Bug, 
  Activity, Fingerprint, UserCheck, ShieldCheck, Search, 
  HardDrive, Radio, Smartphone, Cloud, Server, Monitor
} from 'lucide-react';

export interface CyberTool {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  features: string[];
  tier: 'free' | 'premium' | 'elite';
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  executionTime: string;
  tags: string[];
}

export const cybersecurityTools: CyberTool[] = [
  // Vulnerability Assessment Tools
  {
    id: 'vuln-scanner',
    name: 'Advanced Vulnerability Scanner',
    description: 'Military-grade vulnerability detection with AI-powered analysis',
    category: 'cybersecurity',
    icon: React.createElement(Scan),
    features: ['Zero-day detection', 'CVE database integration', 'Custom exploit generation', 'AI-powered risk assessment'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '15-45 minutes',
    tags: ['vulnerability', 'scanning', 'ai', 'cve']
  },
  {
    id: 'network-mapper',
    name: 'Network Discovery & Mapping',
    description: 'Advanced network topology discovery and asset identification',
    category: 'cybersecurity',
    icon: React.createElement(Network),
    features: ['Live host detection', 'Service enumeration', 'OS fingerprinting', 'Network topology mapping'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-20 minutes',
    tags: ['network', 'discovery', 'mapping', 'reconnaissance']
  },
  {
    id: 'port-scanner',
    name: 'Stealth Port Scanner',
    description: 'High-speed stealth port scanning with evasion techniques',
    category: 'cybersecurity',
    icon: React.createElement(Target),
    features: ['SYN stealth scanning', 'UDP scanning', 'Firewall evasion', 'Custom timing controls'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '1-10 minutes',
    tags: ['ports', 'scanning', 'stealth', 'reconnaissance']
  },
  {
    id: 'ssl-analyzer',
    name: 'SSL/TLS Security Analyzer',
    description: 'Comprehensive SSL/TLS configuration and vulnerability assessment',
    category: 'cybersecurity',
    icon: React.createElement(Lock),
    features: ['Certificate validation', 'Cipher suite analysis', 'Protocol version testing', 'Vulnerability detection'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '2-5 minutes',
    tags: ['ssl', 'tls', 'certificates', 'encryption']
  },

  // Penetration Testing Tools
  {
    id: 'web-scanner',
    name: 'Web Application Scanner',
    description: 'OWASP Top 10 vulnerability scanner with advanced detection',
    category: 'penetration',
    icon: React.createElement(Globe),
    features: ['SQL injection detection', 'XSS analysis', 'CSRF testing', 'Authentication bypass'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '10-30 minutes',
    tags: ['web', 'owasp', 'injection', 'xss']
  },
  {
    id: 'payload-generator',
    name: 'Advanced Payload Generator',
    description: 'Custom exploit payload generation and encoding',
    category: 'penetration',
    icon: React.createElement(Zap),
    features: ['Multi-format payloads', 'Encoding/obfuscation', 'Platform-specific exploits', 'Custom shellcode'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '1-5 minutes',
    tags: ['payloads', 'exploits', 'shellcode', 'encoding']
  },
  {
    id: 'password-cracker',
    name: 'Distributed Password Cracker',
    description: 'High-performance distributed password cracking system',
    category: 'penetration',
    icon: React.createElement(Key),
    features: ['Dictionary attacks', 'Brute force', 'Rainbow tables', 'GPU acceleration'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '5 minutes - 24 hours',
    tags: ['passwords', 'cracking', 'brute-force', 'gpu']
  },
  {
    id: 'social-engineer',
    name: 'Social Engineering Toolkit',
    description: 'Comprehensive social engineering attack simulation',
    category: 'penetration',
    icon: React.createElement(UserCheck),
    features: ['Phishing campaigns', 'Pretexting scenarios', 'OSINT gathering', 'Awareness training'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '30 minutes - 2 hours',
    tags: ['social-engineering', 'phishing', 'osint', 'training']
  },
  {
    id: 'wireless-auditor',
    name: 'Wireless Security Auditor',
    description: 'Complete wireless network security assessment suite',
    category: 'penetration',
    icon: React.createElement(Wifi),
    features: ['WPA/WPA2 cracking', 'Evil twin attacks', 'Deauth attacks', 'Rogue AP detection'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '15 minutes - 4 hours',
    tags: ['wireless', 'wifi', 'wpa', 'rogue-ap']
  },

  // Cryptography & Encryption Tools
  {
    id: 'quantum-encryption',
    name: 'Quantum Encryption Utility',
    description: 'Post-quantum cryptography implementation and testing',
    category: 'cybersecurity',
    icon: React.createElement(Key),
    features: ['Quantum-resistant algorithms', 'Key exchange protocols', 'Lattice-based crypto', 'Hash-based signatures'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '1-10 minutes',
    tags: ['quantum', 'encryption', 'post-quantum', 'cryptography']
  },
  {
    id: 'crypto-analyzer',
    name: 'Cryptographic Analyzer',
    description: 'Advanced cryptographic implementation analysis and testing',
    category: 'cybersecurity',
    icon: React.createElement(Shield),
    features: ['Algorithm identification', 'Weakness detection', 'Key strength analysis', 'Implementation flaws'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '5-30 minutes',
    tags: ['cryptography', 'analysis', 'algorithms', 'keys']
  },
  {
    id: 'hash-cracker',
    name: 'Multi-Hash Cracker',
    description: 'Universal hash cracking with multiple algorithm support',
    category: 'penetration',
    icon: React.createElement(Fingerprint),
    features: ['MD5/SHA cracking', 'bcrypt/scrypt support', 'Custom algorithms', 'Distributed computing'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '1 minute - 12 hours',
    tags: ['hashing', 'cracking', 'md5', 'sha', 'bcrypt']
  },

  // Forensics & Analysis Tools
  {
    id: 'digital-forensics',
    name: 'Digital Forensics Suite',
    description: 'Comprehensive digital evidence collection and analysis',
    category: 'cybersecurity',
    icon: React.createElement(FileSearch),
    features: ['Disk imaging', 'File recovery', 'Timeline analysis', 'Metadata extraction'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '30 minutes - 8 hours',
    tags: ['forensics', 'evidence', 'recovery', 'analysis']
  },
  {
    id: 'memory-analyzer',
    name: 'Memory Dump Analyzer',
    description: 'Advanced memory forensics and malware analysis',
    category: 'cybersecurity',
    icon: React.createElement(HardDrive),
    features: ['Process analysis', 'Malware detection', 'Rootkit hunting', 'Volatility framework'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '10-60 minutes',
    tags: ['memory', 'forensics', 'malware', 'volatility']
  },
  {
    id: 'log-analyzer',
    name: 'Security Log Analyzer',
    description: 'Intelligent security log analysis and threat detection',
    category: 'cybersecurity',
    icon: React.createElement(Activity),
    features: ['Pattern recognition', 'Anomaly detection', 'Threat correlation', 'Real-time monitoring'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-30 minutes',
    tags: ['logs', 'analysis', 'siem', 'monitoring']
  },

  // Mobile & IoT Security
  {
    id: 'mobile-scanner',
    name: 'Mobile App Security Scanner',
    description: 'Comprehensive mobile application security assessment',
    category: 'cybersecurity',
    icon: React.createElement(Smartphone),
    features: ['Static analysis', 'Dynamic testing', 'API security', 'Privacy assessment'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '15-45 minutes',
    tags: ['mobile', 'apps', 'android', 'ios', 'api']
  },
  {
    id: 'iot-scanner',
    name: 'IoT Device Scanner',
    description: 'Internet of Things device security assessment',
    category: 'cybersecurity',
    icon: React.createElement(Radio),
    features: ['Device discovery', 'Firmware analysis', 'Protocol testing', 'Default credential check'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '10-40 minutes',
    tags: ['iot', 'devices', 'firmware', 'protocols']
  },

  // Cloud Security Tools
  {
    id: 'cloud-scanner',
    name: 'Cloud Security Scanner',
    description: 'Multi-cloud security configuration assessment',
    category: 'cybersecurity',
    icon: React.createElement(Cloud),
    features: ['AWS/Azure/GCP scanning', 'Misconfiguration detection', 'IAM analysis', 'Compliance checking'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-25 minutes',
    tags: ['cloud', 'aws', 'azure', 'gcp', 'iam']
  },
  {
    id: 'container-scanner',
    name: 'Container Security Scanner',
    description: 'Docker and Kubernetes security assessment',
    category: 'cybersecurity',
    icon: React.createElement(Database),
    features: ['Image vulnerability scanning', 'Runtime security', 'Kubernetes hardening', 'Secret detection'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '5-20 minutes',
    tags: ['containers', 'docker', 'kubernetes', 'images']
  },

  // Threat Intelligence & Monitoring
  {
    id: 'threat-hunter',
    name: 'Advanced Threat Hunter',
    description: 'Proactive threat hunting and IOC analysis',
    category: 'cybersecurity',
    icon: React.createElement(Eye),
    features: ['IOC correlation', 'Behavioral analysis', 'Threat intelligence feeds', 'Hunt queries'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '20-120 minutes',
    tags: ['threat-hunting', 'ioc', 'intelligence', 'behavior']
  },
  {
    id: 'malware-analyzer',
    name: 'Malware Analysis Sandbox',
    description: 'Safe malware analysis and behavior monitoring',
    category: 'cybersecurity',
    icon: React.createElement(Bug),
    features: ['Dynamic analysis', 'Static analysis', 'Behavioral monitoring', 'IOC extraction'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '10-60 minutes',
    tags: ['malware', 'sandbox', 'analysis', 'behavior']
  },
  {
    id: 'incident-responder',
    name: 'Incident Response Toolkit',
    description: 'Complete incident response and containment suite',
    category: 'cybersecurity',
    icon: React.createElement(AlertTriangle),
    features: ['Automated containment', 'Evidence collection', 'Timeline reconstruction', 'Reporting tools'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '30 minutes - 4 hours',
    tags: ['incident-response', 'containment', 'evidence', 'reporting']
  }
];

export const getCybersecurityToolsByCategory = (category: string) => {
  if (category === 'all') return cybersecurityTools;
  return cybersecurityTools.filter(tool => tool.category === category);
};

export const getCybersecurityToolsByTier = (tier: string) => {
  if (tier === 'all') return cybersecurityTools;
  return cybersecurityTools.filter(tool => tool.tier === tier);
};

export const searchCybersecurityTools = (query: string) => {
  const lowercaseQuery = query.toLowerCase();
  return cybersecurityTools.filter(tool => 
    tool.name.toLowerCase().includes(lowercaseQuery) ||
    tool.description.toLowerCase().includes(lowercaseQuery) ||
    tool.features.some(feature => feature.toLowerCase().includes(lowercaseQuery)) ||
    tool.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
};

