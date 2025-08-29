import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TerminalWindow } from '@/components/TerminalWindow';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error to monitoring service
    console.error('Error caught by boundary:', error, errorInfo);
    
    // In production, you would send this to your error tracking service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <TerminalWindow title="SYSTEM_ERROR.exe" className="border-red-500/50">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-red-500">
                  <AlertTriangle className="h-6 w-6 animate-pulse" />
                  <span className="text-xl font-bold">CRITICAL ERROR DETECTED</span>
                </div>
                
                <div className="text-cyber-green">
                  $ cat error_log.txt
                </div>
                
                <div className="bg-red-500/10 border border-red-500/30 rounded p-4">
                  <div className="text-red-400 font-mono text-sm">
                    <div>Error: {this.state.error?.message}</div>
                    <div className="mt-2 text-xs text-red-300">
                      Stack: {this.state.error?.stack?.split('\n')[1]?.trim()}
                    </div>
                  </div>
                </div>
                
                <div className="text-muted-foreground">
                  <div>$ echo "System encountered an unexpected error"</div>
                  <div>$ echo "Initiating recovery protocols..."</div>
                </div>
                
                <div className="flex space-x-4 pt-4">
                  <Button 
                    onClick={this.handleReload}
                    className="bg-cyber-green hover:bg-cyber-green/80 text-black"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reload System
                  </Button>
                  
                  <Button 
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="border-cyber-green text-cyber-green hover:bg-cyber-green hover:text-black"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Return Home
                  </Button>
                </div>
                
                <div className="text-cyber-green typing-cursor">
                  $ _
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

