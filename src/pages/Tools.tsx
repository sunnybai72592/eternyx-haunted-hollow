import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { toolCategories, Tool } from '@/data/tools';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Grid, List, PlayCircle } from 'lucide-react';

const Tools: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'tabs'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const allTools = toolCategories.flatMap(cat => cat.tools);

  const categories = [
    { id: 'all', name: 'All Tools', icon: Grid },
    ...toolCategories.map(cat => ({ id: cat.id, name: cat.name, icon: cat.icon }))
  ];

  const filteredTools = allTools.filter(tool => {
    const matchesCategory = activeCategory === 'all' || toolCategories.find(c => c.tools.some(t => t.id === tool.id))?.id === activeCategory;
    const matchesSearch = !searchQuery || 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  const handleExecuteTool = (tool: Tool) => {
    toast({
      title: "Executing Tool...",
      description: `Initializing ${tool.name}...`,
    });
    // In a real application, you would navigate to the tool's route or trigger an action.
    // For now, we just show a toast.
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 },
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary mb-4 neon-text">
            ETERNYX TOOLS ARSENAL
          </h1>
          <p className="text-xl text-muted-foreground">
            Professional-grade cybersecurity and development tools
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="mb-8 bg-card/50 border-primary/20 backdrop-blur-sm">
          <CardContent className="p-6">
            <input
              type="text"
              placeholder="Search tools by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-primary/20 rounded-lg focus:outline-none focus:border-primary/50 transition-colors"
            />
          </CardContent>
        </Card>

        {/* View Mode Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-card/50 backdrop-blur-sm border border-primary/20 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="hover-glow transition-all"
            >
              <Grid className="w-4 h-4 mr-2" />
              Unified Grid
            </Button>
            <Button
              variant={viewMode === 'tabs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tabs')}
              className="hover-glow transition-all"
            >
              <List className="w-4 h-4 mr-2" />
              Category Tabs
            </Button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
          >
            {filteredTools.map((tool) => (
              <motion.div key={tool.id} variants={itemVariants}>
                <Card className="group hover-glow gradient-border transition-all h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg bg-primary/10 ${tool.color}`}>
                        <tool.icon className="w-6 h-6" />
                      </div>
                    </div>
                    <CardTitle className="text-lg">{tool.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                  </CardHeader>
                  <CardContent>
                    <Link to={tool.route}>
                      <Button className="w-full hover-glow gradient-border group-hover:scale-105 transition-all">
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Launch Tool
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-8">
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={category.id} className="transition-all duration-300 ease-in-out">
                  <category.icon className="w-4 h-4 mr-2" />
                  <span>{category.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => (
              <TabsContent key={category.id} value={category.id} className="animate-fade-in">
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
                >
                  {filteredTools.filter(tool => category.id === 'all' || toolCategories.find(c => c.tools.some(t => t.id === tool.id))?.id === category.id).map((tool) => (
                    <motion.div key={tool.id} variants={itemVariants}>
                      <Card className="group hover-glow gradient-border transition-all h-full">
                        <CardHeader>
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-lg bg-primary/10 ${tool.color}`}>
                              <tool.icon className="w-6 h-6" />
                            </div>
                          </div>
                          <CardTitle className="text-lg">{tool.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">{tool.description}</p>
                        </CardHeader>
                        <CardContent>
                          <Link to={tool.route}>
                            <Button className="w-full hover-glow gradient-border group-hover:scale-105 transition-all">
                              <PlayCircle className="w-4 h-4 mr-2" />
                              Launch Tool
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Tools;
