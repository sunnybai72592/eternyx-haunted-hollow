import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface CyberCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}

export const CyberCard = ({ title, description, icon, className = "" }: CyberCardProps) => {
  return (
    <Card className={`cyber-card p-4 sm:p-6 transition-all duration-300 hover:animate-pulse-glow hover:scale-105 ${className}`}>
      <div className="flex flex-col sm:flex-row items-start space-y-3 sm:space-y-0 sm:space-x-4">
        {icon && (
          <div className="text-primary text-2xl animate-float self-center sm:self-start">
            {icon}
          </div>
        )}
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-lg sm:text-xl font-bold text-primary mb-2 neon-text">
            {title}
          </h3>
          <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
            {description}
          </p>
        </div>
      </div>
    </Card>
  );
};