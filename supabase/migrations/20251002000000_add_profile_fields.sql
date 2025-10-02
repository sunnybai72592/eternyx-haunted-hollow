-- Add new fields to profiles table for enhanced profile settings
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitter_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_profile_public BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_email BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"theme": "cyberpunk", "notifications": true, "sound_effects": true, "analytics": true}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'basic' CHECK (access_level IN ('basic', 'premium', 'elite'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{"login_count": 0, "projects_created": 0, "last_activity": null}';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_access_level ON public.profiles(access_level);
CREATE INDEX IF NOT EXISTS idx_profiles_is_profile_public ON public.profiles(is_profile_public);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON public.profiles(last_login);

-- Update existing profiles to have default values
UPDATE public.profiles 
SET 
  preferences = COALESCE(preferences, '{"theme": "cyberpunk", "notifications": true, "sound_effects": true, "analytics": true}'),
  access_level = COALESCE(access_level, 'basic'),
  stats = COALESCE(stats, '{"login_count": 0, "projects_created": 0, "last_activity": null}'),
  is_profile_public = COALESCE(is_profile_public, true),
  show_email = COALESCE(show_email, false),
  show_phone = COALESCE(show_phone, false)
WHERE preferences IS NULL OR access_level IS NULL OR stats IS NULL;

-- Create function to update login stats
CREATE OR REPLACE FUNCTION public.update_login_stats(user_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles 
  SET 
    last_login = NOW(),
    stats = jsonb_set(
      COALESCE(stats, '{}'),
      '{login_count}',
      (COALESCE((stats->>'login_count')::integer, 0) + 1)::text::jsonb
    ),
    stats = jsonb_set(
      stats,
      '{last_activity}',
      to_jsonb(NOW()::text)
    )
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update project stats
CREATE OR REPLACE FUNCTION public.increment_project_count(user_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles 
  SET 
    stats = jsonb_set(
      COALESCE(stats, '{}'),
      '{projects_created}',
      (COALESCE((stats->>'projects_created')::integer, 0) + 1)::text::jsonb
    ),
    stats = jsonb_set(
      stats,
      '{last_activity}',
      to_jsonb(NOW()::text)
    )
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_login_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_project_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.preferences IS 'User preferences stored as JSON including theme, notifications, etc.';
COMMENT ON COLUMN public.profiles.access_level IS 'User access level: basic, premium, or elite';
COMMENT ON COLUMN public.profiles.stats IS 'User statistics including login count, projects created, etc.';
COMMENT ON COLUMN public.profiles.is_profile_public IS 'Whether the user profile is publicly visible';
COMMENT ON COLUMN public.profiles.show_email IS 'Whether to show email on public profile';
COMMENT ON COLUMN public.profiles.show_phone IS 'Whether to show phone on public profile';
