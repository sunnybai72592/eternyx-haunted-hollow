import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowUpRight, Bell, ChevronDown, Crown, LayoutDashboard, LogOut,
  Settings2, Shield, ShieldCheck, UserRound, Zap, ClipboardList
} from 'lucide-react';

interface UserProfileProps {
  className?: string;
}

export const UserProfile = ({ className = '' }: UserProfileProps) => {
  const { user, profile, signOut } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;
    if (!user) { setIsAdmin(false); return; }
    void supabase.rpc('is_admin').then(({ data, error }) => {
      if (active) setIsAdmin(!error && data === true);
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => setIsOpen(false), [location.pathname]);

  if (!user) return null;

  const displayName = profile?.full_name || profile?.username || user.email?.split('@')[0] || 'Member';
  const accessLevel = profile?.access_level || 'basic';
  const initials = displayName.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EX';
  const identityLabel = isAdmin ? 'Trusted administrator' : `${accessLevel} member`;

  const destinations = [
    { label: 'Account overview', description: 'Your personal ETERNYX space', icon: LayoutDashboard, path: '/account' },
    { label: 'Profile & identity', description: 'Personal details and avatar', icon: UserRound, path: '/profile' },
    { label: 'Preferences', description: 'Notifications and appearance', icon: Settings2, path: '/settings' },
    { label: 'Notifications', description: 'Your account inbox', icon: Bell, path: '/notifications' },
    { label: 'My bug reports', description: 'Track submitted issues', icon: ClipboardList, path: '/my-bug-reports' },
    ...(isAdmin ? [{ label: 'Administrator console', description: 'Trusted administration workspace', icon: ShieldCheck, path: '/admin/bug-reports' }] : []),
  ];

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
  };

  return (
    <div className={className}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label={`Open account menu for ${displayName}`}
            className="group h-12 max-w-[min(19rem,42vw)] rounded-xl border border-white/10 bg-[#0a1221]/90 px-2.5 text-left shadow-[0_8px_30px_rgba(0,0,0,.22)] backdrop-blur-xl transition duration-200 hover:border-cyan-200/30 hover:bg-[#101d30] focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar className="h-8 w-8 shrink-0 border border-cyan-200/30">
                <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
                <AvatarFallback className="bg-cyan-200/10 text-xs font-semibold text-cyan-100">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 flex-col items-start sm:flex">
                <span className="flex max-w-full items-center gap-1.5">
                  <span className="max-w-[150px] truncate text-xs font-semibold text-slate-100">{displayName}</span>
                  {isAdmin ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <Shield className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{identityLabel}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={10} collisionPadding={12} className="z-[70] w-[min(340px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#080f1d]/[.98] p-1.5 text-slate-200 shadow-[0_24px_80px_rgba(0,0,0,.62)] backdrop-blur-2xl">
          <DropdownMenuLabel className="px-3 py-3 font-normal">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-11 w-11 shrink-0 border border-cyan-200/25 ring-4 ring-cyan-200/[0.06]">
                <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
                <AvatarFallback className="bg-cyan-200/10 font-semibold text-cyan-100">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <p className="mt-1 truncate text-xs text-slate-400" title={user.email || ''}>{user.email}</p>
                <p className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.17em] text-cyan-200/75">
                  {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                  {identityLabel}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="bg-white/10" />
          <div className="px-2 pb-1 pt-2">
            <p className="px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Your ETERNYX</p>
            <div className="grid gap-1">
              {destinations.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <DropdownMenuItem key={item.path} onSelect={() => navigate(item.path)} className={`min-h-11 cursor-pointer gap-3 rounded-xl px-2.5 focus:bg-cyan-200/10 focus:text-white ${active ? 'bg-cyan-200/[0.08] text-cyan-100' : 'text-slate-300 hover:bg-white/[0.045]'}`}>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${active ? 'border-cyan-200/20 bg-cyan-200/10 text-cyan-100' : 'border-white/[0.07] bg-white/[0.035] text-slate-400'}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{item.description}</span>
                    </span>
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-200" />}
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
                  </DropdownMenuItem>
                );
              })}
            </div>
          </div>

          {(accessLevel === 'basic' || accessLevel === 'premium') && (
            <>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onSelect={() => navigate('/premium')} className="min-h-10 cursor-pointer rounded-xl px-3 text-xs font-semibold text-violet-200 focus:bg-violet-300/10 focus:text-violet-100">
                <Crown className="mr-2 h-4 w-4" />
                Explore access plans
                <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem onSelect={handleSignOut} className="min-h-10 cursor-pointer rounded-xl px-3 text-xs font-semibold text-rose-300 focus:bg-rose-300/10 focus:text-rose-200">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out of ETERNYX
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default UserProfile;
