import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, ClipboardList, Download, Link2, MessageCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { getServiceOffering, serviceRequestStatuses, type ServiceRequestStatus } from '@/lib/serviceOfferings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';
import ServiceRequestTimeline from '@/components/services/ServiceRequestTimeline';
import ServiceScopeReview from '@/components/services/ServiceScopeReview';
import ServiceTriagePanel from '@/components/services/ServiceTriagePanel';
import ServiceClarifications from '@/components/services/ServiceClarifications';
import ServiceBriefAmendments from '@/components/services/ServiceBriefAmendments';
import ServiceRequestJournal from '@/components/services/ServiceRequestJournal';
import ServiceActionPulse from '@/components/services/ServiceActionPulse';
import { runServiceCountBudget } from '@/lib/serviceCountBudget';
import { readServiceWindowWithinBudget } from '@/lib/servicePageReadBudget';
import ServiceDeskReadiness from '@/components/services/ServiceDeskReadiness';
import ServiceRequestSectionLinks from '@/components/services/ServiceRequestSectionLinks';
import { readRequestPanel } from '@/lib/serviceRequestPanels';
import { readQueuePreset, buildQueuePresetLink, downloadServiceQueueCsv, type AdminQueuePreset } from '@/lib/serviceQueueViews';
import { Input } from '@/components/ui/input';
import { useLocation, useNavigate } from 'react-router-dom';
import { serviceNextActionLabels, serviceReviewBucketLabels, type ServiceNextAction, type ServiceReviewBucket } from '@/lib/serviceReviewPlanner';

type ServiceRow = {
  id: string; user_id: string; title: string; service_key: string; description: string;
  contact_email: string; company: string | null; status: ServiceRequestStatus;
  client_update: string | null; created_at: string; updated_at: string;
  expected_outcome: string | null; timeframe: string | null; constraints: string | null;
  priority: string; priority_rank: number; assigned_admin_id: string | null;
  needs_follow_up: boolean; last_customer_activity_at: string | null; last_admin_activity_at: string | null;
  next_action_kind: ServiceNextAction; next_review_on: string | null; review_bucket: ServiceReviewBucket;
  last_checked_at: string | null; needs_my_check: boolean;
  last_customer_answer_at: string | null; needs_my_check_extended: boolean;
  needs_follow_up_extended: boolean; customer_answers_since_check: number;
  amendment_count: number; pending_amendment_count: number;
  last_amendment_submitted_at: string | null;
  needs_my_check_complete: boolean; needs_follow_up_complete: boolean;
  open_clarification_count: number; awaiting_customer_count: number; awaiting_admin_review_count: number;
};
type Draft = { status: ServiceRequestStatus; client_update: string };

export default function AdminServiceRequests() {
  const { user, isLoading: authLoading } = useAuthStore();
  const location = useLocation();
  const selectedPanel = readRequestPanel(location.search, 'admin');
  const navigate = useNavigate();
  const [authorizedFor, setAuthorizedFor] = useState<string | null>(null);
  const [adminAccessError, setAdminAccessError] = useState(false);
  const [adminAccessRetry, setAdminAccessRetry] = useState(0);
  const authorized = !!user && authorizedFor === user.id;
  const fetchGeneration = useRef(0);
  const adminListAbortRef = useRef<AbortController | null>(null);
  const [checking, setChecking] = useState(true);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [filter, setFilter] = useState<'all' | ServiceRequestStatus>('all');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [searchField, setSearchField] = useState<'title' | 'contact_email' | 'id'>('title');
  const [activeSearchField, setActiveSearchField] = useState<'title' | 'contact_email' | 'id'>('title');
  const [page, setPage] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'normal' | 'high' | 'urgent'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [mineCheckOnly, setMineCheckOnly] = useState(false);
  const [clarificationFilter, setClarificationFilter] = useState<'all' | 'awaiting_customer' | 'needs_review' | 'open'>('all');
  const [pendingAmendmentsOnly, setPendingAmendmentsOnly] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'priority' | 'customer_activity' | 'next_review' | 'amendments' | 'clarifications'>('newest');
  const [reviewBucket, setReviewBucket] = useState<'all' | ServiceReviewBucket>('all');
  const [actionFilter, setActionFilter] = useState<'all' | ServiceNextAction>('all');
  const countGeneration = useRef(0);
  const sharedCountAbortRef = useRef<AbortController | null>(null);
  const [reviewCountLoading, setReviewCountLoading] = useState(false);
  const [queueCounts, setQueueCounts] = useState<Record<ServiceReviewBucket, number | null>>({
    unscheduled: null, overdue: null, due_today: null, upcoming: null,
  });
  const actionCountGeneration = useRef(0);
  const [actionCountOwner, setActionCountOwner] = useState<string | null>(null);
  const [actionCountLoading, setActionCountLoading] = useState(false);
  const [actionCounts, setActionCounts] = useState<{
    all: number | null; followUp: number | null; amendments: number | null;
    clarifications: number | null; unassigned: number | null;
  }>({ all: null, followUp: null, amendments: null, clarifications: null, unassigned: null });
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 20;
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const [openScope, setOpenScope] = useState<string | null>(null);
  const [openTriage, setOpenTriage] = useState<string | null>(null);
  const [openClarifications, setOpenClarifications] = useState<string | null>(null);
  const [openAmendments, setOpenAmendments] = useState<string | null>(null);
  const [openJournal, setOpenJournal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || authorizedFor !== user.id) return;
    const actor = user.id;
    const generation = ++fetchGeneration.current;
    adminListAbortRef.current?.abort();
    const controller = new AbortController();
    adminListAbortRef.current = controller;
    setLoading(true);
    setLoadError(false);
    setLoadErrorDetail('');
    setRows([]);
    setDrafts({});
    setHasMore(false);
    try {
    let query = supabase.from('service_admin_amendment_queue')
      .select('id,user_id,title,service_key,description,contact_email,company,status,client_update,created_at,updated_at,expected_outcome,timeframe,constraints,priority,priority_rank,assigned_admin_id,needs_follow_up,last_customer_activity_at,last_admin_activity_at,next_action_kind,next_review_on,review_bucket,last_checked_at,needs_my_check,open_clarification_count,awaiting_customer_count,awaiting_admin_review_count,last_customer_answer_at,needs_my_check_extended,needs_follow_up_extended,customer_answers_since_check,amendment_count,pending_amendment_count,last_amendment_submitted_at,needs_my_check_complete,needs_follow_up_complete');
    if (filter !== 'all') query = query.eq('status', filter);
    if (activeSearch) {
      if (activeSearchField === 'id') {
        query = query.eq('id', activeSearch);
      } else {
        const escaped = activeSearch.replace(/[%_]/g, (char) => String.fromCharCode(92) + char);
        query = query.ilike(activeSearchField, '%' + escaped + '%');
      }
    }
    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter);
    if (assignmentFilter === 'mine') query = query.eq('assigned_admin_id', user.id);
    if (assignmentFilter === 'unassigned') query = query.is('assigned_admin_id', null);
    if (attentionOnly) query = query.eq('needs_follow_up_complete', true);
    if (mineCheckOnly) query = query.eq('needs_my_check_complete', true);
    if (clarificationFilter === 'awaiting_customer') query = query.gt('awaiting_customer_count', 0);
    if (clarificationFilter === 'needs_review') query = query.gt('awaiting_admin_review_count', 0);
    if (clarificationFilter === 'open') query = query.gt('open_clarification_count', 0);
    if (pendingAmendmentsOnly) query = query.gt('pending_amendment_count', 0);
    if (reviewBucket !== 'all') query = query.eq('review_bucket', reviewBucket);
    if (actionFilter !== 'all') query = query.eq('next_action_kind', actionFilter);
    if (sortOrder === 'priority') query = query.order('priority_rank', { ascending: false });
    if (sortOrder === 'customer_activity') query = query.order('last_customer_activity_at', { ascending: false, nullsFirst: false });
    if (sortOrder === 'next_review') query = query.order('next_review_on', { ascending: true, nullsFirst: false });
    if (sortOrder === 'amendments') query = query.order('pending_amendment_count', { ascending: false });
    if (sortOrder === 'clarifications') query = query.order('awaiting_admin_review_count', { ascending: false });
      const result = await readServiceWindowWithinBudget<ServiceRow>(
        (signal) => query.order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
          .abortSignal(signal),
        PAGE_SIZE,
        () => generation === fetchGeneration.current
          && useAuthStore.getState().user?.id === actor && authorizedFor === actor,
        controller.signal,
      );
      if (generation !== fetchGeneration.current) return;
      if (useAuthStore.getState().user?.id !== actor || authorizedFor !== actor) return;
      if (result.kind === 'canceled') return;
      if (result.kind === 'unavailable') {
        setLoadError(true);
        setLoadErrorDetail(result.message);
        setRows([]);
        setDrafts({});
        setHasMore(false);
        return;
      }
      if (page > 0 && result.rows.length === 0) {
        // Data may move between buckets; never infer the total from an
        // empty offset page. Return to the preceding real page instead.
        setPage((previous) => Math.max(0, previous - 1));
        return;
      }
      setRows(result.rows);
      setHasMore(result.hasMore);
      setDrafts(Object.fromEntries(result.rows.map((item) => [
        item.id, { status: item.status, client_update: item.client_update ?? '' },
      ])));
    } catch {
      if (generation !== fetchGeneration.current) return;
      if (useAuthStore.getState().user?.id !== actor || authorizedFor !== actor) return;
      setLoadError(true);
      setLoadErrorDetail('The administrator request-list read failed. Its results were not treated as an empty queue.');
      setRows([]);
      setDrafts({});
      setHasMore(false);
    } finally {
      if (generation === fetchGeneration.current
        && useAuthStore.getState().user?.id === actor && authorizedFor === actor) {
        adminListAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [user?.id, authorizedFor, page, filter, activeSearch, activeSearchField, priorityFilter, assignmentFilter, attentionOnly, sortOrder, reviewBucket, actionFilter, mineCheckOnly, clarificationFilter, pendingAmendmentsOnly]);

  useEffect(() => {
    let active = true;
    fetchGeneration.current += 1;
    adminListAbortRef.current?.abort();
    setLoading(false);
    setLoadError(false);
    setLoadErrorDetail('');
    setAuthorizedFor(null);
    setAdminAccessError(false);
    setRows([]);
    setHasMore(false);
    setDrafts({});
    setCheckingId(null);
    setSaving(null);
    setFeedback(null);
    setOpenConversation(null);
    setOpenScope(null);
    setOpenTriage(null);
    setOpenClarifications(null);
    setOpenAmendments(null);
    setOpenJournal(null);
    if (authLoading) {
      setChecking(true);
      return () => { active = false; };
    }
    if (!user) {
      setChecking(false);
      return () => { active = false; };
    }
    setChecking(true);
    const controller = new AbortController();
    const authTimeout = window.setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('is_admin').abortSignal(controller.signal);
        if (!active) return;
        setAdminAccessError(!!error);
        setAuthorizedFor(!error && data === true ? user.id : null);
      } catch (error) {
        if (!active) return;
        console.error('Admin role verification failed', error);
        setAdminAccessError(true);
        setAuthorizedFor(null);
      } finally {
        window.clearTimeout(authTimeout);
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(authTimeout);
      fetchGeneration.current += 1;
      adminListAbortRef.current?.abort();
    };
  }, [user?.id, authLoading, adminAccessRetry]);

  const loadQueueCounts = useCallback(async () => {
    if (!authorized || !user?.id) return;
    const actor = user.id;
    const seq = ++countGeneration.current;
    actionCountGeneration.current++;
    sharedCountAbortRef.current?.abort();
    setActionCountLoading(false);
    const controller = new AbortController();
    sharedCountAbortRef.current = controller;
    setReviewCountLoading(true);
    const buckets: ServiceReviewBucket[] = ['overdue', 'due_today', 'upcoming', 'unscheduled'];
    const probes = buckets.map((bucket) => (signal: AbortSignal) =>
      supabase.from('service_admin_review_queue')
        .select('id', { head: true, count: 'exact' })
        .eq('review_bucket', bucket).abortSignal(signal)
    );
    try {
      const { counts } = await runServiceCountBudget(
        probes,
        () => seq === countGeneration.current && useAuthStore.getState().user?.id === actor,
        controller.signal,
      );
      if (seq !== countGeneration.current || useAuthStore.getState().user?.id !== actor) return;
      setQueueCounts({
        overdue: counts[0], due_today: counts[1], upcoming: counts[2], unscheduled: counts[3],
      });
    } finally {
      if (seq === countGeneration.current && useAuthStore.getState().user?.id === actor) {
        sharedCountAbortRef.current = null;
        setReviewCountLoading(false);
      }
    }
  }, [authorized, user?.id]);

  const loadActionCounts = useCallback(async () => {
    if (!authorized || !user?.id) return;
    const actor = user.id;
    const seq = ++actionCountGeneration.current;
    countGeneration.current++;
    sharedCountAbortRef.current?.abort();
    setReviewCountLoading(false);
    const controller = new AbortController();
    sharedCountAbortRef.current = controller;
    setActionCountLoading(true);
    const queries = [
      (signal: AbortSignal) => supabase.from('service_admin_amendment_queue')
        .select('id', { head: true, count: 'exact' }).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_admin_amendment_queue')
        .select('id', { head: true, count: 'exact' }).eq('needs_follow_up_complete', true).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_admin_amendment_queue')
        .select('id', { head: true, count: 'exact' }).gt('pending_amendment_count', 0).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_admin_amendment_queue')
        .select('id', { head: true, count: 'exact' }).gt('awaiting_admin_review_count', 0).abortSignal(signal),
      (signal: AbortSignal) => supabase.from('service_admin_amendment_queue')
        .select('id', { head: true, count: 'exact' }).is('assigned_admin_id', null).abortSignal(signal),
    ];
    try {
      const { counts } = await runServiceCountBudget(
        queries,
        () => seq === actionCountGeneration.current && useAuthStore.getState().user?.id === actor,
        controller.signal,
      );
      if (seq !== actionCountGeneration.current || useAuthStore.getState().user?.id !== actor) return;
      setActionCounts({
        all: counts[0], followUp: counts[1], amendments: counts[2],
        clarifications: counts[3], unassigned: counts[4],
      });
      setActionCountOwner(actor);
    } finally {
      if (seq === actionCountGeneration.current && useAuthStore.getState().user?.id === actor) {
        sharedCountAbortRef.current = null;
        setActionCountLoading(false);
      }
    }
  }, [authorized, user?.id]);

  const invalidateCountCards = () => {
    // A saved request may change every summary bucket. Show unknown
    // counts until the operator explicitly refreshes them again.
    countGeneration.current++;
    actionCountGeneration.current++;
    sharedCountAbortRef.current?.abort();
    sharedCountAbortRef.current = null;
    setReviewCountLoading(false);
    setActionCountLoading(false);
    setActionCountOwner(null);
    setQueueCounts({ unscheduled: null, overdue: null, due_today: null, upcoming: null });
    setActionCounts({ all: null, followUp: null, amendments: null, clarifications: null, unassigned: null });
  };

  useEffect(() => { if (authorized) void load(); }, [authorized, load]);
  useEffect(() => {
    // No nine-query exact-count burst when the admin desk opens.
    // Existing filters still query the protected view normally.
    countGeneration.current++;
    actionCountGeneration.current++;
    sharedCountAbortRef.current?.abort();
    sharedCountAbortRef.current = null;
    setReviewCountLoading(false);
    setActionCountLoading(false);
    setActionCountOwner(null);
    setQueueCounts({ unscheduled: null, overdue: null, due_today: null, upcoming: null });
    setActionCounts({ all: null, followUp: null, amendments: null, clarifications: null, unassigned: null });
    return () => {
      countGeneration.current++;
      actionCountGeneration.current++;
      sharedCountAbortRef.current?.abort();
    };
  }, [authorized, user?.id]);

  useEffect(() => {
    if (!authorized) return;
    const selected = new URLSearchParams(location.search).get('request');
    if (!selected) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selected)) {
      setFeedback('The administrator request link is invalid.');
      return;
    }
    setFilter('all');
    setPriorityFilter('all');
    setAssignmentFilter('all');
    setAttentionOnly(false);
    setMineCheckOnly(false);
    setClarificationFilter('all');
    setPendingAmendmentsOnly(false);
    setReviewBucket('all');
    setActionFilter('all');
    setPage(0);
    setSearchField('id');
    setActiveSearchField('id');
    setSearch(selected);
    setActiveSearch(selected);
    setOpenConversation(selectedPanel === 'conversation' ? selected : null);
    setOpenScope(selectedPanel === 'scope' ? selected : null);
    setOpenTriage(selectedPanel === 'triage' ? selected : null);
    setOpenClarifications(selectedPanel === 'clarifications' ? selected : null);
    setOpenAmendments(selectedPanel === 'brief-changes' ? selected : null);
    setOpenJournal(selectedPanel === 'journal' ? selected : null);
  }, [authorized, location.search, selectedPanel]);

  // All shared queue links are narrow, allowlisted task categories.
  // Private request UUID deep-links take precedence and are not changed.
  useEffect(() => {
    if (!authorized) return;
    const preset = readQueuePreset(location.search, 'admin');
    if (!preset) return;
    setFilter('all');
    setPriorityFilter('all');
    setAssignmentFilter(preset === 'unassigned' ? 'unassigned' : 'all');
    setAttentionOnly(preset === 'follow-up');
    setMineCheckOnly(false);
    setClarificationFilter(preset === 'clarifications' ? 'needs_review' : 'all');
    setPendingAmendmentsOnly(preset === 'brief-reviews');
    setReviewBucket('all');
    setActionFilter('all');
    setSortOrder('newest');
    setSearch('');
    setActiveSearch('');
    setSearchField('title');
    setActiveSearchField('title');
    setPage(0);
  }, [authorized, location.search]);

  const clearFilters = () => {
    setFilter('all');
    setPriorityFilter('all');
    setAssignmentFilter('all');
    setAttentionOnly(false);
    setMineCheckOnly(false);
    setClarificationFilter('all');
    setPendingAmendmentsOnly(false);
    setReviewBucket('all');
    setActionFilter('all');
    setSortOrder('newest');
    setSearch('');
    setActiveSearch('');
    setSearchField('title');
    setActiveSearchField('title');
    setPage(0);
    setFeedback(null);
    if (location.search) navigate('/admin/service-requests', { replace: true });
  };

  const chooseActionFocus = (kind: 'all' | 'followUp' | 'amendments' | 'clarifications' | 'unassigned') => {
    clearFilters();
    setAttentionOnly(kind === 'followUp');
    setPendingAmendmentsOnly(kind === 'amendments');
    setClarificationFilter(kind === 'clarifications' ? 'needs_review' : 'all');
    setAssignmentFilter(kind === 'unassigned' ? 'unassigned' : 'all');
    setPage(0);
  };

  const markChecked = async (id: string) => {
    if (!authorized || !user?.id || checkingId) return;
    setCheckingId(id);
    setFeedback(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== user.id) throw new Error('Session expired');
      const { data, error } = await supabase.rpc('mark_service_request_checked', { p_request_id: id });
      if (error || !data) throw error ?? new Error('Check-in not confirmed');
      if (useAuthStore.getState().user?.id !== user.id) return;
      setFeedback('Your personal check-in was recorded. It does not send a message or claim anyone read one.');
      void load();
    } catch (reason) {
      console.error('Admin check-in failed', reason);
      if (useAuthStore.getState().user?.id === user.id) setFeedback('Check-in not saved. Verify access and your connection before retrying.');
    } finally {
      if (useAuthStore.getState().user?.id === user.id) setCheckingId(null);
    }
  };

  const copyAdminLink = async (id: string) => {
    if (!authorized || !user?.id || !rows.some((row) => row.id === id)) return;
    const actor = user.id;
    try {
      if (!await confirmAdminForLocalAction()) throw new Error('Administrator access not verified');
      if (useAuthStore.getState().user?.id !== actor) return;
      await navigator.clipboard.writeText(window.location.origin + '/admin/service-requests?request=' + encodeURIComponent(id));
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Private administrator link copied. Access still requires a verified administrator session.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Could not copy the private link. Verify administrator access and clipboard permission.');
      }
    }
  };

  const filtered = rows;
  const currentAdminFocus = (): AdminQueuePreset | null => {
    if (!authorized || !user?.id || new URLSearchParams(location.search).has('request')
      || filter !== 'all' || activeSearch || priorityFilter !== 'all'
      || reviewBucket !== 'all' || actionFilter !== 'all' || sortOrder !== 'newest'
      || mineCheckOnly || assignmentFilter === 'mine'
      || (clarificationFilter !== 'all' && clarificationFilter !== 'needs_review')) return null;
    const selected = Number(attentionOnly) + Number(pendingAmendmentsOnly)
      + Number(clarificationFilter === 'needs_review') + Number(assignmentFilter === 'unassigned');
    if (selected > 1) return null;
    if (attentionOnly) return 'follow-up';
    if (pendingAmendmentsOnly) return 'brief-reviews';
    if (clarificationFilter === 'needs_review') return 'clarifications';
    if (assignmentFilter === 'unassigned') return 'unassigned';
    return 'all';
  };

  const confirmAdminForLocalAction = async (): Promise<boolean> => {
    if (!authorized || !user?.id) return false;
    const { data: { user: verified }, error } = await supabase.auth.getUser();
    if (error || verified?.id !== user.id || useAuthStore.getState().user?.id !== user.id) return false;
    const { data: isAdmin, error: roleError } = await supabase.rpc('is_admin');
    return !roleError && isAdmin === true && useAuthStore.getState().user?.id === user.id;
  };

  const copyFocusedAdminView = async () => {
    const focus = currentAdminFocus();
    if (!focus || !user?.id) return;
    const actor = user.id;
    try {
      if (!await confirmAdminForLocalAction()) throw new Error('Admin account not verified');
      await navigator.clipboard.writeText(buildQueuePresetLink(window.location.origin, 'admin', focus));
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Administrator queue focus link copied. It shares no request IDs, search terms, or customer contacts; a verified admin login is still required.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Could not copy the focus link. Check clipboard access and administrator verification.');
      }
    }
  };

  const exportLoadedAdminQueue = async () => {
    if (!authorized || !user?.id || loading || loadError || filtered.length === 0) return;
    const actor = user.id;
    try {
      if (!await confirmAdminForLocalAction()) throw new Error('Admin account not verified');
      downloadServiceQueueCsv(
        'eternyx-admin-worklist-loaded.csv',
        ['Request reference', 'Service', 'Title', 'Status', 'Priority', 'Assignment', 'Next internal review (UTC)', 'Next internal action', 'Pending brief changes', 'Answered clarifications to review'],
        filtered.map((item) => [
          item.id, getServiceOffering(item.service_key)?.title ?? item.service_key,
          item.title, serviceRequestStatuses[item.status]?.label ?? item.status,
          item.priority, item.assigned_admin_id ? 'Assigned' : 'Unassigned',
          item.next_review_on ?? '', item.next_action_kind ?? '',
          item.pending_amendment_count, item.awaiting_admin_review_count,
        ]),
      );
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Exported ' + filtered.length + ' loaded worklist row(s), not the entire database. This is an internal-only CSV; keep it private.');
      }
    } catch {
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Worklist export not completed. Reverify administrator access and try again.');
      }
    }
  };

  const applySearch = () => {
    const trimmed = search.trim();
    if (searchField === 'id' && trimmed && !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(trimmed)) {
      setFeedback('Enter a valid request UUID when searching by reference.');
      return;
    }
    if (trimmed.length > 80) {
      setFeedback('Search term must be 80 characters or fewer.');
      return;
    }
    setFeedback(null);
    setPage(0);
    setActiveSearchField(searchField);
    setActiveSearch(trimmed);
  };

  const save = async (item: ServiceRow) => {
    const actor = user?.id;
    const draft = drafts[item.id];
    if (!authorized || !actor || !draft || saving || !rows.some((row) => row.id === item.id)) return;
    if ((draft.status === 'in_progress' || draft.status === 'completed') && draft.status !== item.status) {
      setFeedback('Delivery statuses require a separately verified agreement. They are not enabled by this desk.');
      return;
    }
    if (draft.client_update.length > 1000) {
      setFeedback('Client update must be at most 1,000 characters.');
      return;
    }
    setSaving(item.id);
    setFeedback(null);
    try {
      // Verify the current session and administrator role immediately
      // before this customer-visible write. SQL RLS remains authoritative.
      if (!await confirmAdminForLocalAction()) {
        throw new Error('Administrator verification failed before saving');
      }
      if (useAuthStore.getState().user?.id !== actor) return;
      const { data, error } = await supabase.from('service_requests')
        .update({ status: draft.status, client_update: draft.client_update.trim() || null })
        .eq('id', item.id)
        .eq('updated_at', item.updated_at)
        .select('id,status,client_update,updated_at').maybeSingle();
      if (useAuthStore.getState().user?.id !== actor) return;
      if (error || !data) {
        console.error('Admin service request update failed:', error);
        setFeedback('Update not saved. The request may have changed or the database is unavailable. Refresh before retrying.');
      } else {
        setRows((items) => items.map((row) => row.id === item.id ? {
          ...row, status: data.status as ServiceRequestStatus,
          client_update: data.client_update, updated_at: data.updated_at,
        } : row));
        setFeedback('Request ' + item.id + ' updated in the database.');
        void load();
        invalidateCountCards();
      }
    } catch (reason) {
      console.error('Admin service request verification or write failed', reason);
      if (useAuthStore.getState().user?.id === actor) {
        setFeedback('Update not saved. Verify administrator access and your database connection before retrying.');
      }
    } finally {
      if (useAuthStore.getState().user?.id === actor) setSaving(null);
    }
  };

  if (checking || authLoading) return <main className="mx-auto max-w-5xl px-4 py-20 text-center text-muted-foreground">Verifying administrator access…</main>;
  if (!authorized || !user) return <main className="mx-auto max-w-3xl px-4 py-20">
    <Card className="p-8 text-center">
      <ShieldCheck className="mx-auto mb-4 h-8 w-8 text-primary" />
      <h1 className="text-xl font-bold">{adminAccessError ? 'Administrator verification unavailable' : 'Administrator access required'}</h1>
      <p className="mt-2 text-muted-foreground">
        {adminAccessError
          ? 'Could not verify administrator access with the database. This does not mean your account lost its role. Retry when the connection returns.'
          : 'Only verified ETERNYX administrators can manage service enquiries.'}
      </p>
      {adminAccessError && user && <Button type="button" className="mt-4" onClick={() => setAdminAccessRetry((value) => value + 1)}>
        <RefreshCw className="mr-2 h-4 w-4" />Retry administrator verification
      </Button>}
    </Card>
  </main>;

  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <AdminWorkspaceNav />
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary">ETERNYX / Business operations</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Service request desk</h1><p className="mt-2 text-sm text-muted-foreground">Review submitted briefs and publish factual, customer-visible status updates. No payment or fulfillment is triggered here.</p></div>
        <Button variant="outline" onClick={() => { void load(); invalidateCountCards(); }} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Administrator queue sharing and export">
        <Button type="button" variant="outline" size="sm" disabled={!currentAdminFocus()}
          onClick={() => void copyFocusedAdminView()}>
          <Link2 className="mr-2 h-4 w-4" />Copy focus link
        </Button>
        <Button type="button" variant="outline" size="sm"
          disabled={loadError || loading || filtered.length === 0}
          onClick={() => void exportLoadedAdminQueue()}>
          <Download className="mr-2 h-4 w-4" />Export loaded worklist
        </Button>
        <p className="text-xs text-muted-foreground">
          Links contain only an approved task focus. CSV exports just this page's loaded worklist metadata, not customer emails, private notes or full briefs.
        </p>
      </div>
      {authorized && <ServiceDeskReadiness mode="admin" />}
      {authorized && <ServiceActionPulse
        heading="Service operations action center"
        description="Load / refresh exact counts on demand. Task cards continue to apply real server filters even when counts are unknown."
        refreshing={actionCountLoading}
        onRefresh={() => void loadActionCounts()}
        items={[
          { id: 'all', label: 'All requests', count: actionCountOwner === user?.id ? actionCounts.all : null, description: 'Requests on the service desk', active: !attentionOnly && !pendingAmendmentsOnly && clarificationFilter === 'all' && assignmentFilter === 'all' && !activeSearch && filter === 'all', onSelect: () => chooseActionFocus('all') },
          { id: 'follow-up', label: 'Needs follow-up', count: actionCountOwner === user?.id ? actionCounts.followUp : null, description: 'Recorded customer tasks', active: attentionOnly, onSelect: () => chooseActionFocus('followUp') },
          { id: 'amendments', label: 'Brief changes to review', count: actionCountOwner === user?.id ? actionCounts.amendments : null, description: 'Requests with pending changes', active: pendingAmendmentsOnly, onSelect: () => chooseActionFocus('amendments') },
          { id: 'clarifications', label: 'Clarifications to review', count: actionCountOwner === user?.id ? actionCounts.clarifications : null, description: 'Requests with saved answers', active: clarificationFilter === 'needs_review', onSelect: () => chooseActionFocus('clarifications') },
          { id: 'unassigned', label: 'Unassigned requests', count: actionCountOwner === user?.id ? actionCounts.unassigned : null, description: 'Requests without an admin', active: assignmentFilter === 'unassigned', onSelect: () => chooseActionFocus('unassigned') },
        ]}
      />}
      <section aria-label="Verified internal review workload" className="mb-6 rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Internal review workload</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadQueueCounts()}
            disabled={reviewCountLoading || !authorized}>
            {reviewCountLoading ? 'Checking…' : 'Load / refresh review counts'}
          </Button>
          <p className="text-xs text-muted-foreground">Exact counts on demand · UTC calendar · not customer SLAs</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['overdue', 'due_today', 'upcoming', 'unscheduled'] as const).map((bucket) => (
            <Button key={bucket} type="button" variant={reviewBucket === bucket ? 'default' : 'outline'} className="h-auto min-h-16 flex-col gap-1 py-3" aria-pressed={reviewBucket === bucket}
              onClick={() => { setReviewBucket((current) => current === bucket ? 'all' : bucket); setPage(0); }}>
              <span className="text-lg font-bold">{queueCounts[bucket] ?? '—'}</span>
              <span className="text-xs">{serviceReviewBucketLabels[bucket]}</span>
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Unavailable counts display a dash rather than a fabricated zero. Select a card to filter the queue.</p>
      </section>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label htmlFor="service-admin-filter" className="text-sm font-semibold">Status</label>
        <select id="service-admin-filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0); }}>
          <option value="all">All requests</option>
          {Object.entries(serviceRequestStatuses).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
        </select>
        <form className="flex w-full flex-wrap items-center gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
          <label htmlFor="service-admin-search-field" className="sr-only">Search field</label>
          <select id="service-admin-search-field" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={searchField} onChange={(event) => setSearchField(event.target.value as typeof searchField)}>
            <option value="title">Title</option><option value="contact_email">Contact email</option><option value="id">Request UUID</option>
          </select>
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <label htmlFor="service-admin-search" className="sr-only">Search service requests</label>
            <Input id="service-admin-search" maxLength={80} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search confirmed requests" className="pl-9" />
          </div>
          <Button type="submit" variant="outline" disabled={loading}>Search</Button>
        </form>
        <span className="text-xs text-muted-foreground">{filtered.length} loaded requests · page {page + 1} · full total not calculated</span>
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
        <div>
          <label htmlFor="service-priority-filter" className="mb-1 block text-xs font-semibold">Priority</label>
          <select id="service-priority-filter" value={priorityFilter} onChange={(event) => { setPage(0); setPriorityFilter(event.target.value as typeof priorityFilter); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
        </div>
        <div>
          <label htmlFor="service-assignment-filter" className="mb-1 block text-xs font-semibold">Assignment</label>
          <select id="service-assignment-filter" value={assignmentFilter} onChange={(event) => { setPage(0); setAssignmentFilter(event.target.value as typeof assignmentFilter); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All assignments</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div>
          <label htmlFor="service-sort-order" className="mb-1 block text-xs font-semibold">Sort</label>
          <select id="service-sort-order" value={sortOrder} onChange={(event) => { setPage(0); setSortOrder(event.target.value as typeof sortOrder); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="newest">Newest requests</option><option value="priority">Highest priority</option><option value="customer_activity">Recent customer activity</option><option value="next_review">Next scheduled review</option>
            <option value="amendments">Most pending brief changes</option>
            <option value="clarifications">Most answers awaiting review</option>
          </select>
        </div>
        <div>
          <label htmlFor="service-review-bucket" className="mb-1 block text-xs font-semibold">Internal review schedule</label>
          <select id="service-review-bucket" value={reviewBucket} onChange={(event) => { setPage(0); setReviewBucket(event.target.value as typeof reviewBucket); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All review dates</option>
            {Object.entries(serviceReviewBucketLabels).map(([value, title]) => <option value={value} key={value}>{title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="service-next-action-filter" className="mb-1 block text-xs font-semibold">Next internal action</label>
          <select id="service-next-action-filter" value={actionFilter} onChange={(event) => { setPage(0); setActionFilter(event.target.value as typeof actionFilter); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All next actions</option>
            {Object.entries(serviceNextActionLabels).map(([value, title]) => <option value={value} key={value}>{title}</option>)}
          </select>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={attentionOnly} onChange={(event) => { setPage(0); setAttentionOnly(event.target.checked); }} />Needs follow-up</label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={mineCheckOnly} onChange={(event) => { setPage(0); setMineCheckOnly(event.target.checked); }} />Needs my check</label>
        <div>
          <label htmlFor="service-clarification-filter" className="mb-1 block text-xs font-semibold">Clarifications</label>
          <select id="service-clarification-filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={clarificationFilter} onChange={(event) => { setPage(0); setClarificationFilter(event.target.value as typeof clarificationFilter); }}>
            <option value="all">All clarification states</option>
            <option value="awaiting_customer">Awaiting customer answer</option>
            <option value="needs_review">Answered · needs admin review</option>
            <option value="open">Any open question</option>
          </select>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={pendingAmendmentsOnly} onChange={(event) => { setPage(0); setPendingAmendmentsOnly(event.target.checked); }} />Brief changes awaiting review</label>
        <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear all filters</Button>
        <span className="text-xs text-muted-foreground">Follow-up includes actual customer messages, scope responses and clarification answers. Check-ins remain personal; review dates are not response guarantees.</span>
      </div>
      {feedback && <p role="status" className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm">{feedback}</p>}
      <p className="mb-4 text-xs text-muted-foreground">All queue filters, review targets and page totals come from the database. Internal UTC review dates are not customer commitments.</p>
      {loadError ? <Card className="p-8 text-center"><p className="font-semibold">Could not load service requests.</p><p className="mt-2 text-sm text-muted-foreground">The database query failed. Connectivity, API exposure or a migration may be unavailable. This is not proof the queue is empty. Use the read-only feature checks above.</p><p role="status" className="mt-2 text-sm text-muted-foreground">{loadErrorDetail}</p><Button className="mt-4" onClick={() => void load()}>Retry</Button></Card>
        : loading && rows.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Loading service requests…</Card>
        : filtered.length === 0 ? <Card className="p-8 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-primary" /><p>No requests in this view.</p></Card>
        : <div className="space-y-5">{filtered.map((item) => {
          const draft = drafts[item.id] ?? { status: item.status, client_update: item.client_update ?? '' };
          return <Card key={item.id} className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{getServiceOffering(item.service_key)?.title ?? item.service_key}</p><h2 className="mt-2 text-xl font-bold">{item.title}</h2><p className="mt-2 break-all text-xs text-muted-foreground">Submitted {new Date(item.created_at).toLocaleString()} · {item.id}</p></div><span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{serviceRequestStatuses[item.status]?.label ?? item.status}</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">Priority: {item.priority}</span>
              <span className="rounded-full border border-border px-3 py-1">{item.assigned_admin_id === user.id ? 'Assigned to you' : item.assigned_admin_id ? 'Assigned to another admin' : 'Unassigned'}</span>
              {item.needs_follow_up_complete && <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/[0.06] px-3 py-1 text-primary"><Bell className="h-3 w-3" />Needs follow-up</span>}
              {item.needs_my_check_complete && <span className="rounded-full border border-primary/40 px-3 py-1 text-primary">{item.last_checked_at ? 'New customer activity since your check' : 'Needs your first check'}</span>}
              {item.customer_answers_since_check > 0 && <span className="rounded-full border border-primary/40 px-3 py-1 text-primary">{item.customer_answers_since_check} customer clarification answer(s) since your check</span>}
              {item.pending_amendment_count > 0 && <span className="rounded-full border border-primary/40 bg-primary/[0.06] px-3 py-1 text-primary">Brief changes to review: {item.pending_amendment_count}</span>}
              {item.awaiting_customer_count > 0 && <span className="rounded-full border border-border px-3 py-1">Awaiting customer answer: {item.awaiting_customer_count}</span>}
              {item.awaiting_admin_review_count > 0 && <span className="rounded-full border border-primary/40 px-3 py-1 text-primary">Clarifications to review: {item.awaiting_admin_review_count}</span>}
              <span className="flex items-center gap-1 rounded-full border border-border px-3 py-1"><CalendarClock className="h-3 w-3" />{serviceReviewBucketLabels[item.review_bucket] ?? 'Not scheduled'}{item.next_review_on ? ': ' + item.next_review_on : ''}</span>
              <span className="rounded-full border border-border px-3 py-1">Next: {serviceNextActionLabels[item.next_action_kind] ?? 'Not planned'}</span>
              {item.last_customer_activity_at && <span>Customer activity: {new Date(item.last_customer_activity_at).toLocaleString()}</span>}
            </div>
            <div className="mt-5 grid gap-4 rounded-xl border border-border p-4 text-sm md:grid-cols-2"><div><p className="font-semibold">Contact</p><p className="mt-2 break-all text-muted-foreground">{item.contact_email}</p>{item.company && <p className="mt-1 text-muted-foreground">{item.company}</p>}</div><div><p className="font-semibold">Project brief</p><p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">{item.description}</p></div></div>
            <div className="mt-4 grid gap-3 rounded-xl border border-border p-4 text-sm">
              {item.expected_outcome && <p><strong>Expected outcome:</strong> {item.expected_outcome}</p>}
              {item.timeframe && <p><strong>Preferred timeframe:</strong> {item.timeframe.replace(/_/g, ' ')}</p>}
              {item.constraints && <p className="whitespace-pre-wrap break-words"><strong>Constraints:</strong> {item.constraints}</p>}
              <p className="text-xs text-muted-foreground">The customer's preferred timeframe is not a delivery promise.</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <div><label className="mb-2 block text-sm font-semibold" htmlFor={'request-status-' + item.id}>Verified status</label><select id={'request-status-' + item.id} value={draft.status} onChange={(e) => setDrafts((state) => ({ ...state, [item.id]: { ...draft, status: e.target.value as ServiceRequestStatus } }))} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">{Object.entries(serviceRequestStatuses).map(([value, info]) => <option key={value} value={value} disabled={value === 'in_progress' || value === 'completed'}>{info.label}{value === 'in_progress' || value === 'completed' ? ' · requires verified agreement' : ''}</option>)}</select></div>
              <div><label className="mb-2 block text-sm font-semibold" htmlFor={'request-update-' + item.id}>Client-visible update</label><Textarea id={'request-update-' + item.id} rows={3} maxLength={1000} value={draft.client_update} onChange={(e) => setDrafts((state) => ({ ...state, [item.id]: { ...draft, client_update: e.target.value } }))} placeholder="Provide actual next steps. Do not include internal notes or secrets." /><p className="mt-1 text-right text-xs text-muted-foreground">{draft.client_update.length}/1,000</p></div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={checkingId !== null} onClick={() => void markChecked(item.id)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />{checkingId === item.id ? 'Recording…' : 'Mark checked'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void copyAdminLink(item.id)}><Link2 className="mr-2 h-4 w-4" />Copy admin link</Button>
              <Button type="button" variant="outline" aria-expanded={openConversation === item.id} onClick={() => setOpenConversation((current) => current === item.id ? null : item.id)}>
                <MessageCircle className="mr-2 h-4 w-4" />{openConversation === item.id ? 'Close conversation' : 'Customer conversation'}
              </Button>
              <Button disabled={saving !== null || (draft.status === item.status && draft.client_update.trim() === (item.client_update ?? ''))} onClick={() => void save(item)}>{saving === item.id ? 'Saving…' : 'Save verified update'}</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{item.last_checked_at ? 'Your last check: ' + new Date(item.last_checked_at).toLocaleString() : 'You have not checked this request'} · Personal marker, not a read receipt</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" aria-expanded={openTriage === item.id} onClick={() => setOpenTriage((id) => id === item.id ? null : item.id)}>
                {openTriage === item.id ? 'Close private triage' : 'Private triage'}
              </Button>
              <Button type="button" variant="outline" aria-expanded={openJournal === item.id}
                onClick={() => setOpenJournal((id) => id === item.id ? null : item.id)}>
                <ClipboardList className="mr-2 h-4 w-4" />{openJournal === item.id ? 'Close journal' : 'Activity journal'}
              </Button>
              <Button type="button" variant="outline" aria-expanded={openAmendments === item.id} onClick={() => setOpenAmendments((id) => id === item.id ? null : item.id)}>
                <ClipboardList className="mr-2 h-4 w-4" />{openAmendments === item.id ? 'Close brief changes' : 'Brief changes (' + item.amendment_count + ')'}
              </Button>
              <Button type="button" variant="outline" aria-expanded={openClarifications === item.id} onClick={() => setOpenClarifications((id) => id === item.id ? null : item.id)}>
                <ClipboardList className="mr-2 h-4 w-4" />{openClarifications === item.id ? 'Close clarifications' : 'Clarifications (' + item.open_clarification_count + ' open)'}
              </Button>
              <Button type="button" variant="outline" aria-expanded={openScope === item.id} onClick={() => setOpenScope((id) => id === item.id ? null : item.id)}>
                {openScope === item.id ? 'Close scope reviews' : 'Scope review & publish'}
              </Button>
            </div>
            <ServiceRequestSectionLinks requestId={item.id} ownerId={item.user_id} mode="admin" />
            {openConversation === item.id && <ServiceRequestTimeline requestId={item.id} ownerId={item.user_id} refreshToken={Date.parse(item.updated_at)} />}
            {openTriage === item.id && <ServiceTriagePanel requestId={item.id} onSaved={() => { void load(); invalidateCountCards(); }} />}
            {openScope === item.id && <ServiceScopeReview requestId={item.id} ownerId={item.user_id} isAdmin />}
            {openClarifications === item.id && <ServiceClarifications requestId={item.id} ownerId={item.user_id} isAdmin onChanged={() => { void load(); invalidateCountCards(); }} />}
            {openAmendments === item.id && <ServiceBriefAmendments requestId={item.id} ownerId={item.user_id} isAdmin onChanged={() => { void load(); invalidateCountCards(); }} />}
            {openJournal === item.id && <ServiceRequestJournal requestId={item.id} ownerId={item.user_id} />}
          </Card>;
        })}</div>}
      {!loadError && (page > 0 || filtered.length > 0) && (
        <nav aria-label="Service requests pagination" className="mt-6 flex items-center justify-center gap-4">
          <Button type="button" variant="outline" onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={loading || page === 0}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page + 1} · additional pages {hasMore ? 'available' : 'not detected'}</span>
          <Button type="button" variant="outline" onClick={() => setPage((n) => n + 1)} disabled={loading || !hasMore}>Next</Button>
        </nav>
      )}
    </main>
  );
}