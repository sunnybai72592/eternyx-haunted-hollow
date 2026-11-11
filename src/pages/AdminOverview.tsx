import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Bug, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';

type Report = { id: string; title: string; status: string; created_at: string };
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function AdminOverview() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  const load = async () => {
    setLoading(true);
    setError(false);
    const { data, error: queryError } = await supabase.from('bug_reports').select('id,title,status,created_at').order('created_at', { ascending: false });
    if (queryError) {
      setError(true);
      console.error('Admin overview query failed:', queryError);
    } else setReports((data ?? []) as Report[]);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (authLoading) return;
      if (!user) { if (active) { setIsAdmin(false); setChecking(false); } return; }
      const { data, error: accessError } = await supabase.rpc('is_admin');
      if (!active) return;
      const allowed = !accessError && data === true;
      setIsAdmin(allowed);
      setChecking(false);
      if (allowed) await load();
    };
    void verify();
    return () => { active = false; };
  }, [authLoading, user]);

  const metrics = useMemo(() => ({
    total: reports.length,
    open: reports.filter((r) => r.status === 'open').length,
    active: reports.filter((r) => r.status === 'triaged' || r.status === 'in_progress').length,
    completed: reports.filter((r) => r.status === 'resolved' || r.status === 'closed').length,
  }), [reports]);

  if (authLoading || checking) return <main className="mx-auto flex min-h-[55vh] items-center justify-center px-4 text-sm text-slate-400">Verifying administrator access…</main>;
  if (!user || !isAdmin) return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="border-white/10 bg-[#0a1221] p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-2xl font-semibold text-white">{user ? 'Administrator access only' : 'Sign in required'}</h1><p className="mt-2 text-sm text-slate-400">This workspace is restricted to authorized ETERNYX administrators.</p></Card></main>;

  const tiles = [
    { label: 'All reports', value: metrics.total, note: 'Total submitted issues', icon: Bug, tone: 'text-cyan-100' },
    { label: 'Needs attention', value: metrics.open, note: 'Awaiting initial triage', icon: AlertCircle, tone: 'text-amber-100' },
    { label: 'Active workload', value: metrics.active, note: 'Triaged or in progress', icon: Clock3, tone: 'text-violet-100' },
    { label: 'Completed', value: metrics.completed, note: 'Resolved or closed', icon: CheckCircle2, tone: 'text-emerald-100' },
  ];

  return <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-72 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
    <header className="mb-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100"><ShieldCheck className="h-3.5 w-3.5" /> ETERNYX / Trusted administration</div>
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Administrator workspace</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Your operational starting point for platform support and issue resolution.</p>
    </header>
    <AdminWorkspaceNav />
    <section aria-label="Support operations overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(({ label, value, note, icon: Icon, tone }) => <Card key={label} className="border-white/[0.09] bg-[#0a1322]/90 p-5">
        <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">{label}</span><Icon className="h-4 w-4" /></div>
        <p className={`mt-4 text-3xl font-semibold tabular-nums ${tone}`}>{loading ? '—' : value}</p><p className="mt-1 text-xs text-slate-500">{note}</p>
      </Card>)}
    </section>
    <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1221]/85">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-5 sm:p-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Latest activity</p><h2 className="mt-1 text-xl font-semibold text-white">Recent bug reports</h2><p className="mt-1 text-xs text-slate-500">A quick view of the latest support submissions.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/15 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08]"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      {error ? <div className="p-10 text-center"><AlertCircle className="mx-auto mb-3 h-7 w-7 text-rose-300" /><p className="text-sm text-slate-300">Support activity could not be loaded.</p><Button variant="outline" onClick={() => void load()} className="mt-4 border-white/15 text-slate-200">Try again</Button></div>
        : reports.length === 0 && !loading ? <div className="p-10 text-center text-sm text-slate-400">No bug reports have been submitted yet.</div>
        : <div className="divide-y divide-white/[0.07]">{reports.slice(0, 6).map((report) => <div key={report.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{report.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(report.created_at)}</p></div><span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{report.status.replace('_', ' ')}</span></div>)}</div>}
      <div className="border-t border-white/[0.08] p-4 sm:px-6"><Link to="/admin/bug-reports" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-cyan-200 transition hover:text-white">Open report operations <ArrowRight className="h-4 w-4" /></Link></div>
    </section>
    <p className="mt-5 text-[11px] text-slate-500">Administrator access is verified through the existing trusted-admin authorization function.</p>
  </main>;
}
