-- ETERNYX Services Phase 12: clarify-and-follow-through on persisted events.
-- Depends on the Phase 11 clarification schema and Phase 10 check-in views.
-- New security-invoker composition views avoid replacing base views with
-- incompatible column signatures or weakening owner/admin RLS.
--
-- "Activity since check" is an explicit personal check-in comparison,
-- NOT a read receipt, notification-delivery claim or contractual SLA.

CREATE OR REPLACE VIEW public.service_customer_followup_queue
WITH (security_invoker = true) AS
SELECT
  q.*,
  recent.last_clarification_activity_at,
  (
    q.has_updates_since_check OR
    (recent.last_clarification_activity_at IS NOT NULL AND (
      q.last_checked_at IS NULL OR recent.last_clarification_activity_at > q.last_checked_at
    ))
  ) AS has_updates_since_check_extended,
  recent.clarification_changes_since_check
FROM public.service_customer_clarification_queue q
CROSS JOIN LATERAL (
  SELECT
    greatest(max(c.created_at), max(c.closed_at)) AS last_clarification_activity_at,
    count(*) FILTER (
      WHERE q.last_checked_at IS NULL
        OR greatest(c.created_at, c.closed_at) > q.last_checked_at
    )::integer AS clarification_changes_since_check
  FROM public.service_clarification_questions c
  WHERE c.request_id = q.id
) recent;

REVOKE ALL ON public.service_customer_followup_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_customer_followup_queue TO authenticated;

-- Customer replies are now part of the operator's real personal check-in and
-- general follow-up signal. We retain the earlier flags for transparency.
CREATE OR REPLACE VIEW public.service_admin_followup_queue
WITH (security_invoker = true) AS
SELECT
  q.*,
  answers.last_customer_answer_at,
  (
    q.needs_my_check OR
    (answers.last_customer_answer_at IS NOT NULL AND (
      q.last_checked_at IS NULL OR answers.last_customer_answer_at > q.last_checked_at
    ))
  ) AS needs_my_check_extended,
  (q.needs_follow_up OR q.awaiting_admin_review_count > 0)
    AS needs_follow_up_extended,
  answers.customer_answers_since_check
FROM public.service_admin_clarification_queue q
CROSS JOIN LATERAL (
  SELECT
    max(a.created_at) AS last_customer_answer_at,
    count(*) FILTER (
      WHERE q.last_checked_at IS NULL OR a.created_at > q.last_checked_at
    )::integer AS customer_answers_since_check
  FROM public.service_clarification_answers a
  INNER JOIN public.service_clarification_questions question
    ON question.id = a.question_id
  WHERE question.request_id = q.id
) answers
WHERE (SELECT public.is_admin());

REVOKE ALL ON public.service_admin_followup_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_admin_followup_queue TO authenticated;

-- Prevent an authorized administrator from accidentally flooding the same
-- customer with dozens of questions from rapid repeat clicks. A per-pair
-- transaction lock serializes concurrent inserts. Normal customer answer
-- permissions and the immutable question/answer model are unchanged.
CREATE INDEX IF NOT EXISTS service_clarification_admin_burst_lookup_idx
  ON public.service_clarification_questions
    (request_id, author_id, created_at DESC);

CREATE OR REPLACE FUNCTION eternyx_private.guard_service_clarification_question_burst()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM auth.uid()
    OR NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Verified administrator access is required to ask a clarification'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'service-clarification-question:' ||
      NEW.request_id::text || ':' || NEW.author_id::text, 0
    )
  );

  IF (
    SELECT count(*)
    FROM public.service_clarification_questions q
    WHERE q.request_id = NEW.request_id
      AND q.author_id = NEW.author_id
      AND q.created_at >= pg_catalog.clock_timestamp() - interval '60 seconds'
  ) >= 6 THEN
    RAISE EXCEPTION 'Too many clarification questions. Try again in about a minute.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_clarification_questions q
    WHERE q.request_id = NEW.request_id
      AND q.author_id = NEW.author_id
      AND q.created_at >= pg_catalog.clock_timestamp() - interval '90 seconds'
      AND pg_catalog.lower(pg_catalog.btrim(q.prompt)) =
          pg_catalog.lower(pg_catalog.btrim(NEW.prompt))
  ) THEN
    RAISE EXCEPTION 'This clarification question was already submitted recently.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_clarification_question_burst()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_clarification_question_burst_guard
  ON public.service_clarification_questions;
CREATE TRIGGER service_clarification_question_burst_guard
BEFORE INSERT ON public.service_clarification_questions
FOR EACH ROW EXECUTE FUNCTION
  eternyx_private.guard_service_clarification_question_burst();

COMMENT ON VIEW public.service_customer_followup_queue IS
  'Owner-scoped real messages, statuses, scopes, question creation and question closure since personal explicit check-in; not read receipts.';
COMMENT ON VIEW public.service_admin_followup_queue IS
  'Admin-scoped real customer messages, scope responses and clarification answers since personal explicit check-in; preserves previous operational signals.';
COMMENT ON FUNCTION eternyx_private.guard_service_clarification_question_burst() IS
  'Serializes same-admin/request question creation, rejects bursts and recently repeated prompts; never grants extra access.';
