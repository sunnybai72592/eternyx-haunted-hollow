import React from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTextProps {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption' | 'code';
  className?: string;
  children: React.ReactNode;
  cyberpunk?: boolean;
  glowColor?: 'cyan' | 'red' | 'green' | 'purple' | 'orange' | 'blue';
}

export const ResponsiveText: React.FC<ResponsiveTextProps> = ({
  variant = 'body',
  className,
  children,
  cyberpunk = false,
  glowColor = 'cyan',
  ...props
}) => {
  const getVariantClasses = () => {
    const baseClasses = {
      h1: 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight',
      h2: 'text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold leading-tight',
      h3: 'text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-semibold leading-tight',
      h4: 'text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-semibold leading-tight',
      h5: 'text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-medium leading-tight',
      h6: 'text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl font-medium leading-tight',
      body: 'text-sm sm:text-base md:text-lg leading-relaxed',
      caption: 'text-xs sm:text-sm md:text-base leading-relaxed',
      code: 'text-xs sm:text-sm md:text-base font-mono leading-relaxed'
    };

    return baseClasses[variant];
  };

  const getCyberpunkClasses = () => {
    if (!cyberpunk) return '';
    
    return `
      bg-gradient-to-r from-${glowColor}-400 to-${glowColor}-600 bg-clip-text text-transparent
      drop-shadow-lg
      animate-pulse
    `;
  };

  const Component = variant.startsWith('h') ? variant as keyof JSX.IntrinsicElements : 'p';

  return React.createElement(
    Component,
    {
      className: cn(
        getVariantClasses(),
        getCyberpunkClasses(),
        'transition-all duration-300',
        className
      ),
      ...props
    },
    children
  );
};

export default ResponsiveText;

