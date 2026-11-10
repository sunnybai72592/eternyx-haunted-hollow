import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/AuthModal';
import { LogIn, UserPlus } from 'lucide-react';

interface CombinedAuthButtonProps {
  className?: string;
}

export const CombinedAuthButton = ({ className = '' }: CombinedAuthButtonProps) => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const openAuthModal = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <Button variant="ghost" size="sm" onClick={() => openAuthModal('signin')} className="text-foreground hover:bg-primary/10">
          <LogIn className="mr-2 h-4 w-4" />Sign in
        </Button>
        <Button size="sm" onClick={() => openAuthModal('signup')} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500">
          <UserPlus className="mr-2 h-4 w-4" />Create account
        </Button>
      </div>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode={authMode} />
    </>
  );
};
