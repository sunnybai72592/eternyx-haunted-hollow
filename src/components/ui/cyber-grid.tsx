import React from 'react';
import { cn } from '@/lib/utils';

interface CyberGridProps {
  className?: string;
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  responsive?: boolean;
}

interface CyberGridItemProps {
  className?: string;
  children: React.ReactNode;
  span?: 1 | 2 | 3 | 4 | 5 | 6;
  spanSm?: 1 | 2 | 3 | 4 | 5 | 6;
  spanMd?: 1 | 2 | 3 | 4 | 5 | 6;
  spanLg?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const CyberGrid: React.FC<CyberGridProps> = ({
  className,
  children,
  cols = 3,
  gap = 'md',
  responsive = true,
  ...props
}) => {
  const getGridClasses = () => {
    const gapClasses = {
      sm: 'gap-2 sm:gap-3',
      md: 'gap-3 sm:gap-4 md:gap-6',
      lg: 'gap-4 sm:gap-6 md:gap-8',
      xl: 'gap-6 sm:gap-8 md:gap-10'
    };

    if (responsive) {
      const responsiveClasses = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        5: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        6: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      };
      return `grid ${responsiveClasses[cols]} ${gapClasses[gap]}`;
    }

    return `grid grid-cols-${cols} ${gapClasses[gap]}`;
  };

  return (
    <div
      className={cn(getGridClasses(), className)}
      {...props}
    >
      {children}
    </div>
  );
};

export const CyberGridItem: React.FC<CyberGridItemProps> = ({
  className,
  children,
  span,
  spanSm,
  spanMd,
  spanLg,
  ...props
}) => {
  const getSpanClasses = () => {
    const classes = [];
    
    if (span) classes.push(`col-span-${span}`);
    if (spanSm) classes.push(`sm:col-span-${spanSm}`);
    if (spanMd) classes.push(`md:col-span-${spanMd}`);
    if (spanLg) classes.push(`lg:col-span-${spanLg}`);
    
    return classes.join(' ');
  };

  return (
    <div
      className={cn(getSpanClasses(), className)}
      {...props}
    >
      {children}
    </div>
  );
};

export default CyberGrid;

