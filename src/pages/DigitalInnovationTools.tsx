import React, { useState } from 'react';
import { 
  Zap, ExternalLink, Download, Copy, CheckCircle, Sparkles, 
  Brain, BarChart3, Coins, FileText, Video, Cpu, 
  TrendingUp, Palette, Code2, Layers, Atom, Rocket
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CyberCard from '@/components/ui/cyber-card';
import CyberGrid, { CyberGridItem } from '@/components/ui/cyber-grid';
import CyberSection from '@/components/ui/cyber-section';
import { ResponsiveText } from '@/components/ui/responsive-text';
import { EnhancedButton } from '@/components/ui/enhanced-button';
import ChartGenerator from '@/components/tools/ChartGenerator';
import QRCodeTool from '@/components/tools/QRCodeTool';
import { useToast } from '@/hooks/use-toast';

interface InnovationTool {
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
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  innovationLevel: 'Standard' | 'Advanced' | 'Cutting-Edge' | 'Revolutionary';
  popularity: number;
}

const DigitalInnovationToolsEnhanced = () => {
  const [activeCategory, setActiveCategory] = useState('All Tools');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);
  const { toast } = useToast();

  const categories = [
    { id: 'All Tools', name: 'All Tools', icon: Sparkles, count: 9, color: 'purple' },
    { id: 'AI & ML', name: 'AI & Machine Learning', icon: Brain, count: 2, color: 'pink' },
    { id: 'Data Visualization', name: 'Data Visualization', icon: BarChart3, count: 3, color: 'blue' },
    { id: 'Blockchain', name: 'Blockchain & Web3', icon: Coins, count: 2, color: 'yellow' },
    { id: 'Media Processing', name: 'Media Processing', icon: Video, count: 2, color: 'green' }
  ];

  const tools: InnovationTool[] = [
    {
      id: 'huggingface-api',
      name: 'Hugging Face API',
      category: 'AI & ML',
      type: 'API',
      pricing: 'Freemium',
      description: 'State-of-the-art machine learning models and datasets for NLP, computer vision, and more',
      features: ['Pre-trained models', 'Natural language processing', 'Computer vision', 'Audio processing', 'Model hosting'],
      installation: 'pip install transformers or REST API',
      link: 'https://huggingface.co/',
      icon: Brain,
      color: 'pink',
      difficulty: 'Intermediate',
      innovationLevel: 'Revolutionary',
      popularity: 97
    },
    {
      id: 'tensorflowjs',
      name: 'TensorFlow.js',
      category: 'AI & ML',
      type: 'Library',
      pricing: 'Free',
      description: 'Machine learning library for JavaScript that runs in browsers and Node.js',
      features: ['Browser ML', 'Pre-trained models', 'Custom training', 'GPU acceleration', 'Real-time inference'],
      installation: 'npm install @tensorflow/tfjs',
      link: 'https://www.tensorflow.org/js',
      icon: Cpu,
      color: 'pink',
      difficulty: 'Advanced',
      innovationLevel: 'Cutting-Edge',
      popularity: 94
    },
    {
      id: 'chartjs',
      name: 'Chart.js',
      category: 'Data Visualization',
      type: 'Library',
      pricing: 'Free',
      description: 'Simple yet flexible JavaScript charting library for designers and developers',
      features: ['8 chart types', 'Responsive design', 'Animation', 'Plugins', 'Canvas rendering'],
      installation: 'npm install chart.js',
      link: 'https://www.chartjs.org/',
      icon: BarChart3,
      color: 'blue',
      difficulty: 'Beginner',
      innovationLevel: 'Standard',
      popularity: 92
    },
    {
      id: 'recharts',
      name: 'Recharts',
      category: 'Data Visualization',
      type: 'Library',
      pricing: 'Free',
      description: 'Composable charting library built on React components and D3.js',
      features: ['React components', 'Responsive charts', 'Customizable', 'SVG rendering', 'Animation support'],
      installation: 'npm install recharts',
      link: 'https://recharts.org/',
      icon: TrendingUp,
      color: 'blue',
      difficulty: 'Intermediate',
      innovationLevel: 'Advanced',
      popularity: 89
    },
    {
      id: 'd3js',
      name: 'D3.js',
      category: 'Data Visualization',
      type: 'Library',
      pricing: 'Free',
      description: 'Data-driven documents library for creating dynamic, interactive data visualizations',
      features: ['Data binding', 'DOM manipulation', 'SVG/Canvas', 'Animations', 'Geo projections'],
      installation: 'npm install d3 or CDN',
      link: 'https://d3js.org/',
      icon: Atom,
      color: 'blue',
      difficulty: 'Expert',
      innovationLevel: 'Revolutionary',
      popularity: 96
    },
    {
      id: 'web3js',
      name: 'Web3.js',
      category: 'Blockchain',
      type: 'Library',
      pricing: 'Free',
      description: 'Ethereum JavaScript API for interacting with the Ethereum blockchain',
      features: ['Ethereum integration', 'Smart contracts', 'Wallet connection', 'Transaction handling', 'Event listening'],
      installation: 'npm install web3',
      link: 'https://web3js.readthedocs.io/',
      icon: Coins,
      color: 'yellow',
      difficulty: 'Advanced',
      innovationLevel: 'Cutting-Edge',
      popularity: 88
    },
    {
      id: 'coingecko-api',
      name: 'CoinGecko API',
      category: 'Blockchain',
      type: 'API',
      pricing: 'Freemium',
      description: 'Comprehensive cryptocurrency data API with market data, prices, and analytics',
      features: ['Price data', 'Market analytics', 'Historical data', 'Exchange info', 'DeFi protocols'],
      installation: 'REST API - No installation required',
      link: 'https://www.coingecko.com/en/api',
      icon: TrendingUp,
      color: 'yellow',
      difficulty: 'Beginner',
      innovationLevel: 'Standard',
      popularity: 91
    },
    {
      id: 'pdfjs',
      name: 'PDF.js',
      category: 'Media Processing',
      type: 'Library',
      pricing: 'Free',
      description: 'JavaScript PDF viewer and parser that works in modern browsers',
      features: ['PDF rendering', 'Text extraction', 'Annotation support', 'Form handling', 'Print support'],
      installation: 'npm install pdfjs-dist',
      link: 'https://mozilla.github.io/pdf.js/',
      icon: FileText,
      color: 'green',
      difficulty: 'Intermediate',
      innovationLevel: 'Advanced',
      popularity: 93
    },
    {
      id: 'ffmpeg-wasm',
      name: 'FFmpeg.wasm',
      category: 'Media Processing',
      type: 'Library',
      pricing: 'Free',
      description: 'WebAssembly port of FFmpeg for browser-based video/audio processing',
      features: ['Video processing', 'Audio conversion', 'Format support', 'Browser-based', 'No server required'],
      installation: 'npm install @ffmpeg/ffmpeg',
      link: 'https://ffmpegwasm.netlify.app/',
      icon: Video,
      color: 'green',
      difficulty: 'Advanced',
      innovationLevel: 'Revolutionary',
      popularity: 85
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
      case 'Expert': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getInnovationLevelColor = (level: string) => {
    switch (level) {
      case 'Standard': return 'text-blue-400';
      case 'Advanced': return 'text-purple-400';
      case 'Cutting-Edge': return 'text-pink-400';
      case 'Revolutionary': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getPopularityWidth = (popularity: number) => {
    return `${popularity}%`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-black to-pink-900/20">
      {/* Hero Section */}
      <CyberSection
        variant="hero"
        title="Digital Innovation Tools"
        subtitle="Innovation Arsenal"
        description="Cutting-edge technologies for AI, blockchain, data visualization, and digital transformation"
        icon={<Sparkles className="w-16 h-16" />}
        glowColor="purple"
        background="gradient"
        className="min-h-[60vh]"
      >
        {/* Innovation Banner */}
        <div className="bg-gradient-to-r from-purple-900/30 via-pink-900/30 to-blue-900/30 border border-purple-500/50 rounded-lg p-6 mb-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-purple-300">
            <Rocket className="w-6 h-6 text-purple-400" />
            <div>
              <ResponsiveText variant="h6" className="text-purple-200 font-semibold mb-1">
                🚀 Future-Ready Technologies
              </ResponsiveText>
              <ResponsiveText variant="body" className="text-purple-300">
                Explore revolutionary tools that are shaping the future of digital innovation and technology.
              </ResponsiveText>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <CyberGrid cols={4} gap="md" className="mt-12">
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="purple" className="text-center">
              <ResponsiveText variant="h3" className="text-purple-400 font-bold">9+</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Innovation Tools</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="pink" className="text-center">
              <ResponsiveText variant="h3" className="text-pink-400 font-bold">5</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Categories</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="blue" className="text-center">
              <ResponsiveText variant="h3" className="text-blue-400 font-bold">97%</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Cutting-Edge</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard variant="neon" glowColor="green" className="text-center">
              <ResponsiveText variant="h3" className="text-green-400 font-bold">∞</ResponsiveText>
              <ResponsiveText variant="caption" className="text-gray-300">Possibilities</ResponsiveText>
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>

      {/* Category Filter Section */}
      <CyberSection
        title="Innovation Categories"
        subtitle="Filter & Explore"
        glowColor="purple"
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
        glowColor="purple"
        padding="lg"
      >
        <CyberGrid cols={3} gap="lg">
          {filteredTools.map((tool) => (
            <CyberGridItem key={tool.id}>
              <CyberCard
                variant="hologram"
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

                  {/* Difficulty, Innovation Level & Popularity */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${getDifficultyColor(tool.difficulty)}`}>
                          {tool.difficulty}
                        </span>
                        <span className="text-xs text-gray-500">Difficulty</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${getInnovationLevelColor(tool.innovationLevel)}`}>
                          {tool.innovationLevel}
                        </span>
                        <span className="text-xs text-gray-500">Innovation</span>
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
                      variant="hologram"
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

      {/* Interactive Innovation Tools Section */}
      <CyberSection
        title="Interactive Innovation Tools"
        subtitle="Embedded Tools"
        description="Fully functional innovation tools for data visualization, QR generation, and digital transformation"
        glowColor="purple"
        background="dark"
        padding="xl"
      >
        <div className="bg-gradient-to-r from-purple-900/20 via-pink-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 text-purple-400">
            <Rocket className="w-5 h-5" />
            <ResponsiveText variant="caption" className="font-medium">
              Innovation Lab: Experiment with cutting-edge technologies and create amazing digital experiences.
            </ResponsiveText>
          </div>
        </div>

        <CyberGrid cols={2} gap="xl">
          <CyberGridItem>
            <CyberCard
              variant="hologram"
              title="Interactive Chart Generator"
              subtitle="Data visualization and analytics"
              icon={<BarChart3 className="w-6 h-6" />}
            >
              <ChartGenerator />
            </CyberCard>
          </CyberGridItem>
          <CyberGridItem>
            <CyberCard
              variant="neon"
              glowColor="green"
              title="QR Code Generator & Reader"
              subtitle="Digital connectivity and sharing"
              icon={<Code2 className="w-6 h-6" />}
            >
              <QRCodeTool />
            </CyberCard>
          </CyberGridItem>
        </CyberGrid>
      </CyberSection>
    </div>
  );
};

export default DigitalInnovationToolsEnhanced;

