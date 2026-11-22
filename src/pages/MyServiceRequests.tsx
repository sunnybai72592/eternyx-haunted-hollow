import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Download, MessageCircle, RefreshCw, Search, ShieldCheck, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { getServiceOffering, serviceRequestStatuses, type ServiceRequestStatus } from '@/lib/serviceOfferings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import ServiceRequestTimeline from '@/components/services/ServiceRequestTimeline';
import ServiceScopeReview from '@/components/services/ServiceScopeReview';

type RequestRow = {
  id: string; service_key: string; title: string; description: string;
  status: ServiceRequestStatus; client_update: string | null;
  created_at: string; updated_at: string;
  expected_outcome: string | null; timeframe: string | null; constraints: string | null;
};

export default function MyServiceRequests() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const createdId = (location.state as { createdId?: string } | null)?.createdId;
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | ServiceRequestStatus>('all');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [openConversation, setOpenConversation] = useState<string | null>(new URLSearchParams(location.search).get('request'));
  const [openScope, setOpenScope] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    let query = supabase.from('service_requests')
      .select('id,service_key,title,description,status,client_update,created_at,updated_at,expected_outcome,timeframe,constraints', { count: 'exact' })
      .eq('user_id', user.id);
    if (filter !== 'all') query = query.eq('status', filter);
    if (activeSearch) {
      const escaped = activeSearch.replace(/[\\%_]/g, '\\    const { data, error } = await supabase.from('service_requests')
      .select('id,service_key,title,description,status,client_update,created_at,updated_at,expected_outcome,timeframe,constraints')
      .eq('user_id', user.id).order('created_at', { ascending: false });');
      query = query.ilike('title', '%' + escaped + '%');
    }
    const { data, error, count } = await query.order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * 20, (page + 1) * 20 - 1);
    if (error) {
      console.error('Could not load owned service requests:', error);
      setLoadError(true);
    } else { setRows((data ?? []) as RequestRow[]); setTotal(count ?? 0); }
    setLoading(false);
  }, [user?.id, page, filter, activeSearch]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const selected = new URLSearchParams(location.search).get('request');
    if (selected) setOpenConversation(selected);
  }, [location.search]);

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/services/requests?request=' + encodeURIComponent(id));
      setNotice('A link to this request has been copied. Recipients still need authorized account access.');
    } catch {
      setNotice('Could not copy the link. You can use the request reference shown below.');
    }
  };

  const exportBrief = (item: RequestRow) => {
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
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'eternyx-request-' + item.id + '.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setNotice('Export prepared on this device. Keep this copy private.');
  };

  return (
    <main className="mx-auto min-h-[70vh] max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <Button variant="ghost" asChild className="mb-5"><Link to="/services-hub"><ArrowLeft className="mr-2 h-4 w-4" />Services</Link></Button>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary">ETERNYX / Private service desk</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">My service requests</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Only your account and authorized administrators can read your briefs. Statuses reflect actual administrator updates.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button asChild><Link to="/services/request">New request</Link></Button></div>
      </header>
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
        <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
        <span className="text-xs text-muted-foreground">{rows.length} of {total} matching requests</span>
      </form>
      {notice && <p role="status" className="mb-4 rounded-lg border border-primary/20 p-3 text-sm text-muted-foreground">{notice}</p>}
      {loadError ? <Card className="p-8 text-center"><h2 className="font-semibold">Unable to load requests</h2><p className="mt-2 text-sm text-muted-foreground">The service desk may require its database migration to be deployed. No results are being simulated.</p><Button className="mt-4" onClick={() => void load()}>Try again</Button></Card>
        : loading && rows.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Loading your service requests…</Card>
        : rows.length === 0 ? <Card className="p-8 text-center"><ClipboardList className="mx-auto mb-4 h-10 w-10 text-primary" /><h2 className="text-xl font-semibold">No requests yet</h2><p className="mt-2 text-muted-foreground">Your confirmed project briefs will appear here.</p><Button asChild className="mt-5"><Link to="/services/request">Submit a brief</Link></Button></Card>
        : <div className="space-y-4">{rows.map((item) => {
          const status = serviceRequestStatuses[item.status] ?? serviceRequestStatuses.submitted;
          return <Card key={item.id} className="border-border/70 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{getServiceOffering(item.service_key)?.title ?? 'Service enquiry'}</p><h2 className="mt-1 break-words text-xl font-semibold">{item.title}</h2><p className="mt-2 text-xs text-muted-foreground">Submitted {new Date(item.created_at).toLocaleString()}</p></div><span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{status.label}</span></div>
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(item.id)}>
                <Link2 className="mr-2 h-4 w-4" />Copy private link
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => exportBrief(item)}>
                <Download className="mr-2 h-4 w-4" />Export my brief
              </Button>
            </div>
            <Button type="button" variant="outline" className="mt-4 mr-2"
              aria-expanded={openScope === item.id}
              onClick={() => setOpenScope((current) => current === item.id ? null : item.id)}>
              {openScope === item.id ? 'Close scope reviews' : 'View scope reviews'}
            </Button>
            {openScope === item.id && user && <ServiceScopeReview requestId={item.id} ownerId={user.id} />}
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