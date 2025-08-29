import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const { addNotification } = useAppStore();

  useEffect(() => {
    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebAppiOS = (window.navigator as any).standalone === true;
    
    if (isStandalone || isInWebAppiOS) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt after a delay to not be intrusive
      setTimeout(() => {
        setShowPrompt(true);
      }, 10000);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      addNotification({
        type: 'success',
        message: 'ETERNYX app installed successfully!'
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [addNotification]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        addNotification({
          type: 'success',
          message: 'Installing ETERNYX app...'
        });
      } else {
        addNotification({
          type: 'info',
          message: 'App installation cancelled'
        });
      }
      
      setDeferredPrompt(null);
      setShowPrompt(false);
    } catch (error) {
      console.error('Error during app installation:', error);
      addNotification({
        type: 'error',
        message: 'Failed to install app'
      });
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Don't show again for this session
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if already installed or dismissed
  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null;
  }

  // Check if user already dismissed this session
  if (sessionStorage.getItem('pwa-prompt-dismissed')) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50">
      <div className="bg-card border border-border rounded-lg p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <Smartphone className="h-6 w-6 text-cyber-green" />
          </div>
          
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Install ETERNYX App
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Get faster access and offline capabilities by installing our app.
            </p>
            
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={handleInstallClick}
                className="bg-cyber-green hover:bg-cyber-green/80 text-black text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Install
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;

