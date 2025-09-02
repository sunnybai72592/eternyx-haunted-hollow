import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToolCard } from './ToolCard';
import { CyberTool } from '@/data/cybersecurityTools';
import {
  Shield, Target, Code, Server, Brain, Layers,
  Search, Filter, X, Grid, List
} from 'lucide-react';

interface EnhancedToolsGridProps {
  tools: CyberTool[];
  className?: string;
}

export const EnhancedToolsGrid: React.FC<EnhancedToolsGridProps> = ({ 
  tools, 
  className = "" 
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTier, setSelectedTier] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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

  const difficulties = [
    { id: 'all', name: 'All Levels' },
    { id: 'beginner', name: 'Beginner' },
    { id: 'intermediate', name: 'Intermediate' },
    { id: 'advanced', name: 'Advanced' },
    { id: 'expert', name: 'Expert' }
  ];

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.features.some(feature => feature.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         tool.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesTier = selectedTier === 'all' || tool.tier === selectedTier;
    const matchesDifficulty = selectedDifficulty === 'all' || tool.difficulty === selectedDifficulty;
    
    return matchesSearch && matchesCategory && matchesTier && matchesDifficulty;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedTier('all');
    setSelectedDifficulty('all');
  };

  const hasActiveFilters = searchTerm || selectedCategory !== 'all' || selectedTier !== 'all' || selectedDifficulty !== 'all';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Search and Filter Bar */}
      <div className="bg-gray-900/50 backdrop-blur-sm border border-green-500/20 rounded-lg p-6 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder="Search tools, features, tags, or descriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>
        
        {/* Filter Buttons */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Category Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className={`transition-all ${
                    selectedCategory === category.id 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'border-gray-600 text-gray-300 hover:border-green-500 hover:text-green-400'
                  }`}
                >
                  {category.icon}
                  <span className="ml-1 hidden sm:inline">{category.name}</span>
                </Button>
              ))}
            </div>
          </div>
          
          {/* Tier Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Tier</label>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tier) => (
                <Button
                  key={tier.id}
                  variant={selectedTier === tier.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTier(tier.id)}
                  className={`transition-all ${
                    selectedTier === tier.id 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-400'
                  }`}
                >
                  {tier.name}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Difficulty Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Difficulty</label>
            <div className="flex flex-wrap gap-2">
              {difficulties.map((difficulty) => (
                <Button
                  key={difficulty.id}
                  variant={selectedDifficulty === difficulty.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDifficulty(difficulty.id)}
                  className={`transition-all ${
                    selectedDifficulty === difficulty.id 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                      : 'border-gray-600 text-gray-300 hover:border-purple-500 hover:text-purple-400'
                  }`}
                >
                  {difficulty.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Showing {filteredTools.length} of {tools.length} tools
          </div>
          
          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex border border-gray-600 rounded-lg overflow-hidden">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`rounded-none ${viewMode === 'grid' ? 'bg-green-600' : 'hover:bg-gray-700'}`}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className={`rounded-none ${viewMode === 'list' ? 'bg-green-600' : 'hover:bg-gray-700'}`}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="hover:bg-red-900/20 hover:text-red-400 transition-all"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tools Display */}
      {filteredTools.length > 0 ? (
        <div className={
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : "space-y-4"
        }>
          {filteredTools.map((tool, index) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              className={`animate-fade-in ${viewMode === 'list' ? 'max-w-none' : ''}`}
              style={{ animationDelay: `${index * 0.1}s` } as React.CSSProperties}
            />
          ))}
        </div>
      ) : (
        /* No Results */
        <div className="text-center py-16">
          <div className="text-6xl text-gray-500 mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-green-400 mb-2">No tools found</h3>
          <p className="text-gray-400 mb-6">
            Try adjusting your search terms or filters to find the tools you're looking for.
          </p>
          <Button 
            onClick={clearFilters} 
            variant="outline" 
            className="border-green-500 text-green-400 hover:bg-green-500/10"
          >
            <Filter className="w-4 h-4 mr-2" />
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
};

