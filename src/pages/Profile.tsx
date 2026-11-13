import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type UserProfile } from '@/store/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import ProfileAvatarUploader from '@/components/ProfileAvatarUploader';
import AccountControls from '@/components/account/AccountControls';
import { toast } from '@/hooks/use-toast';
import {
  ArrowRight, AtSign, BadgeCheck, BriefcaseBusiness, Check, ChevronRight,
  Globe2, KeyRound, Loader2, LockKeyhole, Mail, MapPin,
  Save, ShieldCheck, Sparkles, UserRound, UserRoundCog
} from 'lucide-react';

type EditableProfile = Partial<Pick<UserProfile,
  'username' | 'full_name' | 'bio' | 'location' | 'job_title' |
  'company' | 'website' | 'github_url' | 'twitter_url' | 'linkedin_url'
>>;

const fieldClass = 'h-11 rounded-xl border-white/[0.10] bg-[#070e19]/85 px-3.5 text-sm text-slate-100 placeholder:text-slate-600 shadow-inner shadow-black/20 transition focus-visible:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-200/10';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400';

const Profile = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user, profile, updateProfile } = useAuthStore();
  const [local, setLocal] = useState<EditableProfile>({});
  const [saving, setSaving] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);

  useEffect(() => {
    document.title = 'Your Identity | ETERNYX';
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/', { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!profile) return;
    setLocal({
      username: profile.username || '',
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      location: profile.location || '',
      job_title: profile.job_title || '',
      company: profile.company || '',
      website: profile.website || '',
      github_url: profile.github_url || '',
      twitter_url: profile.twitter_url || '',
      linkedin_url: profile.linkedin_url || '',
    });
  }, [profile?.user_id]);

  const displayName = profile?.full_name || profile?.username || user?.email?.split('@')[0] || 'ETERNYX member';
  const initials = useMemo(() => displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EX', [displayName]);

  const updateField = (field: keyof EditableProfile, value: string) => {
    setLocal((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const result = await updateProfile(local);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Profile could not be saved', description: result.error || 'Please try again.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Your identity is up to date', description: 'Your profile changes have been saved.' });
  };

  const handlePrivacyUpdate = async (field: 'is_profile_public' | 'show_email' | 'show_phone', value: boolean) => {
    setPrivacySaving(true);
    const result = await updateProfile({ [field]: value });
    setPrivacySaving(false);
    if (!result.success) {
      toast({ title: 'Privacy setting not saved', description: result.error || 'Please try again.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Privacy preference updated', description: 'Your account preference has been saved.' });
  };

  if (authLoading || !isAuthenticated || !user) {
    return (
      <main className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0a1020]/80 px-5 py-4 text-sm text-slate-400 shadow-2xl">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
          Restoring your ETERNYX identity…
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-80 rounded-full bg-cyan-400/[0.055] blur-[100px]" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.23em] text-cyan-200/70">
          <UserRoundCog className="h-4 w-4" />
          Account environment
          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          <span className="text-slate-400">Identity</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          <LockKeyhole className="h-3.5 w-3.5 text-emerald-300/80" />
          Private account space
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-cyan-200/15 bg-[#080f1e] shadow-[0_28px_100px_rgba(0,0,0,.38)]">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_82%_8%,rgba(34,211,238,.14),transparent_34%),linear-gradient(115deg,rgba(7,15,30,.98),rgba(9,18,34,.94)_58%,rgba(13,20,43,.92))]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(148,163,184,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.12)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Your digital identity
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Make your mark in <span className="bg-gradient-to-r from-cyan-200 via-sky-200 to-violet-300 bg-clip-text text-transparent">ETERNYX.</span></h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">Shape how your identity appears across your personal digital environment. Your details, your presence, your control.</p>
          </div>
          <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl sm:min-w-[300px] sm:p-5">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-full bg-cyan-300/15 blur-md" />
              <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-cyan-200/30 bg-cyan-200/10 text-lg font-semibold text-cyan-100">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}</div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{user.email}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-200/80"><BadgeCheck className="h-3.5 w-3.5" /> {profile?.access_level || 'Basic'} member</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <Tabs defaultValue="identity" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border border-white/[0.09] bg-[#09111f]/90 p-1.5 shadow-xl sm:max-w-[520px]">
            <TabsTrigger value="identity" className="min-h-11 gap-2 rounded-xl px-2 text-[10px] font-bold tracking-[0.12em] text-slate-400 transition data-[state=active]:bg-cyan-200/[0.10] data-[state=active]:text-cyan-100 data-[state=active]:shadow-[inset_0_0_0_1px_rgba(103,232,249,.15)] sm:text-xs"><UserRound className="h-4 w-4" /> Identity</TabsTrigger>
            <TabsTrigger value="privacy" className="min-h-11 gap-2 rounded-xl px-2 text-[10px] font-bold tracking-[0.12em] text-slate-400 transition data-[state=active]:bg-cyan-200/[0.10] data-[state=active]:text-cyan-100 data-[state=active]:shadow-[inset_0_0_0_1px_rgba(103,232,249,.15)] sm:text-xs"><ShieldCheck className="h-4 w-4" /> Privacy</TabsTrigger>
            <TabsTrigger value="security" className="min-h-11 gap-2 rounded-xl px-2 text-[10px] font-bold tracking-[0.12em] text-slate-400 transition data-[state=active]:bg-cyan-200/[0.10] data-[state=active]:text-cyan-100 data-[state=active]:shadow-[inset_0_0_0_1px_rgba(103,232,249,.15)] sm:text-xs"><KeyRound className="h-4 w-4" /> Account & data</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-5 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
              <Card className="overflow-hidden rounded-2xl border-white/[0.09] bg-[#0a1322]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,.22)] sm:p-6">
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Profile image</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">Your presence</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">A recognizable image makes your account feel like yours.</p>
                </div>
                <ProfileAvatarUploader currentAvatarUrl={profile?.avatar_url} username={profile?.username || displayName} />
                <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><LockKeyhole className="h-3.5 w-3.5 text-emerald-200/80" /> Your image belongs to your account</p>
                  <p className="mt-1.5 text-[10px] leading-5 text-slate-500">Use an image you are comfortable associating with your ETERNYX identity.</p>
                </div>
              </Card>

              <Card className="rounded-2xl border-white/[0.09] bg-[#0a1322]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,.22)] sm:p-7">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Personal information</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Identity details</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Keep your information current and meaningful.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/15 bg-emerald-200/[0.05] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-emerald-200"><Check className="h-3 w-3" /> Account linked</span>
                </div>

                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="username" className={labelClass}>Username</Label><div className="relative"><AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="username" autoComplete="nickname" value={local.username || ''} onChange={(e) => updateField('username', e.target.value)} placeholder="Your unique handle" className={fieldClass + ' pl-9'} /></div></div>
                  <div className="space-y-2"><Label htmlFor="full_name" className={labelClass}>Full name</Label><div className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="full_name" autoComplete="name" value={local.full_name || ''} onChange={(e) => updateField('full_name', e.target.value)} placeholder="How should we address you?" className={fieldClass + ' pl-9'} /></div></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="email" className={labelClass}>Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="email" value={user.email || ''} readOnly aria-readonly="true" className={fieldClass + ' cursor-not-allowed pl-9 text-slate-400'} /></div><p className="text-[10px] text-slate-600">Your sign-in email is managed by your authentication provider.</p></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="bio" className={labelClass}>About you</Label><Textarea id="bio" value={local.bio || ''} onChange={(e) => updateField('bio', e.target.value)} rows={4} maxLength={500} placeholder="A short introduction, what you build, or what you're interested in…" className="min-h-[112px] resize-y rounded-xl border-white/[0.10] bg-[#070e19]/85 px-3.5 py-3 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus-visible:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-200/10" /><p className="text-right text-[10px] text-slate-600">{(local.bio || '').length}/500</p></div>
                  <div className="space-y-2"><Label htmlFor="location" className={labelClass}>Location</Label><div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="location" autoComplete="address-level2" value={local.location || ''} onChange={(e) => updateField('location', e.target.value)} placeholder="City or region" className={fieldClass + ' pl-9'} /></div></div>
                  <div className="space-y-2"><Label htmlFor="job_title" className={labelClass}>Role / profession</Label><div className="relative"><BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="job_title" autoComplete="organization-title" value={local.job_title || ''} onChange={(e) => updateField('job_title', e.target.value)} placeholder="Your professional role" className={fieldClass + ' pl-9'} /></div></div>
                  <div className="space-y-2"><Label htmlFor="company" className={labelClass}>Organization</Label><Input id="company" autoComplete="organization" value={local.company || ''} onChange={(e) => updateField('company', e.target.value)} placeholder="Company or organization" className={fieldClass} /></div>
                  <div className="space-y-2"><Label htmlFor="website" className={labelClass}>Website</Label><div className="relative"><Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="website" type="url" value={local.website || ''} onChange={(e) => updateField('website', e.target.value)} placeholder="https://" className={fieldClass + ' pl-9'} /></div></div>
                </div>

                <div className="my-7 border-t border-white/[0.08]" />
                <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Connected presence</p><h3 className="mt-1 text-base font-semibold text-white">Around the web</h3><p className="mt-1 text-xs text-slate-500">Optional links to your public work and profiles.</p></div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="github_url" className={labelClass}>GitHub</Label><Input id="github_url" type="url" value={local.github_url || ''} onChange={(e) => updateField('github_url', e.target.value)} placeholder="https://github.com/…" className={fieldClass} /></div>
                  <div className="space-y-2"><Label htmlFor="linkedin_url" className={labelClass}>LinkedIn</Label><Input id="linkedin_url" type="url" value={local.linkedin_url || ''} onChange={(e) => updateField('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" className={fieldClass} /></div>
                  <div className="space-y-2"><Label htmlFor="twitter_url" className={labelClass}>X / Twitter</Label><Input id="twitter_url" type="url" value={local.twitter_url || ''} onChange={(e) => updateField('twitter_url', e.target.value)} placeholder="https://x.com/…" className={fieldClass} /></div>
                </div>

                <div className="mt-7 flex flex-col-reverse gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] text-slate-500">Changes are saved to your signed-in profile.</p>
                  <Button onClick={handleSave} disabled={saving} className="h-11 rounded-xl bg-cyan-200 px-5 font-semibold text-slate-950 shadow-[0_8px_30px_rgba(103,232,249,.12)] hover:bg-cyan-100">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? 'Saving identity…' : 'Save profile changes'}
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="mt-5 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <Card className="rounded-2xl border-white/[0.09] bg-[#0a1322]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,.22)] sm:p-7">
              <div className="mb-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Visibility & consent</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Your privacy, your call.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Choose which parts of your profile may be visible. These controls update your existing account privacy fields.</p>
              </div>
              <div className="divide-y divide-white/[0.07]">
                <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3"><div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] p-2.5 text-cyan-100"><Globe2 className="h-4 w-4" /></div><div><Label htmlFor="public-profile" className="text-sm font-semibold text-slate-100">Public profile</Label><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Allow other people to view the profile information your public profile exposes.</p></div></div>
                  <Switch id="public-profile" checked={!!profile?.is_profile_public} disabled={privacySaving} onCheckedChange={(checked) => handlePrivacyUpdate('is_profile_public', checked)} />
                </div>
                <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3"><div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] p-2.5 text-cyan-100"><Mail className="h-4 w-4" /></div><div><Label htmlFor="show-email" className="text-sm font-semibold text-slate-100">Show email on public profile</Label><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Permit your email address to appear where public profile details are displayed.</p></div></div>
                  <Switch id="show-email" checked={!!profile?.show_email} disabled={privacySaving} onCheckedChange={(checked) => handlePrivacyUpdate('show_email', checked)} />
                </div>
                <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3"><div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] p-2.5 text-cyan-100"><AtSign className="h-4 w-4" /></div><div><Label htmlFor="show-phone" className="text-sm font-semibold text-slate-100">Show phone on public profile</Label><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Permit a phone number to appear where public profile details are displayed. No phone number is collected here.</p></div></div>
                  <Switch id="show-phone" checked={!!profile?.show_phone} disabled={privacySaving} onCheckedChange={(checked) => handlePrivacyUpdate('show_phone', checked)} />
                </div>
              </div>
              <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-3 text-xs leading-5 text-amber-100/70"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Visibility switches control profile preferences; they do not change database access policies or override private account protections.</div>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-5 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <AccountControls />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default Profile;
