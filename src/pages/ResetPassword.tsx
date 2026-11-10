import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { user, isLoading, updatePassword } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Use a password with at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Your passwords do not match.' });
      return;
    }
    const result = await updatePassword(password);
    if (result.success) {
      setMessage({ type: 'success', text: 'Your password has been updated. You can now continue to ETERNYX.' });
      setTimeout(() => navigate('/dashboard'), 1200);
    } else {
      setMessage({ type: 'error', text: result.error || 'The reset link may have expired. Request a new one and try again.' });
    }
  };

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-lg items-center justify-center px-4 py-12">
      <section className="w-full rounded-3xl border border-cyan-400/20 bg-[#08111f] p-7 text-white shadow-2xl shadow-cyan-950/30 sm:p-9">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300"><ShieldCheck className="h-6 w-6" /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">ETERNYX ACCOUNT SECURITY</p>
        <h1 className="mt-3 text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Set a new password for your account using the secure link sent to your email.</p>
        {!isLoading && !user ? (
          <div className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            No active password-reset session was found. Your link may have expired or already been used. <Link to="/" className="font-semibold underline underline-offset-4">Return home</Link> and request another reset email.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-slate-300">New password</label>
              <div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 border-white/10 bg-white/[0.04] pl-10 pr-12 text-white focus-visible:ring-cyan-400" /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="mx-auto h-4 w-4" /> : <Eye className="mx-auto h-4 w-4" />}</button></div>
            </div>
            <div className="space-y-2"><label htmlFor="confirm-new-password" className="text-sm font-medium text-slate-300">Confirm new password</label><Input id="confirm-new-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12 border-white/10 bg-white/[0.04] text-white focus-visible:ring-cyan-400" /></div>
            {message && <div role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/25 bg-rose-400/10 text-rose-200'}`}>{message.text}</div>}
            <Button type="submit" disabled={isLoading} className="h-12 w-full bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white">{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Update password</Button>
          </form>
        )}
      </section>
    </main>
  );
};

export default ResetPassword;
