import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type UserProfile } from '@/store/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { User as UserIcon, Save, Shield, Settings, Loader2, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import ProfileAvatarUploader from '@/components/ProfileAvatarUploader';

const Profile = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user, profile, updateProfile, signOut } = useAuthStore();
  const [local, setLocal] = useState<Partial<UserProfile>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Agent Profile | ETERNYX';
  }, []);

  useEffect(() => {
    // Wait for Supabase to restore the session before deciding the visitor is signed out.
    // ETERNYX uses an auth modal on the home page; there is no standalone /login route.
    if (!authLoading && !isAuthenticated) navigate('/', { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (profile) {
      setLocal(profile);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!local || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: local.username,
          full_name: local.full_name,
          bio: local.bio,
          phone: local.phone,
          location: local.location,
          website: local.website,
          company: local.company,
          job_title: local.job_title,
          github_url: local.github_url,
          twitter_url: local.twitter_url,
          linkedin_url: local.linkedin_url,
          skills: local.skills,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      await updateProfile(local);
      toast({
        title: "Profile Updated",
        description: "Agent profile data synchronized successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Synchronization Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrivacyUpdate = async (field: string, value: boolean) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value } as any)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setLocal(prev => ({ ...prev, [field]: value }));
      toast({
        title: "Privacy Protocol Updated",
        description: "Your privacy settings have been reconfigured.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <motion.main
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background"
    >
      <header className="mx-auto mb-8 max-w-6xl px-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <UserIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Account profile</h1>
            <p className="text-sm text-muted-foreground">Manage your personal details, privacy and account settings.</p>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-8 max-w-6xl">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-card/70 backdrop-blur-sm border border-border/50 shadow-lg">
            <TabsTrigger value="profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-primary/30 data-[state=active]:shadow-md transition-all duration-300">
              <UserIcon className="h-4 w-4 mr-2" />
              IDENTITY
            </TabsTrigger>
            <TabsTrigger value="privacy" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-primary/30 data-[state=active]:shadow-md transition-all duration-300">
              <Shield className="h-4 w-4 mr-2" />
              PROTOCOL
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-primary/30 data-[state=active]:shadow-md transition-all duration-300">
              <Settings className="h-4 w-4 mr-2" />
              SYSTEM
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-8">
            <Card className="cyber-card p-8 space-y-6">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Avatar Uploader */}
                <div className="lg:w-1/3 flex justify-center">
                  <ProfileAvatarUploader 
                    currentAvatarUrl={local?.avatar_url}
                    username={local?.username}
                  />
                </div>

                {/* Profile Form */}
                <div className="lg:w-2/3 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-cyber-green font-mono">AGENT_HANDLE</Label>
                      <Input id="username" value={local?.username || ''} onChange={(e) => setLocal((p) => ({ ...p, username: e.target.value }))} className="neon-input" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="full_name" className="text-cyber-green font-mono">FULL_NAME</Label>
                      <Input id="full_name" value={local?.full_name || ''} onChange={(e) => setLocal((p) => ({ ...p, full_name: e.target.value }))} className="neon-input" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-cyber-green font-mono">EMAIL_ID (Read-Only)</Label>
                    <Input id="email" value={local?.email || user?.email || ''} readOnly className="bg-muted/50 neon-input-disabled" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio" className="text-cyber-green font-mono">BIO_LOG</Label>
                    <Textarea id="bio" value={local?.bio || ''} onChange={(e) => setLocal((p) => ({ ...p, bio: e.target.value }))} rows={3} placeholder="Describe your operational focus..." className="neon-input" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="location" className="text-cyber-green font-mono">LOCATION_TAG</Label>
                      <Input id="location" value={local?.location || ''} onChange={(e) => setLocal((p) => ({ ...p, location: e.target.value }))} placeholder="City, Sector" className="neon-input" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job_title" className="text-cyber-green font-mono">OPERATIONAL_ROLE</Label>
                      <Input id="job_title" value={local?.job_title || ''} onChange={(e) => setLocal((p) => ({ ...p, job_title: e.target.value }))} className="neon-input" />
                    </div>
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto neon-border-lg bg-primary hover:bg-primary/90 transition-all duration-300">
                    {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin"/> : <Save className="h-5 w-5 mr-2"/>}
                    {saving ? 'SYNCHRONIZING DATA...' : 'SYNCHRONIZE CHANGES'}
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-6">
            <Card className="cyber-card p-8 space-y-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-primary">
                <Shield className="h-6 w-6 text-primary" />
                PRIVACY PROTOCOL CONFIGURATION
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border-b border-border/50 hover:bg-card/50 transition-colors duration-200 rounded-md">
                  <Label htmlFor="public-profile" className="flex flex-col space-y-1">
                    <span className="font-mono text-base">PUBLIC_PROFILE_VISIBILITY</span>
                    <span className="text-xs text-muted-foreground">Allow other agents to view your profile data.</span>
                  </Label>
                  <Switch
                    id="public-profile"
                    checked={local?.is_profile_public || false}
                    onCheckedChange={(checked) => handlePrivacyUpdate('is_profile_public', checked)}
                  />
                </div>
                {/* Add more privacy settings here based on your schema */}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="cyber-card p-8 space-y-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-primary">
                <Settings className="h-6 w-6 text-primary" />
                SYSTEM OPERATIONS
              </h3>
              
              <div className="space-y-4">
                <Button 
                  onClick={signOut} 
                  className="w-full bg-orange-600 hover:bg-orange-700 neon-border-sm transition-all duration-300"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  LOGOUT (END SESSION)
                </Button>

              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </motion.main>
  );
};

export default Profile;
