import React from 'react';
import {
  Brain, Cpu, Zap, Layers, Globe, Database, Eye, Smartphone,
  Bot, Lightbulb, Rocket, Atom, Gamepad2, Monitor, Camera,
  Mic, Music, Video, FileText, BarChart, TrendingUp, Users,
  Lock, Shield, Coins, Banknote, Calculator, PieChart, Settings,
  Cloud, Server, Network, Wifi, Radio, Bluetooth, Usb, HardDrive
} from 'lucide-react';

export interface InnovationTool {
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

export const innovationTools: InnovationTool[] = [
  // Artificial Intelligence Tools
  {
    id: 'ai-model-trainer',
    name: 'AI Model Training Studio',
    description: 'Train custom machine learning models with no-code interface',
    category: 'innovation',
    icon: React.createElement(Brain),
    features: ['Drag-and-drop training', 'Auto-hyperparameter tuning', 'Model deployment', 'Performance analytics'],
    tier: 'elite',
    difficulty: 'intermediate',
    executionTime: '30-180 minutes',
    tags: ['ai', 'machine-learning', 'training', 'no-code']
  },
  {
    id: 'nlp-processor',
    name: 'Natural Language Processor',
    description: 'Advanced text analysis and natural language understanding',
    category: 'innovation',
    icon: React.createElement(FileText),
    features: ['Sentiment analysis', 'Entity extraction', 'Language detection', 'Text summarization'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '2-15 minutes',
    tags: ['nlp', 'text-analysis', 'sentiment', 'ai']
  },
  {
    id: 'computer-vision',
    name: 'Computer Vision Toolkit',
    description: 'Image and video analysis using advanced AI algorithms',
    category: 'innovation',
    icon: React.createElement(Eye),
    features: ['Object detection', 'Face recognition', 'OCR processing', 'Image classification'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '5-30 minutes',
    tags: ['computer-vision', 'image-analysis', 'ai', 'detection']
  },
  {
    id: 'chatbot-builder',
    name: 'AI Chatbot Builder',
    description: 'Create intelligent conversational AI assistants',
    category: 'innovation',
    icon: React.createElement(Bot),
    features: ['Intent recognition', 'Context management', 'Multi-language support', 'Integration APIs'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '20-90 minutes',
    tags: ['chatbot', 'conversational-ai', 'nlp', 'automation']
  },
  {
    id: 'predictive-analytics',
    name: 'Predictive Analytics Engine',
    description: 'Forecast trends and patterns using machine learning',
    category: 'innovation',
    icon: React.createElement(TrendingUp),
    features: ['Time series forecasting', 'Anomaly detection', 'Pattern recognition', 'Risk assessment'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '15-60 minutes',
    tags: ['predictive-analytics', 'forecasting', 'ml', 'trends']
  },

  // IoT & Edge Computing Tools
  {
    id: 'iot-simulator',
    name: 'IoT Device Simulator',
    description: 'Simulate and test IoT device networks and protocols',
    category: 'innovation',
    icon: React.createElement(Wifi),
    features: ['Device emulation', 'Protocol testing', 'Network simulation', 'Data generation'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '10-45 minutes',
    tags: ['iot', 'simulation', 'devices', 'protocols']
  },
  {
    id: 'edge-orchestrator',
    name: 'Edge Computing Orchestrator',
    description: 'Manage and deploy applications at the edge',
    category: 'innovation',
    icon: React.createElement(Cpu),
    features: ['Edge deployment', 'Resource management', 'Load balancing', 'Monitoring'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '20-120 minutes',
    tags: ['edge-computing', 'orchestration', 'deployment', 'management']
  },
  {
    id: 'sensor-analytics',
    name: 'Sensor Data Analytics',
    description: 'Analyze and visualize IoT sensor data streams',
    category: 'innovation',
    icon: React.createElement(BarChart),
    features: ['Real-time processing', 'Data visualization', 'Alert system', 'Historical analysis'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-25 minutes',
    tags: ['sensors', 'analytics', 'iot', 'visualization']
  },

  // Blockchain & Cryptocurrency Tools
  {
    id: 'smart-contract-builder',
    name: 'Smart Contract Builder',
    description: 'Create and deploy smart contracts without coding',
    category: 'innovation',
    icon: React.createElement(Coins),
    features: ['Visual contract builder', 'Security auditing', 'Gas optimization', 'Multi-chain deployment'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '30-120 minutes',
    tags: ['blockchain', 'smart-contracts', 'ethereum', 'defi']
  },
  {
    id: 'crypto-analyzer',
    name: 'Cryptocurrency Analyzer',
    description: 'Analyze cryptocurrency markets and trading patterns',
    category: 'innovation',
    icon: React.createElement(Banknote),
    features: ['Price analysis', 'Market indicators', 'Portfolio tracking', 'Risk assessment'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-20 minutes',
    tags: ['cryptocurrency', 'trading', 'analysis', 'portfolio']
  },
  {
    id: 'nft-creator',
    name: 'NFT Creation Studio',
    description: 'Create, mint, and manage NFT collections',
    category: 'innovation',
    icon: React.createElement(Lightbulb),
    features: ['Art generation', 'Metadata creation', 'Minting tools', 'Marketplace integration'],
    tier: 'elite',
    difficulty: 'intermediate',
    executionTime: '15-60 minutes',
    tags: ['nft', 'blockchain', 'art', 'minting']
  },

  // AR/VR Development Tools
  {
    id: 'ar-builder',
    name: 'AR Experience Builder',
    description: 'Create augmented reality experiences without coding',
    category: 'innovation',
    icon: React.createElement(Camera),
    features: ['3D object placement', 'Marker tracking', 'Gesture recognition', 'Cross-platform export'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '45-180 minutes',
    tags: ['ar', 'augmented-reality', '3d', 'mobile']
  },
  {
    id: 'vr-environment',
    name: 'VR Environment Designer',
    description: 'Design immersive virtual reality environments',
    category: 'innovation',
    icon: React.createElement(Monitor),
    features: ['3D world building', 'Physics simulation', 'Interaction design', 'VR optimization'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '60-240 minutes',
    tags: ['vr', 'virtual-reality', '3d', 'immersive']
  },
  {
    id: 'spatial-computing',
    name: 'Spatial Computing Toolkit',
    description: 'Develop spatial computing applications and interfaces',
    category: 'innovation',
    icon: React.createElement(Layers),
    features: ['Spatial mapping', 'Hand tracking', 'Voice commands', 'Mixed reality'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '90-300 minutes',
    tags: ['spatial-computing', 'mixed-reality', 'interfaces', 'tracking']
  },

  // Data Science & Analytics Tools
  {
    id: 'data-pipeline',
    name: 'Automated Data Pipeline',
    description: 'Build and manage automated data processing pipelines',
    category: 'innovation',
    icon: React.createElement(Database),
    features: ['ETL automation', 'Data validation', 'Pipeline monitoring', 'Error handling'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '20-90 minutes',
    tags: ['data-pipeline', 'etl', 'automation', 'processing']
  },
  {
    id: 'big-data-analyzer',
    name: 'Big Data Analyzer',
    description: 'Process and analyze large-scale datasets efficiently',
    category: 'innovation',
    icon: React.createElement(HardDrive),
    features: ['Distributed processing', 'Real-time analytics', 'Data visualization', 'Performance optimization'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '30-180 minutes',
    tags: ['big-data', 'analytics', 'distributed', 'visualization']
  },
  {
    id: 'ml-automl',
    name: 'AutoML Platform',
    description: 'Automated machine learning model development',
    category: 'innovation',
    icon: React.createElement(Zap),
    features: ['Automated feature engineering', 'Model selection', 'Hyperparameter optimization', 'Deployment'],
    tier: 'elite',
    difficulty: 'intermediate',
    executionTime: '45-240 minutes',
    tags: ['automl', 'machine-learning', 'automation', 'optimization']
  },

  // Innovation Consulting & Strategy Tools
  {
    id: 'innovation-radar',
    name: 'Technology Innovation Radar',
    description: 'Track and analyze emerging technology trends',
    category: 'innovation',
    icon: React.createElement(Rocket),
    features: ['Trend analysis', 'Technology mapping', 'Impact assessment', 'Strategic planning'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '15-45 minutes',
    tags: ['innovation', 'trends', 'strategy', 'analysis']
  },
  {
    id: 'digital-transformation',
    name: 'Digital Transformation Planner',
    description: 'Plan and execute digital transformation initiatives',
    category: 'innovation',
    icon: React.createElement(Settings),
    features: ['Maturity assessment', 'Roadmap creation', 'ROI calculation', 'Change management'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '60-180 minutes',
    tags: ['digital-transformation', 'strategy', 'planning', 'roi']
  },
  {
    id: 'startup-validator',
    name: 'Startup Idea Validator',
    description: 'Validate and analyze startup ideas using AI and market data',
    category: 'innovation',
    icon: React.createElement(Lightbulb),
    features: ['Market analysis', 'Competitor research', 'Feasibility assessment', 'Business model validation'],
    tier: 'premium',
    difficulty: 'beginner',
    executionTime: '10-30 minutes',
    tags: ['startup', 'validation', 'market-research', 'business']
  },

  // Quantum Computing Tools
  {
    id: 'quantum-simulator',
    name: 'Quantum Computing Simulator',
    description: 'Simulate quantum algorithms and circuits',
    category: 'innovation',
    icon: React.createElement(Atom),
    features: ['Quantum circuit design', 'Algorithm simulation', 'Qubit visualization', 'Error modeling'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '20-120 minutes',
    tags: ['quantum-computing', 'simulation', 'algorithms', 'qubits']
  },
  {
    id: 'quantum-optimizer',
    name: 'Quantum Optimization Solver',
    description: 'Solve complex optimization problems using quantum algorithms',
    category: 'innovation',
    icon: React.createElement(Calculator),
    features: ['QAOA implementation', 'Optimization modeling', 'Hybrid algorithms', 'Performance comparison'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '30-180 minutes',
    tags: ['quantum-optimization', 'qaoa', 'algorithms', 'modeling']
  }
];

export const getInnovationToolsByCategory = (category: string) => {
  if (category === 'all') return innovationTools;
  return innovationTools.filter(tool => tool.category === category);
};

export const getInnovationToolsByTier = (tier: string) => {
  if (tier === 'all') return innovationTools;
  return innovationTools.filter(tool => tool.tier === tier);
};

export const searchInnovationTools = (query: string) => {
  const lowercaseQuery = query.toLowerCase();
  return innovationTools.filter(tool => 
    tool.name.toLowerCase().includes(lowercaseQuery) ||
    tool.description.toLowerCase().includes(lowercaseQuery) ||
    tool.features.some(feature => feature.toLowerCase().includes(lowercaseQuery)) ||
    tool.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
};

