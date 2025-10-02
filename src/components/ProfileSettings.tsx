import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/useAppStore';
import HolographicCard from '@/components/HolographicCard';
import { 
  User, 
  Upload, 
  Save, 
  Camera, 
  Shield, 
  Bell, 
  Palette, 
  Globe,
  Lock,
  Eye,
  EyeOff,
  Crown,
  Zap,
  Settings,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Github,
  Twitter,
  Linkedin,
  Link as LinkIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProfileSettingsProps {
  className?: string;
}

export const ProfileSettings = ({ className = '' }: ProfileSettingsProps) => {
  const { user, profile, updateProfile } = useAuthStore();
  const { addNotification } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    email: user?.email || '',
    bio: (profile as any)?.bio || '',
    full_name: (profile as any)?.full_name || '',
    location: (profile as any)?.location || '',
    website: (profile as any)?.website || '',
    company: (profile as any)?.company || '',
    job_title: (profile as any)?.job_title || '',
    phone: (profile as any)?.phone || '',
    github_url: (profile as any)?.github_url || '',
    twitter_url: (profile as any)?.twitter_url || '',
    linkedin_url: (profile as any)?.linkedin_url || '',
    avatar_url: (profile as any)?.avatar_url || '',
    is_profile_public: (profile as any)?.is_profile_public ?? true,
    show_email: (profile as any)?.show_email ?? false,
    show_phone: (profile as any)?.show_phone ?? false,
    notifications_enabled: (profile as any)?.preferences?.notifications ?? true,
    sound_effects: (profile as any)?.preferences?.sound_effects ?? true,
    theme: (profile as any)?.preferences?.theme || 'cyberpunk'
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload file to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(filePath);

      // Update form data and profile
      const newAvatarUrl = data.publicUrl;
      setFormData(prev => ({ ...prev, avatar_url: newAvatarUrl }));
      
      await updateProfile({ avatar_url: newAvatarUrl });
      
      addNotification({
        type: 'success',
        message: 'Avatar updated successfully!'
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      addNotification({
        type: 'error',
        message: 'Failed to upload avatar. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      const profileUpdates = {
        username: formData.username,
        bio: formData.bio,
        full_name: formData.full_name,
        location: formData.location,
        website: formData.website,
        company: formData.company,
        job_title: formData.job_title,
        phone: formData.phone,
        github_url: formData.github_url,
        twitter_url: formData.twitter_url,
        linkedin_url: formData.linkedin_url,
        is_profile_public: formData.is_profile_public,
        show_email: formData.show_email,
        show_phone: formData.show_phone
      };

      await updateProfile(profileUpdates);
      
      addNotification({
        type: 'success',
        message: 'Profile updated successfully!'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      addNotification({
        type: 'error',
        message: 'Failed to update profile. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setIsLoading(true);
    try {
      const preferences = {
        notifications: formData.notifications_enabled,
        sound_effects: formData.sound_effects,
        theme: formData.theme
      };

      await updateProfile({ preferences });
      
      addNotification({
        type: 'success',
        message: 'Preferences updated successfully!'
      });
    } catch (error) {
      console.error('Error updating preferences:', error);
      addNotification({
        type: 'error',
        message: 'Failed to update preferences. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getAccessLevelIcon = (level: string) => {
    switch (level) {
      case 'elite':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'premium':
        return <Zap className="h-4 w-4 text-blue-500" />;
      default:
        return <Shield className="h-4 w-4 text-green-500" />;
    }
  };

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case 'elite':
        return 'border-yellow-500 text-yellow-500';
      case 'premium':
        return 'border-blue-500 text-blue-500';
      default:
        return 'border-green-500 text-green-500';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-cyber-green neon-text">Profile Settings</h2>
          <p className="text-muted-foreground">Manage your account information and preferences</p>
        </div>
        <Badge className={`${getAccessLevelColor(profile?.access_level || 'basic')} bg-transparent`}>
          {getAccessLevelIcon(profile?.access_level || 'basic')}
          <span className="ml-1">{(profile?.access_level || 'basic').toUpperCase()}</span>
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-card/50 backdrop-blur-sm">
          <TabsTrigger value="profile" className="data-[state=active]:bg-cyber-green/20 data-[state=active]:text-cyber-green">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="social" className="data-[state=active]:bg-cyber-blue/20 data-[state=active]:text-cyber-blue">
            <LinkIcon className="h-4 w-4 mr-2" />
            Social
          </TabsTrigger>
          <TabsTrigger value="privacy" className="data-[state=active]:bg-purple-400/20 data-[state=active]:text-purple-400">
            <Lock className="h-4 w-4 mr-2" />
            Privacy
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-yellow-400/20 data-[state=active]:text-yellow-400">
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Avatar Section */}
            <HolographicCard title="Profile Picture" animated>
              <div className="flex flex-col items-center space-y-4">
                <Avatar className="h-24 w-24 ring-4 ring-primary/50">
                  <AvatarImage src={formData.avatar_url} alt={formData.username} />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                    {formData.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="space-y-2 w-full">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="w-full"
                    variant="outline"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {isLoading ? 'Uploading...' : 'Change Avatar'}
                  </Button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                    }}
                  />
                  
                  <p className="text-xs text-muted-foreground text-center">
                    JPG, PNG or GIF. Max size 5MB.
                  </p>
                </div>
              </div>
            </HolographicCard>

            {/* Basic Info */}
            <div className="lg:col-span-2">
              <HolographicCard title="Basic Information" animated>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      placeholder="Enter username"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => handleInputChange('full_name', e.target.value)}
                      placeholder="Enter full name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={formData.email}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="Enter phone number"
                    />
                  </div>
                  
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      placeholder="Tell us about yourself..."
                      rows={3}
                    />
                  </div>
                </div>
              </HolographicCard>
            </div>
          </div>

          {/* Professional Info */}
          <HolographicCard title="Professional Information" animated>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => handleInputChange('company', e.target.value)}
                  placeholder="Enter company name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="job_title">Job Title</Label>
                <Input
                  id="job_title"
                  value={formData.job_title}
                  onChange={(e) => handleInputChange('job_title', e.target.value)}
                  placeholder="Enter job title"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="Enter location"
                />
              </div>
              
              <div className="md:col-span-2 lg:col-span-3 space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  placeholder="https://your-website.com"
                />
              </div>
            </div>
          </HolographicCard>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isLoading} className="bg-cyber-green hover:bg-cyber-green/80">
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </TabsContent>

        {/* Social Tab */}
        <TabsContent value="social" className="space-y-6">
          <HolographicCard title="Social Links" animated>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github_url" className="flex items-center">
                  <Github className="h-4 w-4 mr-2" />
                  GitHub
                </Label>
                <Input
                  id="github_url"
                  value={formData.github_url}
                  onChange={(e) => handleInputChange('github_url', e.target.value)}
                  placeholder="https://github.com/username"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="twitter_url" className="flex items-center">
                  <Twitter className="h-4 w-4 mr-2" />
                  Twitter
                </Label>
                <Input
                  id="twitter_url"
                  value={formData.twitter_url}
                  onChange={(e) => handleInputChange('twitter_url', e.target.value)}
                  placeholder="https://twitter.com/username"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="linkedin_url" className="flex items-center">
                  <Linkedin className="h-4 w-4 mr-2" />
                  LinkedIn
                </Label>
                <Input
                  id="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
            </div>
          </HolographicCard>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isLoading} className="bg-cyber-blue hover:bg-cyber-blue/80">
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Social Links'}
            </Button>
          </div>
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <HolographicCard title="Privacy Settings" animated>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="flex items-center">
                    <Globe className="h-4 w-4 mr-2" />
                    Public Profile
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Make your profile visible to other users
                  </p>
                </div>
                <Switch
                  checked={formData.is_profile_public}
                  onCheckedChange={(checked) => handleInputChange('is_profile_public', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="flex items-center">
                    <Mail className="h-4 w-4 mr-2" />
                    Show Email
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display your email address on your public profile
                  </p>
                </div>
                <Switch
                  checked={formData.show_email}
                  onCheckedChange={(checked) => handleInputChange('show_email', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    Show Phone
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display your phone number on your public profile
                  </p>
                </div>
                <Switch
                  checked={formData.show_phone}
                  onCheckedChange={(checked) => handleInputChange('show_phone', checked)}
                />
              </div>
            </div>
          </HolographicCard>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isLoading} className="bg-purple-400 hover:bg-purple-400/80">
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Privacy Settings'}
            </Button>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <HolographicCard title="Notifications" animated>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="flex items-center">
                      <Bell className="h-4 w-4 mr-2" />
                      Enable Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive system notifications
                    </p>
                  </div>
                  <Switch
                    checked={formData.notifications_enabled}
                    onCheckedChange={(checked) => handleInputChange('notifications_enabled', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Sound Effects</Label>
                    <p className="text-sm text-muted-foreground">
                      Play sound effects for interactions
                    </p>
                  </div>
                  <Switch
                    checked={formData.sound_effects}
                    onCheckedChange={(checked) => handleInputChange('sound_effects', checked)}
                  />
                </div>
              </div>
            </HolographicCard>

            <HolographicCard title="Appearance" animated>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center">
                    <Palette className="h-4 w-4 mr-2" />
                    Theme
                  </Label>
                  <Select value={formData.theme} onValueChange={(value) => handleInputChange('theme', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cyberpunk">Cyberpunk</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="matrix">Matrix</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </HolographicCard>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSavePreferences} disabled={isLoading} className="bg-yellow-400 hover:bg-yellow-400/80 text-black">
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfileSettings;
