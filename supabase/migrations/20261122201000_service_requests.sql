-- ETERNYX service intake: customer-owned briefs and admin-reviewed lifecycle.
-- Not a checkout, quotation or fulfillment guarantee.
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_key text NOT NULL CHECK (service_key IN (
    'security-review', 'web-app-development', 'ai-solutions',
    'cloud-devops', 'workflow-automation', 'enterprise-projects'
  )),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 8 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 40 AND 4000),
  contact_email text NOT NULL CHECK (char_length(contact_email) BETWEEN 5 AND 254 AND position('@' IN contact_email) > 1),
  company text CHECK (company IS NULL OR char_length(company) <= 160),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'more_info', 'proposal_sent', 'in_progress', 'completed', 'declined')),
  client_update text CHECK (client_update IS NULL OR char_length(client_update) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_requests_owner_created_idx
  ON public.service_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_status_created_idx
  ON public.service_requests (status, created_at DESC);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_requests TO authenticated;
GRANT INSERT (user_id, service_key, title, description, contact_email, company)
  ON TABLE public.service_requests TO authenticated;
GRANT UPDATE (status, client_update, updated_at)
  ON TABLE public.service_requests TO authenticated;

CREATE POLICY "service_requests_owner_or_admin_read"
  ON public.service_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

CREATE POLICY "service_requests_owner_insert"
  ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "service_requests_admin_update"
  ON public.service_requests FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

COMMENT ON TABLE public.service_requests IS
  'Service enquiry briefs, not purchasable orders. Only verified admins may update status and client-facing notes.';