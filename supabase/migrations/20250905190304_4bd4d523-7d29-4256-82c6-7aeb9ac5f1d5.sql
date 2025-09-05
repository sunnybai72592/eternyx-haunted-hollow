-- Create admin user account
INSERT INTO auth.users (
  id, 
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'naimatullah@gmail.com',
  crypt('Salwa@72592', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"email":"naimatullah@gmail.com"}',
  '',
  '',
  '',
  ''
) ON CONFLICT (email) DO NOTHING;

-- Create admin profile with admin role
INSERT INTO public.profiles (
  id,
  user_id,
  full_name,
  username,
  role
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Naimat Ullah',
  'admin',
  'admin'
) ON CONFLICT (user_id) DO UPDATE SET
  role = 'admin',
  username = 'admin',
  full_name = 'Naimat Ullah';

-- Update function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(role, 'user') FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE user_id = auth.uid()), false);
$$;