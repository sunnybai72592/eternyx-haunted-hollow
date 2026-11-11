import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { applyAccountTheme, normalizeAccountTheme, type AccountTheme } from '@/lib/accountTheme';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Bell, Check, ChevronRight, CircleHelp, Loader2,
  LockKeyhole, MonitorCog, Palette, ShieldCheck, Sparkles, UserRound
} from 'lucide-react';
import { toast } from 'sonner';

const themes: {
  id: AccountTheme;
  name: string;
  description: string;
  detail: string;
  swatches: string[];
}[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'The signature ETERNYX atmosphere.',
    detail: 'Electric cyan, deep midnight and vivid accents.',
    swatches: ['#07111f', '#22d3ee', '#a78bfa'],
  },
  {
    id: 'dark',
    name: 'Midnight',
    description: 'A quieter, neutral dark workspace.',
    detail: 'Low-distraction contrast for focused sessions.',
    swatches: ['#0b1220', '#94a3b8', '#475569'],
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'A deep green terminal-inspired look.',
    detail: 'Emerald highlights over a dark green foundation.',
    swatches: ['#06130d', '#4ade80', '#166534'],
  },
];

const Settings = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, profile, updateProfile } = useAuthStore();
  const [savingTheme, setSavingTheme] = useState<AccountTheme | null>(null);
  const selectedTheme = normalizeAccountTheme(profile?.preferences?.theme);

  useEffect(() => {
    document.title = 'Account Preferences | ETERNYX';
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/auth', { replace: true });
  }, [isAuthenticated, isLoading, navigate]);

  const handleThemeChange = async (theme: AccountTheme) => {
    if (theme === selectedTheme || savingTheme) return;

    const previousTheme = selectedTheme;
    const currentPreferences = profile?.preferences || {};
    setSavingTheme(theme);
    applyAccountTheme(theme);

    const result = await updateProfile({
      preferences: { ...currentPreferences, theme },
    });

    setSavingTheme(null);
    if (!result.success) {
      applyAccountTheme(previousTheme);
      toast.error('Appearance could not be saved', {
        description: result.error || 'Your previous theme has been restored. Please try again.',
      });
      return;
    }

    toast.success('Appearance updated', {
      description: `${themes.find((item) => item.id === theme)?.name} is now your ETERNYX theme.`,
    });
  };

  if (isLoading || !isAuthenticated || !profile) {
    return (
      <main className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0a1020]/80 px-5 py-4 text-sm text-slate-400 shadow-2xl">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
          Loading your account preferences…
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-80 rounded-full bg-cyan-400/[0.055] blur-[100px]" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.23em] text-cyan-200/70">
          <MonitorCog className="h-4 w-4" />
          Account environment
          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          <span className="text-slate-400">Preferences</span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/[0.05] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          Synced to your account
        </span>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-cyan-200/15 bg-[#080f1e] shadow-[0_28px_100px_rgba(0,0,0,.38)]">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_5%,rgba(34,211,238,.14),transparent_35%),linear-gradient(115deg,rgba(7,15,30,.98),rgba(9,18,34,.94)_58%,rgba(13,20,43,.92))]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(148,163,184,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.12)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Make it yours
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your environment. <span className="bg-gradient-to-r from-cyan-200 via-sky-200 to-violet-300 bg-clip-text text-transparent">Your rules.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
              Choose the visual atmosphere that helps you feel at home in ETERNYX. Your selection is saved to your account and follows you across pages and future sessions.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] text-cyan-100">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Current appearance</p>
              <p className="mt-1 text-sm font-semibold text-white">{themes.find((item) => item.id === selectedTheme)?.name}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-9">
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/65">Personalization</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">Choose your theme</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Your choice is applied immediately. We only confirm it after the account save succeeds.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {themes.map((theme) => {
            const active = selectedTheme === theme.id;
            const saving = savingTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                disabled={savingTheme !== null}
                onClick={() => void handleThemeChange(theme.id)}
                aria-pressed={active}
                className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07101d] disabled:cursor-wait disabled:opacity-75 ${active ? 'border-cyan-200/40 bg-cyan-200/[0.07] shadow-[0_16px_45px_rgba(34,211,238,.08)]' : 'border-white/[0.09] bg-[#0a1322]/90 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#0d192b]'}`}
              >
                <div className="mb-5 overflow-hidden rounded-xl border border-white/10 p-3" style={{ background: theme.swatches[0] }}>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {theme.swatches.slice(1).map((swatch) => <span key={swatch} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: swatch }} />)}
                    </div>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.swatches[1] }}>ETERNYX</span>
                  </div>
                  <div className="mt-7 space-y-2">
                    <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: theme.swatches[1], opacity: 0.9 }} />
                    <div className="h-2 w-1/2 rounded-full bg-white/15" />
                    <div className="mt-4 flex gap-2">
                      <div className="h-8 flex-1 rounded-lg border border-white/10 bg-white/[0.06]" />
                      <div className="h-8 w-1/3 rounded-lg" style={{ backgroundColor: theme.swatches[2], opacity: 0.7 }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{theme.name}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-400">{theme.description}</p>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">{theme.detail}</p>
                  </div>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${active ? 'border-cyan-200 bg-cyan-200 text-slate-950' : 'border-white/20 text-transparent'}`}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4">
                  <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${active ? 'text-cyan-100' : 'text-slate-500'}`}>
                    {saving ? 'Saving…' : active ? 'Currently active' : 'Select theme'}
                  </span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,.8)]" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-9 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.09] bg-[#0a1322]/85 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-violet-200/15 bg-violet-200/[0.07] p-2.5 text-violet-200"><ShieldCheck className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white">Privacy & identity</h3>
              <p className="mt-1.5 text-xs leading-6 text-slate-400">Manage your profile visibility and identity details together in one place. We keep these controls on your Profile page rather than duplicating settings here.</p>
              <Button asChild variant="outline" className="mt-4 h-10 rounded-xl border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white">
                <Link to="/profile">Open profile controls <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.09] bg-[#0a1322]/85 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] p-2.5 text-cyan-200"><Bell className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white">Your notifications</h3>
              <p className="mt-1.5 text-xs leading-6 text-slate-400">Review account updates, report status changes and other notifications delivered to your ETERNYX inbox.</p>
              <Button asChild variant="outline" className="mt-4 h-10 rounded-xl border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white">
                <Link to="/notifications">Open notification inbox <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-emerald-200/15 bg-emerald-200/[0.06] p-2 text-emerald-200"><LockKeyhole className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-medium text-slate-200">No pretend controls</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Only settings with a real, verified effect belong here. More account controls will appear when their behavior is ready.</p>
          </div>
        </div>
        <Button variant="ghost" asChild className="justify-start text-slate-300 hover:text-white sm:justify-center">
          <Link to="/help">Need help? <CircleHelp className="ml-2 h-4 w-4" /></Link>
        </Button>
      </section>
    </main>
  );
};

export default Settings;
