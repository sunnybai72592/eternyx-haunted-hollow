import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, Bug, CheckCircle2, Clock3, Filter, RefreshCw, Search, ShieldCheck, Signal, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';

type BugStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'closed';
type BugReport = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  severity: string;
  status: BugStatus;
  created_at: string;
};

const statuses: { value: BugStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const statusStyles: Record<BugStatus, string> = {
  open: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-200',
  triaged: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-200',
  in_progress: 'border-violet-300/20 bg-violet-300/[0.08] text-violet-200',
  resolved: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200',
  closed: 'border-slate-300/15 bg-slate-300/[0.06] text-slate-300',
};

const severityStyles: Record<string, string> = {
  critical: 'text-rose-200',
  high: 'text-orange-200',
  medium: 'text-amber-200',
  low: 'text-slate-300',
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminBugReports() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BugStatus>('all');
  const [loadError, setLoadError] = useState(false);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from('bug_reports')
      .select('id,user_id,title,description,severity,status,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(true);
      toast.error('Could not load bug reports.');
      console.error('Admin bug report query failed:', error);
    } else {
      setReports((data ?? []) as BugReport[]);
    }
    setLoadingReports(false);
  }, []);

  useEffect(() => {
    let active = true;
    const verifyAdmin = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) {
          setIsAdmin(false);
          setCheckingAccess(false);
        }
        return;
      }

      setCheckingAccess(true);
      const { data, error } = await supabase.rpc('is_admin');
      if (!active) return;
      if (error || data !== true) {
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setIsAdmin(true);
      setCheckingAccess(false);
      await loadReports();
    };

    void verifyAdmin();
    return () => { active = false; };
  }, [authLoading, user, loadReports]);

  const counts = useMemo(() => ({
    total: reports.length,
    open: reports.filter((report) => report.status === 'open').length,
    active: reports.filter((report) => report.status === 'triaged' || report.status === 'in_progress').length,
    resolved: reports.filter((report) => report.status === 'resolved' || report.status === 'closed').length,
  }), [reports]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
      const matchesSearch = !term || [report.title, report.description, report.severity, report.user_id]
        .some((value) => value?.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [reports, search, statusFilter]);

  const updateStatus = async (reportId: string, status: BugStatus) => {
    setUpdatingId(reportId);
    const { data, error } = await supabase.rpc('admin_update_bug_report_status', {
      p_report_id: reportId,
      p_status: status,
    });

    if (error) {
      toast.error('Status update failed. Please try again.');
      console.error('Bug report status update failed:', error);
    } else if (data === true) {
      setReports((current) => current.map((report) => report.id === reportId ? { ...report, status } : report));
      toast.success('Status updated and reporter notified.');
    } else {
      toast.info('This report already has that status.');
    }
    setUpdatingId(null);
  };

  if (authLoading || checkingAccess) {
    return <main className="mx-auto flex min-h-[55vh] max-w-5xl items-center justify-center px-4 text-sm text-slate-400">Verifying administrator access…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Card className="border-white/10 bg-[#0a1221] p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h1 className="text-2xl font-semibold text-white">Sign in required</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with an authorized administrator account to access this workspace.</p>
        </Card>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Card className="border-white/10 bg-[#0a1221] p-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h1 className="text-2xl font-semibold text-white">Administrator access only</h1>
          <p className="mt-2 text-sm text-slate-400">This workspace is restricted to authorized ETERNYX administrators.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-72 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
      <AdminWorkspaceNav />

      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">
            <ShieldCheck className="h-3.5 w-3.5" /> ETERNYX / Trusted administration
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Command center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A clear operational view of submitted issues, current workload and resolution progress.</p>
        </div>
        <Button variant="outline" onClick={() => void loadReports()} disabled={loadingReports} className="h-10 w-full border-white/15 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] sm:w-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingReports ? 'animate-spin' : ''}`} />
          Refresh data
        </Button>
      </header>

      <section aria-label="Bug report overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/[0.09] bg-[#0a1322]/90 p-5">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">All reports</span><Bug className="h-4 w-4 text-cyan-200" /></div>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-white">{reports.length}</p>
          <p className="mt-1 text-xs text-slate-500">Total submissions in the inbox</p>
        </Card>
        <Card className="border-white/[0.09] bg-[#0a1322]/90 p-5">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">Needs attention</span><AlertCircle className="h-4 w-4 text-amber-200" /></div>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-amber-100">{counts.open}</p>
          <p className="mt-1 text-xs text-slate-500">New reports awaiting triage</p>
        </Card>
        <Card className="border-white/[0.09] bg-[#0a1322]/90 p-5">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">Active workload</span><Clock3 className="h-4 w-4 text-violet-200" /></div>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-violet-100">{counts.active}</p>
          <p className="mt-1 text-xs text-slate-500">Triaged or currently in progress</p>
        </Card>
        <Card className="border-white/[0.09] bg-[#0a1322]/90 p-5">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">Completed</span><CheckCircle2 className="h-4 w-4 text-emerald-200" /></div>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-emerald-100">{counts.resolved}</p>
          <p className="mt-1 text-xs text-slate-500">Resolved or closed reports</p>
        </Card>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1221]/85">
        <div className="flex flex-col gap-4 border-b border-white/[0.08] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Operations queue</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Bug report inbox</h2>
              <p className="mt-1 text-xs text-slate-500">{filteredReports.length} of {reports.length} reports shown</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-1.5 text-[10px] font-semibold text-emerald-200">
              <Signal className="h-3.5 w-3.5" /> Admin access verified
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <span className="sr-only">Search bug reports</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, description or reporter ID…" className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10" />
            </label>
            <label className="relative block">
              <span className="sr-only">Filter reports by status</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | BugStatus)} className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#0b1424] pl-10 pr-4 text-sm text-slate-200 outline-none transition focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10">
                <option value="all">All statuses</option>
                {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {loadingReports && reports.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading the report queue…</div>
        ) : loadError ? (
          <div className="p-12 text-center">
            <XCircle className="mx-auto mb-3 h-7 w-7 text-rose-300" />
            <p className="text-sm font-medium text-white">The report queue could not be loaded.</p>
            <p className="mt-1 text-xs text-slate-500">Your administrator access is verified. Try refreshing the data.</p>
            <Button variant="outline" onClick={() => void loadReports()} className="mt-4 border-white/15 text-slate-200">Try again</Button>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-200" />
            <p className="text-sm font-medium text-white">The queue is clear.</p>
            <p className="mt-1 text-xs text-slate-500">New submissions will appear here.</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="mx-auto mb-3 h-7 w-7 text-slate-500" />
            <p className="text-sm font-medium text-white">No matching reports</p>
            <p className="mt-1 text-xs text-slate-500">Try another search term or status filter.</p>
            <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); }} className="mt-2 text-cyan-200 hover:text-white">Clear filters</Button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {filteredReports.map((report) => (
              <article key={report.id} className="p-5 transition-colors hover:bg-white/[0.015] sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusStyles[report.status] || statusStyles.open}`}>{statuses.find((status) => status.value === report.status)?.label || report.status}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${severityStyles[report.severity?.toLowerCase()] || 'text-slate-300'}`}>{report.severity || 'Unspecified'} severity</span>
                      <span className="text-[11px] text-slate-500">{formatDate(report.created_at)}</span>
                    </div>
                    <h3 className="break-words text-base font-semibold text-white sm:text-lg">{report.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{report.description}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-500">
                      <span className="break-all">Reporter ID: {report.user_id}</span>
                      <span className="break-all">Reference: {report.id.slice(0, 8)}</span>
                    </div>
                  </div>

                  <div className="w-full shrink-0 rounded-xl border border-white/[0.08] bg-black/15 p-3 xl:w-56">
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500" htmlFor={`status-${report.id}`}>Update workflow</label>
                    <select id={`status-${report.id}`} value={report.status} disabled={updatingId === report.id} onChange={(event) => void updateStatus(report.id, event.target.value as BugStatus)} className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1424] px-3 text-sm text-slate-100 outline-none focus:border-cyan-200/40 disabled:opacity-50">
                      {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                    {updatingId === report.id && <p className="mt-2 text-[11px] text-cyan-200">Saving update…</p>}
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">The reporter receives a notification when the status changes.</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-5 flex flex-col gap-2 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Administrator actions use the existing protected status-update workflow.</span>
        <span className="inline-flex items-center gap-1.5"><ArrowUpRight className="h-3.5 w-3.5" /> Data refreshes only when requested or after a status update.</span>
      </footer>
    </main>
  );
}
