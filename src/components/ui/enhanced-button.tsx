import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EnhancedButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: ButtonProps['variant'] | 'cyber' | 'neon' | 'glitch' | 'hologram';
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
          bg-gradient-to-r from-primary/20 to-accent/20 
          border-2 border-primary/50 
          text-primary 
          hover:from-primary/30 hover:to-accent/30 
          hover:border-primary 
          hover:text-white
          hover:shadow-lg hover:shadow-primary/25
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          ${animated ? 'motion-safe:hover:animate-pulse' : ''}
        `;
      case 'neon':
        return `
          bg-black/80 
          border-2 border-primary/60 
          text-primary 
          hover:bg-primary/10 
          hover:border-primary 
          hover:text-white
          hover:shadow-lg hover:shadow-primary/35
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          ${animated ? 'motion-safe:animate-pulse' : ''}
        `;
      case 'glitch':
        return `
          bg-gradient-to-r from-primary/20 to-accent/20 
          border-2 border-primary/50 
          text-primary 
          hover:from-primary/30 hover:to-accent/30 
          hover:border-primary 
          hover:text-white
          hover:shadow-lg hover:shadow-primary/25
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          relative overflow-hidden
          ${animated ? 'motion-safe:hover:animate-pulse' : ''}
        `;
      case 'hologram':
        return `
          bg-gradient-to-r from-primary/20 via-accent/20 to-primary/10 
          border-2 border-primary/50 
          text-primary 
          hover:from-primary/30 hover:via-accent/30 hover:to-primary/20 
          hover:border-primary 
          hover:text-white
          hover:shadow-lg hover:shadow-primary/25
          active:scale-95
          transition-all duration-300
          backdrop-blur-sm
          relative overflow-hidden
          ${animated ? 'motion-safe:hover:animate-pulse' : ''}
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
        before:bg-gradient-to-r before:from-primary/0 before:via-primary/20 before:to-primary/0
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
            <span className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 motion-safe:animate-pulse"></span>
            <span className="absolute inset-0 bg-gradient-to-l from-primary/5 to-accent/5 motion-safe:animate-ping"></span>
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

