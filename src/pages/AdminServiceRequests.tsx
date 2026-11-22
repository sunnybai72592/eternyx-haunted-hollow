import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ClipboardList, MessageCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
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
import { Input } from '@/components/ui/input';

type ServiceRow = {
  id: string; user_id: string; title: string; service_key: string; description: string;
  contact_email: string; company: string | null; status: ServiceRequestStatus;
  client_update: string | null; created_at: string; updated_at: string;
  expected_outcome: string | null; timeframe: string | null; constraints: string | null;
  priority: string; priority_rank: number; assigned_admin_id: string | null;
  needs_follow_up: boolean; last_customer_activity_at: string | null; last_admin_activity_at: string | null;
};
type Draft = { status: ServiceRequestStatus; client_update: string };

export default function AdminServiceRequests() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [authorizedFor, setAuthorizedFor] = useState<string | null>(null);
  const authorized = !!user && authorizedFor === user.id;
  const fetchGeneration = useRef(0);
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
  const [sortOrder, setSortOrder] = useState<'newest' | 'priority' | 'customer_activity'>('newest');
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const [openScope, setOpenScope] = useState<string | null>(null);
  const [openTriage, setOpenTriage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || authorizedFor !== user.id) return;
    const generation = ++fetchGeneration.current;
    setLoading(true);
    setLoadError(false);
    let query = supabase.from('service_admin_attention_queue')
      .select('id,user_id,title,service_key,description,contact_email,company,status,client_update,created_at,updated_at,expected_outcome,timeframe,constraints,priority,priority_rank,assigned_admin_id,needs_follow_up,last_customer_activity_at,last_admin_activity_at', { count: 'exact' });
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
    if (attentionOnly) query = query.eq('needs_follow_up', true);
    if (sortOrder === 'priority') query = query.order('priority_rank', { ascending: false });
    if (sortOrder === 'customer_activity') query = query.order('last_customer_activity_at', { ascending: false, nullsFirst: false });
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (generation !== fetchGeneration.current) return;
    if (error) {
      setLoadError(true);
      console.error('Admin service requests query failed:', error);
    } else {
      const next = (data ?? []) as ServiceRow[];
      setRows(next);
      setTotal(count ?? 0);
      setDrafts(Object.fromEntries(next.map((item) => [item.id, { status: item.status, client_update: item.client_update ?? '' }])));
    }
    setLoading(false);
  }, [user?.id, authorizedFor, page, filter, activeSearch, activeSearchField, priorityFilter, assignmentFilter, attentionOnly, sortOrder]);

  useEffect(() => {
    let active = true;
    fetchGeneration.current += 1;
    setAuthorizedFor(null);
    setRows([]);
    setTotal(0);
    setDrafts({});
    if (authLoading) {
      setChecking(true);
      return () => { active = false; };
    }
    if (!user) {
      setChecking(false);
      return () => { active = false; };
    }
    setChecking(true);
    void (async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (!active) return;
      setAuthorizedFor(!error && data === true ? user.id : null);
      setChecking(false);
    })();
    return () => { active = false; fetchGeneration.current += 1; };
  }, [user?.id, authLoading]);

  useEffect(() => { if (authorized) void load(); }, [authorized, load]);

  const filtered = rows;
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
    const draft = drafts[item.id];
    if (!draft || saving) return;
    if ((draft.status === 'in_progress' || draft.status === 'completed') && draft.status !== item.status) { setFeedback('Delivery statuses require a separately verified agreement. They are not enabled by this desk.'); return; }
    if (draft.client_update.length > 1000) { setFeedback('Client update must be at most 1,000 characters.'); return; }
    setSaving(item.id);
    setFeedback(null);
    const { data, error } = await supabase.from('service_requests')
      .update({ status: draft.status, client_update: draft.client_update.trim() || null })
      .eq('id', item.id)
      .eq('updated_at', item.updated_at)
      .select('id,status,client_update,updated_at').maybeSingle();
    if (error || !data) {
      console.error('Admin service request update failed:', error);
      setFeedback('Update not saved. The request may have changed or the service desk migration is unavailable. Refresh before retrying.');
    } else {
      setRows((items) => items.map((row) => row.id === item.id ? { ...row, status: data.status as ServiceRequestStatus, client_update: data.client_update, updated_at: data.updated_at } : row));
      setFeedback('Request ' + item.id + ' updated in the database.');
      void load();
    }
    setSaving(null);
  };

  if (checking || authLoading) return <main className="mx-auto max-w-5xl px-4 py-20 text-center text-muted-foreground">Verifying administrator access…</main>;
  if (!authorized || !user) return <main className="mx-auto max-w-3xl px-4 py-20"><Card className="p-8 text-center"><ShieldCheck className="mx-auto mb-4 h-8 w-8 text-primary" /><h1 className="text-xl font-bold">Administrator access required</h1><p className="mt-2 text-muted-foreground">Only verified ETERNYX administrators can manage service enquiries.</p></Card></main>;

  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <AdminWorkspaceNav />
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary">ETERNYX / Business operations</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Service request desk</h1><p className="mt-2 text-sm text-muted-foreground">Review submitted briefs and publish factual, customer-visible status updates. No payment or fulfillment is triggered here.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </header>
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
        <span className="text-xs text-muted-foreground">{filtered.length} of {total} matching requests · page {page + 1}</span>
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
            <option value="newest">Newest requests</option><option value="priority">Highest priority</option><option value="customer_activity">Recent customer activity</option>
          </select>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={attentionOnly} onChange={(event) => { setPage(0); setAttentionOnly(event.target.checked); }} />Needs follow-up</label>
        <span className="text-xs text-muted-foreground">Signals are based on saved activity, not unread receipts or response deadlines.</span>
      </div>
      {feedback && <p role="status" className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm">{feedback}</p>
      <p className="mb-4 text-xs text-muted-foreground">Search and status filters are applied by the database. No first-250 cutoff or invented totals.</p>
      {loadError ? <Card className="p-8 text-center"><p className="font-semibold">Could not load service requests.</p><p className="mt-2 text-sm text-muted-foreground">The migration may not yet be deployed, or access was denied.</p><Button className="mt-4" onClick={() => void load()}>Retry</Button></Card>
        : loading && rows.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Loading service requests…</Card>
        : filtered.length === 0 ? <Card className="p-8 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-primary" /><p>No requests in this view.</p></Card>
        : <div className="space-y-5">{filtered.map((item) => {
          const draft = drafts[item.id] ?? { status: item.status, client_update: item.client_update ?? '' };
          return <Card key={item.id} className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{getServiceOffering(item.service_key)?.title ?? item.service_key}</p><h2 className="mt-2 text-xl font-bold">{item.title}</h2><p className="mt-2 break-all text-xs text-muted-foreground">Submitted {new Date(item.created_at).toLocaleString()} · {item.id}</p></div><span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{serviceRequestStatuses[item.status]?.label ?? item.status}</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">Priority: {item.priority}</span>
              <span className="rounded-full border border-border px-3 py-1">{item.assigned_admin_id === user.id ? 'Assigned to you' : item.assigned_admin_id ? 'Assigned to another admin' : 'Unassigned'}</span>
              {item.needs_follow_up && <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/[0.06] px-3 py-1 text-primary"><Bell className="h-3 w-3" />Needs follow-up</span>}
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
              <Button type="button" variant="outline" aria-expanded={openConversation === item.id} onClick={() => setOpenConversation((current) => current === item.id ? null : item.id)}>
                <MessageCircle className="mr-2 h-4 w-4" />{openConversation === item.id ? 'Close conversation' : 'Customer conversation'}
              </Button>
              <Button disabled={saving !== null || (draft.status === item.status && draft.client_update.trim() === (item.client_update ?? ''))} onClick={() => void save(item)}>{saving === item.id ? 'Saving…' : 'Save verified update'}</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" aria-expanded={openTriage === item.id} onClick={() => setOpenTriage((id) => id === item.id ? null : item.id)}>
                {openTriage === item.id ? 'Close private triage' : 'Private triage'}
              </Button>
              <Button type="button" variant="outline" aria-expanded={openScope === item.id} onClick={() => setOpenScope((id) => id === item.id ? null : item.id)}>
                {openScope === item.id ? 'Close scope reviews' : 'Scope review & publish'}
              </Button>
            </div>
            {openConversation === item.id && <ServiceRequestTimeline requestId={item.id} ownerId={item.user_id} refreshToken={Date.parse(item.updated_at)} />}
            {openTriage === item.id && <ServiceTriagePanel requestId={item.id} onSaved={() => void load()} />}
            {openScope === item.id && <ServiceScopeReview requestId={item.id} ownerId={item.user_id} isAdmin />}
          </Card>;
        })}</div>}
      {!loadError && total > 0 && (
        <nav aria-label="Service requests pagination" className="mt-6 flex items-center justify-center gap-4">
          <Button type="button" variant="outline" onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={loading || page === 0}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          <Button type="button" variant="outline" onClick={() => setPage((n) => n + 1)} disabled={loading || (page + 1) * PAGE_SIZE >= total}>Next</Button>
        </nav>
      )}
    </main>
  );
}