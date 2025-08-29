import { Loader2, Terminal } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'cyber';
  text?: string;
}

const LoadingSpinner = ({ 
  size = 'md', 
  variant = 'default',
  text = 'Loading...'
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  if (variant === 'cyber') {
    return (
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <Terminal className={`${sizeClasses[size]} text-cyber-green animate-pulse`} />
          <div className="absolute inset-0 animate-ping">
            <Terminal className={`${sizeClasses[size]} text-cyber-green opacity-20`} />
          </div>
        </div>
        {text && (
          <div className="text-cyber-green font-mono text-sm animate-pulse">
            {text}
            <span className="animate-ping">...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
      {text && (
        <span className="text-sm text-muted-foreground">{text}</span>
      )}
    </div>
  );
};

export default LoadingSpinner;

