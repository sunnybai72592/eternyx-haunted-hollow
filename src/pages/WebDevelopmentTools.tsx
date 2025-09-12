import React, { useState } from 'react';
import { 
  Code, ExternalLink, Download, Copy, CheckCircle, Wrench, Zap, Globe, 
  Database, Palette, Layout, Terminal, Layers, Smartphone, FileCode, 
  GitBranch, Monitor, Package, Play, Settings, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CyberCard from '@/components/ui/cyber-card';
import CyberGrid, { CyberGridItem } from '@/components/ui/cyber-grid';
import CyberSection from '@/components/ui/cyber-section';
import { ResponsiveText } from '@/components/ui/responsive-text';
import { EnhancedButton } from '@/components/ui/enhanced-button';
import SimpleCodeEditor from '@/components/tools/SimpleCodeEditor';
import APITester from '@/components/tools/APITester';
import { useToast } from '@/hooks/use-toast';

interface Tool {
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
  popularity: number;
}

const WebDevelopmentToolsEnhanced = () => {
  const [activeCategory, setActiveCategory] = useState('All Tools');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);
  const { toast } = useToast();

  const categories = [
    { id: 'All Tools', name: 'All Tools', icon: Wrench, count: 11, color: 'cyan' },
    { id: 'Editors', name: 'Code Editors', icon: Code, count: 2, color: 'blue' },
    { id: 'APIs', name: 'APIs & Services', icon: Database, count: 3, color: 'green' },
    { id: 'UI/UX', name: 'UI Libraries', icon: Palette, count: 4, color: 'purple' },
    { id: 'Tools', name: 'Dev Tools', icon: Terminal, count: 2, color: 'orange' }
  ];

  const tools: Tool[] = [
    {
      id: 'monaco-editor',
      name: 'Monaco Editor',
      category: 'Editors',
      type: 'Library',
      pricing: 'Free',
      description: 'The code editor that powers VS Code - feature-rich JavaScript-based editor',
      features: ['Syntax highlighting', 'IntelliSense', 'Multi-cursor editing', 'Minimap', 'Find/Replace'],
      installation: 'npm install monaco-editor',
      link: 'https://microsoft.github.io/monaco-editor/',
      icon: Code,
      color: 'blue',
      difficulty: 'Intermediate',
      popularity: 95
    },
    {
      id: 'ace-editor',
      name: 'Ace Editor',
      category: 'Editors',
      type: 'Library',
      pricing: 'Free',
      description: 'High performance code editor for the web with syntax highlighting',
      features: ['120+ languages', 'Themes', 'Auto-completion', 'Code folding', 'Search & replace'],
      installation: 'npm install ace-builds',
      link: 'https://ace.c9.io/',
      icon: FileCode,
      color: 'blue',
      difficulty: 'Beginner',
      popularity: 88
    },
    {
      id: 'github-api',
      name: 'GitHub API',
      category: 'APIs',
      type: 'API',
      pricing: 'Freemium',
      description: 'Comprehensive REST API for GitHub integration and repository management',
      features: ['Repository management', 'User authentication', 'Issue tracking', 'Pull requests', 'Webhooks'],
      installation: 'REST API - No installation required',
      link: 'https://docs.github.com/en/rest',
      icon: GitBranch,
      color: 'green',
      difficulty: 'Intermediate',
      popularity: 92
    },
    {
      id: 'gitea',
      name: 'Gitea',
      category: 'APIs',
      type: 'Service',
      pricing: 'Free',
      description: 'Self-hosted Git service with API for custom integrations',
      features: ['Self-hosted', 'Git repositories', 'Issue tracking', 'Wiki', 'API access'],
      installation: 'Docker or binary installation',
      link: 'https://gitea.io/',
      icon: Database,
      color: 'green',
      difficulty: 'Advanced',
      popularity: 75
    },
    {
      id: 'browsersync',
      name: 'BrowserSync',
      category: 'Tools',
      type: 'Tool',
      pricing: 'Free',
      description: 'Live reloading and browser synchronization for development',
      features: ['Live reload', 'Cross-device sync', 'Network throttling', 'UI interface', 'CSS injection'],
      installation: 'npm install -g browser-sync',
      link: 'https://browsersync.io/',
      icon: Monitor,
      color: 'orange',
      difficulty: 'Beginner',
      popularity: 85
    },
    {
      id: 'jsfiddle',
      name: 'JSFiddle Embed',
      category: 'Tools',
      type: 'Embed',
      pricing: 'Freemium',
      description: 'Online code playground with embedding capabilities',
      features: ['Live preview', 'Multiple frameworks', 'Sharing', 'Embedding', 'Collaboration'],
      installation: 'Embed code snippet',
      link: 'https://jsfiddle.net/',
      icon: Play,
      color: 'orange',
      difficulty: 'Beginner',
      popularity: 80
    },
    {
      id: 'codesandbox',
      name: 'CodeSandbox Embed',
      category: 'Tools',
      type: 'Embed',
      pricing: 'Freemium',
      description: 'Online IDE with powerful embedding and sharing features',
      features: ['Full IDE', 'NPM packages', 'Hot reloading', 'Collaboration', 'Deployment'],
      installation: 'Embed iframe',
      link: 'https://codesandbox.io/',
      icon: Layers,
      color: 'orange',
      difficulty: 'Intermediate',
      popularity: 90
    },
    {
      id: 'tailwindui',
      name: 'TailwindUI Free',
      category: 'UI/UX',
      type: 'Library',
      pricing: 'Freemium',
      description: 'Beautiful UI components built with Tailwind CSS',
      features: ['Pre-built components', 'Responsive design', 'Accessibility', 'Copy-paste ready', 'React/Vue/HTML'],
      installation: 'Copy component code',
      link: 'https://tailwindui.com/components',
      icon: Palette,
      color: 'purple',
      difficulty: 'Beginner',
      popularity: 93
    },
    {
      id: 'flowbite',
      name: 'Flowbite',
      category: 'UI/UX',
      type: 'Library',
      pricing: 'Freemium',
      description: 'Component library built on Tailwind CSS with interactive elements',
      features: ['40+ components', 'Dark mode', 'Interactive JS', 'Multiple frameworks', 'Figma design'],
      installation: 'npm install flowbite',
      link: 'https://flowbite.com/',
      icon: Layout,
      color: 'purple',
      difficulty: 'Beginner',
      popularity: 87
    },
    {
      id: 'shadcn-ui',
      name: 'ShadCN/UI',
      category: 'UI/UX',
      type: 'Library',
      pricing: 'Free',
      description: 'Beautifully designed components built with Radix UI and Tailwind CSS',
      features: ['Copy & paste', 'Customizable', 'Accessible', 'TypeScript', 'Radix primitives'],
      installation: 'npx shadcn-ui@latest init',
      link: 'https://ui.shadcn.com/',
      icon: Zap,
      color: 'purple',
      difficulty: 'Intermediate',
      popularity: 96
    },
    {
      id: 'bootstrap',
      name: 'Bootstrap',
      category: 'UI/UX',
      type: 'Framework',
      pricing: 'Free',
      description: 'Popular CSS framework for responsive, mobile-first web development',
      features: ['Grid system', 'Components', 'Utilities', 'JavaScript plugins', 'Theming'],
      installation: 'npm install bootstrap',
      link: 'https://getbootstrap.com/',
      icon: Globe,
      color: 'purple',
      difficulty: 'Beginner',
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
      case 'Advanced': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getPopularityWidth = (popularity: number) => {
    return `${popularity}%`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Hero Section */}
      <CyberSection
        variant="hero"
        title="Web Development Tools"
        subtitle="Development Arsenal"
        description="Professional development tools and libraries - Build faster, code smarter, deploy better"
        icon={<Code className="w-16 h-16" />}
        glowColor="cyan"
        background="gradient"
        className="min-h-[60vh]"
      >
        {/* Stats Cards */}
        <CyberGrid cols={4} gap="md" className="mt-12">
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="cyan" className="text-center">
              <ResponsiveText variant="h3" className="text-cyan-400 font-bold">11+</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Tools & Libraries</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="blue" className="text-center">
              <ResponsiveText variant="h3" className="text-blue-400 font-bold">5</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Categories</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="green" className="text-center">
              <ResponsiveText variant="h3" className="text-green-400 font-bold">100%</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Free & Open Source</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="purple" className="text-center">
              <ResponsiveText variant="h3" className="text-purple-400 font-bold">24/7</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Available</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>

      {/* Category Filter Section */}
      <CyberSection
        title="Tool Categories"
        subtitle="Filter & Explore"
        glowColor="cyan"
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
                    {category.count} tools
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
        subtitle="Available Tools"
        glowColor="cyan"
        padding="lg"
      >
        <CyberGrid cols={3} gap="lg">
          {filteredTools.map((tool) => (
            <CyberGridItem key={tool.id}>
              <CyberCard
                variant="neon"
                glowColor={tool.color as any}
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

                  {/* Difficulty & Popularity */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className={`text-sm font-medium ${getDifficultyColor(tool.difficulty)}`}>
                        {tool.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Popularity</span>
                      <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full bg-${tool.color}-400 transition-all duration-300`}
                          style={{ width: getPopularityWidth(tool.popularity) }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{tool.popularity}%</span>
                    </div>
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
                        Installation:
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
                      variant="cyber"
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

      {/* Interactive Tools Section */}
      <CyberSection
        title="Interactive Development Tools"
        subtitle="Embedded Tools"
        description="Fully functional development tools for testing, analysis, and education"
        glowColor="cyan"
        background="dark"
        padding="xl"
      >
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 text-red-400">
            <Shield className="w-5 h-5" />
            <ResponsiveText variant="caption" className="font-medium">
              Professional Use Only: These tools are for authorized development and educational purposes only.
            </ResponsiveText>
          </div>
        </div>

        <CyberGrid cols={2} gap="xl">
          <CyberGridItem>
            <CyberCard
              variant="neon"
              glowColor="cyan"
              title="Interactive Code Editor"
              subtitle="Real-time JavaScript execution"
              icon={<Code className="w-6 h-6" />}
            >
              <SimpleCodeEditor />
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard
              variant="neon"
              glowColor="green"
              title="API Testing Tool"
              subtitle="Live HTTP request testing"
              icon={<Database className="w-6 h-6" />}
            >
              <APITester />
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>
    </div>
  );
};

export default WebDevelopmentToolsEnhanced;

