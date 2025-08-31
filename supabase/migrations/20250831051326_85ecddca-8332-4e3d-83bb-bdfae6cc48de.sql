-- Create user profiles table for proper profile data storage
CREATE TABLE public.user_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username TEXT UNIQUE,
  email TEXT,
  avatar_url TEXT,
  access_level TEXT NOT NULL DEFAULT 'basic' CHECK (access_level IN ('basic', 'premium', 'elite')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_login TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  preferences JSONB DEFAULT '{
    "theme": "cyberpunk",
    "notifications": true,
    "analytics": true,
    "sound_effects": true
  }'::jsonb,
  stats JSONB DEFAULT '{
    "login_count": 0,
    "projects_created": 0,
    "last_activity": null
  }'::jsonb
);

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for user profiles
CREATE POLICY "Users can view their own profile" 
ON public.user_profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.user_profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.user_profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, username)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update user stats
CREATE OR REPLACE FUNCTION public.update_user_stats(user_id UUID, stat_name TEXT, increment_value INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles 
  SET stats = jsonb_set(
    stats, 
    ARRAY[stat_name], 
    to_jsonb(COALESCE((stats ->> stat_name)::INTEGER, 0) + increment_value)
  ),
  last_login = CASE WHEN stat_name = 'login_count' THEN now() ELSE last_login END
  WHERE user_profiles.user_id = update_user_stats.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create storage bucket for user avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'user-avatars');

CREATE POLICY "Users can upload their own avatar" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);