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
    <Card className={`cyber-card p-6 transition-all duration-300 hover-glow gradient-border ${className}`}>
      <div className="flex items-start space-x-4">
        {icon && (
          <div className="text-primary text-2xl animate-float">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-xl font-bold text-primary mb-2 neon-text">
            {title}
          </h3>
          <p className="text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </Card>
  );
};