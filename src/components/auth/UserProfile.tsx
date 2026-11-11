import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { 
  User, 
  Settings, 
  LogOut, 
  Shield, 
  Bell,
  LayoutDashboard,
  ClipboardList,
  Crown,
  ShieldCheck,
  Zap,
  ChevronDown
} from 'lucide-react';

interface UserProfileProps {
  className?: string;
}

export const UserProfile = ({ className = '' }: UserProfileProps) => {
  const { user, profile, signOut } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) { setIsAdmin(false); return; }
    void supabase.rpc('is_admin').then(({ data, error }) => {
      if (active) setIsAdmin(!error && data === true);
    });
    return () => { active = false; };
  }, [user?.id]);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !profile) return null;

  const displayName = profile.username || profile.full_name || user.email?.split('@')[0] || 'Member';
  const accessLevel = profile.access_level || 'basic';

  const getAccessLevelIcon = (level: string) => {
    switch (level) {
      case 'elite':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'premium':
        return <Zap className="h-4 w-4 text-blue-500" />;
      default:
        return <Shield className="h-4 w-4 text-green-500" />;
    }
  };

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case 'elite':
        return 'text-yellow-500';
      case 'premium':
        return 'text-blue-500';
      default:
        return 'text-green-500';
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  return (
    <div className={`${className}`}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-12 w-auto px-3 rounded-lg neon-border bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-105"
          >
            <div className="flex items-center space-x-3">
              <Avatar className="h-8 w-8 ring-2 ring-primary/50">
                <AvatarImage src={(profile as any)?.avatar_url || '/placeholder.svg'} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="hidden sm:flex flex-col items-start">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-foreground">
                    {displayName}
                  </span>
                  {isAdmin ? <ShieldCheck className="h-4 w-4 text-amber-400" /> : getAccessLevelIcon(accessLevel)}
                </div>
                <span className={`text-xs ${isAdmin ? 'text-amber-400' : getAccessLevelColor(accessLevel)} uppercase font-medium`}>
                  {isAdmin ? 'Administrator' : `${accessLevel} member`}
                </span>
              </div>
              
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          className="w-64 cyber-card border-primary/20 shadow-lg shadow-primary/10"
          align="end"
          sideOffset={5}
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10 ring-2 ring-primary/50">
                  <AvatarImage src={(profile as any)?.avatar_url || '/placeholder.svg'} alt={profile?.username} />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {isAdmin ? <ShieldCheck className="h-4 w-4 text-amber-400" /> : getAccessLevelIcon(accessLevel)}
                <span className={`text-xs ${isAdmin ? 'text-amber-400' : getAccessLevelColor(accessLevel)} uppercase font-medium`}>
                  {isAdmin ? 'TRUSTED ADMINISTRATOR' : `${accessLevel} ACCESS`}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
          
          {isAdmin && (
            <>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onSelect={() => navigate('/admin/bug-reports')} className="cursor-pointer text-amber-400 hover:bg-amber-500/10 focus:bg-amber-500/10">
                <ShieldCheck className="mr-2 h-4 w-4" /><span>Administrator Console</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem onSelect={() => navigate('/account')} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <LayoutDashboard className="mr-2 h-4 w-4" /><span>Account Overview</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/profile')} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <User className="mr-2 h-4 w-4" /><span>My Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/settings')} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <Settings className="mr-2 h-4 w-4" /><span>Settings & Preferences</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/notifications')} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <Bell className="mr-2 h-4 w-4" /><span>Notifications</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/my-bug-reports')} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <ClipboardList className="mr-2 h-4 w-4" /><span>My Bug Reports</span>
          </DropdownMenuItem>
          
          {accessLevel === 'basic' && (
            <>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="cursor-pointer hover:bg-blue-500/10 focus:bg-blue-500/10 text-blue-400">
                <Crown className="mr-2 h-4 w-4" />
                <span>Upgrade Access</span>
              </DropdownMenuItem>
            </>
          )}
          
          <DropdownMenuSeparator className="bg-border" />
          
          <DropdownMenuItem 
            className="cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

