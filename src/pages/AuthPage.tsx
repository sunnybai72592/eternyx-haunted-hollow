import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeOff, Github, Loader2, Lock, Mail, MailCheck, ShieldCheck, Sparkles, User, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'signin' | 'signup' | 'reset' | 'sent';

const friendly = (msg?: string) => {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return 'That email and password don\'t match. Try again or reset your password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. We can resend the link below.';
  if (m.includes('already registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('provider is not enabled')) return 'This sign-in option isn\'t switched on yet. Use email for now.';
  return msg || 'Something went wrong. Please try again.';
};

const strength = (p: string) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
};
const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, resetPassword, isAuthenticated, isLoading } = useAuthStore();
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const redirect = params.get('redirect') || '/dashboard';
  const score = useMemo(() => strength(password), [password]);

  useEffect(() => { if (isAuthenticated && !isLoading) navigate(redirect, { replace: true }); }, [isAuthenticated, isLoading, navigate, redirect]);

  const go = (m: Mode) => { setMode(m); setError(null); setInfo(null); setPassword(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError('Enter a valid email address.');
    setBusy(true);
    try {
      if (mode === 'reset') {
        const r = await resetPassword(clean);
        if (!r.success) return setError(friendly(r.error));
        setInfo('reset'); setMode('sent'); return;
      }
      if (mode === 'signup') {
        if (username.trim().length < 3) return setError('Choose a username with at least 3 characters.');
        if (score < 2) return setError('Pick a stronger password: 8+ characters with letters and numbers.');
        const r = await signUp(clean, password, username.trim());
        if (!r.success) return setError(friendly(r.error));
        if (r.needsEmailConfirmation) { setInfo('confirm'); setMode('sent'); }
        return;
      }
      const r = await signIn(clean, password);
      if (!r.success) setError(friendly(r.error));
    } finally { setBusy(false); }
  };

  const oauth = async (provider: 'google' | 'github') => {
    setError(null);
    if (provider === 'google') {
      const r = await signInWithGoogle();
      if (!r.success) setError(friendly(r.error));
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}${redirect}` } });
    if (error) setError(friendly(error.message));
  };

  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    setError(error ? friendly(error.message) : null);
    if (!error) setInfo(info === 'confirm' ? 'confirm-resent' : info);
  };

  const loading = busy;
  const field = 'h-12 rounded-xl border-border bg-background/60 pl-11 text-foreground placeholder:text-muted-foreground transition focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.15),transparent_50%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2 lg:px-8">
        {/* Story side */}
        <aside className="hidden flex-col gap-8 lg:flex animate-fade-in">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">ETERNYX Account</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight tracking-tight">One account.<br /><span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Your whole digital kingdom.</span></h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">Run security scans, chat with Eternyx AI about your documents, take courses and track everything from one dashboard.</p>
          </div>
          <ul className="space-y-4">
            {['Security & developer tools that return real results', 'Eternyx AI that reads your own documents', 'Profile, privacy and history synced to your account'].map((t) => (
              <li key={t} className="flex items-start gap-3 text-foreground/90"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Check className="h-3.5 w-3.5" /></span>{t}</li>
            ))}
          </ul>
        </aside>

        {/* Form side */}
        <main className="mx-auto w-full max-w-md animate-scale-in">
          <section className="rounded-3xl border border-border bg-card/80 p-7 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>

            {mode === 'sent' ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary"><MailCheck className="h-8 w-8" /></div>
                <h2 className="text-2xl font-semibold">Check your inbox</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {info === 'reset' ? 'If an account exists for ' : 'We sent a confirmation link to '}
                  <span className="font-medium text-foreground">{email}</span>
                  {info === 'reset' ? ', a password reset link is on its way.' : '. Click it to activate your account — you\'ll be signed in automatically.'}
                </p>
                {info === 'confirm-resent' && <p className="text-sm text-primary">Link sent again.</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                {info !== 'reset' && <Button variant="outline" className="w-full" onClick={resend} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Resend email</Button>}
                <button onClick={() => go('signin')} className="text-sm font-medium text-primary hover:underline">Back to sign in</button>
              </div>
            ) : (
              <>
                {mode !== 'reset' && (
                  <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-medium">
                    {(['signin', 'signup'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => go(m)} className={`rounded-lg py-2.5 transition-all duration-300 ${mode === m ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>{m === 'signin' ? 'Sign in' : 'Create account'}</button>
                    ))}
                  </div>
                )}
                <h2 className="text-2xl font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{mode === 'signin' ? 'Sign in to continue to your dashboard.' : mode === 'signup' ? 'Free forever. Takes under a minute.' : 'Enter your email and we\'ll send a secure reset link.'}</p>

                {mode !== 'reset' && (
                  <>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => oauth('google')}>
                        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"/></svg>Google
                      </Button>
                      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => oauth('github')}><Github className="mr-2 h-4 w-4" />GitHub</Button>
                    </div>
                    <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
                  </>
                )}

                <form onSubmit={submit} className={`space-y-4 ${mode === 'reset' ? 'mt-6' : ''}`} noValidate>
                  {mode === 'signup' && (
                    <div className="relative animate-fade-in"><User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input aria-label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={field} /></div>
                  )}
                  <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input aria-label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={field} /></div>
                  {mode !== 'reset' && (
                    <div>
                      <div className="relative"><Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input aria-label="Password" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={`${field} pr-12`} />
                        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                      {mode === 'signup' && password && (
                        <div className="mt-2.5 animate-fade-in">
                          <div className="flex gap-1.5">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < score ? (score <= 1 ? 'bg-destructive' : score === 2 ? 'bg-accent' : 'bg-primary') : 'bg-muted'}`} />)}</div>
                          <p className="mt-1.5 text-xs text-muted-foreground">Password strength: <span className="font-medium text-foreground">{strengthLabel[score]}</span></p>
                        </div>
                      )}
                      {mode === 'signin' && <div className="mt-2 text-right"><button type="button" onClick={() => go('reset')} className="text-xs font-medium text-muted-foreground hover:text-primary">Forgot password?</button></div>}
                    </div>
                  )}

                  {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-fade-in">{error}
                    {error.includes('confirm your email') && <button type="button" onClick={async () => { await resend(); setInfo('confirm-resent'); setMode('sent'); }} className="ml-1 font-semibold underline">Resend link</button>}
                  </div>}

                  <Button type="submit" disabled={loading} className="group h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent text-base font-semibold text-primary-foreground shadow-lg transition-all duration-300 hover:shadow-primary/30 hover:brightness-110">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === 'signup' ? <Sparkles className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
                    {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
                  </Button>
                </form>
                {mode === 'reset' && <button onClick={() => go('signin')} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Back to sign in</button>}
                {mode === 'signup' && <p className="mt-5 text-center text-xs text-muted-foreground">By creating an account you agree to use ETERNYX tools only on systems you own or are authorised to test.</p>}
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
