import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Mail, Lock, User, ShieldCheck, Zap, Loader2, Chrome, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

type AuthMode = 'signin' | 'signup' | 'reset';

export const AuthModal = ({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { signIn, signUp, signInWithGoogle, resetPassword, isLoading } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setMessage(null);
      setPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialMode]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setMessage({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }

    if (mode === 'reset') {
      const result = await resetPassword(cleanEmail);
      setMessage(result.success
        ? { type: 'success', text: 'If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.' }
        : { type: 'error', text: result.error || 'Could not send the reset email.' });
      return;
    }

    if (!password) {
      setMessage({ type: 'error', text: 'Enter your password.' });
      return;
    }

    if (mode === 'signup') {
      if (username.trim().length < 3) {
        setMessage({ type: 'error', text: 'Choose a username with at least 3 characters.' });
        return;
      }
      if (password.length < 8) {
        setMessage({ type: 'error', text: 'Use a password with at least 8 characters.' });
        return;
      }
      if (password !== confirmPassword) {
        setMessage({ type: 'error', text: 'Your passwords do not match.' });
        return;
      }
      const result = await signUp(cleanEmail, password, username.trim());
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Account creation failed.' });
      } else if (result.needsEmailConfirmation) {
        setMessage({ type: 'success', text: 'Account request received. Check your email and confirm your address before signing in.' });
      } else {
        onClose();
      }
      return;
    }

    const result = await signIn(cleanEmail, password);
    if (result.success) onClose();
    else setMessage({ type: 'error', text: result.error || 'Sign-in failed. Check your email and password.' });
  };

  const handleGoogle = async () => {
    setMessage(null);
    const result = await signInWithGoogle();
    if (!result.success) setMessage({ type: 'error', text: result.error || 'Google sign-in could not be started.' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#030712]/85 p-4 backdrop-blur-xl" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isLoading) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="eternyx-auth-title" className="relative my-auto w-full max-w-md overflow-hidden rounded-3xl border border-cyan-400/20 bg-[#08111f] text-white shadow-[0_24px_100px_rgba(6,182,212,0.16)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.13),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.12),transparent_38%)]" />
        <div className="relative border-b border-white/10 px-7 pb-6 pt-7">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">ETERNYX ACCOUNT</p>
                <p className="mt-1 text-xs text-slate-400">One ecosystem. Endless possibilities.</p>
              </div>
            </div>
            <button type="button" aria-label="Close authentication" onClick={onClose} disabled={isLoading} className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40">✕</button>
          </div>
          <h2 id="eternyx-auth-title" className="text-2xl font-semibold tracking-tight">
            {mode === 'signin' ? 'Welcome back.' : mode === 'signup' ? 'Create your account.' : 'Reset your password.'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {mode === 'signin' ? 'Sign in to continue to your workspace.' : mode === 'signup' ? 'Create one account for your ETERNYX workspace.' : 'We will email you a secure password reset link.'}
          </p>
        </div>

        <div className="relative px-7 py-6">
          {mode !== 'reset' && (
            <Button type="button" variant="outline" onClick={handleGoogle} disabled={isLoading} className="mb-5 h-12 w-full border-white/15 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Chrome className="mr-2 h-4 w-4" />}
              Continue with Google
            </Button>
          )}

          {mode !== 'reset' && <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500"><span className="h-px flex-1 bg-white/10" />or use email<span className="h-px flex-1 bg-white/10" /></div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <label htmlFor="auth-username" className="text-sm font-medium text-slate-300">Username</label>
                <div className="relative"><User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="auth-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" disabled={isLoading} className="h-12 border-white/10 bg-white/[0.04] pl-10 text-white placeholder:text-slate-600 focus-visible:ring-cyan-400" /></div>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-medium text-slate-300">Email address</label>
              <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={isLoading} className="h-12 border-white/10 bg-white/[0.04] pl-10 text-white placeholder:text-slate-600 focus-visible:ring-cyan-400" /></div>
            </div>
            {mode !== 'reset' && (
              <div className="space-y-2">
                <label htmlFor="auth-password" className="text-sm font-medium text-slate-300">Password</label>
                <div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" disabled={isLoading} className="h-12 border-white/10 bg-white/[0.04] pl-10 pr-12 text-white placeholder:text-slate-600 focus-visible:ring-cyan-400" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400 hover:text-white">{showPassword ? <EyeOff className="mx-auto h-4 w-4" /> : <Eye className="mx-auto h-4 w-4" />}</button></div>
              </div>
            )}
            {mode === 'signup' && (
              <div className="space-y-2">
                <label htmlFor="auth-confirm-password" className="text-sm font-medium text-slate-300">Confirm password</label>
                <Input id="auth-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter your password again" disabled={isLoading} className="h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-slate-600 focus-visible:ring-cyan-400" />
              </div>
            )}

            {message && <div role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm leading-5 ${message.type === 'success' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/25 bg-rose-400/10 text-rose-200'}`}>{message.text}</div>}

            <Button type="submit" disabled={isLoading} className="h-12 w-full bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white shadow-lg shadow-cyan-950/40 transition hover:from-cyan-400 hover:to-blue-500">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              {isLoading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3 text-sm">
            {mode === 'signin' && <>
              <button type="button" onClick={() => switchMode('reset')} className="text-slate-400 transition hover:text-cyan-300">Forgot your password?</button>
              <p className="text-slate-500">New to ETERNYX? <button type="button" onClick={() => switchMode('signup')} className="font-semibold text-cyan-300 hover:text-cyan-200">Create an account</button></p>
            </>}
            {mode === 'signup' && <p className="text-slate-500">Already have an account? <button type="button" onClick={() => switchMode('signin')} className="font-semibold text-cyan-300 hover:text-cyan-200">Sign in</button></p>}
            {mode === 'reset' && <button type="button" onClick={() => switchMode('signin')} className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-4 w-4" />Back to sign in</button>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AuthModal;
