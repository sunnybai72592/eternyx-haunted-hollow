import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type UserProfile } from '@/store/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TerminalWindow } from '@/components/TerminalWindow';
import { User as UserIcon, Upload, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const Profile = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, profile, updateProfile } = useAuthStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [local, setLocal] = useState<UserProfile | null>(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Your Profile | ETERNYX';
  }, []);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  useEffect(() => setLocal(profile), [profile]);

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    await updateProfile({ username: local.username });
    setSaving(false);
  };

  const handleUpload = async (file: File) => {
    if (!user) return;
    const ext = file.name.split('.').pop();
    const path = `avatars/${user.id}.${ext}`;
    await supabase.storage.from('user-avatars').upload(path, file, { upsert: true });
    const { data } = supabase.storage.from('user-avatars').getPublicUrl(path);
    await updateProfile({ avatar_url: data.publicUrl });
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

      <section className="container mx-auto px-4 py-8 grid gap-6 md:grid-cols-2">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={local?.avatar_url || ''} alt={`${local?.username || 'user'} avatar`} />
              <AvatarFallback>{(local?.username || 'U').slice(0,2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2"/>Upload Avatar
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files[0])}/>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={local?.username || ''} onChange={(e) => setLocal((p) => p ? { ...p, username: e.target.value } : p)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={local?.email || ''} readOnly />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2"/>{saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Card>

        <Card className="p-6">
          <TerminalWindow title="profile.log">
            <div className="text-xs text-muted-foreground">
              Keep your identity secure. Avatar uploads are stored in a public bucket for display purposes only.
            </div>
          </TerminalWindow>
        </Card>
      </section>
    </main>
  );
};

export default Profile;
