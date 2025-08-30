import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HolographicCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'success';
  animated?: boolean;
  glitch?: boolean;
}

const HolographicCard: React.FC<HolographicCardProps> = ({
  title,
  description,
  children,
  className,
  variant = 'default',
  animated = true,
  glitch = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [glitchActive, setGlitchActive] = useState(false);

  // Random glitch effect
  useEffect(() => {
    if (glitch) {
      const interval = setInterval(() => {
        if (Math.random() < 0.1) { // 10% chance every second
          setGlitchActive(true);
          setTimeout(() => setGlitchActive(false), 200);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [glitch]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          border: 'border-cyber-green/40 hover:border-cyber-green/80',
          glow: 'shadow-cyber-green/20 hover:shadow-cyber-green/40',
          accent: 'text-cyber-green'
        };
      case 'secondary':
        return {
          border: 'border-cyber-blue/40 hover:border-cyber-blue/80',
          glow: 'shadow-cyber-blue/20 hover:shadow-cyber-blue/40',
          accent: 'text-cyber-blue'
        };
      case 'danger':
        return {
          border: 'border-red-400/40 hover:border-red-400/80',
          glow: 'shadow-red-400/20 hover:shadow-red-400/40',
          accent: 'text-red-400'
        };
      case 'success':
        return {
          border: 'border-emerald-400/40 hover:border-emerald-400/80',
          glow: 'shadow-emerald-400/20 hover:shadow-emerald-400/40',
          accent: 'text-emerald-400'
        };
      default:
        return {
          border: 'border-primary/40 hover:border-primary/80',
          glow: 'shadow-primary/20 hover:shadow-primary/40',
          accent: 'text-primary'
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="relative group">
      {/* Holographic background effect */}
      <div className={cn(
        "absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        "bg-gradient-to-r from-transparent via-primary/5 to-transparent",
        animated && "animate-pulse"
      )} />
      
      {/* Scanning line effect */}
      {isHovered && animated && (
        <div className="absolute inset-0 overflow-hidden rounded-lg">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyber-green to-transparent animate-scan" />
        </div>
      )}

      <Card
        className={cn(
          "relative bg-card/30 backdrop-blur-md transition-all duration-300",
          styles.border,
          `shadow-lg ${styles.glow}`,
          animated && "hover:scale-[1.02] hover:shadow-2xl",
          glitchActive && "animate-glitch",
          className
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Corner decorations */}
        <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-cyber-green/60" />
        <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-cyber-green/60" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-cyber-green/60" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-cyber-green/60" />

        {/* Data stream effect */}
        {isHovered && animated && (
          <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-cyber-blue to-transparent opacity-60 animate-data-stream" />
        )}

        <CardHeader className="relative">
          <CardTitle className={cn(
            "text-lg font-bold flex items-center space-x-2",
            styles.accent,
            glitchActive && "animate-text-glitch"
          )}>
            <span className="relative">
              {title}
              {glitchActive && (
                <span className="absolute inset-0 text-red-400 animate-glitch-text">
                  {title}
                </span>
              )}
            </span>
          </CardTitle>
          {description && (
            <CardDescription className="text-muted-foreground/80">
              {description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="relative">
          {children}
        </CardContent>

        {/* Holographic grid overlay */}
        <div className={cn(
          "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none",
          "bg-[linear-gradient(90deg,transparent_24px,rgba(0,255,255,0.03)_25px,rgba(0,255,255,0.03)_26px,transparent_27px,transparent_74px,rgba(0,255,255,0.03)_75px,rgba(0,255,255,0.03)_76px,transparent_77px),linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px)]",
          "bg-[size:100px_100px]"
        )} />
      </Card>

      {/* Particle effects */}
      {isHovered && animated && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-cyber-green rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${i * 0.2}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HolographicCard;

