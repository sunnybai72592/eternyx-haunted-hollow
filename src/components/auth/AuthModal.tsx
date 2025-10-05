import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { X } from 'lucide-react';
import { GoogleAuthButton } from './GoogleAuthButton';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'login' | 'signup';
  onModeChange?: (mode: 'login' | 'signup') => void;
  defaultMode?: 'login' | 'signup';
}

export const AuthModal = ({ isOpen, onClose, mode: propMode, onModeChange, defaultMode = 'login' }: AuthModalProps) => {
  const [internalMode, setInternalMode] = useState<'login' | 'signup'>(defaultMode);
  const mode = propMode || internalMode;

  const handleSuccess = () => {
    onClose();
  };

  const handleSwitchMode = () => {
    const newMode = mode === 'login' ? 'signup' : 'login';
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-background border-primary/20 shadow-2xl shadow-primary/10 p-0 overflow-hidden">
        <div className="relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
            <span className="sr-only">Close</span>
          </button>

          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 animate-pulse-glow" />
          
          {/* Content */}
          <div className="relative p-6">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {mode === 'login' ? 'Sign In' : 'Sign Up'}
              </DialogTitle>
            </DialogHeader>

            {mode === 'login' ? (
              <>
                <LoginForm
                  onSuccess={handleSuccess}
                  onSwitchToSignup={handleSwitchMode}
                />
                <div className="mt-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-muted" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <GoogleAuthButton />
                  </div>
                </div>
              </>
            ) : (
              <>
                <SignupForm
                  onSuccess={handleSuccess}
                  onSwitchToLogin={handleSwitchMode}
                />
                <div className="mt-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-muted" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <GoogleAuthButton />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

