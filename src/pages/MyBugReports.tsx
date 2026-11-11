import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Bug, ClipboardList, Clock3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type BugStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'closed';
type BugReport = {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: BugStatus;
  created_at: string;
};

const statusDetails: Record<BugStatus, { label: string; explanation: string }> = {
  open: { label: 'Received', explanation: 'Your report has been received and is waiting for review.' },
  triaged: { label: 'Under review', explanation: 'The team has reviewed and categorized your report.' },
  in_progress: { label: 'In progress', explanation: 'The team is actively investigating or working on this issue.' },
  resolved: { label: 'Resolved', explanation: 'The team has marked this issue as resolved.' },
  closed: { label: 'Closed', explanation: 'This report has been closed.' },
};

export default function MyBugReports() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bug_reports')
      .select('id,title,description,severity,status,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Personal bug reports query failed:', error);
      toast.error('Could not load your bug reports. Please try again.');
    } else {
      setReports((data ?? []) as BugReport[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error) {
        console.error('Could not verify signed-in user:', error);
        toast.error('Could not verify your account. Please sign in again.');
      }
      setUserId(user?.id ?? null);
      setCheckingUser(false);
      if (user) await loadReports();
    };
    void initialize();
    return () => { active = false; };
  }, [loadReports]);

  if (checkingUser) {
    return <main className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">Checking your account…</main>;
  }

  if (!userId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Card className="p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Sign in to view your reports</h1>
          <p className="mt-2 text-muted-foreground">Your bug reports are private to your ETERNYX account.</p>
          <Button asChild className="mt-5"><Link to="/auth">Sign in</Link></Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><ClipboardList className="h-5 w-5" /><span className="text-sm font-medium">ETERNYX · Your account</span></div>
          <h1 className="text-3xl font-bold">My bug reports</h1>
          <p className="mt-2 text-muted-foreground">Track the progress of issues you have submitted to our team.</p>
        </div>
        <Button variant="outline" onClick={() => void loadReports()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh status
        </Button>
      </header>

      {loading && reports.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Loading your reports…</Card>
      ) : reports.length === 0 ? (
        <Card className="p-8 text-center">
          <Bug className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-xl font-semibold">No reports yet</h2>
          <p className="mt-2 text-muted-foreground">When you submit a bug report, it will appear here.</p>
          <Button asChild className="mt-5"><Link to="/bug-report">Report a bug</Link></Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const status = statusDetails[report.status] ?? statusDetails.open;
            return (
              <Card key={report.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">{report.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(report.created_at).toLocaleString()}</p>
                  </div>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{status.label}</span>
                </div>
                <div className="mt-4 rounded-lg border border-border/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4 text-primary" />Current status</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{status.explanation}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Severity: {report.severity}</span>
                  <span>Report ID: {report.id}</span>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-primary">View submitted description</summary>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{report.description}</p>
                </details>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">Statuses update when our team reviews your report. Use “Refresh status” to check for the latest update.</p>
    </main>
  );
}
