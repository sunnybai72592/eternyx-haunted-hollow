-- Update profiles table to support admin role
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- Create admin profile manually (user will need to sign up first)
-- We'll handle this in the application logic

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE user_id = auth.uid()), false);
$$;

-- Update existing get_current_user_role function
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(role, 'user') FROM public.profiles WHERE user_id = auth.uid();
$$;