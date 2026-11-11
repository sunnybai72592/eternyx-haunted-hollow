import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2, Save, ShieldCheck, Upload, X } from 'lucide-react';

interface ProfileAvatarUploaderProps {
  currentAvatarUrl: string | null | undefined;
  username: string | null | undefined;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ProfileAvatarUploader = ({ currentAvatarUrl, username }: ProfileAvatarUploaderProps) => {
  const { user, updateProfile } = useAuthStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Choose an image', description: 'Please select a JPG, PNG, WebP or other supported image file.', variant: 'destructive' });
      event.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'Image is too large', description: 'Choose an image smaller than 5 MB.', variant: 'destructive' });
      event.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!user || !selectedFile) return;
    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(path, selectedFile, { upsert: true, contentType: selectedFile.type });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-avatars').getPublicUrl(path);
      const newAvatarUrl = data.publicUrl;
      const result = await updateProfile({ avatar_url: newAvatarUrl });
      if (!result.success) throw new Error(result.error || 'The image uploaded, but the profile could not be updated.');

      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: 'Profile image updated', description: 'Your new image is now linked to your ETERNYX identity.' });
    } catch (error) {
      toast({
        title: 'Image upload failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const displayName = username || 'ETERNYX member';
  const displayUrl = previewUrl || currentAvatarUrl || undefined;
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EX';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-cyan-300/10 blur-xl" />
        <Avatar className="relative h-36 w-36 border border-cyan-200/30 bg-[#0b1728] shadow-[0_0_0_7px_rgba(103,232,249,.045),0_18px_45px_rgba(0,0,0,.35)]">
          <AvatarImage src={displayUrl} alt={`${displayName} profile image`} className="object-cover" />
          <AvatarFallback className="bg-cyan-200/[0.08] text-3xl font-semibold text-cyan-100">{initials}</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#0a1322] bg-cyan-200 text-slate-950 shadow-lg"><ImagePlus className="h-4 w-4" /></span>
      </div>

      <p className="mt-5 max-w-full truncate text-sm font-semibold text-white">{displayName}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Personal profile image</p>

      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} aria-label="Choose a profile image" />

      {!selectedFile ? (
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="mt-5 h-10 w-full max-w-[190px] rounded-xl border-cyan-200/20 bg-cyan-200/[0.07] text-xs font-semibold text-cyan-100 hover:border-cyan-200/35 hover:bg-cyan-200/[0.12] hover:text-white">
          <Upload className="mr-2 h-4 w-4" /> Choose image
        </Button>
      ) : (
        <div className="mt-5 w-full space-y-2">
          <p className="truncate text-[10px] text-slate-400" title={selectedFile.name}>{selectedFile.name}</p>
          <Button type="button" onClick={handleUpload} disabled={uploading} className="h-10 w-full rounded-xl bg-cyan-200 text-xs font-semibold text-slate-950 hover:bg-cyan-100">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {uploading ? 'Updating image…' : 'Save profile image'}
          </Button>
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={uploading} className="h-9 w-full rounded-xl text-xs text-slate-400 hover:bg-white/[0.05] hover:text-white">
            <X className="mr-2 h-3.5 w-3.5" /> Cancel selection
          </Button>
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-200/70" /> JPG, PNG or WebP · up to 5 MB</div>
    </div>
  );
};

export default ProfileAvatarUploader;
