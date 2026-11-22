import React from 'react';
import { cn } from '@/lib/utils';
import { ResponsiveText } from './responsive-text';

interface CyberSectionProps {
  className?: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  description?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'hero' | 'feature' | 'tools' | 'footer';
  glowColor?: 'cyan' | 'red' | 'green' | 'purple' | 'orange' | 'blue' | 'pink' | 'yellow';
  background?: 'transparent' | 'dark' | 'gradient' | 'matrix';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export const CyberSection: React.FC<CyberSectionProps> = ({
  className,
  children,
  title,
  subtitle,
  description,
  icon,
  variant = 'default',
  glowColor = 'cyan',
  background = 'transparent',
  padding = 'lg',
  ...props
}) => {
  const getSectionClasses = () => {
    const paddingClasses = {
      none: '',
      sm: 'py-4 px-4',
      md: 'py-8 px-4 sm:px-6',
      lg: 'py-12 px-4 sm:px-6 lg:px-8',
      xl: 'py-16 px-4 sm:px-6 lg:px-8 xl:px-12'
    };

    const backgroundClasses = {
      transparent: '',
      dark: 'bg-background/50 backdrop-blur-sm',
      gradient: 'bg-gradient-to-br from-primary/10 to-accent/5',
      matrix: 'bg-gradient-to-br from-primary/10 to-accent/5'
    };

    const variantClasses = {
      default: '',
      hero: 'min-h-screen flex items-center justify-center',
      feature: 'relative overflow-hidden',
      tools: 'border-t border-primary/20',
      footer: 'border-t border-border/50 bg-background/80'
    };

    return cn(
      paddingClasses[padding],
      backgroundClasses[background],
      variantClasses[variant],
      'relative'
    );
  };

  const getHeaderClasses = () => {
    if (variant === 'hero') {
      return 'text-center mb-12';
    }
    return 'mb-8';
  };

  const getTitleVariant = () => {
    switch (variant) {
      case 'hero':
        return 'h1';
      case 'feature':
        return 'h2';
      case 'tools':
        return 'h3';
      default:
        return 'h2';
    }
  };

  return (
    <section
      className={cn(getSectionClasses(), className)}
      {...props}
    >
      {/* Background Effects */}
      {variant === 'hero' && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-primary/10" />
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-pulse" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_1px,_rgba(255,255,255,0.02)_1px)] bg-[length:60px_60px]" />
          </div>
        </div>
      )}

      {/* Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        {(title || subtitle || description || icon) && (
          <div className={getHeaderClasses()}>
            {icon && (
              <div className="flex justify-center mb-4 text-primary">
                {icon}
              </div>
            )}
            
            {subtitle && (
              <ResponsiveText
                variant="caption"
                className="text-primary font-medium uppercase tracking-wider mb-2"
                cyberpunk
                glowColor={glowColor}
              >
                {subtitle}
              </ResponsiveText>
            )}
            
            {title && (
              <ResponsiveText
                variant={getTitleVariant()}
                className="text-white font-bold mb-4"
                cyberpunk={variant === 'hero'}
                glowColor={glowColor}
              >
                {title}
              </ResponsiveText>
            )}
            
            {description && (
              <ResponsiveText
                variant="body"
                className="text-gray-300 max-w-3xl mx-auto"
              >
                {description}
              </ResponsiveText>
            )}
          </div>
        )}

        {/* Content */}
        <div className="relative">
          {children}
        </div>
      </div>

      {/* Decorative Elements */}
      {variant === 'feature' && (
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      )}
    </section>
  );
};

export default CyberSection;

