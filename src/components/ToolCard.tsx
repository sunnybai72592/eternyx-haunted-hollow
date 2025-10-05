import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Tool } from "@/lib/tools";

interface ToolCardProps {
  tool: Tool;
  runningScans: { [key: string]: number };
  onExecuteTool: (toolId: string) => void;
  className?: string;
}

const ToolCard: React.FC<ToolCardProps> = ({
  tool,
  runningScans,
  onExecuteTool,
  className,
}) => {
  const { id, title, name, description, icon, xp = 0, maxXp = 1000, level = 1, lastUsed, usageCount = 0, glowColor = 'cyan', isLocked = false, requiredLevel } = tool;
  const displayTitle = title || name || 'Unnamed Tool';
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleClick = () => {
    if (isLocked) return;
    
    // Create particle effect
    const newParticles = Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      y: Math.random() * 100,
    }));

    setParticles(newParticles);
    setTimeout(() => setParticles([]), 1000);

    onExecuteTool(id);
  };

  const getGlowColor = () => {
    const colors = {
      cyan: 'hover:shadow-cyber-cyan/30',
      green: 'hover:shadow-neon-green/30',
      pink: 'hover:shadow-cyber-pink/30',
      purple: 'hover:shadow-cyber-purple/30',
      orange: 'hover:shadow-cyber-orange/30',
    };
    return colors[glowColor];
  };

  const getBorderColor = () => {
    const colors = {
      cyan: 'hover:border-cyber-cyan',
      green: 'hover:border-neon-green',
      pink: 'hover:border-cyber-pink',
      purple: 'hover:border-cyber-purple',
      orange: 'hover:border-cyber-orange',
    };
    return colors[glowColor];
  };

  const getIconColor = () => {
    const colors = {
      cyan: 'text-cyber-cyan',
      green: 'text-neon-green',
      pink: 'text-cyber-pink',
      purple: 'text-cyber-purple',
      orange: 'text-cyber-orange',
    };
    return colors[glowColor];
  };

  const xpPercentage = (xp / maxXp) * 100;

  return (
    <Card
      className={cn(
        'relative overflow-hidden cursor-pointer transition-all duration-300 group',
        'bg-black/70 backdrop-blur-sm border-2 border-gray-800',
        'hover:scale-105 hover:shadow-2xl',
        getBorderColor(),
        getGlowColor(),
        isLocked && 'opacity-60 cursor-not-allowed hover:scale-100',
        className
      )}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Floating effect */}
      <div className={cn(
        'absolute inset-0 transition-all duration-300',
        isHovered && 'animate-float-effect'
      )} />

      <CardHeader className="relative z-10">
        <div className="flex items-center justify-between">
          <div className={cn('text-3xl transition-all duration-300', getIconColor())}>
            {icon}
          </div>
          
          <div className="flex flex-col items-end space-y-1">
            {!isLocked && (
              <>
                <Badge variant="outline" className="text-xs font-mono">
                  LVL {level}
                </Badge>
                <div className="text-xs text-muted-foreground">
                  {usageCount} uses
                </div>
              </>
            )}
            {isLocked && requiredLevel && (
              <Badge variant="destructive" className="text-xs font-mono">
                REQ LVL {requiredLevel}
              </Badge>
            )}
          </div>
        </div>

        <CardTitle className="text-xl font-bold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyber-cyan group-hover:to-neon-green transition-all duration-300">
          {displayTitle}
        </CardTitle>
        
        <CardDescription className="text-gray-300 text-sm">
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="relative z-10">
        {!isLocked && (
          <>
            {/* XP Progress */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Experience</span>
                <span>{xp}/{maxXp} XP</span>
              </div>
              <Progress 
                value={xpPercentage} 
                className="h-2 bg-gray-800"
              />
            </div>

            {/* Last used */}
            {lastUsed && (
              <div className="text-xs text-muted-foreground font-mono">
                Last used: {lastUsed}
              </div>
            )}

            {runningScans[id] !== undefined ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary">Running...</span>
                  <span className="text-primary font-mono">{Math.round(runningScans[id])}%</span>
                </div>
                <Progress value={runningScans[id]} className="w-full animate-pulse-glow" />
              </div>
            ) : (
              <Button 
                onClick={handleClick}
                className="w-full hover-glow gradient-border group-hover:scale-105 transition-all"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                Execute Tool
              </Button>
            )}
          </>
        )}

        {isLocked && (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">🔒</div>
            <div className="text-sm text-muted-foreground">
              Unlock at level {requiredLevel}
            </div>
          </div>
        )}
      </CardContent>

      {/* Particle effects */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-1 h-1 bg-current rounded-full pointer-events-none animate-ping"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            animationDuration: '1s',
          }}
        />
      ))}

      {/* Holographic border effect */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-current rounded-lg opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
      
      {/* Scan line effect */}
      {isHovered && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="w-full h-0.5 bg-current opacity-50 animate-scan" />
        </div>
      )}
    </Card>
  );
};

export default ToolCard;

