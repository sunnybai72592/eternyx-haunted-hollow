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
      border transition-all duration-300
    `;

    switch (variant) {
      case 'neon':
        return `
          ${baseClasses}
          bg-black/80 border-${glowColor}-400/50
          hover:border-${glowColor}-300 hover:shadow-lg hover:shadow-${glowColor}-400/25
          ${animated ? 'hover:animate-pulse' : ''}
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      case 'glitch':
        return `
          ${baseClasses}
          bg-gradient-to-br from-red-900/20 to-purple-900/20 
          border-red-400/50 hover:border-red-300
          hover:shadow-lg hover:shadow-red-400/25
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      case 'matrix':
        return `
          ${baseClasses}
          bg-gradient-to-br from-green-900/20 to-emerald-900/20 
          border-green-400/50 hover:border-green-300
          hover:shadow-lg hover:shadow-green-400/25
          ${animated ? 'hover:animate-pulse' : ''}
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      case 'hologram':
        return `
          ${baseClasses}
          bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 
          border-blue-400/50 hover:border-purple-300
          hover:shadow-lg hover:shadow-purple-400/25
          ${animated ? 'hover:animate-pulse' : ''}
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
      default:
        return `
          ${baseClasses}
          bg-gray-900/80 border-gray-700/50
          hover:border-gray-600 hover:shadow-lg hover:shadow-gray-400/10
          ${interactive ? 'hover:scale-105 cursor-pointer' : ''}
        `;
    }
  };

  const getGlowEffect = () => {
    if (variant === 'neon') {
      return (
        <div className={`absolute inset-0 bg-gradient-to-r from-${glowColor}-400/0 via-${glowColor}-400/10 to-${glowColor}-400/0 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
      );
    }
    return null;
  };

  const getScanlineEffect = () => {
    if (animated && (variant === 'neon' || variant === 'matrix')) {
      return (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-full w-full animate-scan-line" />
        </div>
      );
    }
    return null;
  };

  const getGlitchEffect = () => {
    if (variant === 'glitch') {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-purple-500/5 animate-pulse pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-l from-cyan-500/3 to-blue-500/3 animate-ping pointer-events-none" />
        </>
      );
    }
    return null;
  };

  return (
    <div
      className={cn(getVariantClasses(), className)}
      onClick={onClick}
      {...props}
    >
      {getGlowEffect()}
      {getScanlineEffect()}
      {getGlitchEffect()}
      
      {/* Header */}
      {(title || subtitle || icon) && (
        <div className="p-4 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`text-${glowColor}-400 flex-shrink-0`}>
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {title && (
                <h3 className={`font-semibold text-lg text-${glowColor}-100 truncate`}>
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

