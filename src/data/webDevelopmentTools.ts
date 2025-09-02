import React from 'react';
import {
  Code, Palette, Smartphone, Monitor, Globe, Zap, Database, 
  Settings, FileCode, Layers, Package, GitBranch, Terminal,
  Image, Video, Music, FileText, Search, BarChart, PieChart,
  TrendingUp, Users, Mail, Calendar, ShoppingCart, CreditCard,
  Lock, Shield, Eye, Gauge, Wrench, Bug, TestTube, Rocket
} from 'lucide-react';

export interface WebDevTool {
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

export const webDevelopmentTools: WebDevTool[] = [
  // Frontend Development Tools
  {
    id: 'responsive-tester',
    name: 'Responsive Design Tester',
    description: 'Test website responsiveness across multiple device sizes',
    category: 'development',
    icon: React.createElement(Smartphone),
    features: ['Multi-device preview', 'Custom breakpoints', 'Touch simulation', 'Performance metrics'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '2-5 minutes',
    tags: ['responsive', 'mobile', 'testing', 'ui']
  },
  {
    id: 'color-palette-generator',
    name: 'AI Color Palette Generator',
    description: 'Generate harmonious color palettes for web projects',
    category: 'development',
    icon: React.createElement(Palette),
    features: ['AI-powered suggestions', 'Accessibility check', 'Export formats', 'Brand color matching'],
    tier: 'premium',
    difficulty: 'beginner',
    executionTime: '1-3 minutes',
    tags: ['colors', 'design', 'accessibility', 'branding']
  },
  {
    id: 'css-optimizer',
    name: 'CSS Performance Optimizer',
    description: 'Optimize and minify CSS for better performance',
    category: 'development',
    icon: React.createElement(Zap),
    features: ['CSS minification', 'Unused CSS removal', 'Critical CSS extraction', 'Performance analysis'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '2-8 minutes',
    tags: ['css', 'optimization', 'performance', 'minification']
  },
  {
    id: 'html-validator',
    name: 'HTML5 Validator & Optimizer',
    description: 'Validate HTML markup and optimize for SEO',
    category: 'development',
    icon: React.createElement(FileCode),
    features: ['W3C validation', 'SEO optimization', 'Accessibility audit', 'Schema markup'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '1-4 minutes',
    tags: ['html', 'validation', 'seo', 'accessibility']
  },
  {
    id: 'js-bundler',
    name: 'JavaScript Bundle Analyzer',
    description: 'Analyze and optimize JavaScript bundles',
    category: 'development',
    icon: React.createElement(Package),
    features: ['Bundle size analysis', 'Dependency tree', 'Code splitting suggestions', 'Performance metrics'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '3-10 minutes',
    tags: ['javascript', 'bundling', 'optimization', 'webpack']
  },

  // Backend Development Tools
  {
    id: 'api-designer',
    name: 'RESTful API Designer',
    description: 'Design and document REST APIs with OpenAPI',
    category: 'development',
    icon: React.createElement(Database),
    features: ['OpenAPI specification', 'Interactive documentation', 'Mock server generation', 'Code generation'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '10-30 minutes',
    tags: ['api', 'rest', 'openapi', 'documentation']
  },
  {
    id: 'database-designer',
    name: 'Database Schema Designer',
    description: 'Visual database schema design and optimization',
    category: 'development',
    icon: React.createElement(Layers),
    features: ['ER diagram creation', 'SQL generation', 'Index optimization', 'Migration scripts'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '15-60 minutes',
    tags: ['database', 'schema', 'sql', 'optimization']
  },
  {
    id: 'graphql-playground',
    name: 'GraphQL Schema Builder',
    description: 'Build and test GraphQL schemas interactively',
    category: 'development',
    icon: React.createElement(GitBranch),
    features: ['Schema definition', 'Query testing', 'Resolver generation', 'Documentation'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '10-45 minutes',
    tags: ['graphql', 'schema', 'api', 'testing']
  },
  {
    id: 'microservice-architect',
    name: 'Microservice Architecture Planner',
    description: 'Plan and visualize microservice architectures',
    category: 'development',
    icon: React.createElement(Settings),
    features: ['Service mapping', 'Communication patterns', 'Load balancing', 'Deployment strategies'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '30-120 minutes',
    tags: ['microservices', 'architecture', 'planning', 'deployment']
  },

  // Performance & Testing Tools
  {
    id: 'lighthouse-analyzer',
    name: 'Web Performance Analyzer',
    description: 'Comprehensive web performance and SEO analysis',
    category: 'development',
    icon: React.createElement(Gauge),
    features: ['Lighthouse integration', 'Core Web Vitals', 'SEO audit', 'Accessibility check'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '2-8 minutes',
    tags: ['performance', 'lighthouse', 'seo', 'vitals']
  },
  {
    id: 'load-tester',
    name: 'Load Testing Suite',
    description: 'Simulate high traffic loads and measure performance',
    category: 'development',
    icon: React.createElement(TrendingUp),
    features: ['Concurrent user simulation', 'Response time analysis', 'Bottleneck identification', 'Scalability testing'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '5-30 minutes',
    tags: ['load-testing', 'performance', 'scalability', 'stress']
  },
  {
    id: 'unit-test-generator',
    name: 'AI Unit Test Generator',
    description: 'Generate comprehensive unit tests using AI',
    category: 'development',
    icon: React.createElement(TestTube),
    features: ['AI-powered test generation', 'Multiple frameworks', 'Coverage analysis', 'Mock generation'],
    tier: 'elite',
    difficulty: 'intermediate',
    executionTime: '5-20 minutes',
    tags: ['testing', 'unit-tests', 'ai', 'coverage']
  },
  {
    id: 'bug-tracker',
    name: 'Smart Bug Tracker',
    description: 'Intelligent bug tracking and resolution system',
    category: 'development',
    icon: React.createElement(Bug),
    features: ['Automated bug detection', 'Priority classification', 'Solution suggestions', 'Team collaboration'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '3-15 minutes',
    tags: ['bugs', 'tracking', 'collaboration', 'automation']
  },

  // DevOps & Deployment Tools
  {
    id: 'docker-optimizer',
    name: 'Docker Container Optimizer',
    description: 'Optimize Docker containers for production',
    category: 'infrastructure',
    icon: React.createElement(Package),
    features: ['Image size reduction', 'Security scanning', 'Multi-stage builds', 'Performance tuning'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '5-25 minutes',
    tags: ['docker', 'containers', 'optimization', 'security']
  },
  {
    id: 'ci-cd-builder',
    name: 'CI/CD Pipeline Builder',
    description: 'Visual CI/CD pipeline creation and management',
    category: 'infrastructure',
    icon: React.createElement(Rocket),
    features: ['Pipeline visualization', 'Multi-platform support', 'Automated testing', 'Deployment strategies'],
    tier: 'elite',
    difficulty: 'advanced',
    executionTime: '15-60 minutes',
    tags: ['ci-cd', 'deployment', 'automation', 'pipeline']
  },
  {
    id: 'kubernetes-helper',
    name: 'Kubernetes Configuration Helper',
    description: 'Generate and validate Kubernetes configurations',
    category: 'infrastructure',
    icon: React.createElement(Settings),
    features: ['YAML generation', 'Configuration validation', 'Resource optimization', 'Best practices'],
    tier: 'elite',
    difficulty: 'expert',
    executionTime: '10-45 minutes',
    tags: ['kubernetes', 'yaml', 'configuration', 'orchestration']
  },
  {
    id: 'monitoring-setup',
    name: 'Application Monitoring Setup',
    description: 'Configure comprehensive application monitoring',
    category: 'infrastructure',
    icon: React.createElement(Eye),
    features: ['Metrics collection', 'Alert configuration', 'Dashboard creation', 'Log aggregation'],
    tier: 'premium',
    difficulty: 'advanced',
    executionTime: '20-90 minutes',
    tags: ['monitoring', 'metrics', 'alerts', 'observability']
  },

  // Content & Media Tools
  {
    id: 'image-optimizer',
    name: 'Web Image Optimizer',
    description: 'Optimize images for web performance',
    category: 'development',
    icon: React.createElement(Image),
    features: ['Format conversion', 'Compression optimization', 'WebP generation', 'Lazy loading setup'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '1-5 minutes',
    tags: ['images', 'optimization', 'webp', 'performance']
  },
  {
    id: 'video-processor',
    name: 'Video Processing Suite',
    description: 'Process and optimize videos for web delivery',
    category: 'development',
    icon: React.createElement(Video),
    features: ['Format conversion', 'Compression', 'Thumbnail generation', 'Streaming optimization'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-30 minutes',
    tags: ['video', 'processing', 'streaming', 'optimization']
  },
  {
    id: 'content-generator',
    name: 'AI Content Generator',
    description: 'Generate web content using artificial intelligence',
    category: 'development',
    icon: React.createElement(FileText),
    features: ['Text generation', 'SEO optimization', 'Multiple languages', 'Content templates'],
    tier: 'elite',
    difficulty: 'beginner',
    executionTime: '2-10 minutes',
    tags: ['ai', 'content', 'seo', 'copywriting']
  },

  // Analytics & SEO Tools
  {
    id: 'seo-analyzer',
    name: 'Advanced SEO Analyzer',
    description: 'Comprehensive SEO analysis and optimization',
    category: 'development',
    icon: React.createElement(Search),
    features: ['Keyword analysis', 'Meta tag optimization', 'Schema markup', 'Competitor analysis'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '5-20 minutes',
    tags: ['seo', 'keywords', 'optimization', 'ranking']
  },
  {
    id: 'analytics-setup',
    name: 'Web Analytics Configurator',
    description: 'Set up comprehensive web analytics tracking',
    category: 'development',
    icon: React.createElement(BarChart),
    features: ['Google Analytics setup', 'Event tracking', 'Conversion goals', 'Custom dashboards'],
    tier: 'free',
    difficulty: 'beginner',
    executionTime: '10-30 minutes',
    tags: ['analytics', 'tracking', 'conversion', 'metrics']
  },
  {
    id: 'heatmap-analyzer',
    name: 'User Behavior Heatmap',
    description: 'Analyze user interactions with heatmap visualization',
    category: 'development',
    icon: React.createElement(Eye),
    features: ['Click tracking', 'Scroll analysis', 'User journey mapping', 'A/B testing'],
    tier: 'premium',
    difficulty: 'intermediate',
    executionTime: '15-45 minutes',
    tags: ['heatmap', 'user-behavior', 'analytics', 'ux']
  }
];

export const getWebDevToolsByCategory = (category: string) => {
  if (category === 'all') return webDevelopmentTools;
  return webDevelopmentTools.filter(tool => tool.category === category);
};

export const getWebDevToolsByTier = (tier: string) => {
  if (tier === 'all') return webDevelopmentTools;
  return webDevelopmentTools.filter(tool => tool.tier === tier);
};

export const searchWebDevTools = (query: string) => {
  const lowercaseQuery = query.toLowerCase();
  return webDevelopmentTools.filter(tool => 
    tool.name.toLowerCase().includes(lowercaseQuery) ||
    tool.description.toLowerCase().includes(lowercaseQuery) ||
    tool.features.some(feature => feature.toLowerCase().includes(lowercaseQuery)) ||
    tool.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
};

