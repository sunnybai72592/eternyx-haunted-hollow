import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Code, FileCode, GitBranch, Palette, Monitor, Globe, 
  Package, Layers, Zap, ExternalLink, Download, Play
} from 'lucide-react';

interface WebDevTool {
  id: string;
  name: string;
  description: string;
  type: 'Library' | 'Plugin' | 'API' | 'Service' | 'Embed' | 'Framework' | 'Tool';
  category: 'Editor' | 'Version Control' | 'Development' | 'UI Framework' | 'Integration';
  icon: React.ReactNode;
  features: string[];
  link?: string;
  documentation?: string;
  installation?: string;
}

const webDevTools: WebDevTool[] = [
  {
    id: 'monaco-editor',
    name: 'Monaco Editor',
    description: 'The code editor that powers VS Code - feature-rich JavaScript-based editor',
    type: 'Library',
    category: 'Editor',
    icon: React.createElement(Code),
    features: ['Syntax highlighting', 'IntelliSense', 'Multi-cursor editing', 'Minimap', 'Find/Replace'],
    link: 'https://microsoft.github.io/monaco-editor/',
    documentation: 'https://microsoft.github.io/monaco-editor/docs.html',
    installation: 'npm install monaco-editor'
  },
  {
    id: 'ace-editor',
    name: 'Ace Editor',
    description: 'High performance code editor for the web with syntax highlighting',
    type: 'Library',
    category: 'Editor',
    icon: React.createElement(FileCode),
    features: ['120+ languages', 'Themes', 'Auto-completion', 'Code folding', 'Search & replace'],
    link: 'https://ace.c9.io/',
    documentation: 'https://ace.c9.io/#nav=howto',
    installation: 'npm install ace-builds'
  },
  {
    id: 'github-api',
    name: 'GitHub API',
    description: 'REST API for GitHub integration and repository management',
    type: 'API',
    category: 'Version Control',
    icon: React.createElement(GitBranch),
    features: ['Repository management', 'Issue tracking', 'Pull requests', 'User management', 'Webhooks'],
    link: 'https://docs.github.com/en/rest',
    documentation: 'https://docs.github.com/en/rest/guides',
    installation: 'REST API - No installation required'
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Self-hosted Git service with API for custom Git hosting solutions',
    type: 'Service',
    category: 'Version Control',
    icon: React.createElement(GitBranch),
    features: ['Self-hosted', 'Lightweight', 'API access', 'Issue tracking', 'Wiki support'],
    link: 'https://gitea.io/',
    documentation: 'https://docs.gitea.io/',
    installation: 'Docker or binary installation'
  },
  {
    id: 'browsersync',
    name: 'BrowserSync',
    description: 'Live reloading and browser synchronization tool for development',
    type: 'Tool',
    category: 'Development',
    icon: React.createElement(Monitor),
    features: ['Live reload', 'Cross-device sync', 'Network throttling', 'UI for controls', 'HTTPS support'],
    link: 'https://browsersync.io/',
    documentation: 'https://browsersync.io/docs',
    installation: 'npm install -g browser-sync'
  },
  {
    id: 'jsfiddle-embed',
    name: 'JSFiddle Embed',
    description: 'Embed interactive code snippets and demos in your applications',
    type: 'Embed',
    category: 'Integration',
    icon: React.createElement(Play),
    features: ['Live code editing', 'Multiple frameworks', 'Shareable links', 'Embed anywhere', 'Collaboration'],
    link: 'https://jsfiddle.net/',
    documentation: 'https://docs.jsfiddle.net/',
    installation: 'Embed code - No installation required'
  },
  {
    id: 'codesandbox-embed',
    name: 'CodeSandbox Embed',
    description: 'Embed full development environments in your web applications',
    type: 'Embed',
    category: 'Integration',
    icon: React.createElement(Package),
    features: ['Full IDE experience', 'NPM packages', 'Hot reloading', 'Collaboration', 'Templates'],
    link: 'https://codesandbox.io/',
    documentation: 'https://codesandbox.io/docs',
    installation: 'Embed code - No installation required'
  },
  {
    id: 'tailwindui-free',
    name: 'TailwindUI Free',
    description: 'Free UI components built with Tailwind CSS',
    type: 'Library',
    category: 'UI Framework',
    icon: React.createElement(Palette),
    features: ['Pre-built components', 'Responsive design', 'Copy-paste ready', 'Tailwind CSS', 'Accessibility'],
    link: 'https://tailwindui.com/components',
    documentation: 'https://tailwindcss.com/docs',
    installation: 'npm install tailwindcss'
  },
  {
    id: 'flowbite',
    name: 'Flowbite',
    description: 'Component library built on Tailwind CSS with interactive elements',
    type: 'Library',
    category: 'UI Framework',
    icon: React.createElement(Layers),
    features: ['50+ components', 'React/Vue/Angular', 'Dark mode', 'Interactive elements', 'Figma design'],
    link: 'https://flowbite.com/',
    documentation: 'https://flowbite.com/docs',
    installation: 'npm install flowbite'
  },
  {
    id: 'shadcn-ui',
    name: 'ShadCN/UI',
    description: 'Beautifully designed components built with Radix UI and Tailwind CSS',
    type: 'Library',
    category: 'UI Framework',
    icon: React.createElement(Zap),
    features: ['Radix UI primitives', 'Customizable', 'Accessible', 'TypeScript', 'Copy-paste components'],
    link: 'https://ui.shadcn.com/',
    documentation: 'https://ui.shadcn.com/docs',
    installation: 'npx shadcn-ui@latest init'
  },
  {
    id: 'bootstrap',
    name: 'Bootstrap',
    description: 'The world\'s most popular CSS framework for responsive web development',
    type: 'Framework',
    category: 'UI Framework',
    icon: React.createElement(Globe),
    features: ['Responsive grid', 'Pre-built components', 'JavaScript plugins', 'Sass variables', 'Extensive docs'],
    link: 'https://getbootstrap.com/',
    documentation: 'https://getbootstrap.com/docs',
    installation: 'npm install bootstrap'
  }
];

const WebDevelopmentTools = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { toast } = useToast();

  const categories = [
    { id: 'all', name: 'All Tools', icon: <Package className="w-4 h-4" /> },
    { id: 'Editor', name: 'Code Editors', icon: <Code className="w-4 h-4" /> },
    { id: 'Version Control', name: 'Version Control', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'Development', name: 'Development Tools', icon: <Monitor className="w-4 h-4" /> },
    { id: 'UI Framework', name: 'UI Frameworks', icon: <Palette className="w-4 h-4" /> },
    { id: 'Integration', name: 'Integrations', icon: <Layers className="w-4 h-4" /> }
  ];

  const filteredTools = selectedCategory === 'all' 
    ? webDevTools 
    : webDevTools.filter(tool => tool.category === selectedCategory);

  const handleToolAction = (tool: WebDevTool) => {
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
      'Library': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Plugin': 'bg-green-500/20 text-green-400 border-green-500/30',
      'API': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Service': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'Embed': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'Framework': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'Tool': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-4">
            Web Development Tools
          </h1>
          <p className="text-gray-300 text-lg">
            Essential tools, libraries, and frameworks for modern web development
          </p>
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-8">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-gray-900/50 border border-cyan-500/30">
            {categories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="flex items-center gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
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
            <Card key={tool.id} className="bg-gray-900/50 border-cyan-500/30 hover:border-cyan-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/20 rounded-lg text-cyan-400">
                      {tool.icon}
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">{tool.name}</CardTitle>
                      <Badge className={`mt-1 ${getTypeColor(tool.type)}`}>
                        {tool.type}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">{tool.description}</p>
                
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-cyan-400 mb-2">Key Features:</h4>
                  <ul className="text-sm text-gray-300 space-y-1">
                    {tool.features.slice(0, 3).map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
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
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                  {tool.documentation && (
                    <Button
                      onClick={() => window.open(tool.documentation, '_blank')}
                      variant="outline"
                      className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
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

export default WebDevelopmentTools;

