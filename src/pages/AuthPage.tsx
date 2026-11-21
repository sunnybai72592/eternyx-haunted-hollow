import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { AuthAtmosphere } from '@/components/auth/AuthAtmosphere';
import '@/styles/lamp-auth.css';

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
  const loading = busy; // never lock the form while the session check runs

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

  const resend = async (): Promise<boolean> => {
    if (loading) return false;
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
        return false;
      }
      setInfo(info === 'confirm' || info === 'confirm-resent' ? 'confirm-resent' : info);
      return true;
    } catch {
      setError('We could not resend the email. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = 'h-12 w-full rounded-xl border-border/80 bg-background/70 pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground/80 shadow-sm transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 sm:text-sm';

  return (
    <AuthAtmosphere>
          <div className="auth-form-shell">
            <div className="auth-form-heading">
              {mode === 'sent' ? (
                <>
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Check your inbox</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">One quick step and you're on your way.</p>
                </>
              ) : (
                <>
                  {mode !== 'reset' && (
                    <div className="auth-mode-tabs" role="group" aria-label="Authentication mode">
                      {(['signin', 'signup'] as const).map((item) => (
                        <Button variant="ghost"
                          key={item}
                          type="button"
                          onClick={() => go(item)}
                          disabled={loading}
                          aria-pressed={mode === item}
                          className="auth-mode-tab"
                        >
                          {item === 'signin' ? 'Sign in' : 'Create account'}
                        </Button>
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

            <div className="auth-form-body">
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
                  <Button variant="ghost" type="button" onClick={() => go('signin')} disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </Button>
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
                            <Button variant="ghost" type="button" onClick={() => go('reset')} disabled={loading} className="min-h-8 rounded-md text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                              Forgot password?
                            </Button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className={`${fieldClass} pr-12`} disabled={loading} />
                          <Button variant="ghost" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={loading} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
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

                    {error && <div role="alert" aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{error}{error.includes('confirm your email') && <Button variant="ghost" type="button" disabled={loading} onClick={async () => { const sent = await resend(); if (sent) { setInfo('confirm-resent'); setMode('sent'); } }} className="ml-1 font-semibold underline underline-offset-2 disabled:opacity-50">Resend confirmation link</Button>}</div>}

                    <Button type="submit" disabled={loading} className="auth-primary-submit group mt-2 h-12 w-full text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === 'signup' ? <Sparkles className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
                      {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in to ETERNYX' : mode === 'signup' ? 'Create your account' : 'Send reset link'}
                    </Button>
                  </form>

                  {mode === 'reset' && (
                    <Button variant="ghost" type="button" onClick={() => go('signin')} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <ArrowLeft className="h-4 w-4" />Back to sign in
                    </Button>
                  )}
                  {mode === 'signup' && <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">By creating an account, you agree to use ETERNYX tools only on systems you own or are authorised to test.</p>}
                </>
              )}
            </div>
          </div>
    </AuthAtmosphere>
  );
}
