-- Fix user_profiles table RLS - it uses 'id' column not 'user_id'
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Create new policies using 'id' column
CREATE POLICY "Users can view own profile" ON public.user_profiles 
  FOR SELECT TO authenticated 
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.user_profiles 
  FOR UPDATE TO authenticated 
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.user_profiles 
  FOR INSERT TO authenticated 
  WITH CHECK (id = auth.uid());