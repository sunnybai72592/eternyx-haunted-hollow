import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EnhancedButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'cyber' | 'neon' | 'glitch' | 'hologram';
  glowColor?: 'cyan' | 'red' | 'green' | 'purple' | 'orange' | 'blue';
  animated?: boolean;
  responsive?: boolean;
}

export const EnhancedButton: React.FC<EnhancedButtonProps> = ({
  className,
  variant = 'default',
  glowColor = 'cyan',
  animated = true,
  responsive = true,
  children,
  ...props
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'cyber':
        return `
          bg-gradient-to-r from-cyan-500/20 to-blue-500/20 
          border-2 border-cyan-400/50 
          text-cyan-100 
          hover:from-cyan-400/30 hover:to-blue-400/30 
          hover:border-cyan-300 
          hover:text-white
          hover:shadow-lg hover:shadow-cyan-400/25
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          ${animated ? 'hover:animate-pulse' : ''}
        `;
      case 'neon':
        return `
          bg-black/80 
          border-2 border-${glowColor}-400 
          text-${glowColor}-100 
          hover:bg-${glowColor}-500/10 
          hover:border-${glowColor}-300 
          hover:text-white
          hover:shadow-lg hover:shadow-${glowColor}-400/50
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          ${animated ? 'animate-pulse' : ''}
        `;
      case 'glitch':
        return `
          bg-gradient-to-r from-red-500/20 to-purple-500/20 
          border-2 border-red-400/50 
          text-red-100 
          hover:from-red-400/30 hover:to-purple-400/30 
          hover:border-red-300 
          hover:text-white
          hover:shadow-lg hover:shadow-red-400/25
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          relative overflow-hidden
          ${animated ? 'hover:animate-pulse' : ''}
        `;
      case 'hologram':
        return `
          bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 
          border-2 border-purple-400/50 
          text-purple-100 
          hover:from-blue-400/30 hover:via-purple-400/30 hover:to-pink-400/30 
          hover:border-purple-300 
          hover:text-white
          hover:shadow-lg hover:shadow-purple-400/25
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          relative overflow-hidden
          ${animated ? 'hover:animate-pulse' : ''}
        `;
      default:
        return '';
    }
  };

  const getResponsiveClasses = () => {
    if (!responsive) return '';
    return `
      text-sm sm:text-base
      px-3 py-2 sm:px-4 sm:py-2
      min-h-[44px] sm:min-h-[48px]
      min-w-[44px] sm:min-w-[48px]
    `;
  };

  const getGlowClasses = () => {
    if (variant === 'cyber' || variant === 'neon' || variant === 'glitch' || variant === 'hologram') {
      return `
        before:absolute before:inset-0 before:rounded-lg 
        before:bg-gradient-to-r before:from-${glowColor}-400/0 before:via-${glowColor}-400/20 before:to-${glowColor}-400/0
        before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300
        before:blur-sm before:-z-10
      `;
    }
    return '';
  };

  if (variant === 'cyber' || variant === 'neon' || variant === 'glitch' || variant === 'hologram') {
    return (
      <button
        className={cn(
          'relative inline-flex items-center justify-center rounded-lg font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          getVariantClasses(),
          getResponsiveClasses(),
          getGlowClasses(),
          className
        )}
        {...props}
      >
        {variant === 'glitch' && (
          <>
            <span className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-purple-500/10 animate-pulse"></span>
            <span className="absolute inset-0 bg-gradient-to-l from-cyan-500/5 to-blue-500/5 animate-ping"></span>
          </>
        )}
        <span className="relative z-10 flex items-center gap-2">
          {children}
        </span>
      </button>
    );
  }

  return (
    <Button
      variant={variant}
      className={cn(
        getResponsiveClasses(),
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
};

export default EnhancedButton;

