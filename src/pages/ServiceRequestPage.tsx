import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { getServiceOffering, serviceOfferings, type ServiceKey } from '@/lib/serviceOfferings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function ServiceRequestPage() {
  const [searchParams] = useSearchParams();
  const initialService = getServiceOffering(searchParams.get('service'));
  const [serviceKey, setServiceKey] = useState<ServiceKey>(initialService?.key ?? serviceOfferings[0].key);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [company, setCompany] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [timeframe, setTimeframe] = useState('flexible');
  const [constraints, setConstraints] = useState('');
  const [authorizationUnderstood, setAuthorizationUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.email) setContactEmail((current) => current || user.email || '');
  }, [user?.email]);

  const selected = getServiceOffering(serviceKey);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const cleanEmail = contactEmail.trim();
    if (cleanTitle.length < 8 || cleanTitle.length > 120) return toast.error('Title must be 8–120 characters.');
    if (cleanDescription.length < 40 || cleanDescription.length > 4000) return toast.error('Brief must be 40–4,000 characters.');
    if (company.trim().length > 160) return toast.error('Company must be 160 characters or fewer.');
    if (expectedOutcome.trim().length < 12 || expectedOutcome.trim().length > 800) return toast.error('Expected outcome must be 12–800 characters.');
    if (constraints.length > 1200) return toast.error('Constraints must be 1,200 characters or fewer.');
    if (serviceKey === 'security-review' && !authorizationUnderstood) return toast.error('Confirm you understand written authorization is required before any security testing.');
    if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return toast.error('Enter a valid contact email.');
    setBusy(true);
    try {
      const { data: { user: verifiedUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !verifiedUser) throw new Error('Session expired. Please sign in again.');
      const { data, error } = await supabase.from('service_requests').insert({
        user_id: verifiedUser.id,
        service_key: serviceKey,
        title: cleanTitle,
        description: cleanDescription,
        contact_email: cleanEmail,
        company: company.trim() || null,
        expected_outcome: expectedOutcome.trim(),
        timeframe,
        constraints: constraints.trim() || null,
        authorization_understood: serviceKey === 'security-review' && authorizationUnderstood,
      }).select('id').single();
      if (error || !data?.id) throw error ?? new Error('The request was not confirmed by the database.');
      toast.success('Project brief submitted for review.');
      navigate('/services/requests', { replace: true, state: { createdId: data.id } });
    } catch (error) {
      console.error('Service request submission failed:', error);
      toast.error('Your brief was not confirmed. Please try again or contact support.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-[75vh] max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <Button variant="ghost" asChild className="mb-6"><Link to="/services-hub"><ArrowLeft className="mr-2 h-4 w-4" /> Services</Link></Button>
      <div className="mb-8 max-w-3xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><FileText className="h-5 w-5" /> ETERNYX / Project intake</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Tell us what you want to achieve.</h1>
        <p className="mt-4 text-muted-foreground">Submit a request for feasibility review. Submission is free and does not create a contract, order, subscription, or payment obligation.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-5 sm:p-8">
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
            <div>
              <label htmlFor="service-category" className="mb-2 block text-sm font-semibold">Service area</label>
              <select id="service-category" value={serviceKey} onChange={(event) => setServiceKey(event.target.value as ServiceKey)} disabled={busy} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                {serviceOfferings.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">{selected?.scope}</p>
            </div>
            <div>
              <label htmlFor="service-title" className="mb-2 block text-sm font-semibold">Project title *</label>
              <Input id="service-title" required minLength={8} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} placeholder="e.g. Secure customer portal for my business" />
            </div>
            <div>
              <label htmlFor="service-description" className="mb-2 block text-sm font-semibold">Project brief *</label>
              <Textarea id="service-description" required minLength={40} maxLength={4000} rows={9} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} placeholder="Describe the problem, expected outcome, constraints and approximate timeline. Do not share passwords, credentials or production secrets." />
              <p className="mt-1 text-right text-xs text-muted-foreground">{description.length}/4,000 · minimum 40</p>
            </div>
            <div><label htmlFor="service-outcome" className="mb-2 block text-sm font-semibold">What does success look like? *</label>
              <Textarea id="service-outcome" required minLength={12} maxLength={800} rows={3} value={expectedOutcome} onChange={(event) => setExpectedOutcome(event.target.value)} disabled={busy} placeholder="Describe the measurable result you would like to achieve." />
              <p className="mt-1 text-right text-xs text-muted-foreground">{expectedOutcome.length}/800</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="service-timeframe" className="mb-2 block text-sm font-semibold">Preferred planning timeframe</label>
                <select id="service-timeframe" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={timeframe} onChange={(event) => setTimeframe(event.target.value)} disabled={busy}>
                  <option value="flexible">Flexible / not decided</option>
                  <option value="under_1_month">Under one month</option>
                  <option value="1_3_months">1–3 months</option>
                  <option value="3_plus_months">More than three months</option>
                </select>
              </div>
              <div><label htmlFor="service-constraints" className="mb-2 block text-sm font-semibold">Constraints (optional)</label>
                <Textarea id="service-constraints" rows={3} maxLength={1200} value={constraints} onChange={(event) => setConstraints(event.target.value)} disabled={busy} placeholder="Technology, compliance, accessibility, known dependencies — no secrets." />
              </div>
            </div>
            {serviceKey === 'security-review' && (
              <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
                <input type="checkbox" checked={authorizationUnderstood} onChange={(event) => setAuthorizationUnderstood(event.target.checked)} required disabled={busy} className="mt-1" />
                <span>I understand active security testing is not authorized by this request and will require separate verified written permission from the asset owner.</span>
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="service-contact" className="mb-2 block text-sm font-semibold">Contact email *</label><Input id="service-contact" type="email" required maxLength={254} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} disabled={busy} /></div>
              <div><label htmlFor="service-company" className="mb-2 block text-sm font-semibold">Company (optional)</label><Input id="service-company" maxLength={160} value={company} onChange={(event) => setCompany(event.target.value)} disabled={busy} /></div>
            </div>
            <Button type="submit" disabled={busy || !user} className="w-full">{busy ? 'Submitting…' : 'Submit brief for review'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
            {!user && <p className="text-center text-sm text-muted-foreground">An account is required. <Link className="font-semibold text-primary underline" to="/auth">Sign in first</Link>.</p>}
          </form>
        </Card>
        <aside className="space-y-4">
          <Card className="p-5"><ShieldCheck className="mb-3 h-6 w-6 text-primary" /><h2 className="font-semibold">What happens next?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The request is saved under your account. An authorized administrator can review it and publish an update. There is no guaranteed response time or acceptance.</p><Button variant="outline" asChild className="mt-5 w-full"><Link to="/services/requests">View my requests</Link></Button></Card>
          <Card className="p-5"><LockKeyhole className="mb-3 h-6 w-6 text-primary" /><h2 className="font-semibold">Keep credentials private</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Never include API keys, customer records, passwords or other sensitive material. Security testing requires separate authorization before any activity.</p></Card>
        </aside>
      </div>
    </main>
  );
}