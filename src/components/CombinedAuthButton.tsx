import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/auth/AuthModal';
import { LogIn, UserPlus, User } from 'lucide-react';

interface CombinedAuthButtonProps {
  className?: string;
}

export const CombinedAuthButton = ({ className = '' }: CombinedAuthButtonProps) => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const openAuthModal = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => openAuthModal('login')}
        className={`bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 hover:scale-105 text-xs px-2 py-1.5 h-8 min-w-[60px] touch-target ${className}`}
        aria-label="Sign in or sign up"
      >
        <User className="h-3 w-3 mr-1" />
        <span className="hidden xs:inline">Auth</span>
        <span className="xs:hidden">•</span>
      </Button>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </>
  );
};

