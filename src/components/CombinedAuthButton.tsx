import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus } from 'lucide-react';

interface CombinedAuthButtonProps { className?: string }

export const CombinedAuthButton = ({ className = '' }: CombinedAuthButtonProps) => {
  const navigate = useNavigate();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button variant="ghost" size="sm" onClick={() => navigate('/auth')} className="text-foreground hover:bg-primary/10">
        <LogIn className="mr-2 h-4 w-4" />Sign in
      </Button>
      <Button size="sm" onClick={() => navigate('/auth?mode=signup')} className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:brightness-110">
        <UserPlus className="mr-2 h-4 w-4" />Create account
      </Button>
    </div>
  );
};
