import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bug, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type BugStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'closed';
type BugReport = { id: string; user_id: string; title: string; description: string; severity: string; status: BugStatus; created_at: string };
const statuses: { value: BugStatus; label: string }[] = [
  { value: 'open', label: 'Open' }, { value: 'triaged', label: 'Triaged' },
  { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function AdminBugReports() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    const { data, error } = await supabase.from('bug_reports')
      .select('id,user_id,title,description,severity,status,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Could not load bug reports.');
      console.error('Admin bug report query failed:', error);
    } else setReports((data ?? []) as BugReport[]);
    setLoadingReports(false);
  }, []);

  useEffect(() => {
    let active = true;
    const verifyAdmin = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) { setIsAdmin(false); setCheckingAccess(false); }
        return;
      }
      setCheckingAccess(true);
      const { data, error } = await supabase.rpc('is_admin');
      if (!active) return;
      if (error || data !== true) { setIsAdmin(false); setCheckingAccess(false); return; }
      setIsAdmin(true);
      setCheckingAccess(false);
      await loadReports();
    };
    void verifyAdmin();
    return () => { active = false; };
  }, [authLoading, user, loadReports]);

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

  if (authLoading || checkingAccess) return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-muted-foreground">Verifying administrator access…</main>;
  if (!user) return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="p-8 text-center"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h1 className="text-2xl font-bold">Sign in required</h1><p className="mt-2 text-muted-foreground">Sign in with an authorized administrator account to access bug reports.</p></Card></main>;
  if (!isAdmin) return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h1 className="text-2xl font-bold">Administrator access only</h1><p className="mt-2 text-muted-foreground">This area is restricted to authorized ETERNYX administrators.</p></Card></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-primary"><Bug className="h-5 w-5" /><span className="text-sm font-medium">ETERNYX · Administration</span></div><h1 className="text-3xl font-bold">Bug report inbox</h1><p className="mt-2 text-muted-foreground">Review submitted issues and update their workflow status.</p></div>
        <Button variant="outline" onClick={() => void loadReports()} disabled={loadingReports}><RefreshCw className={`mr-2 h-4 w-4 ${loadingReports ? 'animate-spin' : ''}`} />Refresh</Button>
      </header>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-muted-foreground">Total reports</p><p className="mt-1 text-2xl font-semibold">{reports.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">Open</p><p className="mt-1 text-2xl font-semibold">{reports.filter((r) => r.status === 'open').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">In progress</p><p className="mt-1 text-2xl font-semibold">{reports.filter((r) => r.status === 'in_progress').length}</p></Card>
      </div>
      {loadingReports && reports.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Loading reports…</Card>
        : reports.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No bug reports have been submitted yet.</Card>
        : <div className="space-y-4">{reports.map((report) => (
          <Card key={report.id} className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full border px-2 py-1 uppercase">{report.severity}</span><span>{new Date(report.created_at).toLocaleString()}</span></div>
                <h2 className="text-lg font-semibold">{report.title}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{report.description}</p>
                <p className="mt-4 break-all text-xs text-muted-foreground">Reporter: {report.user_id}</p>
              </div>
              <div className="w-full lg:w-48"><label className="mb-2 block text-sm font-medium" htmlFor={`status-${report.id}`}>Workflow status</label>
                <select id={`status-${report.id}`} value={report.status} disabled={updatingId === report.id} onChange={(event) => void updateStatus(report.id, event.target.value as BugStatus)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>{updatingId === report.id && <p className="mt-2 text-xs text-muted-foreground">Saving…</p>}
              </div>
            </div>
          </Card>
        ))}</div>}
    </main>
  );
}
