import React, { useRef, useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Upload, Save, X, Loader2, User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProfileAvatarUploaderProps {
  currentAvatarUrl: string | null | undefined;
  username: string | null | undefined;
}

const ProfileAvatarUploader: React.FC<ProfileAvatarUploaderProps> = ({ currentAvatarUrl, username }) => {
  const { user, updateProfile } = useAuthStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
      toast({
        title: "Upload Error",
        description: "Please select a valid image file.",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!user || !selectedFile) return;
    setUploading(true);

    try {
      const ext = selectedFile.name.split('.').pop();
      const path = `${user.id}.${ext}`;
      
      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, selectedFile, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const newAvatarUrl = data.publicUrl;
      
      // 3. Update profile table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // 4. Update local state and store
      await updateProfile({ avatar_url: newAvatarUrl });
      setSelectedFile(null);
      
      toast({
        title: "Avatar Uploaded",
        description: "Agent profile image updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "An unknown error occurred during upload.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    if (fileRef.current) {
      fileRef.current.value = ''; // Clear file input
    }
  };

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center gap-4 p-6 border border-border/50 rounded-lg bg-card/50 shadow-lg">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100 }}
        className="relative group"
      >
        <Avatar className="h-32 w-32 border-4 border-primary/50 shadow-primary/50 shadow-xl transition-all duration-300 hover:border-primary">
          <AvatarImage src={displayUrl || ''} alt={`${username || 'user'} avatar`} />
          <AvatarFallback className="text-2xl bg-primary/20 text-primary">
            {username ? username.slice(0, 2).toUpperCase() : <UserIcon className="h-8 w-8" />}
          </AvatarFallback>
        </Avatar>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-full"
          >
            <span className="text-xs text-cyber-green font-mono animate-pulse">PREVIEW</span>
          </motion.div>
        )}
      </motion.div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <div className="flex gap-2">
        {!selectedFile ? (
          <Button 
            size="sm" 
            onClick={() => fileRef.current?.click()} 
            disabled={uploading}
            className="bg-primary/80 hover:bg-primary neon-border-sm"
          >
            <Upload className="h-4 w-4 mr-2"/>
            Upload New
          </Button>
        ) : (
          <>
            <Button 
              size="sm" 
              onClick={handleUpload} 
              disabled={uploading}
              className="bg-green-600 hover:bg-green-700 neon-border-sm"
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
              {uploading ? 'Transmitting...' : 'Save Avatar'}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleCancel}
              disabled={uploading}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4"/>
            </Button>
          </>
        )}
      </div>
      {selectedFile && (
        <p className="text-xs text-muted-foreground font-mono mt-1">
          File selected: {selectedFile.name}
        </p>
      )}
    </div>
  );
};

export default ProfileAvatarUploader;
