import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Brain, BarChart, Coins, FileText, Video, 
  Zap, ExternalLink, FileCode, TrendingUp, Cpu
} from 'lucide-react';

interface InnovationTool {
  id: string;
  name: string;
  description: string;
  type: 'API' | 'Library' | 'Service';
  category: 'AI/ML' | 'Data Visualization' | 'Blockchain' | 'Media Processing' | 'Analytics';
  icon: React.ReactNode;
  features: string[];
  link?: string;
  documentation?: string;
  installation?: string;
  pricing: 'Free' | 'Freemium' | 'Paid';
}

const innovationTools: InnovationTool[] = [
  {
    id: 'huggingface-api',
    name: 'Hugging Face API',
    description: 'Access thousands of pre-trained AI models for NLP, computer vision, and more',
    type: 'API',
    category: 'AI/ML',
    icon: React.createElement(Brain),
    features: ['Pre-trained models', 'NLP tasks', 'Computer vision', 'Audio processing', 'Model hosting'],
    link: 'https://huggingface.co/',
    documentation: 'https://huggingface.co/docs',
    installation: 'pip install transformers',
    pricing: 'Freemium'
  },
  {
    id: 'tensorflowjs',
    name: 'TensorFlow.js',
    description: 'Machine learning library for JavaScript - run ML models in the browser',
    type: 'Library',
    category: 'AI/ML',
    icon: React.createElement(Cpu),
    features: ['Browser ML', 'Pre-trained models', 'Custom training', 'Node.js support', 'GPU acceleration'],
    link: 'https://www.tensorflow.org/js',
    documentation: 'https://www.tensorflow.org/js/guide',
    installation: 'npm install @tensorflow/tfjs',
    pricing: 'Free'
  },
  {
    id: 'chartjs',
    name: 'Chart.js',
    description: 'Simple yet flexible JavaScript charting library for responsive charts',
    type: 'Library',
    category: 'Data Visualization',
    icon: React.createElement(BarChart),
    features: ['8 chart types', 'Responsive design', 'Animation', 'Plugins', 'Canvas rendering'],
    link: 'https://www.chartjs.org/',
    documentation: 'https://www.chartjs.org/docs/',
    installation: 'npm install chart.js',
    pricing: 'Free'
  },
  {
    id: 'recharts',
    name: 'Recharts',
    description: 'Composable charting library built on React components and D3',
    type: 'Library',
    category: 'Data Visualization',
    icon: React.createElement(TrendingUp),
    features: ['React components', 'Responsive charts', 'Composable', 'SVG rendering', 'Animation support'],
    link: 'https://recharts.org/',
    documentation: 'https://recharts.org/en-US/guide',
    installation: 'npm install recharts',
    pricing: 'Free'
  },
  {
    id: 'd3js',
    name: 'D3.js',
    description: 'Data-driven documents library for creating dynamic, interactive data visualizations',
    type: 'Library',
    category: 'Data Visualization',
    icon: React.createElement(Zap),
    features: ['Data binding', 'DOM manipulation', 'SVG/Canvas', 'Animations', 'Extensive ecosystem'],
    link: 'https://d3js.org/',
    documentation: 'https://github.com/d3/d3/wiki',
    installation: 'npm install d3',
    pricing: 'Free'
  },
  {
    id: 'web3js',
    name: 'Web3.js',
    description: 'Ethereum JavaScript API for interacting with blockchain networks',
    type: 'Library',
    category: 'Blockchain',
    icon: React.createElement(Coins),
    features: ['Ethereum interaction', 'Smart contracts', 'Wallet integration', 'Transaction handling', 'Event listening'],
    link: 'https://web3js.readthedocs.io/',
    documentation: 'https://web3js.readthedocs.io/en/v1.10.0/',
    installation: 'npm install web3',
    pricing: 'Free'
  },
  {
    id: 'coingecko-api',
    name: 'CoinGecko API',
    description: 'Comprehensive cryptocurrency data API with market information',
    type: 'API',
    category: 'Blockchain',
    icon: React.createElement(Coins),
    features: ['Price data', 'Market cap', 'Trading volume', 'Historical data', 'Exchange info'],
    link: 'https://www.coingecko.com/en/api',
    documentation: 'https://www.coingecko.com/en/api/documentation',
    installation: 'REST API - No installation required',
    pricing: 'Freemium'
  },
  {
    id: 'pdfjs',
    name: 'PDF.js',
    description: 'JavaScript PDF viewer and parser built by Mozilla',
    type: 'Library',
    category: 'Media Processing',
    icon: React.createElement(FileText),
    features: ['PDF rendering', 'Text extraction', 'Annotation support', 'Cross-platform', 'No plugins required'],
    link: 'https://mozilla.github.io/pdf.js/',
    documentation: 'https://github.com/mozilla/pdf.js/wiki',
    installation: 'npm install pdfjs-dist',
    pricing: 'Free'
  },
  {
    id: 'ffmpeg-wasm',
    name: 'FFmpeg.wasm',
    description: 'WebAssembly port of FFmpeg for browser-based video/audio processing',
    type: 'Library',
    category: 'Media Processing',
    icon: React.createElement(Video),
    features: ['Video processing', 'Audio conversion', 'Format support', 'Browser-based', 'No server required'],
    link: 'https://ffmpegwasm.netlify.app/',
    documentation: 'https://github.com/ffmpegwasm/ffmpeg.wasm',
    installation: 'npm install @ffmpeg/ffmpeg @ffmpeg/core',
    pricing: 'Free'
  }
];

const DigitalInnovationTools = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { toast } = useToast();

  const categories = [
    { id: 'all', name: 'All Tools', icon: <Zap className="w-4 h-4" /> },
    { id: 'AI/ML', name: 'AI/ML', icon: <Brain className="w-4 h-4" /> },
    { id: 'Data Visualization', name: 'Data Viz', icon: <BarChart className="w-4 h-4" /> },
    { id: 'Blockchain', name: 'Blockchain', icon: <Coins className="w-4 h-4" /> },
    { id: 'Media Processing', name: 'Media', icon: <Video className="w-4 h-4" /> }
  ];

  const filteredTools = selectedCategory === 'all' 
    ? innovationTools 
    : innovationTools.filter(tool => tool.category === selectedCategory);

  const handleToolAction = (tool: InnovationTool) => {
    if (tool.link) {
      window.open(tool.link, '_blank');
    }
    toast({
      title: `${tool.name} Accessed`,
      description: `Opening ${tool.name} documentation and resources`,
    });
  };

  const getTypeColor = (type: string) => {
    const colors = {
      'API': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Library': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Service': 'bg-green-500/20 text-green-400 border-green-500/30'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getPricingColor = (pricing: string) => {
    const colors = {
      'Free': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Freemium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Paid': 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[pricing as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-4">
            Digital Innovation Tools
          </h1>
          <p className="text-gray-300 text-lg">
            Cutting-edge APIs and libraries for AI, blockchain, data visualization, and media processing
          </p>
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-8">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 bg-gray-900/50 border border-purple-500/30">
            {categories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
              >
                {category.icon}
                <span className="hidden sm:inline">{category.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTools.map((tool) => (
            <Card key={tool.id} className="bg-gray-900/50 border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                      {tool.icon}
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">{tool.name}</CardTitle>
                      <div className="flex gap-2 mt-1">
                        <Badge className={getTypeColor(tool.type)}>
                          {tool.type}
                        </Badge>
                        <Badge className={getPricingColor(tool.pricing)}>
                          {tool.pricing}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">{tool.description}</p>
                
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-purple-400 mb-2">Key Features:</h4>
                  <ul className="text-sm text-gray-300 space-y-1">
                    {tool.features.slice(0, 3).map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-purple-400 rounded-full"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {tool.installation && (
                  <div className="mb-4 p-2 bg-black/50 rounded border border-gray-700">
                    <p className="text-xs text-gray-400 mb-1">Installation:</p>
                    <code className="text-xs text-green-400 font-mono">{tool.installation}</code>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleToolAction(tool)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Explore
                  </Button>
                  {tool.documentation && (
                    <Button
                      onClick={() => window.open(tool.documentation, '_blank')}
                      variant="outline"
                      className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                    >
                      <FileCode className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTools.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No tools found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DigitalInnovationTools;

