import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TerminalWindow } from '@/components/TerminalWindow';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  reference?: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, reference: globalThis.crypto?.randomUUID?.() ?? 'unavailable' };
  }

  componentDidCatch() {
    console.error('ETERNYX_RENDER_FAILURE', this.state.reference);
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
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4" data-testid="eternyx-error-recovery">
          <div className="max-w-2xl w-full">
            <TerminalWindow title="SYSTEM_ERROR.exe" className="border-red-500/50">
              <div className="space-y-4" role="alert">
                <div className="flex items-center space-x-2 text-red-500">
                  <AlertTriangle className="h-6 w-6 animate-pulse" />
                  <span className="text-xl font-bold">Unable to display this page</span>
                </div>
                
                <div className="text-cyber-green">
                  Recovery information
                </div>
                
                <div className="bg-red-500/10 border border-red-500/30 rounded p-4">
                  <div className="text-red-400 font-mono text-sm">
                    <div className="break-all">Local reference: {this.state.reference}</div>
                  </div>
                </div>
                
                <div className="text-muted-foreground">
                  <div>Reload or return home.</div>
                  <div>Check whether your previous action completed before repeating it.</div>
                </div>
                
                <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap">
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

