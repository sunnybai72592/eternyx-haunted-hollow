import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ToolCard from './ToolCard';
import { Tool } from '@/lib/tools';
import { useToast } from '@/hooks/use-toast';
import { 
  Layers, 
  Shield, 
  Target, 
  Code, 
  Server, 
  Brain,
  Search,
  X
} from 'lucide-react';

interface ToolsGridProps {
  tools: Tool[];
  runningScans: { [key: string]: number };
  onExecuteTool: (toolId: string) => void;
}

export const ToolsGrid: React.FC<ToolsGridProps> = ({ tools, runningScans, onExecuteTool }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTier, setSelectedTier] = useState("all");
  const [targetInput, setTargetInput] = useState<{ [key: string]: string }>({}); // State for target input per tool
  const { toast } = useToast();

  const categories = [
    { id: 'all', name: 'All Tools', icon: <Layers className="w-4 h-4" /> },
    { id: 'cybersecurity', name: 'Cybersecurity', icon: <Shield className="w-4 h-4" /> },
    { id: 'penetration', name: 'Penetration Testing', icon: <Target className="w-4 h-4" /> },
    { id: 'development', name: 'Development', icon: <Code className="w-4 h-4" /> },
    { id: 'infrastructure', name: 'Infrastructure', icon: <Server className="w-4 h-4" /> },
    { id: 'innovation', name: 'Innovation', icon: <Brain className="w-4 h-4" /> }
  ];

  const tiers = [
    { id: 'all', name: 'All Tiers' },
    { id: 'free', name: 'Free' },
    { id: 'premium', name: 'Premium' },
    { id: 'elite', name: 'Elite' }
  ];

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.features.some(feature => feature.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesTier = selectedTier === 'all' || tool.tier === selectedTier;
    
    return matchesSearch && matchesCategory && matchesTier;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedTier('all');
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Bar */}
      <div className="bg-card/50 backdrop-blur-sm border border-primary/20 rounded-lg p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search tools, features, or descriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-background/50 border-primary/30 focus:border-primary/60 transition-all"
            />
          </div>
          
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
                className="hover-glow transition-all"
              >
                {category.icon}
                <span className="ml-1 hidden sm:inline">{category.name}</span>
              </Button>
            ))}
          </div>
          
          {/* Tier Filter */}
          <div className="flex flex-wrap gap-2">
            {tiers.map((tier) => (
              <Button
                key={tier.id}
                variant={selectedTier === tier.id ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSelectedTier(tier.id)}
                className="hover-glow transition-all"
              >
                {tier.name}
              </Button>
            ))}
          </div>
          
          {/* Clear Filters */}
          {(searchTerm || selectedCategory !== 'all' || selectedTier !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="hover:bg-destructive/20 hover:text-destructive transition-all"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        
        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          Showing {filteredTools.length} of {tools.length} tools
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTools.map((tool, index) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            runningScans={runningScans}
            onExecuteTool={onExecuteTool}
            className="animate-fade-in"
          />
        ))}
      </div>

      {/* No Results */}
      {filteredTools.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl text-muted-foreground mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-primary mb-2">No tools found</h3>
          <p className="text-muted-foreground mb-4">
            Try adjusting your search terms or filters
          </p>
          <Button onClick={clearFilters} variant="outline" className="hover-glow">
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
};

