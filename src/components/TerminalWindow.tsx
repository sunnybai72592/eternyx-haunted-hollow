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
      <div className="bg-card border-b border-border px-4 py-2 flex items-center space-x-2">
        <div className="flex space-x-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <span className="text-sm text-muted-foreground ml-4">{title}</span>
      </div>
      
      {/* Terminal Body */}
      <div className="bg-background p-4 font-mono text-sm">
        {children}
      </div>
    </div>
  );
};