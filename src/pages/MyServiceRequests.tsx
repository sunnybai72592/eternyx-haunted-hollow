import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, Download, MessageCircle, RefreshCw, Search, ShieldCheck, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { getServiceOffering, serviceRequestStatuses, type ServiceRequestStatus } from '@/lib/serviceOfferings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import ServiceRequestTimeline from '@/components/services/ServiceRequestTimeline';
import ServiceScopeReview from '@/components/services/ServiceScopeReview';
import ServiceClarifications from '@/components/services/ServiceClarifications';
import ServiceBriefAmendments from '@/components/services/ServiceBriefAmendments';
import ServiceRequestJournal from '@/components/services/ServiceRequestJournal';
import ServiceActionPulse from '@/components/services/ServiceActionPulse';
import { runServiceCountBudget } from '@/lib/serviceCountBudget';
import ServiceDeskReadiness from '@/components/services/ServiceDeskReadiness';
import ServiceRequestSectionLinks from '@/components/services/ServiceRequestSectionLinks';
import { readRequestPanel } from '@/lib/serviceRequestPanels';
import { describePrivateRequestRead } from '@/lib/servicePrivateRequestReliability';
import { readQueuePreset, buildQueuePresetLink, downloadServiceQueueCsv, type OwnerQueuePreset } from '@/lib/serviceQueueViews';

type RequestRow = {
  id: string; service_key: string; title: string; description: string;
  status: ServiceRequestStatus; client_update: string | null;
  created_at: string; updated_at: string;
  expected_outcome: string | null; timeframe: string | null; constraints: string | null;
  last_admin_activity_at: string | null; last_checked_at: string | null;
  has_updates_since_check: boolean;
  has_updates_since_check_extended: boolean;
  last_clarification_activity_at: string | null;
  clarification_changes_since_check: number;
  amendment_count: number; pending_amendment_count: number;
  last_amendment_reviewed_at: string | null; has_updates_since_check_complete: boolean;
  open_clarification_count: number; awaiting_customer_count: number; awaiting_admin_review_count: number;
};

export default function MyServiceRequests() {
  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? null;
  const requestGeneration = useRef(0);
  const location = useLocation();
  const selectedPanel = readRequestPanel(location.search, 'customer');
  const createdId = (location.state as { createdId?: string } | null)?.createdId;
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [rowsOwner, setRowsOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | ServiceRequestStatus>('all');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [answersOnly, setAnswersOnly] = useState(false);
  const [pendingReviewsOnly, setPendingReviewsOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'request_updated'>('newest');
  const pulseGeneration = useRef(0);
  const pulseAbortRef = useRef<AbortController | null>(null);
  const [pulseOwner, setPulseOwner] = useState<string | null>(null);
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseCounts, setPulseCounts] = useState<{
    all: number | null; newActivity: number | null; answers: number | null; pendingReviews: number | null;
  }>({ all: null, newActivity: null, answers: null, pendingReviews: null });
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [linkedRequest, setLinkedRequest] = useState<RequestRow | null>(null);
  const [linkedOwner, setLinkedOwner] = useState<string | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedError, setLinkedError] = useState('');
  const [linkedRetryable, setLinkedRetryable] = useState(false);
  const [linkedRetry, setLinkedRetry] = useState(0);
  const [openConversation, setOpenConversation] = useState<string | null>(new URLSearchParams(location.search).get('request'));
  const [openScope, setOpenScope] = useState<string | null>(null);
  const [openClarifications, setOpenClarifications] = useState<string | null>(null);
  const [openAmendments, setOpenAmendments] = useState<string | null>(null);
  const [openJournal, setOpenJournal] = useState<string | null>(null);
  const loadPulse = useCallback(async () => {
    const seq = ++pulseGeneration.current;
    pulseAbortRef.current?.abort();
    if (!userId) {
      setPulseOwner(null);
      setPulseLoading(false);
      setPulseCounts({ all: null, newActivity: null, answers: null, pendingReviews: null });
      return;
    }
    const controller = new AbortController();
    pulseAbortRef.current = controller;
    setPulseLoading(true);
    // Deliberately construct only one count query at a time. The queue
    // view is layered; eagerly firing four exact counts on page entry
    // can amplify load when a database is already slow.
    const queries = [
      (signal: AbortSignal) => supabase.from('service_customer_amendment_queue')
        .select('id', { head: true, count: 'exact' }).eq('user_id', userId).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_customer_amendment_queue')
        .select('id', { head: true, count: 'exact' }).eq('user_id', userId)
        .eq('has_updates_since_check_complete', true).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_customer_amendment_queue')
        .select('id', { head: true, count: 'exact' }).eq('user_id', userId)
        .gt('awaiting_customer_count', 0).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_customer_amendment_queue')
        .select('id', { head: true, count: 'exact' }).eq('user_id', userId)
        .gt('pending_amendment_count', 0).abortSignal(signal),
    ];
    try {
      const { counts } = await runServiceCountBudget(
        queries,
        () => seq === pulseGeneration.current && useAuthStore.getState().user?.id === userId,
        controller.signal,
      );
      if (seq !== pulseGeneration.current || useAuthStore.getState().user?.id !== userId) return;
      setPulseCounts({
        all: counts[0], newActivity: counts[1], answers: counts[2], pendingReviews: counts[3],
      });
      setPulseOwner(userId);
    } finally {
      if (seq === pulseGeneration.current && useAuthStore.getState().user?.id === userId) {
        pulseAbortRef.current = null;
        setPulseLoading(false);
      }
    }
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError(false);
    let query = supabase.from('service_customer_amendment_queue')
      .select('id,service_key,title,description,status,client_update,created_at,updated_at,expected_outcome,timeframe,constraints,last_admin_activity_at,last_checked_at,has_updates_since_check,open_clarification_count,awaiting_customer_count,awaiting_admin_review_count,last_clarification_activity_at,has_updates_since_check_extended,clarification_changes_since_check,amendment_count,pending_amendment_count,last_amendment_reviewed_at,has_updates_since_check_complete', { count: 'exact' })
      .eq('user_id', userId);
    if (filter !== 'all') query = query.eq('status', filter);
    if (updatesOnly) query = query.eq('has_updates_since_check_complete', true);
    if (answersOnly) query = query.gt('awaiting_customer_count', 0);
    if (pendingReviewsOnly) query = query.gt('pending_amendment_count', 0);
    if (activeSearch) {
      const escaped = activeSearch.replace(/[%_]/g, (char) => String.fromCharCode(92) + char);
      query = query.ilike('title', '%' + escaped + '%');
    }
    const sorted = sortOrder === 'oldest'
      ? query.order('created_at', { ascending: true })
      : sortOrder === 'request_updated'
        ? query.order('updated_at', { ascending: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false });
    const { data, error, count } = await sorted.order('id', { ascending: false })
      .range(page * 20, (page + 1) * 20 - 1);
    if (generation !== requestGeneration.current) return;
    if (error) {
      console.error('Could not load owned service requests:', error);
      setLoadError(true);
      setRows([]);
      setTotal(0);
    } else {
      const size = count ?? 0;
      if (page > 0 && page * 20 >= size) { setPage(Math.max(0, Math.ceil(size / 20) - 1)); setLoading(false); return; }
      setRows((data ?? []) as RequestRow[]);
      setRowsOwner(userId);
      setTotal(size);
    }
    setLoading(false);
  }, [userId, page, filter, activeSearch, updatesOnly, answersOnly, pendingReviewsOnly, sortOrder]);

  useEffect(() => {
    requestGeneration.current += 1;
    setRows([]);
    setRowsOwner(null);
    setTotal(0);
    setPage(0);
    setFilter('all');
    setSearch('');
    setActiveSearch('');
    setUpdatesOnly(false);
    setAnswersOnly(false);
    setPendingReviewsOnly(false);
    setSortOrder('newest');
    setCheckingId(null);
    setOpenConversation(null);
    setOpenScope(null);
    setOpenClarifications(null);
    setOpenAmendments(null);
    setOpenJournal(null);
    setLinkedRequest(null);
    setLinkedOwner(null);
    setLinkedLoading(false);
    setLinkedError('');
    setLinkedRetryable(false);
    setLinkedRetry(0);
    setNotice('');
    setLoadError(false);
  }, [userId]);

  useEffect(() => {
    void load();
    return () => { requestGeneration.current += 1; };
  }, [load]);

  useEffect(() => {
    // Counts are opt-in. Do not launch four additional exact-count queries
    // when entering the service desk or changing accounts.
    pulseGeneration.current++;
    pulseAbortRef.current?.abort();
    setPulseOwner(null);
    setPulseCounts({ all: null, newActivity: null, answers: null, pendingReviews: null });
    setPulseLoading(false);
    return () => {
      pulseGeneration.current++;
      pulseAbortRef.current?.abort();
    };
  }, [userId]);
  // Focus links encode only an allowlisted task category, never search,
  // customer identity or a request UUID. Private request deep links win.
  useEffect(() => {
    const preset = readQueuePreset(location.search, 'customer');
    if (!userId || !preset) return;
    setFilter('all');
    setSearch('');
    setActiveSearch('');
    setUpdatesOnly(preset === 'activity');
    setAnswersOnly(preset === 'answers');
    setPendingReviewsOnly(preset === 'brief-reviews');
    setSortOrder('newest');
    setPage(0);
  }, [userId, location.search, selectedPanel]);

  useEffect(() => {
    const selected = new URLSearchParams(location.search).get('request');
    setLinkedRequest(null);
    setLinkedOwner(null);
    setLinkedError('');
    setLinkedRetryable(false);
    setLinkedLoading(false);
    if (!userId || !selected) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selected)) {
      setLinkedError('Invalid request reference.');
      return;
    }
    setOpenConversation(!selectedPanel || selectedPanel === 'conversation' ? selected : null);
    setOpenScope(null);
    setOpenClarifications(null);
    setOpenAmendments(null);
    setOpenJournal(null);
    const controller = new AbortController();
    let active = true;
    const deadline = window.setTimeout(() => controller.abort(), 15000);
    setLinkedLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from('service_customer_amendment_queue')
          .select('id,service_key,title,description,status,client_update,created_at,updated_at,expected_outcome,timeframe,constraints,last_admin_activity_at,last_checked_at,has_updates_since_check,open_clarification_count,awaiting_customer_count,awaiting_admin_review_count,last_clarification_activity_at,has_updates_since_check_extended,clarification_changes_since_check,amendment_count,pending_amendment_count,last_amendment_reviewed_at,has_updates_since_check_complete')
          .eq('user_id', userId)
          .eq('id', selected)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (!active || useAuthStore.getState().user?.id !== userId) return;
        const status = describePrivateRequestRead(error, !!data);
        if (status.kind !== 'ready') {
          setLinkedError(status.message);
          setLinkedRetryable(status.retryable);
        } else {
          setLinkedRequest(data as RequestRow);
          setLinkedOwner(userId);
        }
      } catch (reason) {
        if (!active || useAuthStore.getState().user?.id !== userId) return;
        console.error('Private request lookup failed', reason);
        const status = describePrivateRequestRead({
          message: reason instanceof Error ? reason.message : 'Connection unavailable',
        }, false);
        setLinkedError(status.message);
        setLinkedRetryable(status.retryable);
      } finally {
        window.clearTimeout(deadline);
        if (active && useAuthStore.getState().user?.id === userId) setLinkedLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(deadline);
    };
  }, [userId, location.search, linkedRetry]);

  const markChecked = async (id: string) => {
    if (!userId || checkingId) return;
    setCheckingId(id);
    setNotice('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== userId) throw new Error('Account changed');
      const { data, error } = await supabase.rpc('mark_service_request_checked', { p_request_id: id });
      if (error || !data) throw error ?? new Error('Check-in not confirmed');
      if (useAuthStore.getState().user?.id !== userId) return;
      setNotice('Your check-in was recorded. This records a manual action, not a read receipt.');
      setLinkedRequest((current) => current?.id === id ? { ...current, last_checked_at: data, has_updates_since_check: false, has_updates_since_check_extended: false, has_updates_since_check_complete: false, clarification_changes_since_check: 0 } : current);
      void load();
      void loadPulse();
    } catch (reason) {
      console.error('Customer service check-in failed', reason);
      if (useAuthStore.getState().user?.id === userId) setNotice('Could not record your check-in. Verify your connection and account, then retry.');
    } finally {
      if (useAuthStore.getState().user?.id === userId) setCheckingId(null);
    }
  };

  const copyLink = async (id: string) => {
    if (!userId || rowsOwner !== userId || !visibleRows.some((item) => item.id === id)) return;
    try {
      const { data: { user: verified }, error } = await supabase.auth.getUser();
      if (error || verified?.id !== userId || useAuthStore.getState().user?.id !== userId) {
        throw new Error('Account changed');
      }
      await navigator.clipboard.writeText(window.location.origin + '/services/requests?request=' + encodeURIComponent(id));
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('A link to this request has been copied. Recipients still need authorized account access.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Could not copy the private link. Verify your account and clipboard permission.');
      }
    }
  };

  const exportBrief = async (item: RequestRow) => {
    if (!userId || rowsOwner !== userId || !visibleRows.some((row) => row.id === item.id)) return;
    try {
      const { data: { user: verified }, error } = await supabase.auth.getUser();
      if (error || verified?.id !== userId || useAuthStore.getState().user?.id !== userId) {
        throw new Error('Account changed');
      }
      const text = [
        'ETERNYX SERVICE REQUEST — PERSONAL COPY',
        'Reference: ' + item.id,
        'Service: ' + (getServiceOffering(item.service_key)?.title ?? item.service_key),
        'Title: ' + item.title,
        'Status: ' + (serviceRequestStatuses[item.status]?.label ?? item.status),
        'Submitted: ' + item.created_at,
        '',
        'PROJECT BRIEF', item.description,
        '',
        'EXPECTED OUTCOME', item.expected_outcome || 'Not provided',
        'PREFERRED TIMEFRAME', item.timeframe || 'Not provided',
        'CONSTRAINTS', item.constraints || 'Not provided',
        '',
        'LATEST CUSTOMER UPDATE', item.client_update || 'No update yet',
        '',
        'This is an enquiry record, not a quote, contract or proof of delivery.',
      ].join('\n');
      if (useAuthStore.getState().user?.id !== userId) return;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'eternyx-request-' + item.id + '.txt';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Export prepared on this device. Keep this copy private.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Could not export the private brief. Verify your session and retry.');
      }
    }
  };

  const choosePulse = (kind: 'all' | 'newActivity' | 'answers' | 'pendingReviews') => {
    setFilter('all');
    setSearch('');
    setActiveSearch('');
    setUpdatesOnly(kind === 'newActivity');
    setAnswersOnly(kind === 'answers');
    setPendingReviewsOnly(kind === 'pendingReviews');
    setSortOrder('newest');
    setPage(0);
  };

  const currentFocusPreset = (): OwnerQueuePreset | null => {
    if (!userId || new URLSearchParams(location.search).has('request')
      || activeSearch || filter !== 'all' || sortOrder !== 'newest'
      || Number(updatesOnly) + Number(answersOnly) + Number(pendingReviewsOnly) > 1) return null;
    if (updatesOnly) return 'activity';
    if (answersOnly) return 'answers';
    if (pendingReviewsOnly) return 'brief-reviews';
    return 'all';
  };

  const copyFocusedView = async () => {
    const preset = currentFocusPreset();
    if (!userId || !preset) return;
    try {
      const { data: { user: verified }, error } = await supabase.auth.getUser();
      if (error || verified?.id !== userId || useAuthStore.getState().user?.id !== userId) {
        throw new Error('Account changed');
      }
      await navigator.clipboard.writeText(buildQueuePresetLink(window.location.origin, 'customer', preset));
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Focused queue link copied. It contains no private request IDs or search terms; sign-in is still required.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Could not copy the view link. Check clipboard access and your account.');
      }
    }
  };

  const exportLoadedQueue = async () => {
    if (!userId || rowsOwner !== userId || loading || loadError || visibleRows.length === 0) return;
    try {
      const { data: { user: verified }, error } = await supabase.auth.getUser();
      if (error || verified?.id !== userId || useAuthStore.getState().user?.id !== userId) {
        throw new Error('Account changed');
      }
      downloadServiceQueueCsv(
        'eternyx-my-requests-loaded.csv',
        ['Request reference', 'Service', 'Title', 'Status', 'Submitted (UTC)', 'Request updated (UTC)', 'Questions awaiting customer', 'Brief amendments awaiting review'],
        visibleRows.map((row) => [
          row.id, getServiceOffering(row.service_key)?.title ?? row.service_key,
          row.title, serviceRequestStatuses[row.status]?.label ?? row.status,
          row.created_at, row.updated_at, row.awaiting_customer_count,
          row.pending_amendment_count,
        ]),
      );
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Exported the ' + visibleRows.length + ' loaded request(s) only. Keep this private CSV secure.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === userId) {
        setNotice('Request list export was not completed. Verify your session and try again.');
      }
    }
  };

  const visiblePulse = pulseOwner === userId ? pulseCounts :
    { all: null, newActivity: null, answers: null, pendingReviews: null };
  const visibleRows = rowsOwner === userId && userId ? rows : [];
  const visibleLinkedRequest = linkedOwner === userId && userId ? linkedRequest : null;

  return (
    <main className="mx-auto min-h-[70vh] max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <Button variant="ghost" asChild className="mb-5"><Link to="/services-hub"><ArrowLeft className="mr-2 h-4 w-4" />Services</Link></Button>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary">ETERNYX / Private service desk</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">My service requests</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Only your account and authorized administrators can read your briefs. Statuses reflect actual administrator updates.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { void load(); void loadPulse(); }} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button asChild><Link to="/services/request">New request</Link></Button></div>
      </header>
      {userId && <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Private queue sharing and export">
        <Button type="button" variant="outline" size="sm" disabled={!currentFocusPreset()}
          onClick={() => void copyFocusedView()}>
          <Link2 className="mr-2 h-4 w-4" />Copy focus link
        </Button>
        <Button type="button" variant="outline" size="sm"
          disabled={loadError || loading || visibleRows.length === 0}
          onClick={() => void exportLoadedQueue()}>
          <Download className="mr-2 h-4 w-4" />Export loaded rows
        </Button>
        <p className="text-xs text-muted-foreground">Links save only a standard queue focus; custom searches are not shared. CSV contains only this account's loaded requests.</p>
      </div>}
      {userId && <ServiceDeskReadiness mode="customer" />}
      {userId && <ServiceActionPulse
        heading="My service action center"
        description="Select Load / refresh counts to fetch exact request totals on demand. Cards still filter the server when counts are unavailable."
        refreshing={pulseLoading}
        onRefresh={() => void loadPulse()}
        items={[
          { id: 'all', label: 'All my requests', count: visiblePulse.all, description: 'Submitted service requests', active: !updatesOnly && !answersOnly && !pendingReviewsOnly && filter === 'all' && !activeSearch, onSelect: () => choosePulse('all') },
          { id: 'new-activity', label: 'Activity since my check', count: visiblePulse.newActivity, description: 'Requests with saved updates', active: updatesOnly && !answersOnly && !pendingReviewsOnly, onSelect: () => choosePulse('newActivity') },
          { id: 'answers', label: 'Questions to answer', count: visiblePulse.answers, description: 'Requests awaiting your answer', active: answersOnly && !updatesOnly && !pendingReviewsOnly, onSelect: () => choosePulse('answers') },
          { id: 'reviews', label: 'Brief changes pending', count: visiblePulse.pendingReviews, description: 'Requests awaiting team review', active: pendingReviewsOnly && !updatesOnly && !answersOnly, onSelect: () => choosePulse('pendingReviews') },
        ]}
      />}
      <form className="mb-6 flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        if (search.trim().length > 80) { setNotice('Search term must be 80 characters or fewer.'); return; }
        setPage(0);
        setActiveSearch(search.trim());
      }}>
        <div><label htmlFor="owner-service-status" className="mb-1 block text-xs font-medium">Status</label>
          <select id="owner-service-status" value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All statuses</option>
            {Object.entries(serviceRequestStatuses).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
          </select>
        </div>
        <div className="min-w-0 flex-1 sm:max-w-xs"><label htmlFor="owner-service-search" className="mb-1 block text-xs font-medium">Search project titles</label>
          <Input id="owner-service-search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80}
            placeholder="Search your own requests" />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={updatesOnly} onChange={(event) => { setPage(0); setUpdatesOnly(event.target.checked); }} />Activity since my check</label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={answersOnly} onChange={(event) => { setPage(0); setAnswersOnly(event.target.checked); }} />Questions awaiting my answer</label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={pendingReviewsOnly} onChange={(event) => { setPage(0); setPendingReviewsOnly(event.target.checked); }} />Brief changes pending review</label>
        <div>
          <label htmlFor="owner-service-sort" className="mb-1 block text-xs font-medium">Order</label>
          <select id="owner-service-sort" value={sortOrder} onChange={(event) => { setPage(0); setSortOrder(event.target.value as typeof sortOrder); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="newest">Newest submitted first</option>
            <option value="oldest">Oldest submitted first</option>
            <option value="request_updated">Recently edited request records</option>
          </select>
        </div>
        <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
        <span className="text-xs text-muted-foreground">{visibleRows.length} of {total} matching requests</span>
      </form>
      {notice && <p role="status" className="mb-4 rounded-lg border border-primary/20 p-3 text-sm text-muted-foreground">{notice}</p>}
      {linkedLoading && <p className="mb-4 text-sm text-muted-foreground">Opening your private request…</p>}
      {linkedError && <div className="mb-4 rounded-lg border border-destructive/30 p-3">
        <p role="alert" className="text-sm text-destructive">{linkedError}</p>
        {linkedRetryable && <Button type="button" className="mt-3" size="sm" variant="outline" disabled={linkedLoading}
          onClick={() => setLinkedRetry((count) => count + 1)}>
          <RefreshCw className="mr-2 h-4 w-4" />Retry private request
        </Button>}
      </div>}
      {visibleLinkedRequest && (selectedPanel !== null || !visibleRows.some((item) => item.id === visibleLinkedRequest.id)) && user && (
        <Card className="mb-6 border-primary/20 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Opened by private link</p>
          <h2 className="mt-2 break-words text-xl font-bold">{visibleLinkedRequest.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{getServiceOffering(visibleLinkedRequest.service_key)?.title ?? visibleLinkedRequest.service_key} · {serviceRequestStatuses[visibleLinkedRequest.status]?.label ?? visibleLinkedRequest.status}</p>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-primary">View project brief</summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{visibleLinkedRequest.description}</p>
          </details>
          {visibleLinkedRequest.has_updates_since_check_complete && <p className="mt-3 text-xs font-semibold text-primary">New ETERNYX activity since your last check</p>}
          {visibleLinkedRequest.clarification_changes_since_check > 0 && <p className="mt-2 text-xs text-muted-foreground">{visibleLinkedRequest.clarification_changes_since_check} clarification item(s) created or closed since your last check</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={checkingId !== null} onClick={() => void markChecked(visibleLinkedRequest.id)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />{checkingId === visibleLinkedRequest.id ? 'Recording…' : 'Mark checked'}
            </Button>
            <span className="text-xs text-muted-foreground">{visibleLinkedRequest.last_checked_at ? 'Last checked: ' + new Date(visibleLinkedRequest.last_checked_at).toLocaleString() : 'Not checked yet'}</span>
          </div>
          <ServiceRequestSectionLinks requestId={visibleLinkedRequest.id} ownerId={user.id} mode="customer" />
          {(!selectedPanel || selectedPanel === 'conversation') && <ServiceRequestTimeline requestId={visibleLinkedRequest.id} ownerId={user.id} refreshToken={Date.parse(visibleLinkedRequest.updated_at)} />}
          {(!selectedPanel || selectedPanel === 'scope') && <ServiceScopeReview requestId={visibleLinkedRequest.id} ownerId={user.id} />}
          {(!selectedPanel || selectedPanel === 'clarifications') && <ServiceClarifications requestId={visibleLinkedRequest.id} ownerId={user.id} onChanged={() => { void load(); void loadPulse(); }} />}
          {(!selectedPanel || selectedPanel === 'brief-changes') && <ServiceBriefAmendments requestId={visibleLinkedRequest.id} ownerId={user.id} onChanged={() => void load()} />}
          {(!selectedPanel || selectedPanel === 'journal') && <ServiceRequestJournal requestId={visibleLinkedRequest.id} ownerId={user.id} />}
        </Card>
      )}
      {loadError ? <Card className="p-8 text-center"><h2 className="font-semibold">Unable to load requests</h2><p className="mt-2 text-sm text-muted-foreground">The database request failed. The connection, API exposure, or migration might be unavailable; this is not an empty inbox. Use the read-only feature checks above and retry. No results are simulated.</p><Button className="mt-4" onClick={() => void load()}>Try again</Button></Card>
        : loading && visibleRows.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Loading your service requests…</Card>
        : visibleRows.length === 0 ? <Card className="p-8 text-center"><ClipboardList className="mx-auto mb-4 h-10 w-10 text-primary" /><h2 className="text-xl font-semibold">{total > 0 || filter !== 'all' || activeSearch ? 'No requests match this view' : 'No requests yet'}</h2><p className="mt-2 text-muted-foreground">{filter !== 'all' || activeSearch || updatesOnly || answersOnly || pendingReviewsOnly ? 'Try changing the status, search or activity filters.' : 'Your confirmed project briefs will appear here.'}</p><Button asChild className="mt-5"><Link to="/services/request">Submit a brief</Link></Button></Card>
        : <div className="space-y-4">{visibleRows.map((item) => {
          if (selectedPanel && visibleLinkedRequest?.id === item.id) return null;
          const status = serviceRequestStatuses[item.status] ?? serviceRequestStatuses.submitted;
          return <Card key={item.id} className="border-border/70 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{getServiceOffering(item.service_key)?.title ?? 'Service enquiry'}</p><h2 className="mt-1 break-words text-xl font-semibold">{item.title}</h2><p className="mt-2 text-xs text-muted-foreground">Submitted {new Date(item.created_at).toLocaleString()}</p></div><span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{status.label}</span></div>
            {item.has_updates_since_check_complete && <p className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3 text-sm font-medium text-primary">New ETERNYX activity since your last check</p>}
            {item.clarification_changes_since_check > 0 && <p className="mt-2 text-xs text-muted-foreground">{item.clarification_changes_since_check} clarification item(s) created or closed since your last check</p>}
            {item.pending_amendment_count > 0 && <p className="mt-2 text-xs font-medium text-primary">{item.pending_amendment_count} brief change(s) awaiting administrator review</p>}
            {item.awaiting_customer_count > 0 && <p className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3 text-sm font-medium text-primary">{item.awaiting_customer_count} clarification question(s) awaiting your answer</p>}
            {item.awaiting_admin_review_count > 0 && <p className="mt-2 text-xs text-muted-foreground">{item.awaiting_admin_review_count} clarification answer(s) awaiting administrator review</p>}
            {createdId === item.id && <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-3 text-sm text-emerald-300">Your request was saved successfully.</p>}
            <p className="mt-5 text-sm text-muted-foreground">{status.description}</p>
            {item.client_update && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />Client update</div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.client_update}</p></div>}
            <details className="mt-5"><summary className="cursor-pointer text-sm font-medium text-primary">View original brief</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.description}</p></details>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              {item.expected_outcome && <p><span className="font-semibold text-foreground">Expected outcome:</span> {item.expected_outcome}</p>}
              {item.timeframe && <p><span className="font-semibold text-foreground">Preferred timeframe:</span> {item.timeframe.replace(/_/g, ' ')}</p>}
              {item.constraints && <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-foreground">Constraints:</span> {item.constraints}</p>}
            </div>
            <p className="mt-5 break-all text-xs text-muted-foreground">Reference: {item.id}</p>
            {user && <ServiceRequestSectionLinks requestId={item.id} ownerId={user.id} mode="customer" />}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(item.id)}>
                <Link2 className="mr-2 h-4 w-4" />Copy private link
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void exportBrief(item)}>
                <Download className="mr-2 h-4 w-4" />Export my brief
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void markChecked(item.id)} disabled={checkingId !== null}>
                <CheckCircle2 className="mr-2 h-4 w-4" />{checkingId === item.id ? 'Recording…' : 'Mark checked'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{item.last_checked_at ? 'You last checked: ' + new Date(item.last_checked_at).toLocaleString() : 'Not checked yet'} · Manual check-ins, not read receipts</p>
            <Button type="button" variant="outline" className="mt-4 mr-2"
              aria-expanded={openScope === item.id}
              onClick={() => setOpenScope((current) => current === item.id ? null : item.id)}>
              {openScope === item.id ? 'Close scope reviews' : 'View scope reviews'}
            </Button>
            {openScope === item.id && user && <ServiceScopeReview requestId={item.id} ownerId={user.id} />}
            <Button type="button" variant="outline" className="mt-4 mr-2" aria-expanded={openClarifications === item.id}
              onClick={() => setOpenClarifications((current) => current === item.id ? null : item.id)}>
              <ClipboardList className="mr-2 h-4 w-4" />{openClarifications === item.id ? 'Close clarifications' : 'Clarification questions (' + item.open_clarification_count + ' open)'}
            </Button>
            {openClarifications === item.id && user && <ServiceClarifications requestId={item.id} ownerId={user.id} onChanged={() => void load()} />}
            <Button type="button" variant="outline" className="mt-4 mr-2" aria-expanded={openAmendments === item.id}
              onClick={() => setOpenAmendments((current) => current === item.id ? null : item.id)}>
              <ClipboardList className="mr-2 h-4 w-4" />{openAmendments === item.id ? 'Close brief changes' : 'Brief changes (' + item.amendment_count + ')'}
            </Button>
            {openAmendments === item.id && user && <ServiceBriefAmendments requestId={item.id} ownerId={user.id} onChanged={() => void load()} />}
            <Button type="button" variant="outline" className="mt-4 mr-2" aria-expanded={openJournal === item.id}
              onClick={() => setOpenJournal((current) => current === item.id ? null : item.id)}>
              <ClipboardList className="mr-2 h-4 w-4" />{openJournal === item.id ? 'Close activity journal' : 'Activity journal'}
            </Button>
            {openJournal === item.id && user && <ServiceRequestJournal requestId={item.id} ownerId={user.id} />}
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              aria-expanded={openConversation === item.id}
              onClick={() => setOpenConversation((current) => current === item.id ? null : item.id)}
            >
              <MessageCircle className="mr-2 h-4 w-4" />{openConversation === item.id ? 'Close conversation' : 'Open conversation'}
            </Button>
            {openConversation === item.id && user && <ServiceRequestTimeline requestId={item.id} ownerId={user.id} refreshToken={Date.parse(item.updated_at)} />}
          </Card>;
        })}</div>}
      {!loadError && total > 0 && (
        <nav aria-label="My service requests pages" className="mt-6 flex items-center justify-center gap-3">
          <Button type="button" variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / 20))}</span>
          <Button type="button" variant="outline" disabled={loading || (page + 1) * 20 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </nav>
      )}
      <p className="mt-7 text-center text-xs text-muted-foreground">These are enquiries, not paid orders. No price, timeline or delivery is promised until separately agreed.</p>
    </main>
  );
}