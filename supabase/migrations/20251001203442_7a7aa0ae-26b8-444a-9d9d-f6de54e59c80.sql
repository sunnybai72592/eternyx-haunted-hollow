-- Final RLS policy fixes with correct column names

-- 1. user_profiles table (uses id as primary key referencing auth.users)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- 2. projects table
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. threat_monitoring_events table (no user_id column, but needs protection)
ALTER TABLE public.threat_monitoring_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all threat events" ON public.threat_monitoring_events;
DROP POLICY IF EXISTS "Security team can view threat events" ON public.threat_monitoring_events;
DROP POLICY IF EXISTS "System can insert threat events" ON public.threat_monitoring_events;
CREATE POLICY "Admins can view all threat events" ON public.threat_monitoring_events FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Security team can view threat events" ON public.threat_monitoring_events FOR SELECT TO authenticated USING (true); -- All authenticated users can view for security awareness
CREATE POLICY "System can insert threat events" ON public.threat_monitoring_events FOR INSERT TO authenticated WITH CHECK (true);