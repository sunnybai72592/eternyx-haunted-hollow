import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type UserProfile } from '@/store/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { User as UserIcon, Upload, Save, Shield, Settings, Trash2, Eye, EyeOff } from 'lucide-react';
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

const Profile = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, profile, updateProfile, signOut } = useAuthStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [local, setLocal] = useState<Partial<UserProfile>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = 'Your Profile | ETERNYX';
  }, []);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

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
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
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
        title: "Privacy settings updated",
        description: "Your settings have been saved.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      await updateProfile({ avatar_url: data.publicUrl });
      setLocal(prev => ({ ...prev, avatar_url: data.publicUrl }));
      
      toast({
        title: "Avatar uploaded",
        description: "Your profile picture has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Delete profile data
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // Sign out and navigate
      await signOut();
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
      });
      navigate('/');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <head>
        <title>User Profile | ETERNYX</title>
        <meta name="description" content="Manage your ETERNYX user profile and avatar." />
        <link rel="canonical" href={`${window.location.origin}/profile`} />
      </head>

      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 flex items-center gap-3">
          <UserIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">User Profile</h1>
        </div>
      </header>

      <section className="container mx-auto px-4 py-8 max-w-5xl">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="profile">
              <UserIcon className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="privacy">
              <Shield className="h-4 w-4 mr-2" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={local?.avatar_url || ''} alt={`${local?.username || 'user'} avatar`} />
                    <AvatarFallback className="text-2xl">{(local?.username || 'U').slice(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-2"/>
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files[0])}/>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" value={local?.username || ''} onChange={(e) => setLocal((p) => ({ ...p, username: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input id="full_name" value={local?.full_name || ''} onChange={(e) => setLocal((p) => ({ ...p, full_name: e.target.value }))} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={local?.email || user?.email || ''} readOnly className="bg-muted" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea id="bio" value={local?.bio || ''} onChange={(e) => setLocal((p) => ({ ...p, bio: e.target.value }))} rows={3} placeholder="Tell us about yourself..." />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" value={local?.phone || ''} onChange={(e) => setLocal((p) => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input id="location" value={local?.location || ''} onChange={(e) => setLocal((p) => ({ ...p, location: e.target.value }))} placeholder="City, Country" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input id="company" value={local?.company || ''} onChange={(e) => setLocal((p) => ({ ...p, company: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job_title">Job Title</Label>
                      <Input id="job_title" value={local?.job_title || ''} onChange={(e) => setLocal((p) => ({ ...p, job_title: e.target.value }))} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" type="url" value={local?.website || ''} onChange={(e) => setLocal((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="github_url">GitHub URL</Label>
                    <Input id="github_url" type="url" value={local?.github_url || ''} onChange={(e) => setLocal((p) => ({ ...p, github_url: e.target.value }))} placeholder="https://github.com/username" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="twitter_url">Twitter URL</Label>
                      <Input id="twitter_url" type="url" value={local?.twitter_url || ''} onChange={(e) => setLocal((p) => ({ ...p, twitter_url: e.target.value }))} placeholder="https://twitter.com/username" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                      <Input id="linkedin_url" type="url" value={local?.linkedin_url || ''} onChange={(e) => setLocal((p) => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/username" />
                    </div>
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
                    <Save className="h-4 w-4 mr-2"/>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-6">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Privacy Settings</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {local?.is_profile_public ? <Eye className="h-5 w-5 text-primary" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
                      <div>
                        <p className="font-medium">Public Profile</p>
                        <p className="text-sm text-muted-foreground">Make your profile visible to everyone</p>
                      </div>
                    </div>
                    <Switch 
                      checked={local?.is_profile_public || false} 
                      onCheckedChange={(checked) => handlePrivacyUpdate('is_profile_public', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Show Email</p>
                      <p className="text-sm text-muted-foreground">Display email on public profile</p>
                    </div>
                    <Switch 
                      checked={local?.show_email || false} 
                      onCheckedChange={(checked) => handlePrivacyUpdate('show_email', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Show Phone</p>
                      <p className="text-sm text-muted-foreground">Display phone number on public profile</p>
                    </div>
                    <Switch 
                      checked={local?.show_phone || false} 
                      onCheckedChange={(checked) => handlePrivacyUpdate('show_phone', checked)}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2 text-destructive">Danger Zone</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Once you delete your account, there is no going back. Please be certain.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={deleting}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deleting ? 'Deleting...' : 'Delete Account'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete Account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default Profile;
