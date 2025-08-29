import { ReactNode } from 'react';

interface TerminalWindowProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export const TerminalWindow = ({ title = "terminal", children, className = "" }: TerminalWindowProps) => {
  return (
    <div className={`neon-border rounded-lg overflow-hidden ${className}`}>
      {/* Terminal Header */}
      <div className="bg-card border-b border-border px-3 sm:px-4 py-2 flex items-center space-x-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-yellow-500"></div>
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground ml-2 sm:ml-4 truncate">{title}</span>
      </div>
      
      {/* Terminal Body */}
      <div className="bg-background p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
        {children}
      </div>
    </div>
  );
};