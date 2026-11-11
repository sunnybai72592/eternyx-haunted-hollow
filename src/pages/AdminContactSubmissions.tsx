import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Clock3, Filter, Mail, Phone, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';

type EnquiryStatus = 'new' | 'contacted' | 'in-progress' | 'completed' | 'archived';
type EnquiryPriority = 'low' | 'medium' | 'high' | 'urgent';
type Enquiry = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  subject: string;
  message: string;
  service_interested: string | null;
  status: EnquiryStatus | null;
  priority: EnquiryPriority | null;
  created_at: string;
  updated_at: string;
};

const statuses: { value: EnquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];
const priorities: { value: EnquiryPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
const statusStyles: Record<EnquiryStatus, string> = {
  new: 'border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200',
  contacted: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-200',
  'in-progress': 'border-violet-300/20 bg-violet-300/[0.08] text-violet-200',
  completed: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200',
  archived: 'border-slate-300/15 bg-slate-300/[0.06] text-slate-300',
};
const priorityStyles: Record<EnquiryPriority, string> = {
  low: 'text-slate-400',
  medium: 'text-cyan-200',
  high: 'text-amber-200',
  urgent: 'text-rose-200',
};
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function AdminContactSubmissions() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EnquiryStatus>('all');

  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from('contact_submissions')
      .select('id,name,email,company,phone,subject,message,service_interested,status,priority,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(true);
      console.error('Admin contact enquiries query failed:', error);
      toast.error('Could not load business enquiries.');
    } else {
      setEnquiries((data ?? []) as Enquiry[]);
    }
    setLoading(false);
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
      const allowed = !error && data === true;
      setIsAdmin(allowed);
      setCheckingAccess(false);
      if (allowed) await loadEnquiries();
    };
    void verifyAdmin();
    return () => { active = false; };
  }, [authLoading, user, loadEnquiries]);

  const counts = useMemo(() => ({
    total: enquiries.length,
    new: enquiries.filter((item) => item.status === 'new').length,
    active: enquiries.filter((item) => item.status === 'contacted' || item.status === 'in-progress').length,
    completed: enquiries.filter((item) => item.status === 'completed').length,
  }), [enquiries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enquiries.filter((item) => {
      const matchesStatus = statusFilter === 'all' || (item.status ?? 'new') === statusFilter;
      const matchesSearch = !term || [item.name, item.email, item.company, item.subject, item.message, item.service_interested]
        .some((value) => value?.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [enquiries, search, statusFilter]);

  const updateEnquiry = async (id: string, changes: { status?: EnquiryStatus; priority?: EnquiryPriority }) => {
    setUpdatingId(id);
    const { error } = await supabase
      .from('contact_submissions')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('The enquiry could not be updated.');
      console.error('Contact enquiry update failed:', error);
    } else {
      setEnquiries((current) => current.map((item) => item.id === id ? { ...item, ...changes, updated_at: new Date().toISOString() } : item));
      toast.success('Enquiry updated.');
    }
    setUpdatingId(null);
  };

  if (authLoading || checkingAccess) {
    return <main className="mx-auto flex min-h-[55vh] items-center justify-center px-4 text-sm text-slate-400">Verifying administrator access…</main>;
  }
  if (!user || !isAdmin) {
    return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="border-white/10 bg-[#0a1221] p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-2xl font-semibold text-white">{user ? 'Administrator access only' : 'Sign in required'}</h1><p className="mt-2 text-sm text-slate-400">This workspace is restricted to authorized ETERNYX administrators.</p></Card></main>;
  }

  const metrics = [
    { label: 'Total enquiries', value: counts.total, note: 'All submitted messages', icon: Mail, tone: 'text-white' },
    { label: 'New', value: counts.new, note: 'Awaiting first response', icon: AlertCircle, tone: 'text-cyan-100' },
    { label: 'In progress', value: counts.active, note: 'Contacted or being handled', icon: Clock3, tone: 'text-violet-100' },
    { label: 'Completed', value: counts.completed, note: 'Successfully handled', icon: CheckCircle2, tone: 'text-emerald-100' },
  ];

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-72 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
      <AdminWorkspaceNav />
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100"><ShieldCheck className="h-3.5 w-3.5" /> ETERNYX / Business operations</div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Business enquiries</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review incoming messages, prioritize opportunities and track each enquiry through its actual workflow.</p>
        </div>
        <Button variant="outline" onClick={() => void loadEnquiries()} disabled={loading} className="h-10 w-full border-white/15 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] sm:w-auto"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh data</Button>
      </header>

      <section aria-label="Business enquiry metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon, tone }) => <Card key={label} className="border-white/[0.09] bg-[#0a1322]/90 p-5">
          <div className="flex items-center justify-between text-slate-400"><span className="text-xs font-medium">{label}</span><Icon className="h-4 w-4" /></div>
          <p className={`mt-4 text-3xl font-semibold tabular-nums ${tone}`}>{loading && enquiries.length === 0 ? '—' : value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </Card>)}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1221]/85">
        <div className="flex flex-col gap-4 border-b border-white/[0.08] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Client pipeline</p><h2 className="mt-1 text-xl font-semibold text-white">Enquiry inbox</h2><p className="mt-1 text-xs text-slate-500">{filtered.length} of {enquiries.length} enquiries shown</p></div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-1.5 text-[10px] font-semibold text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" /> Admin access verified</span>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block"><span className="sr-only">Search business enquiries</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, company or message…" className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10" /></label>
            <label className="relative block"><span className="sr-only">Filter enquiries by status</span><Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | EnquiryStatus)} className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#0b1424] pl-10 pr-4 text-sm text-slate-200 outline-none transition focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"><option value="all">All statuses</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          </div>
        </div>

        {loading && enquiries.length === 0 ? <div className="p-12 text-center text-sm text-slate-400">Loading business enquiries…</div>
          : loadError ? <div className="p-12 text-center"><AlertCircle className="mx-auto mb-3 h-7 w-7 text-rose-300" /><p className="text-sm font-medium text-white">The enquiry inbox could not be loaded.</p><Button variant="outline" onClick={() => void loadEnquiries()} className="mt-4 border-white/15 text-slate-200">Try again</Button></div>
          : filtered.length === 0 ? <div className="p-12 text-center"><Mail className="mx-auto mb-3 h-8 w-8 text-slate-500" /><p className="text-sm font-medium text-white">{enquiries.length ? 'No matching enquiries' : 'No enquiries received yet'}</p><p className="mt-1 text-xs text-slate-500">{enquiries.length ? 'Try another search or status filter.' : 'New contact form submissions will appear here.'}</p></div>
          : <div className="divide-y divide-white/[0.07]">{filtered.map((item) => {
            const status = item.status ?? 'new';
            const priority = item.priority ?? 'medium';
            return <article key={item.id} className="p-5 transition-colors hover:bg-white/[0.015] sm:p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusStyles[status]}`}>{statuses.find((option) => option.value === status)?.label ?? status}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${priorityStyles[priority]}`}>{priority} priority</span>
                    <span className="text-[11px] text-slate-500">{formatDate(item.created_at)}</span>
                  </div>
                  <h3 className="break-words text-base font-semibold text-white sm:text-lg">{item.subject}</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{item.message}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /><a className="text-cyan-200 hover:text-white" href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Re: ${item.subject}`)}`}>{item.name} · {item.email}</a></span>
                    {item.phone && <a className="inline-flex items-center gap-1.5 hover:text-white" href={`tel:${item.phone.replace(/[^+\d]/g, '')}`}><Phone className="h-3.5 w-3.5" />{item.phone}</a>}
                    {item.company && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{item.company}</span>}
                    {item.service_interested && <span>Interested in: {item.service_interested}</span>}
                  </div>
                  <p className="mt-3 text-[10px] text-slate-600">Reference: {item.id.slice(0, 8)} · Updated {formatDate(item.updated_at)}</p>
                </div>
                <div className="grid w-full shrink-0 gap-3 rounded-xl border border-white/[0.08] bg-black/15 p-3 sm:grid-cols-2 xl:w-64 xl:grid-cols-1">
                  <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Workflow status</span><select value={status} disabled={updatingId === item.id} onChange={(event) => void updateEnquiry(item.id, { status: event.target.value as EnquiryStatus })} className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1424] px-3 text-sm text-slate-100 outline-none focus:border-cyan-200/40 disabled:opacity-50">{statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Priority</span><select value={priority} disabled={updatingId === item.id} onChange={(event) => void updateEnquiry(item.id, { priority: event.target.value as EnquiryPriority })} className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1424] px-3 text-sm text-slate-100 outline-none focus:border-cyan-200/40 disabled:opacity-50">{priorities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  {updatingId === item.id && <p className="text-[11px] text-cyan-200 sm:col-span-2 xl:col-span-1">Saving update…</p>}
                </div>
              </div>
            </article>;
          })}</div>}
      </section>
      <footer className="mt-5 text-[11px] leading-5 text-slate-500">Enquiries are loaded from the existing contact_submissions table. Only workflow status and priority are changed by this inbox.</footer>
    </main>
  );
}
