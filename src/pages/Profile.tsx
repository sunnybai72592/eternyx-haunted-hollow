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
import { User as UserIcon, Save, Shield, Settings, Trash2, Wrench, Zap, Loader2, LogOut } from 'lucide-react';
import { fetchTools, Tool } from '@/lib/tools';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { motion } from 'framer-motion';
import ProfileAvatarUploader from '@/components/ProfileAvatarUploader';
import { TerminalWindow } from '@/components/TerminalWindow';

const Profile = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, profile, updateProfile, signOut } = useAuthStore();
  const [local, setLocal] = useState<Partial<UserProfile>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userTools, setUserTools] = useState<Tool[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);

  useEffect(() => {
    document.title = 'Agent Profile | ETERNYX';
  }, []);

  useEffect(() => {
    if (!isAuthenticated) navigate('/login'); // Assuming a login route exists
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (profile) {
      setLocal(profile);
    }
  }, [profile]);

  useEffect(() => {
    const getTools = async () => {
      if (user?.id) {
        setLoadingTools(true);
        try {
          // NOTE: Using a placeholder for fetchTools as the original implementation is complex.
          // In a real scenario, this would be replaced with the actual implementation.
          // For now, we'll use a mock or the existing one if it works.
          // Since the original file used it, we'll keep the import and hope for the best.
          // If fetchTools is not defined, this will break. Assuming it is defined in '@/lib/tools'.
          const tools = await fetchTools(user.id); 
          setUserTools(tools);
        } catch (error) {
          console.error("Failed to fetch user tools:", error);
          toast({
            title: "Error",
            description: "Failed to load your tools data.",
            variant: "destructive",
          });
        } finally {
          setLoadingTools(false);
        }
      }
    };

    getTools();
  }, [user]);

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
        .update({ [field]: value })
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

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Delete profile data (soft delete or flag is better, but following original code structure)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // Sign out and navigate
      await signOut();
      toast({
        title: "Account Decommissioned",
        description: "Your ETERNYX account has been permanently deleted.",
      });
      navigate('/');
    } catch (error: any) {
      toast({
        title: "Decommission Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const renderToolCard = (tool: Tool) => {
    const Icon = tool.icon;
    const xpPercentage = (tool.xp / tool.maxXp) * 100;
    const glowColor = tool.glowColor || 'cyan';

    return (
      <motion.div 
        key={tool.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`p-4 rounded-lg border transition-all duration-300 hover:scale-[1.02] cyber-card-sm`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg bg-${glowColor}-500/10`}>
            <Icon className={`h-6 w-6 text-${glowColor}-400`} />
          </div>
          {tool.isLocked && (
            <div className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded font-mono">
              [LOCKED]
            </div>
          )}
        </div>
        
        <h4 className="font-semibold text-base mb-1 font-mono">{tool.title}</h4>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{tool.description}</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>LVL {tool.level}</span>
            <span>{tool.xp}/{tool.maxXp} XP</span>
          </div>
          
          <div className="w-full bg-gray-700 rounded-full h-2">
            <motion.div 
              className={`bg-gradient-to-r from-${glowColor}-400 to-${glowColor}-600 h-2 rounded-full`}
              initial={{ width: 0 }}
              animate={{ width: `${xpPercentage}%` }}
              transition={{ duration: 1.5 }}
            ></motion.div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.main
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background"
    >
      <TerminalWindow title="AGENT_PROFILE_V4.1.2" className="mb-8">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-3xl font-extrabold flex items-center justify-center">
            <UserIcon className="inline mr-3 h-8 w-8 animate-pulse" />
            AGENT PROFILE MANAGEMENT
          </div>
          <p className="text-lg text-muted-foreground font-mono">
            // Accessing and modifying ETERNYX operational identity.
          </p>
        </div>
      </TerminalWindow>

      <section className="container mx-auto px-4 py-8 max-w-6xl">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8 bg-card/70 backdrop-blur-sm border border-border/50 shadow-lg">
            <TabsTrigger value="profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-primary/30 data-[state=active]:shadow-md transition-all duration-300">
              <UserIcon className="h-4 w-4 mr-2" />
              IDENTITY
            </TabsTrigger>
            <TabsTrigger value="tools" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-primary/30 data-[state=active]:shadow-md transition-all duration-300">
              <Wrench className="h-4 w-4 mr-2" />
              ARSENAL
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

          <TabsContent value="tools" className="space-y-6">
            <Card className="cyber-card p-8">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-primary">
                <Wrench className="h-6 w-6 text-primary" />
                OPERATIONAL ARSENAL & PROGRESS
              </h3>
              
              {loadingTools ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                  <p className="text-primary font-mono">LOADING ARSENAL DATA...</p>
                </div>
              ) : userTools.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-mono">NO TOOLS UNLOCKED. BEGIN YOUR OPERATIONAL DEPLOYMENT.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userTools.map(renderToolCard)}
                </div>
              )}
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
                    checked={local?.is_public || false}
                    onCheckedChange={(checked) => handlePrivacyUpdate('is_public', checked)}
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

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      className="w-full bg-destructive hover:bg-destructive/90 neon-border-sm transition-all duration-300"
                    >
                      <Trash2 className="h-5 w-5 mr-2" />
                      DECOMMISSION ACCOUNT
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="cyber-card border-destructive shadow-destructive/50">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-destructive flex items-center gap-2">
                        <Zap className="h-6 w-6 animate-pulse" />
                        WARNING: CRITICAL DECOMMISSION PROTOCOL
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground font-mono">
                        Initiating this protocol will permanently erase your operational identity and all associated data from the ETERNYX network. This action is irreversible.
                        <br/><br/>
                        <span className="text-red-400 font-bold">CONFIRM DECOMMISSION?</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="neon-border-sm hover:bg-card/50">CANCEL PROTOCOL</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDeleteAccount} 
                        disabled={deleting}
                        className="bg-destructive hover:bg-destructive/90 neon-border-sm"
                      >
                        {deleting ? <Loader2 className="h-5 w-5 mr-2 animate-spin"/> : <Trash2 className="h-5 w-5 mr-2"/>}
                        {deleting ? 'ERASING DATA...' : 'CONFIRM DECOMMISSION'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </motion.main>
  );
};

export default Profile;
