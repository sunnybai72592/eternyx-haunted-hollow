import React, { useState } from 'react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface InteractiveButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  glowColor?: 'cyan' | 'green' | 'pink' | 'purple' | 'orange';
}

const InteractiveButton: React.FC<InteractiveButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  disabled = false,
  glowColor = 'cyan',
}) => {
  const [isClicked, setIsClicked] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;

    // Particle emission effect
    const rect = e.currentTarget.getBoundingClientRect();
    const newParticles = Array.from({ length: 6 }, (_, i) => ({
      id: Date.now() + i,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }));

    setParticles(newParticles);
    setIsClicked(true);

    // Clear particles after animation
    setTimeout(() => setParticles([]), 600);
    setTimeout(() => setIsClicked(false), 150);

    onClick?.();
  };

  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-r from-cyber-cyan to-neon-green text-black hover:from-neon-green hover:to-cyber-pink';
      case 'secondary':
        return 'bg-cyber-purple text-white hover:bg-cyber-pink';
      case 'outline':
        return `border-2 border-${glowColor === 'cyan' ? 'cyber-cyan' : glowColor === 'green' ? 'neon-green' : glowColor === 'pink' ? 'cyber-pink' : glowColor === 'purple' ? 'cyber-purple' : 'cyber-orange'} text-${glowColor === 'cyan' ? 'cyber-cyan' : glowColor === 'green' ? 'neon-green' : glowColor === 'pink' ? 'cyber-pink' : glowColor === 'purple' ? 'cyber-purple' : 'cyber-orange'} bg-transparent hover:bg-${glowColor === 'cyan' ? 'cyber-cyan' : glowColor === 'green' ? 'neon-green' : glowColor === 'pink' ? 'cyber-pink' : glowColor === 'purple' ? 'cyber-purple' : 'cyber-orange'} hover:text-black`;
      case 'ghost':
        return `text-${glowColor === 'cyan' ? 'cyber-cyan' : glowColor === 'green' ? 'neon-green' : glowColor === 'pink' ? 'cyber-pink' : glowColor === 'purple' ? 'cyber-purple' : 'cyber-orange'} bg-transparent hover:bg-${glowColor === 'cyan' ? 'cyber-cyan' : glowColor === 'green' ? 'neon-green' : glowColor === 'pink' ? 'cyber-pink' : glowColor === 'purple' ? 'cyber-purple' : 'cyber-orange'}/10`;
      default:
        return 'bg-cyber-cyan text-black hover:bg-neon-green';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-4 py-2 text-sm';
      case 'lg':
        return 'px-8 py-4 text-lg';
      default:
        return 'px-6 py-3 text-base';
    }
  };

  const getGlowClasses = () => {
    const glowColors = {
      cyan: 'hover:shadow-cyber-cyan/50',
      green: 'hover:shadow-neon-green/50',
      pink: 'hover:shadow-cyber-pink/50',
      purple: 'hover:shadow-cyber-purple/50',
      orange: 'hover:shadow-cyber-orange/50',
    };
    return `hover:shadow-2xl ${glowColors[glowColor]}`;
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden rounded-lg font-mono font-bold transition-all duration-300 group',
        'hover:scale-105 active:scale-95',
        getVariantClasses(),
        getSizeClasses(),
        getGlowClasses(),
        isClicked && 'animate-pulse-soft',
        disabled && 'opacity-50 cursor-not-allowed hover:scale-100',
        className
      )}
    >
      {/* Background animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      
      {/* Content */}
      <span className="relative z-10">{children}</span>

      {/* Particle effects */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 bg-white rounded-full pointer-events-none animate-ping"
          style={{
            left: particle.x - 4,
            top: particle.y - 4,
            animationDuration: '0.6s',
          }}
        />
      ))}

      {/* Neon border effect */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-current rounded-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
    </Button>
  );
};

export default InteractiveButton;

