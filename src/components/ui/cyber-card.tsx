import React from 'react';
import { cn } from '@/lib/utils';

interface CyberCardProps {
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'neon' | 'glitch' | 'matrix' | 'hologram';
  glowColor?: 'cyan' | 'red' | 'green' | 'purple' | 'orange' | 'blue' | 'pink' | 'yellow';
  animated?: boolean;
  interactive?: boolean;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export const CyberCard: React.FC<CyberCardProps> = ({
  className,
  children,
  variant = 'default',
  glowColor = 'cyan',
  animated = true,
  interactive = true,
  title,
  subtitle,
  icon,
  onClick,
  ...props
}) => {
  const getVariantClasses = () => {
    const baseClasses = `
      relative overflow-hidden rounded-lg backdrop-blur-md
      border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
    `;

    switch (variant) {
      case 'neon':
        return `
          ${baseClasses}
          bg-black/80 border-primary/50
          hover:border-primary hover:shadow-lg hover:shadow-primary/25
          ${animated ? 'motion-safe:hover:animate-pulse' : ''}
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      case 'glitch':
        return `
          ${baseClasses}
          bg-gradient-to-br from-primary/15 to-accent/10 
          border-primary/50 hover:border-primary
          hover:shadow-lg hover:shadow-primary/25
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      case 'matrix':
        return `
          ${baseClasses}
          bg-gradient-to-br from-primary/15 to-accent/10 
          border-primary/50 hover:border-primary
          hover:shadow-lg hover:shadow-primary/25
          ${animated ? 'motion-safe:hover:animate-pulse' : ''}
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      case 'hologram':
        return `
          ${baseClasses}
          bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5 
          border-primary/50 hover:border-primary
          hover:shadow-lg hover:shadow-primary/25
          ${animated ? 'motion-safe:hover:animate-pulse' : ''}
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      default:
        return `
          ${baseClasses}
          bg-card/80 border-border/50
          hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
    }
  };

  const getGlowEffect = () => {
    if (variant === 'neon') {
      return (
        <div className={`absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
      );
    }
    return null;
  };

  const getScanlineEffect = () => {
    if (animated && (variant === 'neon' || variant === 'matrix')) {
      return (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-full w-full motion-safe:animate-scan-line" />
        </div>
      );
    }
    return null;
  };

  const getGlitchEffect = () => {
    if (variant === 'glitch') {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 motion-safe:animate-pulse pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-l from-primary/[.03] to-accent/[.03] motion-safe:animate-ping pointer-events-none" />
        </>
      );
    }
    return null;
  };

  return (
    <div
      className={cn(getVariantClasses(), className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      {...props}
    >
      {getGlowEffect()}
      {getScanlineEffect()}
      {getGlitchEffect()}
      
      {/* Header */}
      {(title || subtitle || icon) && (
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`text-primary flex-shrink-0`}>
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {title && (
                <h3 className={`font-semibold text-lg text-foreground truncate`}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-gray-400 truncate mt-1">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="relative z-10 p-4">
        {children}
      </div>
    </div>
  );
};

export default CyberCard;

