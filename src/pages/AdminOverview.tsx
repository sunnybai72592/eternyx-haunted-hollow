import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Bug, Building2, CheckCircle2, Clock3, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';

type ActivityItem = {
  id: string;
  kind: 'bug' | 'enquiry';
  title: string;
  subtitle: string;
  status: string;
  created_at: string;
  href: string;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const formatStatus = (value: string) => value.replace(/[_-]/g, ' ');

export default function AdminOverview() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bugTotal, setBugTotal] = useState<number | null>(null);
  const [bugOpen, setBugOpen] = useState<number | null>(null);
  const [enquiryTotal, setEnquiryTotal] = useState<number | null>(null);
  const [enquiryNew, setEnquiryNew] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [bugError, setBugError] = useState(false);
  const [enquiryError, setEnquiryError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [bugCount, openBugCount, recentBugs, enquiryCount, newEnquiryCount, recentEnquiries] = await Promise.all([
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }),
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('bug_reports').select('id,title,status,created_at').order('created_at', { ascending: false }).limit(8),
      supabase.from('contact_submissions').select('id', { count: 'exact', head: true }),
      supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('contact_submissions').select('id,name,subject,status,created_at').order('created_at', { ascending: false }).limit(8),
    ]);

    const hasBugError = Boolean(bugCount.error || openBugCount.error || recentBugs.error);
    const hasEnquiryError = Boolean(enquiryCount.error || newEnquiryCount.error || recentEnquiries.error);
    setBugError(hasBugError);
    setEnquiryError(hasEnquiryError);
    setBugTotal(bugCount.error ? null : bugCount.count ?? 0);
    setBugOpen(openBugCount.error ? null : openBugCount.count ?? 0);
    setEnquiryTotal(enquiryCount.error ? null : enquiryCount.count ?? 0);
    setEnquiryNew(newEnquiryCount.error ? null : newEnquiryCount.count ?? 0);

    const bugItems: ActivityItem[] = recentBugs.error ? [] : (recentBugs.data ?? []).map((report) => ({
      id: report.id,
      kind: 'bug',
      title: report.title,
      subtitle: 'Bug report',
      status: report.status,
      created_at: report.created_at,
      href: '/admin/bug-reports',
    }));
    const enquiryItems: ActivityItem[] = recentEnquiries.error ? [] : (recentEnquiries.data ?? []).map((enquiry) => ({
      id: enquiry.id,
      kind: 'enquiry',
      title: enquiry.subject,
      subtitle: `Business enquiry · ${enquiry.name}`,
      status: enquiry.status ?? 'new',
      created_at: enquiry.created_at,
      href: '/admin/enquiries',
    }));
    setActivity([...bugItems, ...enquiryItems].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10));
    setLoading(false);

    if (hasBugError) console.error('Admin overview could not fully load bug-report data:', bugCount.error || openBugCount.error || recentBugs.error);
    if (hasEnquiryError) console.error('Admin overview could not fully load enquiry data:', enquiryCount.error || newEnquiryCount.error || recentEnquiries.error);
  }, []);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) { setIsAdmin(false); setChecking(false); }
        return;
      }
      const { data, error: accessError } = await supabase.rpc('is_admin');
      if (!active) return;
      const allowed = !accessError && data === true;
      setIsAdmin(allowed);
      setChecking(false);
      if (allowed) await load();
    };
    void verify();
    return () => { active = false; };
  }, [authLoading, user, load]);

  const metrics = useMemo(() => [
    { label: 'Bug reports', value: bugTotal, note: 'All submitted issues', icon: Bug, tone: 'text-cyan-100', href: '/admin/bug-reports' },
    { label: 'Open reports', value: bugOpen, note: 'Awaiting initial triage', icon: AlertCircle, tone: 'text-amber-100', href: '/admin/bug-reports' },
    { label: 'Business enquiries', value: enquiryTotal, note: 'All contact submissions', icon: Mail, tone: 'text-sky-100', href: '/admin/enquiries' },
    { label: 'New enquiries', value: enquiryNew, note: 'Awaiting first response', icon: Clock3, tone: 'text-violet-100', href: '/admin/enquiries' },
  ], [bugTotal, bugOpen, enquiryTotal, enquiryNew]);

  if (authLoading || checking) return <main className="mx-auto flex min-h-[55vh] items-center justify-center px-4 text-sm text-slate-400">Verifying administrator access…</main>;
  if (!user || !isAdmin) return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="border-white/10 bg-[#0a1221] p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-2xl font-semibold text-white">{user ? 'Administrator access only' : 'Sign in required'}</h1><p className="mt-2 text-sm text-slate-400">This workspace is restricted to authorized ETERNYX administrators.</p></Card></main>;

  return <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-72 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100"><ShieldCheck className="h-3.5 w-3.5" /> ETERNYX / Trusted administration</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Administrator workspace</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A unified operational view of platform support, incoming enquiries and current workload.</p>
      </div>
      <Button variant="outline" onClick={() => void load()} disabled={loading} className="h-10 w-full border-white/15 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] sm:w-auto"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh overview</Button>
    </header>
    <AdminWorkspaceNav />

    <section aria-label="Platform operations metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, note, icon: Icon, tone, href }) => <Link key={label} to={href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
        <Card className="h-full border-white/[0.09] bg-[#0a1322]/90 p-5 transition-colors group-hover:border-cyan-200/20 group-hover:bg-[#0d192b]">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">{label}</span><Icon className="h-4 w-4" /></div>
          <p className={`mt-4 text-3xl font-semibold tabular-nums ${tone}`}>{loading && value === null ? '—' : value ?? 'Unavailable'}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </Card>
      </Link>)}
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1221]/85">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-5 sm:p-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Operations feed</p><h2 className="mt-1 text-xl font-semibold text-white">Recent platform activity</h2><p className="mt-1 text-xs text-slate-500">The latest support reports and business enquiries, ordered by submission time.</p></div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-1.5 text-[10px] font-semibold text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" /> Admin access verified</span>
      </div>
      {(bugError || enquiryError) && <div role="status" className="flex items-start gap-2 border-b border-amber-200/10 bg-amber-200/[0.04] px-5 py-3 text-xs text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Some activity data could not be loaded. Available records are still shown; refresh to try again.</div>}
      {loading && activity.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">Loading platform activity…</div>
        : activity.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">{bugError && enquiryError ? 'Activity could not be loaded.' : 'No support reports or business enquiries have been submitted yet.'}</div>
        : <div className="divide-y divide-white/[0.07]">{activity.map((item) => {
          const isBug = item.kind === 'bug';
          return <Link key={`${item.kind}-${item.id}`} to={item.href} className="flex flex-col gap-3 p-5 transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-cyan-200">{isBug ? <Bug className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}</span>
              <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-100">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.subtitle} · {formatDate(item.created_at)}</p></div>
            </div>
            <div className="flex items-center gap-3 pl-11 sm:pl-0"><span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{formatStatus(item.status)}</span><ArrowRight className="h-4 w-4 text-slate-500" /></div>
          </Link>;
        })}</div>}
      <div className="flex flex-wrap gap-4 border-t border-white/[0.08] p-4 sm:px-6">
        <Link to="/admin/bug-reports" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-cyan-200 transition hover:text-white">Open bug reports <ArrowRight className="h-4 w-4" /></Link>
        <Link to="/admin/enquiries" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-cyan-200 transition hover:text-white">Open business enquiries <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </section>
    <p className="mt-5 text-[11px] text-slate-500">Metrics use exact database counts. The activity feed displays recent records only and does not expose private user notifications.</p>
  </main>;
}
