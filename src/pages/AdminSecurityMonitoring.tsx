import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Clock3, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';

type ThreatEvent = {
  id: string;
  event_type: string;
  severity: string;
  source_ip: unknown;
  destination_ip: unknown;
  source_port: number | null;
  destination_port: number | null;
  protocol: string | null;
  detected_at: string | null;
  created_at: string | null;
  is_false_positive: boolean | null;
};

const PAGE_SIZE = 25;

const dateLabel = (value: string | null) => {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const ipLabel = (value: unknown) => value == null ? '—' : String(value);

const severityClass = (severity: string) => {
  switch (severity.toLowerCase()) {
    case 'critical': return 'border-rose-300/20 bg-rose-300/[0.07] text-rose-200';
    case 'high': return 'border-orange-300/20 bg-orange-300/[0.07] text-orange-200';
    case 'medium': return 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200';
    case 'low': return 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200';
    default: return 'border-white/10 bg-white/[0.04] text-slate-300';
  }
};

export default function AdminSecurityMonitoring() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [critical, setCritical] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [falsePositives, setFalsePositives] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let eventQuery = supabase
      .from('threat_monitoring_events')
      .select('id,event_type,severity,source_ip,destination_ip,source_port,destination_port,protocol,detected_at,created_at,is_false_positive', { count: 'exact' })
      .order('detected_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (search.trim()) eventQuery = eventQuery.ilike('event_type', `%${search.trim().slice(0, 80)}%`);
    if (severity !== 'all') eventQuery = eventQuery.eq('severity', severity);

    const [eventResult, criticalResult, highResult, falsePositiveResult] = await Promise.all([
      eventQuery,
      supabase.from('threat_monitoring_events').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
      supabase.from('threat_monitoring_events').select('id', { count: 'exact', head: true }).eq('severity', 'high'),
      supabase.from('threat_monitoring_events').select('id', { count: 'exact', head: true }).eq('is_false_positive', true),
    ]);

    setCritical(criticalResult.error ? null : criticalResult.count ?? 0);
    setHigh(highResult.error ? null : highResult.count ?? 0);
    setFalsePositives(falsePositiveResult.error ? null : falsePositiveResult.count ?? 0);

    if (eventResult.error) {
      setEvents([]);
      setTotal(0);
      setError(eventResult.error.message || 'Security events could not be loaded.');
    } else {
      setEvents((eventResult.data ?? []) as ThreatEvent[]);
      setTotal(eventResult.count ?? 0);
    }
    setLoading(false);
  }, [page, search, severity]);

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
      setIsAdmin(!accessError && data === true);
      setChecking(false);
    };
    void verify();
    return () => { active = false; };
  }, [authLoading, user]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const updateSearch = (value: string) => { setSearch(value); setPage(0); };
  const updateSeverity = (value: string) => { setSeverity(value); setPage(0); };
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (authLoading || checking) return <main className="mx-auto flex min-h-[55vh] items-center justify-center px-4 text-sm text-slate-400">Verifying administrator access…</main>;
  if (!user || !isAdmin) return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="border-white/10 bg-[#0a1221] p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-2xl font-semibold text-white">{user ? 'Administrator access only' : 'Sign in required'}</h1><p className="mt-2 text-sm text-slate-400">Security operations are restricted to authorized ETERNYX administrators.</p></Card></main>;

  const metrics = [
    { label: 'Critical events', value: critical, icon: ShieldAlert, tone: 'text-rose-200' },
    { label: 'High severity', value: high, icon: AlertTriangle, tone: 'text-orange-200' },
    { label: 'False positives', value: falsePositives, icon: Activity, tone: 'text-amber-200' },
  ];

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-72 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100"><ShieldCheck className="h-3.5 w-3.5" /> ETERNYX / Security operations</div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Threat monitoring</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review platform threat events, prioritize severity and inspect network indicators. This workspace is read-only.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="h-10 w-full border-white/15 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] sm:w-auto"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh events</Button>
      </header>

      <AdminWorkspaceNav />

      <section aria-label="Threat monitoring metrics" className="mb-7 grid gap-3 sm:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="border-white/[0.09] bg-[#0a1322]/90 p-5">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">{label}</span><Icon className="h-4 w-4" /></div>
          <p className={`mt-4 text-3xl font-semibold tabular-nums ${tone}`}>{value === null ? '—' : value.toLocaleString()}</p>
        </Card>)}
      </section>

      <section className="mb-5 rounded-2xl border border-white/[0.09] bg-[#0a1221]/85 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div>
            <label htmlFor="threat-event-search" className="mb-2 block text-xs font-semibold text-slate-300">Search event types</label>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="threat-event-search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Search DDoS, malware, suspicious login…" className="h-11 border-white/10 bg-black/20 pl-10 text-white placeholder:text-slate-600" /></div>
          </div>
          <div>
            <label htmlFor="threat-severity-filter" className="mb-2 block text-xs font-semibold text-slate-300">Severity</label>
            <select id="threat-severity-filter" value={severity} onChange={(event) => updateSeverity(event.target.value)} className="h-11 w-full rounded-md border border-white/10 bg-[#101b2b] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              <option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-4 text-sm text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {loading && events.length === 0 ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading threat events…</div>
        : events.length === 0 ? <Card className="border-white/[0.09] bg-[#0a1221]/85 p-10 text-center"><Activity className="mx-auto mb-3 h-8 w-8 text-slate-500" /><h2 className="text-lg font-semibold text-white">{error ? 'Monitoring data unavailable' : 'No matching threat events'}</h2><p className="mt-2 text-sm text-slate-500">{error ? 'Verify that the threat monitoring table and administrator read policy are available.' : 'Try another event type or severity filter.'}</p>{error && <Button variant="outline" onClick={() => void load()} className="mt-5 border-white/15 text-slate-200">Retry</Button>}</Card>
        : <>
          <div className="mb-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Showing <span className="font-semibold text-slate-300">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}</span> of {total.toLocaleString()} matching events</p>{loading && <span className="text-xs text-cyan-200">Refreshing…</span>}</div>
          <div className="space-y-3">
            {events.map((event) => <Card key={event.id} className="border-white/[0.09] bg-[#0a1221]/90 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-white">{event.event_type}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${severityClass(event.severity)}`}>{event.severity}</span>{event.is_false_positive && <span className="rounded-full border border-amber-200/15 bg-amber-200/[0.05] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Marked false positive</span>}</div>
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{dateLabel(event.detected_at || event.created_at)}</p>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:min-w-[420px]">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Source</p><p className="mt-1 break-all font-mono text-xs text-slate-200">{ipLabel(event.source_ip)}{event.source_port ? `:${event.source_port}` : ''}</p></div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Destination</p><p className="mt-1 break-all font-mono text-xs text-slate-200">{ipLabel(event.destination_ip)}{event.destination_port ? `:${event.destination_port}` : ''}</p></div>
                  <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Protocol</p><p className="mt-1 text-xs text-slate-300">{event.protocol || 'Not recorded'}</p></div>
                </div>
              </div>
            </Card>)}
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5"><p className="text-xs text-slate-500">Page {page + 1} of {pageCount}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))} className="border-white/15 text-slate-200"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((current) => current + 1)} className="border-white/15 text-slate-200">Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
        </>}
      <p className="mt-8 text-center text-[11px] leading-5 text-slate-600">Security event payloads and analyst notes are intentionally omitted from this overview. Browser access is read-only and enforced by the database administrator policy.</p>
    </main>
  );
}
