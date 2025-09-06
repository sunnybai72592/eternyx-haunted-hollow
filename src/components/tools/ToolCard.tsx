import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CyberTool } from '@/data/cybersecurityTools';
import { ToolModal } from './ToolModal';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  Lock, 
  Clock, 
  Target, 
  Shield,
  Zap,
  Crown,
  Star
} from 'lucide-react';

interface ToolCardProps {
  tool: CyberTool;
  className?: string;
}

export const ToolCard: React.FC<ToolCardProps> = ({ tool, className = "" }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user, profile } = useAuthStore();
  const { toast } = useToast();

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'free': return <Shield className="w-4 h-4" />;
      case 'premium': return <Star className="w-4 h-4" />;
      case 'elite': return <Crown className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'text-green-400 border-green-400';
      case 'premium': return 'text-blue-400 border-blue-400';
      case 'elite': return 'text-purple-400 border-purple-400';
      default: return 'text-gray-400 border-gray-400';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-900/20 text-green-400';
      case 'intermediate': return 'bg-yellow-900/20 text-yellow-400';
      case 'advanced': return 'bg-orange-900/20 text-orange-400';
      case 'expert': return 'bg-red-900/20 text-red-400';
      default: return 'bg-gray-900/20 text-gray-400';
    }
  };

  const canUseTool = () => {
    // Admins bypass all checks
    if (profile?.role === 'admin' || user?.email === 'naimatullahullahofficial01@gmail.com') return true;
    if (!user) return false;

    const userAccessLevel = profile?.access_level || 'basic';

    switch (tool.tier) {
      case 'free': return true;
      case 'premium': return ['premium', 'elite'].includes(userAccessLevel);
      case 'elite': return userAccessLevel === 'elite';
      default: return false;
    }
  };

  const handleExecute = () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to use this tool",
        variant: "destructive",
      });
      return;
    }

    if (!canUseTool()) {
      toast({
        title: "Upgrade Required",
        description: `This tool requires ${tool.tier} access. Redirecting to Subscription Hub...`,
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = '/subscriptions';
      }, 400);
      return;
    }

    setIsModalOpen(true);
  };

  const handleExecutionComplete = (result: any) => {
    toast({
      title: "Tool Execution Complete",
      description: `${tool.name} completed successfully. Found ${result.vulnerabilities_found || result.issues_found || 0} issues.`,
    });
  };

  return (
    <>
      <Card className={`cyber-card p-6 transition-all duration-300 hover-glow gradient-border ${className}`}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-primary text-2xl animate-float">
                {tool.icon}
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary neon-text">
                  {tool.name}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant="outline" className={getTierColor(tool.tier)}>
                    {getTierIcon(tool.tier)}
                    <span className="ml-1">{tool.tier}</span>
                  </Badge>
                  <Badge className={getDifficultyColor(tool.difficulty)}>
                    {tool.difficulty}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-muted-foreground text-sm leading-relaxed">
            {tool.description}
          </p>

          {/* Features */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-green-400">Key Features</h4>
            <ul className="space-y-1">
              {tool.features.slice(0, 3).map((feature, index) => (
                <li key={index} className="text-xs text-gray-300 flex items-start">
                  <span className="text-green-400 mr-2">•</span>
                  {feature}
                </li>
              ))}
              {tool.features.length > 3 && (
                <li className="text-xs text-gray-400">
                  +{tool.features.length - 3} more features
                </li>
              )}
            </ul>
          </div>

          {/* Execution Time */}
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Execution time: {tool.executionTime}</span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {tool.tags.slice(0, 4).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Action Button */}
          <div className="pt-2">
            {canUseTool() ? (
              <Button
                onClick={handleExecute}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                <Play className="w-4 h-4 mr-2" />
                Execute Tool
              </Button>
            ) : !user ? (
              <Button
                onClick={handleExecute}
                variant="outline"
                className="w-full border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
                size="sm"
              >
                <Lock className="w-4 h-4 mr-2" />
                Login Required
              </Button>
            ) : (
              <Button
                onClick={handleExecute}
                variant="outline"
                className="w-full border-purple-500 text-purple-500 hover:bg-purple-500/10"
                size="sm"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to {tool.tier}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <ToolModal
        tool={tool}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onExecutionComplete={handleExecutionComplete}
      />
    </>
  );
};

