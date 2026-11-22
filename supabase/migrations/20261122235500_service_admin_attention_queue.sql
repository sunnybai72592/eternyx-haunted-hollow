-- ETERNYX Services: administrative attention queue using verified persisted events.
-- Dependencies: all preceding Services migrations, including 20261122223000.
-- This is a read-only SECURITY INVOKER view, not an elevated API.
--
-- Important: "needs_follow_up" denotes a queue signal based on recorded
-- customer/admin activity. It does NOT promise a response time or detect
-- whether anyone actually read a message.

CREATE INDEX IF NOT EXISTS service_request_activity_customer_message_idx
  ON public.service_request_activity(request_id, actor_id, created_at DESC)
  WHERE event_type = 'message';

CREATE INDEX IF NOT EXISTS service_scope_responses_review_user_date_idx
  ON public.service_scope_responses(review_id, user_id, created_at DESC);

CREATE OR REPLACE VIEW public.service_admin_attention_queue
WITH (security_invoker = true) AS
SELECT
  q.*,
  (
    q.status = 'submitted'
    OR (
      q.last_customer_activity_at IS NOT NULL
      AND (
        q.last_admin_activity_at IS NULL
        OR q.last_customer_activity_at > q.last_admin_activity_at
      )
    )
  ) AS needs_follow_up
FROM (
  SELECT
    r.id,
    r.user_id,
    r.service_key,
    r.title,
    r.description,
    r.contact_email,
    r.company,
    r.status,
    r.client_update,
    r.expected_outcome,
    r.timeframe,
    r.constraints,
    r.created_at,
    r.updated_at,
    COALESCE(t.priority, 'normal') AS priority,
    CASE COALESCE(t.priority, 'normal')
      WHEN 'urgent' THEN 4 WHEN 'high' THEN 3
      WHEN 'normal' THEN 2 ELSE 1
    END AS priority_rank,
    t.assigned_admin_id,
    t.updated_at AS triage_updated_at,
    greatest(
      (
        SELECT max(a.created_at)
        FROM public.service_request_activity a
        WHERE a.request_id = r.id AND a.event_type = 'message'
          AND a.actor_id = r.user_id
      ),
      (
        SELECT max(s.created_at)
        FROM public.service_scope_responses s
        INNER JOIN public.service_scope_reviews v ON v.id = s.review_id
        WHERE v.request_id = r.id AND s.user_id = r.user_id
      )
    ) AS last_customer_activity_at,
    (
      SELECT max(a.created_at)
      FROM public.service_request_activity a
      WHERE a.request_id = r.id
        AND (
          a.event_type = 'status_changed'
          OR (a.event_type = 'message' AND a.actor_id IS DISTINCT FROM r.user_id)
        )
    ) AS last_admin_activity_at
  FROM public.service_requests r
  LEFT JOIN public.service_request_triage t ON t.request_id = r.id
  WHERE (SELECT public.is_admin())
) q;

REVOKE ALL ON public.service_admin_attention_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_admin_attention_queue TO authenticated;

COMMENT ON VIEW public.service_admin_attention_queue IS
  'Admin-only, RLS-invoker service triage queue. Needs follow-up is an activity-derived workflow signal, not an unread receipt or response guarantee.';
