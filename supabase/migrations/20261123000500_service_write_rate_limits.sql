-- ETERNYX Services Phase 7: server-enforced write throttling.
-- Append-only messages and non-binding scope feedback remain covered by RLS.
-- Applies after service_admin_attention_queue. No user rows are changed.
-- Trigger runs as invoker: cannot cross request ownership or invent privileges.
-- A per-request/user transaction advisory lock serializes simultaneous writes.
CREATE OR REPLACE FUNCTION eternyx_private.limit_service_message_bursts()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  window_start timestamptz := pg_catalog.clock_timestamp() - interval '60 seconds';
BEGIN
  IF NEW.event_type <> 'message' THEN
    RETURN NEW; -- server-generated request/status audit events never throttled
  END IF;
  IF NEW.actor_id IS NULL OR NEW.actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A verified account is required to post a message' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('service-message:' || NEW.request_id::text || ':' || NEW.actor_id::text, 0)
  );
  IF (
    SELECT count(*) FROM public.service_request_activity a
    WHERE a.request_id = NEW.request_id
      AND a.actor_id = NEW.actor_id
      AND a.event_type = 'message'
      AND a.created_at >= window_start
  ) >= 8 THEN
    RAISE EXCEPTION 'Too many service messages. Please try again in about a minute.'
      USING ERRCODE='P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_request_activity a
    WHERE a.request_id = NEW.request_id AND a.actor_id = NEW.actor_id
      AND a.event_type = 'message'
      AND a.created_at >= (pg_catalog.clock_timestamp() - interval '30 seconds')
      AND pg_catalog.btrim(a.body) = pg_catalog.btrim(NEW.body)
  ) THEN
    RAISE EXCEPTION 'This message was already submitted recently.'
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.limit_service_message_bursts()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_activity_message_burst_guard ON public.service_request_activity;
CREATE TRIGGER service_activity_message_burst_guard
BEFORE INSERT ON public.service_request_activity
FOR EACH ROW EXECUTE FUNCTION eternyx_private.limit_service_message_bursts();

CREATE OR REPLACE FUNCTION eternyx_private.limit_service_scope_feedback_bursts()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A verified request owner is required for scope feedback'
      USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('service-feedback:' || NEW.review_id::text || ':' || NEW.user_id::text, 0)
  );
  IF (
    SELECT count(*) FROM public.service_scope_responses s
    WHERE s.review_id = NEW.review_id AND s.user_id = NEW.user_id
      AND s.created_at >= (pg_catalog.clock_timestamp() - interval '60 seconds')
  ) >= 4 THEN
    RAISE EXCEPTION 'Too many scope responses. Please try again in about a minute.'
      USING ERRCODE='P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_scope_responses s
    WHERE s.review_id = NEW.review_id AND s.user_id = NEW.user_id
      AND s.created_at >= (pg_catalog.clock_timestamp() - interval '30 seconds')
      AND s.kind = NEW.kind
      AND pg_catalog.btrim(s.note) = pg_catalog.btrim(NEW.note)
  ) THEN
    RAISE EXCEPTION 'This scope response was already submitted recently.'
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.limit_service_scope_feedback_bursts()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_scope_feedback_burst_guard ON public.service_scope_responses;
CREATE TRIGGER service_scope_feedback_burst_guard
BEFORE INSERT ON public.service_scope_responses
FOR EACH ROW EXECUTE FUNCTION eternyx_private.limit_service_scope_feedback_bursts();

COMMENT ON FUNCTION eternyx_private.limit_service_message_bursts() IS
  'Serializes same-user/request messages, throttles bursts and repeats, not server audit inserts.';
COMMENT ON FUNCTION eternyx_private.limit_service_scope_feedback_bursts() IS
  'Serializes same-user/review feedback, throttles bursts and repeats; never creates contracts.';
