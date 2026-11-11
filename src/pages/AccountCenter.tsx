import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  ArrowDownRight, ArrowRight, Bell, Bug, CheckCircle2, ChevronRight,
  CircleUserRound, Command, ExternalLink, LifeBuoy, LockKeyhole,
  Settings2, ShieldCheck, Sparkles, UserRound, Zap
} from 'lucide-react';

type AccountSummary = {
  reports: number | null;
  unread: number | null;
};

export default function AccountCenter() {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, isLoading } = useAuthStore();
  const [summary, setSummary] = useState<AccountSummary>({ reports: null, unread: null });
  const [dataLoading, setDataLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/auth', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setSummary({ reports: null, unread: null });
      setDataLoading(false);
      return;
    }

    let active = true;
    setDataLoading(true);

    const loadAccount = async () => {
      const [admin, reports, notifications] = await Promise.all([
        supabase.rpc('is_admin'),
        supabase.from('bug_reports').select('id', { count: 'exact', head: true }),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
      ]);

      if (!active) return;
      setIsAdmin(!admin.error && admin.data === true);
      setSummary({
        reports: reports.error ? null : reports.count ?? 0,
        unread: notifications.error ? null : notifications.count ?? 0,
      });
      setDataLoading(false);
    };

    void loadAccount();
    return () => { active = false; };
  }, [user?.id]);

  const name = profile?.full_name || profile?.username || user?.email?.split('@')[0] || 'ETERNYX member';
  const initials = useMemo(() => name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EX', [name]);
  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  const destinations = [
    { title: 'Profile & identity', description: 'Your personal details, profile image and public presence.', href: '/profile', icon: UserRound, eyebrow: 'IDENTITY', count: undefined },
    { title: 'Preferences', description: 'Tune notifications, appearance and account preferences.', href: '/settings', icon: Settings2, eyebrow: 'CONTROL', count: undefined },
    { title: 'Notifications', description: 'Keep up with important updates from your ETERNYX account.', href: '/notifications', icon: Bell, eyebrow: 'INBOX', count: summary.unread },
    { title: 'Bug reports', description: 'Follow the issues you have submitted and their progress.', href: '/my-bug-reports', icon: Bug, eyebrow: 'SUPPORT', count: summary.reports },
    { title: 'Help & support', description: 'Find guidance or get in touch with the ETERNYX team.', href: '/help', icon: LifeBuoy, eyebrow: 'ASSISTANCE', count: undefined },
    ...(isAdmin ? [{ title: 'Administrator console', description: 'Review and manage reports with trusted administrator access.', href: '/admin/bug-reports', icon: ShieldCheck, eyebrow: 'ADMINISTRATION', count: undefined }] : []),
  ];

  if (isLoading || (!isAuthenticated && !user)) {
    return (
      <main className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0a1020]/80 px-5 py-4 text-sm text-slate-400 shadow-2xl">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
          Restoring your ETERNYX identity…
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-80 rounded-full bg-cyan-400/[0.055] blur-[100px]" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
          <Command className="h-4 w-4" />
          Personal environment
          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          <span className="text-slate-400">Account center</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 text-[11px] font-medium text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.8)]" />
          Signed in
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-cyan-200/15 bg-[#080f1e] shadow-[0_28px_100px_rgba(0,0,0,.38)]">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_10%,rgba(34,211,238,.13),transparent_36%),linear-gradient(115deg,rgba(7,15,30,.98),rgba(9,18,34,.94)_55%,rgba(13,20,43,.92))]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(148,163,184,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.12)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
          <div className="min-w-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Your space in the ecosystem
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Welcome back, <span className="bg-gradient-to-r from-cyan-200 via-sky-200 to-violet-300 bg-clip-text text-transparent">{name}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              Your identity, preferences and activity—connected in one place. Make this environment yours.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-cyan-200 px-5 font-semibold text-slate-950 shadow-[0_8px_30px_rgba(103,232,249,.14)] hover:bg-cyan-100">
                <Link to="/profile">Manage profile <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-white/15 bg-white/[0.035] px-5 text-slate-200 hover:bg-white/[0.08] hover:text-white">
                <Link to="/settings">Account preferences <Settings2 className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl sm:min-w-[290px] sm:p-5">
            <Avatar className="h-[68px] w-[68px] shrink-0 border border-cyan-200/30 ring-4 ring-cyan-200/[0.07]">
              <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
              <AvatarFallback className="bg-cyan-200/10 text-lg font-semibold text-cyan-100">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">{name}</p>
              <p className="mt-1 truncate text-xs text-slate-400" title={user?.email || ''}>{user?.email}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-200/80">
                {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                {isAdmin ? 'Trusted administrator' : (profile?.access_level || 'Basic') + ' access'}
              </div>
              {joined && <p className="mt-1 text-[11px] text-slate-500">Member since {joined}</p>}
            </div>
          </div>
        </div>
        <div className="relative grid grid-cols-1 border-t border-white/[0.09] bg-black/20 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 px-6 py-5 sm:px-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Your submitted reports</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{dataLoading ? '—' : summary.reports ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] p-3 text-cyan-200"><Bug className="h-5 w-5" /></div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] px-6 py-5 sm:border-l sm:border-t-0 sm:px-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Unread notifications</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{dataLoading ? '—' : summary.unread ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-violet-200/15 bg-violet-200/[0.07] p-3 text-violet-200"><Bell className="h-5 w-5" /></div>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/65">Your control layer</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Account & workspace</h2>
            <p className="mt-2 text-sm text-slate-400">Everything connected to your ETERNYX identity, organized by purpose.</p>
          </div>
          <span className="text-xs text-slate-500">Private to your account</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {destinations.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} to={item.href} className="group relative flex min-h-[174px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1221]/85 p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-200/30 hover:bg-[#0d192b] hover:shadow-[0_18px_50px_rgba(0,0,0,.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                <div aria-hidden="true" className="absolute right-0 top-0 h-28 w-28 rounded-full bg-cyan-300/[0.035] blur-2xl transition group-hover:bg-cyan-300/[0.09]" />
                <div className="relative flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] text-cyan-100"><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="text-[9px] font-bold tracking-[0.18em] text-slate-600">0{index + 1} / {item.eyebrow}</span>
                </div>
                <div className="relative mt-5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-100 transition group-hover:text-cyan-100">{item.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-400">{item.description}</p>
                    {item.count !== undefined && <p className="mt-2 text-[11px] font-medium text-cyan-200/75">{dataLoading ? 'Updating…' : item.count === null ? 'Count unavailable' : item.count === 0 ? 'Nothing waiting' : item.title === 'Notifications' ? `${item.count} unread` : `${item.count} submitted`}</p>}
                  </div>
                  <ArrowDownRight className="mb-1 h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-cyan-200" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-10 flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-emerald-200/15 bg-emerald-200/[0.06] p-2 text-emerald-200"><CheckCircle2 className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-medium text-slate-200">Your account stays yours</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Private account pages use your signed-in session and existing access controls.</p>
          </div>
        </div>
        <Button variant="ghost" asChild className="justify-start text-slate-300 hover:text-white sm:justify-center">
          <Link to="/help">Need a hand? Visit support <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link>
        </Button>
      </section>
    </main>
  );
}
