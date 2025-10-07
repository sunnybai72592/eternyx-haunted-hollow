import { Shield, Code, Brain, Zap, Search, Bug, Network, FileText, Server } from 'lucide-react';

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  route: string;
  color: string; // Tailwind color class for neon effect
}

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  tools: Tool[];
  route: string;
}

export const toolCategories: ToolCategory[] = [
  {
    id: 'cybersecurity',
    name: 'Cybersecurity Arsenal',
    description: 'Advanced tools for threat detection, vulnerability assessment, and digital defense.',
    icon: Shield,
    route: '/tools/category/cybersecurity',
    tools: [
      {
        id: 'network-scanner',
        name: 'Network Scanner',
        description: 'Map and analyze network topology, discover open ports and services.',
        icon: Network,
        route: '/tools/network-scanner',
        color: 'text-red-400',
      },
      {
        id: 'vulnerability-scanner',
        name: 'Vulnerability Scanner',
        description: 'Automated scanning for known software vulnerabilities and misconfigurations.',
        icon: Bug,
        route: '/vulnerability-scanner',
        color: 'text-orange-400',
      },
      {
        id: 'incident-response',
        name: 'Incident Response Kit',
        description: 'Tools and guides for rapid containment and eradication of active threats.',
        icon: Zap,
        route: '/incident-response',
        color: 'text-yellow-400',
      },
      {
        id: 'penetration-testing',
        name: 'Penetration Testing Suite',
        description: 'A comprehensive suite for ethical hacking and security validation.',
        icon: Search,
        route: '/penetration-testing',
        color: 'text-red-500',
      },
    ],
  },
  {
    id: 'web-development',
    name: 'Web Development Matrix',
    description: 'High-performance utilities for code quality, deployment, and front-end optimization.',
    icon: Code,
    route: '/tools/category/web-development',
    tools: [
      {
        id: 'code-analyzer',
        name: 'Code Analyzer',
        description: 'Static analysis to find bugs, security flaws, and style issues in source code.',
        icon: FileText,
        route: '/tools/code-analyzer',
        color: 'text-blue-400',
      },
      {
        id: 'deployment-pipeline',
        name: 'Deployment Pipeline Config',
        description: 'Templates and scripts for setting up CI/CD with major cloud providers.',
        icon: Server,
        route: '/tools/deployment-pipeline',
        color: 'text-cyan-400',
      },
    ],
  },
  {
    id: 'digital-innovation',
    name: 'Digital Innovation Hub',
    description: 'Experimental and cutting-edge tools for future-proofing your digital assets.',
    icon: Brain,
    route: '/tools/category/digital-innovation',
    tools: [
      {
        id: 'ai-model-tester',
        name: 'AI Model Tester',
        description: 'Sandbox environment for testing and fine-tuning custom AI/ML models.',
        icon: Brain,
        route: '/tools/ai-model-tester',
        color: 'text-purple-400',
      },
      {
        id: 'quantum-simulator',
        name: 'Quantum Encryption Simulator',
        description: 'Simulate post-quantum cryptography algorithms for future-proof security.',
        icon: Zap,
        route: '/quantum-encryption',
        color: 'text-pink-400',
      },
    ],
  },
];

// Utility function to get a category by ID
export const getCategoryById = (id: string) => toolCategories.find(cat => cat.id === id);

// Utility function to get all tools
export const getAllTools = () => toolCategories.flatMap(cat => cat.tools);
