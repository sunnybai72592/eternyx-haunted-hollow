import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, Bell, Bug, ClipboardList, LifeBuoy, Settings, UserRound } from 'lucide-react';

export default function AccountCenter() {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, isLoading } = useAuthStore();
  const [reportCount, setReportCount] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/auth', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadSummary = async () => {
      setDataLoading(true);
      const [reports, notifications] = await Promise.all([
        supabase.from('bug_reports').select('id', { count: 'exact', head: true }),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
      ]);
      if (!active) return;
      setReportCount(reports.error ? null : reports.count ?? 0);
      setUnreadCount(notifications.error ? null : notifications.count ?? 0);
      setDataLoading(false);
    };
    void loadSummary();
    return () => { active = false; };
  }, [user?.id]);

  if (isLoading || (!isAuthenticated && !user)) {
    return <main className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-4 text-muted-foreground">Loading your account…</main>;
  }

  const name = profile?.full_name || profile?.username || user?.email?.split('@')[0] || 'ETERNYX member';
  const initials = name.slice(0, 2).toUpperCase();
  const tiles = [
    { title: 'My Profile', description: 'Personal details, avatar and public profile visibility.', href: '/profile', icon: UserRound },
    { title: 'Settings & Preferences', description: 'Manage your preferences and privacy controls.', href: '/settings', icon: Settings },
    { title: 'Notifications', description: 'View messages and updates sent to your account.', href: '/notifications', icon: Bell },
    { title: 'My Bug Reports', description: 'Follow the status of issues you have submitted.', href: '/my-bug-reports', icon: Bug },
    { title: 'Help & Support', description: 'Find help or contact the ETERNYX team.', href: '/help', icon: LifeBuoy },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-20 pt-8">
      <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-2 ring-primary/30">
            <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-primary">YOUR ETERNYX</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Account overview</h1>
            <p className="text-sm text-muted-foreground">{name} · {user?.email}</p>
          </div>
        </div>
        <Button asChild variant="outline"><Link to="/profile">Edit profile <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">Bug reports submitted</p><p className="mt-1 text-3xl font-semibold">{dataLoading ? '…' : reportCount ?? '—'}</p></div>
            <ClipboardList className="h-8 w-8 text-primary" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Your reports stored in ETERNYX.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">Unread notifications</p><p className="mt-1 text-3xl font-semibold">{dataLoading ? '…' : unreadCount ?? '—'}</p></div>
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Updates waiting in your notification inbox.</p>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-semibold">Your account</h2><p className="text-sm text-muted-foreground">Manage the parts of ETERNYX connected to your identity.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          {tiles.map((tile) => (
            <Link key={tile.href} to={tile.href} className="group">
              <Card className="flex h-full items-center gap-4 p-5 transition-colors hover:border-primary/50">
                <div className="rounded-xl bg-primary/10 p-3"><tile.icon className="h-5 w-5 text-primary" /></div>
                <div className="min-w-0 flex-1"><h3 className="font-semibold">{tile.title}</h3><p className="mt-1 text-sm text-muted-foreground">{tile.description}</p></div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

    </main>
  );
}
