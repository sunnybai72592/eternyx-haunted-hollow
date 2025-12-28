-- Drop the overly permissive public access policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create a proper policy that respects privacy settings
-- Users can view their own profile (full access)
-- Other users can only view profiles where is_profile_public is true
CREATE POLICY "Users can view public profiles or their own"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  (is_profile_public = true)
);

-- Note: For column-level filtering (show_email, show_phone), 
-- this should be handled at the application level or via a view,
-- as RLS operates at the row level. The sensitive columns (email, phone)
-- should be filtered in application queries when viewing other users' profiles.