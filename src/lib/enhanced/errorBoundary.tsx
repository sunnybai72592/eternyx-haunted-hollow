import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class EnhancedErrorBoundary extends Component<Props, State> {
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
    console.error('ETERNYX Error Boundary caught an error:', error, errorInfo);
    
    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Send to Sentry, LogRocket, etc.
    }
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
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full p-8 bg-card/50 backdrop-blur-sm border-red-400/20 neon-border">
            <div className="text-center">
              {/* Terminal-style error display */}
              <div className="mb-6">
                <div className="bg-black/80 p-4 rounded border border-red-400/50 text-left font-mono text-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="flex space-x-1">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <span className="text-red-400">SYSTEM_ERROR.exe</span>
                  </div>
                  
                  <div className="text-red-400 mb-2">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    CRITICAL ERROR DETECTED
                  </div>
                  
                  <div className="text-green-400 mb-1">$ cat error_log.txt</div>
                  
                  <div className="bg-red-900/20 p-3 rounded border border-red-400/30 mb-2">
                    <div className="text-red-300">
                      Error: {this.state.error?.message || 'process is not defined'}
                    </div>
                    <div className="text-red-400 text-xs mt-1">
                      Stack: {this.state.error?.stack?.split('\n')[1]?.trim() || 'at new StripeService'}
                    </div>
                  </div>
                  
                  <div className="text-green-400 mb-1">$ echo "System encountered an unexpected error"</div>
                  <div className="text-green-400">$ echo "Initiating recovery protocols..."</div>
                </div>
              </div>

              <div className="mb-6">
                <h1 className="text-3xl font-bold text-primary glitch mb-2" data-text="SYSTEM BREACH">
                  SYSTEM BREACH
                </h1>
                <p className="text-muted-foreground">
                  An unexpected error has compromised the system integrity
                </p>
              </div>

              <div className="grid md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 bg-background/50 rounded border border-red-400/20 text-center">
                  <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2 animate-pulse" />
                  <div className="text-sm font-bold text-red-400">ERROR</div>
                  <div className="text-xs text-muted-foreground">System Fault</div>
                </div>
                
                <div className="p-4 bg-background/50 rounded border border-yellow-400/20 text-center">
                  <Bug className="h-8 w-8 text-yellow-400 mx-auto mb-2 animate-pulse" />
                  <div className="text-sm font-bold text-yellow-400">DEBUG</div>
                  <div className="text-xs text-muted-foreground">Trace Active</div>
                </div>
                
                <div className="p-4 bg-background/50 rounded border border-blue-400/20 text-center">
                  <RefreshCw className="h-8 w-8 text-blue-400 mx-auto mb-2 animate-spin" />
                  <div className="text-sm font-bold text-blue-400">RECOVERY</div>
                  <div className="text-xs text-muted-foreground">Protocols Ready</div>
                </div>
                
                <div className="p-4 bg-background/50 rounded border border-green-400/20 text-center">
                  <Home className="h-8 w-8 text-green-400 mx-auto mb-2 animate-pulse" />
                  <div className="text-sm font-bold text-green-400">SAFE MODE</div>
                  <div className="text-xs text-muted-foreground">Available</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex space-x-4 justify-center">
                  <Button
                    onClick={this.handleReload}
                    className="bg-blue-500 hover:bg-blue-600 text-white neon-border"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reload System
                  </Button>
                  
                  <Button
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="border-green-400/50 text-green-400"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Return Home
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Error ID: {Date.now().toString(36).toUpperCase()} | 
                  Timestamp: {new Date().toISOString()}
                </p>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default EnhancedErrorBoundary;

