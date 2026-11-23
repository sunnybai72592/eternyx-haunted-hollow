import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';

type CheckResult = {
  id: string;
  title: string;
  explanation: string;
  available: boolean;
  reason: string | null;
};
type Probe = {
  id: string;
  title: string;
  explanation: string;
  check: () => PromiseLike<{ error: { code?: string; message?: string } | null }>;
};
const classifyError = (code: string | undefined, message: string | undefined): string => {
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
    return 'Feature may be missing or not exposed by the database API.';
  }
  if (code === '42501' || code === 'PGRST301' || /permission|unauthorized|forbidden/i.test(message ?? '')) {
    return 'This account cannot access the feature. The request has not been authorized.';
  }
  if (code === '57014' || /aborted|timeout|timed out|cancelled/i.test(message ?? '')) {
    return 'Connection or query timed out.';
  }
  if (/fetch|network|connect/i.test(message ?? '')) {
    return 'The database connection could not be reached.';
  }
  return 'Read-only query failed. Verify database deployment, API exposure and access.';
};
const OVERALL_TIMEOUT_MS = 15000;

export default function ServiceDeskReadiness({
  mode,
}: {
  mode: 'customer' | 'admin';
}) {
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const viewerKey = mode + ':' + (viewerId ?? 'signed-out');
  const viewerKeyRef = useRef(viewerKey);
  viewerKeyRef.current = viewerKey;
  const requestVersion = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [resultsKey, setResultsKey] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const visibleResults = viewerId && resultsKey === viewerKey ? results : [];
  const completed = !!viewerId && resultsKey === viewerKey;
  const passed = visibleResults.filter((item) => item.available).length;

  useEffect(() => {
    requestVersion.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setOpen(false);
    setRunning(false);
    setResults([]);
    setResultsKey(null);
    setCheckedAt(null);
    setError('');
    return () => {
      requestVersion.current++;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [viewerKey]);

  const run = useCallback(async () => {
    if (!viewerId || running) return;
    const seq = ++requestVersion.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS);
    const isCurrent = () => seq === requestVersion.current && viewerKeyRef.current === viewerKey
      && !controller.signal.aborted;

    setRunning(true);
    setError('');
    setResultsKey(null);
    setResults([]);
    setCheckedAt(null);
    try {
      const auth = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Auth verification timed out')), { once: true });
        }),
      ]);
      if (!isCurrent()) return;
      if (auth.error || !auth.data.user || auth.data.user.id !== viewerId) {
        setError('Sign in to the same account again before checking private Services features.');
        return;
      }
      if (mode === 'admin') {
        const { data: isAdmin, error: roleError } = await supabase.rpc('is_admin')
          .abortSignal(controller.signal);
        if (!isCurrent()) return;
        if (roleError) {
          setError('Could not verify administrator access. No admin-only checks were performed.');
          return;
        }
        if (isAdmin !== true) {
          setError('Administrator access is required for private operator diagnostics.');
          return;
        }
      }

      // A successful HEAD request means only that the resource can be queried
      // by this session. It does NOT prove RLS isolation or service delivery.
      const checks: Probe[] = [
        {
          id: 'requests', title: 'Request intake', explanation: 'Private service request records',
          check: () => supabase.from('service_requests').select('id', { head: true }).limit(1).abortSignal(controller.signal),
        },
        {
          id: 'conversation', title: 'Conversation history', explanation: 'Recorded customer/admin messages and statuses',
          check: () => supabase.from('service_request_activity').select('id', { head: true }).limit(1).abortSignal(controller.signal),
        },
        {
          id: 'scope', title: 'Scope reviews', explanation: 'Published nonbinding scope reviews',
          check: () => supabase.from('service_scope_reviews').select('id', { head: true }).limit(1).abortSignal(controller.signal),
        },
        {
          id: 'clarifications', title: 'Clarification questions', explanation: 'Saved questions and owner responses',
          check: () => supabase.from('service_clarification_questions').select('id', { head: true }).limit(1).abortSignal(controller.signal),
        },
        {
          id: 'amendments', title: 'Brief amendments', explanation: 'Immutable customer-submitted brief changes (Phase 13)',
          check: () => supabase.from('service_brief_amendments').select('id', { head: true }).limit(1).abortSignal(controller.signal),
        },
        {
          id: 'journal', title: 'Activity journal', explanation: 'Read-only unified request activity (Phase 14)',
          check: () => supabase.from('service_request_journal').select('event_key', { head: true }).limit(1).abortSignal(controller.signal),
        },
        mode === 'admin'
          ? {
              id: 'queue', title: 'Administrator request queue', explanation: 'Private admin follow-up and work queues',
              check: () => supabase.from('service_admin_amendment_queue').select('id', { head: true }).limit(1).abortSignal(controller.signal),
            }
          : {
              id: 'queue', title: 'Customer request queue', explanation: 'Owner-scoped follow-up and personal action counts',
              check: () => supabase.from('service_customer_amendment_queue').select('id', { head: true }).limit(1).abortSignal(controller.signal),
            },
      ];

      if (mode === 'admin') {
        checks.push({
          id: 'triage', title: 'Internal triage', explanation: 'Administrator-only scheduling and assignment records',
          check: () => supabase.from('service_request_triage').select('request_id', { head: true }).limit(1).abortSignal(controller.signal),
        });
      }

      const next = await Promise.all(checks.map(async (probe): Promise<CheckResult> => {
        try {
          const { error: probeError } = await probe.check();
          return {
            id: probe.id, title: probe.title, explanation: probe.explanation,
            available: !probeError,
            reason: probeError ? classifyError(probeError.code, probeError.message) : null,
          };
        } catch (reason) {
          return {
            id: probe.id, title: probe.title, explanation: probe.explanation,
            available: false,
            reason: classifyError(undefined, reason instanceof Error ? reason.message : ''),
          };
        }
      }));
      if (!isCurrent()) return;
      setResults(next);
      setResultsKey(viewerKey);
      setCheckedAt(new Date().toISOString());
    } catch (reason) {
      if (isCurrent()) {
        console.error('Services availability verification failed', reason);
        setError('Could not complete account verification. No readiness claim was made.');
      } else if (seq === requestVersion.current && viewerKeyRef.current === viewerKey) {
        setError('Service diagnostic check timed out. Retry when the connection is available.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (seq === requestVersion.current && viewerKeyRef.current === viewerKey) {
        controllerRef.current = null;
        setRunning(false);
      }
    }
  }, [viewerId, viewerKey, mode, running]);

  return (
    <section aria-label="Service feature availability" className="mb-6 rounded-xl border border-border bg-card/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />Service feature availability
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Read-only checks against your signed-in account. Queries do not create, edit, or send anything.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={open}
          onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide diagnostics' : 'Check service availability'}
        </Button>
      </div>
      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={() => void run()} disabled={running || !viewerId}>
              <RefreshCw className="mr-2 h-4 w-4" />{running ? 'Checking…' : completed ? 'Run checks again' : 'Run availability checks'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {completed
                ? passed + ' of ' + visibleResults.length + ' read-only queries succeeded'
                : 'Not checked for this account'}
            </span>
          </div>
          {!viewerId && <p className="mt-3 text-xs text-muted-foreground">Sign in before checking private Services data.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          {completed && checkedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              Checked at {new Date(checkedAt).toLocaleString()} (device time). This is a point-in-time API check, not an RLS audit or production uptime guarantee.
            </p>
          )}
          {completed && (
            <ul className="mt-3 space-y-2">
              {visibleResults.map((item) => (
                <li key={item.id} className="flex items-start gap-2 rounded-lg border border-border/70 p-3 text-sm">
                  {item.available ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                  <div>
                    <p className="font-semibold">{item.title}: {item.available ? 'Query available' : 'Query unavailable'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.explanation}</p>
                    {item.reason && <p className="mt-1 text-xs text-destructive">{item.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Empty results can still mean the API is accessible. These checks cannot prove row-level security
            isolation, migration-history consistency, or a completed customer workflow.
            If a feature is unavailable, retry later and ask an administrator to inspect deployment and database logs.
          </p>
        </div>
      )}
    </section>
  );
}
