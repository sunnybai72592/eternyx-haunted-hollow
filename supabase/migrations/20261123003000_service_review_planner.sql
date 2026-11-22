-- ETERNYX Services Phase 8: private operator next-action planning.
-- Depends on all Services migrations through Phase 7.
-- Dates are ADMIN-ONLY internal review targets, NEVER customer SLAs.
-- No records are invented; unscheduled means the admin has not set a date.

ALTER TABLE public.service_request_triage
  ADD COLUMN IF NOT EXISTS next_action_kind text NOT NULL DEFAULT 'not_set',
  ADD COLUMN IF NOT EXISTS next_review_on date;

ALTER TABLE public.service_request_triage
  ADD CONSTRAINT service_triage_next_action_kind_check
    CHECK (next_action_kind IN (
      'not_set', 'review_brief', 'clarify_requirements', 'prepare_scope',
      'coordinate_team', 'await_customer'
    )),
  ADD CONSTRAINT service_triage_review_date_range_check
    CHECK (next_review_on IS NULL
      OR next_review_on BETWEEN DATE '2020-01-01' AND DATE '2100-12-31');

GRANT UPDATE (next_action_kind, next_review_on)
  ON public.service_request_triage TO authenticated;
GRANT INSERT (next_action_kind, next_review_on)
  ON public.service_request_triage TO authenticated;

CREATE INDEX IF NOT EXISTS service_triage_next_review_on_idx
  ON public.service_request_triage(next_review_on)
  WHERE next_review_on IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_triage_next_action_kind_idx
  ON public.service_request_triage(next_action_kind);

-- Extend the existing SECURITY INVOKER admin attention view rather than
-- altering its column order. The parent view enforces is_admin() and RLS.
CREATE OR REPLACE VIEW public.service_admin_review_queue
WITH (security_invoker = true) AS
SELECT
  q.*,
  COALESCE(t.next_action_kind, 'not_set') AS next_action_kind,
  t.next_review_on,
  CASE
    WHEN t.next_review_on IS NULL THEN 'unscheduled'
    WHEN t.next_review_on < (now() AT TIME ZONE 'UTC')::date THEN 'overdue'
    WHEN t.next_review_on = (now() AT TIME ZONE 'UTC')::date THEN 'due_today'
    ELSE 'upcoming'
  END AS review_bucket
FROM public.service_admin_attention_queue AS q
LEFT JOIN public.service_request_triage AS t ON t.request_id = q.id
WHERE (SELECT public.is_admin());

REVOKE ALL ON public.service_admin_review_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_admin_review_queue TO authenticated;

COMMENT ON COLUMN public.service_request_triage.next_review_on IS
  'Admin-only internal next-review date in UTC. Not a customer deadline or service-level agreement.';
COMMENT ON COLUMN public.service_request_triage.next_action_kind IS
  'Admin-only next action plan. Not a customer-facing promise or automated task execution.';
COMMENT ON VIEW public.service_admin_review_queue IS
  'Security-invoker admin-only action queue; computed review buckets are based on UTC dates and real admin plans, not SLAs.';
