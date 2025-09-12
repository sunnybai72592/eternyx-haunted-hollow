import React, { useState } from 'react';
import { 
  Zap, ExternalLink, Download, Copy, CheckCircle, Settings, 
  Cloud, Shield, CreditCard, Bell, Users, Server, 
  Globe, Database, Lock, Smartphone, Activity, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CyberCard from '@/components/ui/cyber-card';
import CyberGrid, { CyberGridItem } from '@/components/ui/cyber-grid';
import CyberSection from '@/components/ui/cyber-section';
import { ResponsiveText } from '@/components/ui/responsive-text';
import { EnhancedButton } from '@/components/ui/enhanced-button';
import { useToast } from '@/hooks/use-toast';

interface UtilityTool {
  id: string;
  name: string;
  category: string;
  type: string;
  pricing: string;
  description: string;
  features: string[];
  installation: string;
  link: string;
  icon: React.ComponentType<any>;
  color: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  reliability: 'Standard' | 'High' | 'Enterprise' | 'Mission-Critical';
  popularity: number;
}

const UniversalWebAppUtilitiesEnhanced = () => {
  const [activeCategory, setActiveCategory] = useState('All Tools');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);
  const { toast } = useToast();

  const categories = [
    { id: 'All Tools', name: 'All Tools', icon: Settings, count: 8, color: 'green' },
    { id: 'Authentication', name: 'Authentication', icon: Shield, count: 2, color: 'blue' },
    { id: 'Deployment', name: 'Deployment', icon: Cloud, count: 3, color: 'purple' },
    { id: 'Services', name: 'Services', icon: Server, count: 2, color: 'orange' },
    { id: 'Payments', name: 'Payments', icon: CreditCard, count: 1, color: 'yellow' }
  ];

  const tools: UtilityTool[] = [
    {
      id: 'firebase-auth',
      name: 'Firebase Auth',
      category: 'Authentication',
      type: 'SDK',
      pricing: 'Freemium',
      description: 'Complete authentication solution with multiple sign-in methods and security features',
      features: ['Multiple providers', 'Email/Password', 'Social login', 'Phone auth', 'Custom tokens'],
      installation: 'npm install firebase',
      link: 'https://firebase.google.com/docs/auth',
      icon: Shield,
      color: 'blue',
      difficulty: 'Intermediate',
      reliability: 'Enterprise',
      popularity: 96
    },
    {
      id: 'supabase',
      name: 'Supabase',
      category: 'Authentication',
      type: 'Service',
      pricing: 'Freemium',
      description: 'Open-source Firebase alternative with PostgreSQL database and real-time features',
      features: ['PostgreSQL database', 'Real-time subscriptions', 'Authentication', 'Storage', 'Edge functions'],
      installation: 'npm install @supabase/supabase-js',
      link: 'https://supabase.com/',
      icon: Database,
      color: 'blue',
      difficulty: 'Intermediate',
      reliability: 'High',
      popularity: 94
    },
    {
      id: 'vercel',
      name: 'Vercel',
      category: 'Deployment',
      type: 'Platform',
      pricing: 'Freemium',
      description: 'Frontend deployment platform with global CDN and serverless functions',
      features: ['Global CDN', 'Serverless functions', 'Preview deployments', 'Analytics', 'Edge network'],
      installation: 'npm install -g vercel',
      link: 'https://vercel.com/',
      icon: Cloud,
      color: 'purple',
      difficulty: 'Beginner',
      reliability: 'Enterprise',
      popularity: 95
    },
    {
      id: 'netlify',
      name: 'Netlify',
      category: 'Deployment',
      type: 'Platform',
      pricing: 'Freemium',
      description: 'All-in-one platform for web development with continuous deployment and forms',
      features: ['Continuous deployment', 'Form handling', 'Split testing', 'Analytics', 'Edge functions'],
      installation: 'npm install -g netlify-cli',
      link: 'https://www.netlify.com/',
      icon: Globe,
      color: 'purple',
      difficulty: 'Beginner',
      reliability: 'High',
      popularity: 92
    },
    {
      id: 'render',
      name: 'Render',
      category: 'Deployment',
      type: 'Platform',
      pricing: 'Freemium',
      description: 'Cloud platform for hosting static sites, web services, and databases',
      features: ['Auto-deploy from Git', 'Free SSL', 'Custom domains', 'PostgreSQL', 'Redis'],
      installation: 'Web-based deployment',
      link: 'https://render.com/',
      icon: Server,
      color: 'purple',
      difficulty: 'Beginner',
      reliability: 'High',
      popularity: 88
    },
    {
      id: 'onesignal',
      name: 'OneSignal',
      category: 'Services',
      type: 'SDK',
      pricing: 'Freemium',
      description: 'Push notification service for web and mobile applications',
      features: ['Push notifications', 'In-app messaging', 'Email campaigns', 'SMS', 'Analytics'],
      installation: 'npm install react-onesignal',
      link: 'https://onesignal.com/',
      icon: Bell,
      color: 'orange',
      difficulty: 'Intermediate',
      reliability: 'Enterprise',
      popularity: 91
    },
    {
      id: 'stripe',
      name: 'Stripe',
      category: 'Payments',
      type: 'API',
      pricing: 'Pay-per-use',
      description: 'Complete payments platform with APIs for online and in-person payments',
      features: ['Payment processing', 'Subscriptions', 'Marketplace', 'Connect', 'Fraud prevention'],
      installation: 'npm install stripe',
      link: 'https://stripe.com/',
      icon: CreditCard,
      color: 'yellow',
      difficulty: 'Advanced',
      reliability: 'Mission-Critical',
      popularity: 98
    },
    {
      id: 'analytics',
      name: 'Web Analytics Suite',
      category: 'Services',
      type: 'Service',
      pricing: 'Freemium',
      description: 'Comprehensive analytics and monitoring tools for web applications',
      features: ['User analytics', 'Performance monitoring', 'Error tracking', 'A/B testing', 'Heatmaps'],
      installation: 'Script integration',
      link: 'https://analytics.google.com/',
      icon: Activity,
      color: 'orange',
      difficulty: 'Beginner',
      reliability: 'Enterprise',
      popularity: 89
    }
  ];

  const filteredTools = activeCategory === 'All Tools' 
    ? tools 
    : tools.filter(tool => tool.category === activeCategory);

  const handleCopyInstallation = (installation: string, toolName: string) => {
    navigator.clipboard.writeText(installation);
    setCopiedTool(toolName);
    toast({
      title: "Copied to clipboard!",
      description: `Installation command for ${toolName} copied.`,
    });
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'text-green-400';
      case 'Intermediate': return 'text-yellow-400';
      case 'Advanced': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getReliabilityColor = (reliability: string) => {
    switch (reliability) {
      case 'Standard': return 'text-blue-400';
      case 'High': return 'text-green-400';
      case 'Enterprise': return 'text-purple-400';
      case 'Mission-Critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getPopularityWidth = (popularity: number) => {
    return `${popularity}%`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900/20 via-black to-blue-900/20">
      {/* Hero Section */}
      <CyberSection
        variant="hero"
        title="Universal Web App Utilities"
        subtitle="Essential Services"
        description="Core services and utilities for modern web application development and deployment"
        icon={<Settings className="w-16 h-16" />}
        glowColor="green"
        background="gradient"
        className="min-h-[60vh]"
      >
        {/* Essential Services Banner */}
        <div className="bg-gradient-to-r from-green-900/30 via-blue-900/30 to-purple-900/30 border border-green-500/50 rounded-lg p-6 mb-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-green-300">
            <Layers className="w-6 h-6 text-green-400" />
            <div>
              <ResponsiveText variant="h6" className="text-green-200 font-semibold mb-1">
                🛠️ Production-Ready Services
              </ResponsiveText>
              <ResponsiveText variant="body" className="text-green-300">
                Essential utilities and services that power modern web applications - from authentication to deployment.
              </ResponsiveText>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <CyberGrid cols={4} gap="md" className="mt-12">
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="green" className="text-center">
              <ResponsiveText variant="h3" className="text-green-400 font-bold">8+</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Essential Services</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="blue" className="text-center">
              <ResponsiveText variant="h3" className="text-blue-400 font-bold">5</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Categories</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="purple" className="text-center">
              <ResponsiveText variant="h3" className="text-purple-400 font-bold">99.9%</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Uptime</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="yellow" className="text-center">
              <ResponsiveText variant="h3" className="text-yellow-400 font-bold">∞</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Scalability</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>

      {/* Category Filter Section */}
      <CyberSection
        title="Service Categories"
        subtitle="Filter & Explore"
        glowColor="green"
        padding="lg"
      >
        <CyberGrid cols={5} gap="md">
          {categories.map((category) => (
            <CyberGridItem key={category.id}>
              <CyberCard
                variant={activeCategory === category.id ? "neon" : "default"}
                glowColor={category.color as any}
                interactive
                className="cursor-pointer"
                onClick={() => setActiveCategory(category.id)}
              >
                <div className="text-center p-4">
                  <category.icon className={`w-8 h-8 mx-auto mb-3 text-${category.color}-400`} />
                  <ResponsiveText variant="h6" className="text-white font-semibold mb-1">
                    {category.name}
                  </ResponsiveText>
                  <Badge variant="secondary" className="text-xs">
                    {category.count} services
                  </Badge>
                </div>
              </CyberCard>
            </CyberGridItem>
          ))}
        </CyberGrid>
      </CyberSection>

      {/* Tools Grid Section */}
      <CyberSection
        title={`${activeCategory} (${filteredTools.length})`}
        subtitle="Available Services"
        glowColor="green"
        padding="lg"
      >
        <CyberGrid cols={3} gap="lg">
          {filteredTools.map((tool) => (
            <CyberGridItem key={tool.id}>
              <CyberCard
                variant="matrix"
                title={tool.name}
                subtitle={`${tool.type} • ${tool.pricing}`}
                icon={<tool.icon className="w-6 h-6" />}
                interactive
              >
                <div className="space-y-4">
                  {/* Description */}
                  <ResponsiveText variant="body" className="text-gray-300">
                    {tool.description}
                  </ResponsiveText>

                  {/* Difficulty, Reliability & Popularity */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${getDifficultyColor(tool.difficulty)}`}>
                          {tool.difficulty}
                        </span>
                        <span className="text-xs text-gray-500">Difficulty</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${getReliabilityColor(tool.reliability)}`}>
                          {tool.reliability}
                        </span>
                        <span className="text-xs text-gray-500">Reliability</span>
                      </div>
                    </div>
                  </div>

                  {/* Popularity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Popularity</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full bg-${tool.color}-400 transition-all duration-300`}
                        style={{ width: getPopularityWidth(tool.popularity) }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{tool.popularity}%</span>
                  </div>

                  {/* Features */}
                  <div>
                    <ResponsiveText variant="caption" className="text-gray-400 font-medium mb-2">
                      Key Features:
                    </ResponsiveText>
                    <div className="flex flex-wrap gap-1">
                      {tool.features.slice(0, 3).map((feature, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {tool.features.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{tool.features.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Installation */}
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <ResponsiveText variant="caption" className="text-gray-400 font-medium">
                        Setup:
                      </ResponsiveText>
                      <EnhancedButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyInstallation(tool.installation, tool.name)}
                        className="h-6 px-2"
                      >
                        {copiedTool === tool.name ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </EnhancedButton>
                    </div>
                    <code className="text-xs text-green-400 font-mono break-all">
                      {tool.installation}
                    </code>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <EnhancedButton
                      variant="neon"
                      glowColor="green"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(tool.link, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Access
                    </EnhancedButton>
                    <EnhancedButton
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(tool.link, '_blank')}
                    >
                      <Download className="w-4 h-4" />
                    </EnhancedButton>
                  </div>
                </div>
              </CyberCard>
            </CyberGridItem>
          ))}
        </CyberGrid>
      </CyberSection>

      {/* Service Integration Guide */}
      <CyberSection
        title="Integration Guide"
        subtitle="Getting Started"
        description="Quick setup guides and best practices for integrating these essential services"
        glowColor="green"
        background="dark"
        padding="xl"
      >
        <div className="bg-gradient-to-r from-green-900/20 via-blue-900/20 to-purple-900/20 border border-green-500/30 rounded-lg p-6 mb-8">
          <div className="flex items-center gap-3 text-green-300">
            <Layers className="w-6 h-6 text-green-400" />
            <div>
              <ResponsiveText variant="h6" className="text-green-200 font-semibold mb-2">
                🚀 Production Deployment Checklist
              </ResponsiveText>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-300">Authentication (Firebase/Supabase)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-300">Deployment Platform (Vercel/Netlify)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-300">Analytics & Monitoring</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-300">Payment Processing (Stripe)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-300">Push Notifications (OneSignal)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-300">Performance Optimization</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <CyberGrid cols={2} gap="xl">
          <CyberGridItem>
            <CyberCard
              variant="matrix"
              title="Quick Start Template"
              subtitle="Ready-to-use project setup"
              icon={<Zap className="w-6 h-6" />}
            >
              <div className="space-y-4">
                <ResponsiveText variant="body" className="text-gray-300">
                  Get started with a pre-configured template that includes authentication, deployment, and essential services.
                </ResponsiveText>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <code className="text-xs text-green-400 font-mono">
                    npx create-eternyx-app my-app --template=full-stack
                  </code>
                </div>
                <EnhancedButton variant="neon" glowColor="green" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </EnhancedButton>
              </div>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard
              variant="neon"
              glowColor="blue"
              title="Service Configuration"
              subtitle="Environment setup guide"
              icon={<Settings className="w-6 h-6" />}
            >
              <div className="space-y-4">
                <ResponsiveText variant="body" className="text-gray-300">
                  Step-by-step guide to configure and integrate all essential services for your web application.
                </ResponsiveText>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-gray-300">Environment Variables</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span className="text-gray-300">API Keys & Secrets</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-gray-300">Deployment Configuration</span>
                  </div>
                </div>
                <EnhancedButton variant="neon" glowColor="blue" className="w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Guide
                </EnhancedButton>
              </div>
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>
    </div>
  );
};

export default UniversalWebAppUtilitiesEnhanced;

