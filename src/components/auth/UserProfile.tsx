import { useState } from 'react';
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
import { 
  User, 
  Settings, 
  LogOut, 
  Shield, 
  Activity, 
  Crown,
  Zap,
  ChevronDown
} from 'lucide-react';

interface UserProfileProps {
  className?: string;
}

export const UserProfile = ({ className = '' }: UserProfileProps) => {
  const { user, profile, signOut } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !profile) return null;

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
                <AvatarImage src={profile.avatar_url} alt={profile.username} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold">
                  {profile.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="hidden sm:flex flex-col items-start">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-foreground">
                    {profile.username}
                  </span>
                  {getAccessLevelIcon(profile.access_level)}
                </div>
                <span className={`text-xs ${getAccessLevelColor(profile.access_level)} uppercase font-medium`}>
                  {profile.access_level}
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
                  <AvatarImage src={profile.avatar_url} alt={profile.username} />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold">
                    {profile.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {profile.username}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getAccessLevelIcon(profile.access_level)}
                  <span className={`text-xs ${getAccessLevelColor(profile.access_level)} uppercase font-medium`}>
                    {profile.access_level} ACCESS
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  <span>Online</span>
                </div>
              </div>
            </div>
          </DropdownMenuLabel>
          
          <DropdownMenuSeparator className="bg-border" />
          
          <DropdownMenuItem className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <User className="mr-2 h-4 w-4" />
            <span>Profile Settings</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <Settings className="mr-2 h-4 w-4" />
            <span>Preferences</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10">
            <Activity className="mr-2 h-4 w-4" />
            <span>Activity Log</span>
          </DropdownMenuItem>
          
          {profile.access_level === 'basic' && (
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

