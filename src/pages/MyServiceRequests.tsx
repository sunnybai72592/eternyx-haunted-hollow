import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { getServiceOffering, serviceRequestStatuses, type ServiceRequestStatus } from '@/lib/serviceOfferings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type RequestRow = {
  id: string; service_key: string; title: string; description: string;
  status: ServiceRequestStatus; client_update: string | null;
  created_at: string; updated_at: string;
};

export default function MyServiceRequests() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const createdId = (location.state as { createdId?: string } | null)?.createdId;
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('service_requests')
      .select('id,service_key,title,description,status,client_update,created_at,updated_at')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) {
      console.error('Could not load owned service requests:', error);
      setLoadError(true);
    } else setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="mx-auto min-h-[70vh] max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <Button variant="ghost" asChild className="mb-5"><Link to="/services-hub"><ArrowLeft className="mr-2 h-4 w-4" />Services</Link></Button>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary">ETERNYX / Private service desk</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">My service requests</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Only your account and authorized administrators can read your briefs. Statuses reflect actual administrator updates.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button asChild><Link to="/services/request">New request</Link></Button></div>
      </header>
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
            <p className="mt-5 break-all text-xs text-muted-foreground">Reference: {item.id}</p>
          </Card>;
        })}</div>}
      <p className="mt-7 text-center text-xs text-muted-foreground">These are enquiries, not paid orders. No price, timeline or delivery is promised until separately agreed.</p>
    </main>
  );
}