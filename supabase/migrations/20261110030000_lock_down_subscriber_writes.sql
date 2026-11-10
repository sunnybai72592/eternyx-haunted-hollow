-- Keep subscription billing state server-managed.
-- Browser clients may read only their own subscription status; all writes are
-- performed by trusted Edge Functions using the server-only Supabase secret key.

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription" ON public.subscribers;
DROP POLICY IF EXISTS "update_own_subscription" ON public.subscribers;
DROP POLICY IF EXISTS "insert_subscription" ON public.subscribers;

-- Remove inherited and direct client privileges. The service_role's existing
-- explicit privileges are preserved; service_role bypasses RLS by design.
REVOKE ALL ON TABLE public.subscribers FROM PUBLIC, anon, authenticated;

-- Authenticated users can read only their own subscription row.
GRANT SELECT ON TABLE public.subscribers TO authenticated;

CREATE POLICY "select_own_subscription"
ON public.subscribers
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()) OR email = (SELECT auth.email()));

COMMENT ON TABLE public.subscribers IS
  'Billing state is server-managed. Authenticated users may only read their own subscription; client writes are revoked.';
