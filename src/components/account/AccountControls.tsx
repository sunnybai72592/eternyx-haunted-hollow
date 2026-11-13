import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { CloudDownload, KeyRound, Loader2, LogOut, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';

const card = 'rounded-2xl border border-white/[0.09] bg-[#0a1322]/90 p-5 sm:p-6 transition hover:border-white/[0.14]';
const field = 'h-11 rounded-xl border-white/[0.10] bg-[#070e19]/85 text-sm text-slate-100 placeholder:text-slate-600';
const lbl = 'text-[11px] uppercase tracking-[0.14em] text-slate-400';

export default function AccountControls() {
  const navigate = useNavigate();
  const { user, setProfile, updatePassword } = useAuthStore();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const syncNow = async () => {
    setSyncing(true);
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    setSyncing(false);
    if (error) return toast({ title: 'Sync failed', description: 'Check your connection and try again.', variant: 'destructive' });
    if (data) setProfile({ ...(data as any), email: user.email || '' });
    setLastSync(new Date());
    toast({ title: 'Account synced', description: 'Your latest profile data is loaded on this device.' });
  };

  const exportData = async () => {
    setExporting(true);
    const [profile, reports, notifications] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('bug_reports').select('*').eq('user_id', user.id),
      supabase.from('notifications').select('*').eq('user_id', user.id),
    ]);
    const backup = {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email, created_at: user.created_at },
      profile: profile.data ?? null,
      bug_reports: reports.data ?? [],
      notifications: notifications.data ?? [],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `eternyx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    toast({ title: 'Backup downloaded', description: 'A copy of your account data is saved to your device.' });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) return toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
    if (pw.next !== pw.confirm) return toast({ title: 'Passwords don’t match', description: 'Type the same password twice.', variant: 'destructive' });
    setPwSaving(true);
    const result = await updatePassword(pw.next);
    setPwSaving(false);
    if (!result.success) return toast({ title: 'Password not changed', description: result.error || 'Please try again.', variant: 'destructive' });
    setPw({ next: '', confirm: '' });
    toast({ title: 'Password updated', description: 'Use your new password next time you sign in.' });
  };

  const signOutEverywhere = async () => {
    setSigningOut(true);
    await supabase.auth.signOut({ scope: 'global' });
    setSigningOut(false);
    navigate('/auth', { replace: true });
  };

  const deleteAccount = async () => {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    setDeleting(false);
    if (error || data?.error) {
      return toast({ title: 'Account not deleted', description: data?.error || 'Please try again.', variant: 'destructive' });
    }
    await supabase.auth.signOut();
    toast({ title: 'Account deleted', description: 'Your ETERNYX account has been removed.' });
    navigate('/', { replace: true });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] p-3 text-cyan-100"><RefreshCw className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-white">Sync & backup</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Your account is stored in the cloud and follows you on every device.</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-slate-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Synced</span>
          <span className="text-[11px] text-slate-500">Last checked {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button onClick={syncNow} disabled={syncing} variant="outline" className="h-11 rounded-xl border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:text-white">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync now
          </Button>
          <Button onClick={exportData} disabled={exporting} className="h-11 rounded-xl bg-cyan-200 font-semibold text-slate-950 hover:bg-cyan-100">
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />} Download my data
          </Button>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-violet-200/15 bg-violet-200/[0.07] p-3 text-violet-100"><KeyRound className="h-5 w-5" /></div>
          <div><h2 className="font-semibold text-white">Change password</h2><p className="mt-1 text-xs leading-5 text-slate-500">At least 8 characters. Google sign-in users can set one here too.</p></div>
        </div>
        <form onSubmit={changePassword} className="mt-5 grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="new-pw" className={lbl}>New password</Label><Input id="new-pw" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={field} /></div>
          <div className="space-y-1.5"><Label htmlFor="confirm-pw" className={lbl}>Confirm password</Label><Input id="confirm-pw" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={field} /></div>
          <Button type="submit" disabled={pwSaving || !pw.next} className="h-11 rounded-xl bg-violet-200 font-semibold text-slate-950 hover:bg-violet-100">
            {pwSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Update password
          </Button>
        </form>
      </section>

      <section className={card}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.07] p-3 text-amber-100"><LogOut className="h-5 w-5" /></div>
          <div><h2 className="font-semibold text-white">Sessions</h2><p className="mt-1 text-xs leading-5 text-slate-500">Lost a device? Sign out of ETERNYX on every browser and phone at once.</p></div>
        </div>
        <Button onClick={signOutEverywhere} disabled={signingOut} variant="outline" className="mt-5 h-11 w-full rounded-xl border-amber-200/20 bg-amber-200/[0.04] text-amber-100 hover:bg-amber-200/[0.09] hover:text-amber-50">
          {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />} Sign out everywhere
        </Button>
      </section>

      <section className="rounded-2xl border border-red-400/20 bg-red-500/[0.04] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-red-300/20 bg-red-400/[0.08] p-3 text-red-200"><Trash2 className="h-5 w-5" /></div>
          <div><h2 className="font-semibold text-white">Delete account</h2><p className="mt-1 text-xs leading-5 text-slate-400">Permanently removes your profile, picture and sign-in. This can’t be undone — download a backup first.</p></div>
        </div>
        <AlertDialog onOpenChange={() => setConfirmText('')}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-5 h-11 w-full rounded-xl"><Trash2 className="mr-2 h-4 w-4" /> Delete my account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl border-red-400/20 bg-[#0a1322]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete your ETERNYX account?</AlertDialogTitle>
              <AlertDialogDescription>Type <span className="font-mono font-semibold text-red-200">DELETE</span> to confirm. Everything tied to {user.email} will be removed.</AlertDialogDescription>
            </AlertDialogHeader>
            <Input autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className={field} />
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Keep my account</AlertDialogCancel>
              <Button variant="destructive" disabled={confirmText !== 'DELETE' || deleting} onClick={deleteAccount} className="rounded-xl">
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete forever
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
