import React from 'react';
import { SectionSelector } from '@/components/home/SectionSelector';

interface ResponsiveMainContentProps {
  className?: string;
}

export const ResponsiveMainContent = ({ className = '' }: ResponsiveMainContentProps) => {
  return <SectionSelector className={className} />;
};
