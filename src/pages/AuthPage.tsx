import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'signin' | 'signup' | 'reset' | 'sent';
type OAuthProvider = 'google' | 'github';

const friendly = (msg?: string) => {
  const message = (msg || '').toLowerCase();
  if (message.includes('invalid login')) return "That email and password don't match. Try again or reset your password.";
  if (message.includes('email not confirmed')) return 'Please confirm your email first. You can resend the link below.';
  if (message.includes('already registered')) return 'An account with this email already exists. Sign in instead.';
  if (message.includes('rate limit') || message.includes('security purposes')) return 'Too many attempts. Please wait a moment and try again.';
  if (message.includes('provider is not enabled')) return "This sign-in option isn't available right now. Use email instead.";
  return msg || 'Something went wrong. Please try again.';
};

const strength = (password: string) => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
};

const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

const googleMark = (
  <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09a6.1 6.1 0 0 1 0-4.18V7.07H2.18a10.98 10.98 0 0 0 0 9.86l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, resetPassword, isAuthenticated, isLoading } = useAuthStore();
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const redirect = params.get('redirect') || '/dashboard';
  const score = useMemo(() => strength(password), [password]);
  const loading = busy || isLoading;

  useEffect(() => {
    if (isAuthenticated && !isLoading) navigate(redirect, { replace: true });
  }, [isAuthenticated, isLoading, navigate, redirect]);

  const go = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setInfo(null);
    setPassword('');
    setShowPassword(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        const result = await resetPassword(cleanEmail);
        if (!result.success) {
          setError(friendly(result.error));
          return;
        }
        setInfo('reset');
        setMode('sent');
        return;
      }

      if (mode === 'signup') {
        if (username.trim().length < 3) {
          setError('Choose a username with at least 3 characters.');
          return;
        }
        if (score < 2) {
          setError('Choose a stronger password: at least 8 characters with a mix of letters and numbers.');
          return;
        }
        const result = await signUp(cleanEmail, password, username.trim());
        if (!result.success) {
          setError(friendly(result.error));
          return;
        }
        if (result.needsEmailConfirmation) {
          setInfo('confirm');
          setMode('sent');
        }
        return;
      }

      const result = await signIn(cleanEmail, password);
      if (!result.success) setError(friendly(result.error));
    } catch {
      setError('We could not complete that request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: OAuthProvider) => {
    if (loading) return;
    setError(null);
    setBusy(true);
    try {
      if (provider === 'google') {
        const result = await signInWithGoogle();
        if (!result.success) setError(friendly(result.error));
        return;
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}${redirect}` },
      });
      if (oauthError) setError(friendly(oauthError.message));
    } catch {
      setError('We could not start social sign-in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (loading) return;
    setBusy(true);
    setError(null);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (resendError) {
        setError(friendly(resendError.message));
      } else {
        setInfo(info === 'confirm' || info === 'confirm-resent' ? 'confirm-resent' : info);
      }
    } catch {
      setError('We could not resend the email. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = 'h-12 w-full rounded-xl border-border/80 bg-background/70 pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground/80 shadow-sm transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 sm:text-sm';

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--background)/0.12),hsl(var(--background)/0.82))]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="ETERNYX home" className="group inline-flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_24px_hsl(var(--primary)/0.12)] transition-transform duration-300 group-hover:scale-105">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold tracking-[0.2em] text-foreground">ETERNYX</span>
            <span className="hidden text-[10px] tracking-[0.16em] text-muted-foreground sm:block">ONE ECOSYSTEM. ENDLESS POSSIBILITIES.</span>
          </span>
        </Link>
        <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden xs:inline">Back to home</span>
          <span className="xs:hidden">Home</span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-8 px-4 pb-10 pt-3 sm:px-6 sm:pb-14 lg:min-h-[calc(100dvh-4.5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(400px,0.95fr)] lg:gap-14 lg:px-8 lg:py-12">
        <aside className="hidden flex-col justify-center gap-9 lg:flex">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Your ETERNYX identity
            </p>
            <h1 className="mt-6 text-5xl font-bold leading-[1.08] tracking-tight xl:text-6xl">
              One account.
              <span className="mt-2 block bg-gradient-to-r from-primary via-cyan-300 to-accent bg-clip-text text-transparent">A universe of possibilities.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Sign in once and make your way through the ETERNYX ecosystem with one connected identity.
            </p>
          </div>
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            {[
              'Explore your digital workspaces',
              'Access tools across the ecosystem',
              'Manage your profile and preferences',
              'Keep your ETERNYX journey connected',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm leading-6 text-foreground/85">{item}</span>
              </div>
            ))}
          </div>
          <p className="text-xs tracking-wide text-muted-foreground/70">ONE IDENTITY · SIX CONNECTED WORLDS</p>
        </aside>

        <section className="mx-auto w-full max-w-lg">
          <div className="mb-5 text-center lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Your ETERNYX identity</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {mode === 'signup' ? 'Join the universe.' : mode === 'reset' ? 'Secure your account.' : 'Welcome back.'}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              One account to explore the ETERNYX ecosystem.
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/85 shadow-[0_24px_90px_hsl(var(--background)/0.55)] backdrop-blur-2xl sm:rounded-3xl">
            <div className="border-b border-border/70 px-5 py-5 sm:px-8 sm:py-6">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              {mode === 'sent' ? (
                <>
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Check your inbox</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">One quick step and you're on your way.</p>
                </>
              ) : (
                <>
                  {mode !== 'reset' && (
                    <div className="mb-6 grid grid-cols-2 rounded-xl border border-border/70 bg-muted/70 p-1" role="group" aria-label="Authentication mode">
                      {(['signin', 'signup'] as const).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => go(item)}
                          disabled={loading}
                          aria-pressed={mode === item}
                          className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${mode === item ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {item === 'signin' ? 'Sign in' : 'Create account'}
                        </button>
                      ))}
                    </div>
                  )}
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {mode === 'signin' ? 'Sign in to continue to your workspace.' : mode === 'signup' ? 'Your ETERNYX journey starts here.' : "Enter your email and we'll send a secure reset link."}
                  </p>
                </>
              )}
            </div>

            <div className="px-5 py-5 sm:px-8 sm:py-7">
              {mode === 'sent' ? (
                <div className="space-y-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MailCheck className="h-7 w-7" />
                  </div>
                  <p className="break-words text-sm leading-7 text-muted-foreground">
                    {info === 'reset' ? 'If an account exists for ' : 'We sent a confirmation link to '}
                    <span className="font-semibold text-foreground">{email}</span>
                    {info === 'reset' ? ', a password reset link is on its way.' : ". Open it to confirm your email address and continue."}
                  </p>
                  {info === 'confirm-resent' && <p role="status" className="text-sm font-medium text-primary">A new confirmation link has been sent.</p>}
                  {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
                  {info !== 'reset' && (
                    <Button variant="outline" className="h-12 w-full rounded-xl" onClick={resend} disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Resend confirmation email
                    </Button>
                  )}
                  <button type="button" onClick={() => go('signin')} disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  {mode !== 'reset' && (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Button type="button" variant="outline" className="h-12 w-full rounded-xl border-border/80 bg-background/50 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-primary/5" onClick={() => oauth('google')} disabled={loading}>
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="mr-2">{googleMark}</span>}
                          Continue with Google
                        </Button>
                        <Button type="button" variant="outline" className="h-12 w-full rounded-xl border-border/80 bg-background/50 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-primary/5" onClick={() => oauth('github')} disabled={loading}>
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Github className="mr-2 h-4 w-4" />}
                          Continue with GitHub
                        </Button>
                      </div>
                      <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />or continue with email<span className="h-px flex-1 bg-border" />
                      </div>
                    </>
                  )}

                  <form onSubmit={submit} className="space-y-4" noValidate>
                    {mode === 'signup' && (
                      <div className="space-y-2">
                        <label htmlFor="auth-username" className="text-sm font-medium text-foreground/90">Username</label>
                        <div className="relative">
                          <User aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="auth-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Choose a username" className={fieldClass} disabled={loading} aria-invalid={Boolean(error && error.includes('username'))} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="auth-email" className="text-sm font-medium text-foreground/90">Email address</label>
                      <div className="relative">
                        <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="auth-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={fieldClass} disabled={loading} aria-invalid={Boolean(error && error.includes('email'))} />
                      </div>
                    </div>

                    {mode !== 'reset' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label htmlFor="auth-password" className="text-sm font-medium text-foreground/90">Password</label>
                          {mode === 'signin' && (
                            <button type="button" onClick={() => go('reset')} disabled={loading} className="min-h-8 rounded-md text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className={`${fieldClass} pr-12`} disabled={loading} />
                          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={loading} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {mode === 'signup' && password && (
                          <div className="space-y-2 pt-1" aria-live="polite">
                            <div className="flex gap-1.5" aria-hidden="true">
                              {[0, 1, 2, 3].map((item) => (
                                <span key={item} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${item < score ? (score <= 1 ? 'bg-destructive' : score === 2 ? 'bg-accent' : 'bg-primary') : 'bg-muted'}`} />
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Password strength: <span className="font-semibold text-foreground">{strengthLabel[score]}</span></p>
                          </div>
                        )}
                      </div>
                    )}

                    {error && <div role="alert" aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{error}</div>}

                    <Button type="submit" disabled={loading} className="group mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-primary/20 disabled:translate-y-0 disabled:opacity-60">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === 'signup' ? <Sparkles className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
                      {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in to ETERNYX' : mode === 'signup' ? 'Create your account' : 'Send reset link'}
                    </Button>
                  </form>

                  {mode === 'reset' && (
                    <button type="button" onClick={() => go('signin')} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <ArrowLeft className="h-4 w-4" />Back to sign in
                    </button>
                  )}
                  {mode === 'signup' && <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">By creating an account, you agree to use ETERNYX tools only on systems you own or are authorised to test.</p>}
                </>
              )}
            </div>
          </section>
          <p className="mt-5 px-2 text-center text-xs leading-5 text-muted-foreground/70">Your account. Your workspace. Your ETERNYX journey.</p>
        </section>
      </main>
    </div>
  );
}
