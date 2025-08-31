import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TerminalWindow } from '@/components/TerminalWindow';
import { Settings as SettingsIcon, Shield, Bell, Palette, Monitor } from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();
  const { isAuthenticated, profile, updateProfile } = useAuthStore();

  useEffect(() => {
    document.title = 'Account Settings | ETERNYX';
  }, []);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const prefs = profile?.preferences || { theme: 'cyberpunk', notifications: true, analytics: true, sound_effects: true };

  const handleToggle = async (key: keyof NonNullable<typeof prefs>, value: boolean | string) => {
    const next = { ...(prefs as any), [key]: value };
    await updateProfile({ preferences: next as any });
  };

  return (
    <main className="min-h-screen bg-background">
      <head>
        <title>Account Settings | ETERNYX</title>
        <meta name="description" content="Manage account preferences and privacy settings for ETERNYX." />
        <link rel="canonical" href={`${window.location.origin}/settings`} />
      </head>

      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 flex items-center gap-3">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Account Settings</h1>
        </div>
      </header>

      <section className="container mx-auto px-4 py-8">
        <Tabs defaultValue="preferences" className="space-y-6">
          <TabsList>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
          </TabsList>

          <TabsContent value="preferences" className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Notifications</h2>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif">Enable notifications</Label>
                <Switch id="notif" checked={!!prefs.notifications} onCheckedChange={(v) => handleToggle('notifications', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sound">Sound effects</Label>
                <Switch id="sound" checked={!!prefs.sound_effects} onCheckedChange={(v) => handleToggle('sound_effects', v)} />
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Analytics</h2>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="analytics">Usage analytics</Label>
                <Switch id="analytics" checked={!!prefs.analytics} onCheckedChange={(v) => handleToggle('analytics', v)} />
              </div>
            </Card>

            <Card className="p-6 space-y-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Theme</h2>
              </div>
              <div className="flex items-center gap-3">
                {(['cyberpunk','dark','matrix'] as const).map((t) => (
                  <Button key={t} variant={prefs.theme === t ? 'default' : 'outline'} size="sm" onClick={() => handleToggle('theme', t)}>
                    {t}
                  </Button>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="privacy">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Privacy Controls</h2>
              </div>
              <p className="text-sm text-muted-foreground">Manage how your account data is processed and displayed.</p>
              <TerminalWindow title="privacy.log">
                <div className="text-xs text-muted-foreground">All changes are applied instantly and logged for audit purposes.</div>
              </TerminalWindow>
            </Card>
          </TabsContent>

          <TabsContent value="display">
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Display preferences will be available soon.</p>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default Settings;
