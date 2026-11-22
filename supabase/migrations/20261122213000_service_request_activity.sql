-- Private service desk: append-only messages and auditable status changes.
-- Depends on 20261122201000_service_requests.sql; no billing is enabled.

CREATE TABLE IF NOT EXISTS public.service_request_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('message', 'request_created', 'status_changed')),
  body text CHECK (body IS NULL OR char_length(btrim(body)) BETWEEN 1 AND 1500),
  from_status text,
  to_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_request_activity_payload CHECK (
    (event_type = 'message' AND body IS NOT NULL
      AND char_length(btrim(body)) BETWEEN 10 AND 1500
      AND from_status IS NULL AND to_status IS NULL)
    OR (event_type IN ('request_created', 'status_changed') AND to_status IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS service_request_activity_request_created_idx
  ON public.service_request_activity(request_id, created_at ASC, id ASC);
ALTER TABLE public.service_request_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_request_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_request_activity TO authenticated;
-- Do not grant client insert of event timestamps, status, or historical rows.
GRANT INSERT (request_id, actor_id, event_type, body)
  ON public.service_request_activity TO authenticated;

CREATE POLICY "service_request_activity_read_by_owner_or_admin"
  ON public.service_request_activity FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests AS sr
      WHERE sr.id = request_id
        AND (sr.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );

CREATE POLICY "service_request_activity_message_by_participant"
  ON public.service_request_activity FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND event_type = 'message'
    AND EXISTS (
      SELECT 1 FROM public.service_requests AS sr
      WHERE sr.id = request_id
        AND (sr.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );

-- Restrict escalation: status, customer-facing update and timestamp are not
-- editable by the requester. Timestamp is maintained by a server-side trigger.
REVOKE UPDATE (updated_at) ON public.service_requests FROM authenticated;

CREATE SCHEMA IF NOT EXISTS eternyx_private;
REVOKE ALL ON SCHEMA eternyx_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION eternyx_private.service_request_update_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.service_request_update_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_request_update_time ON public.service_requests;
CREATE TRIGGER service_request_update_time
BEFORE UPDATE ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION eternyx_private.service_request_update_time();

-- This trigger is invoked only after the parent row passes authenticated RLS
-- or an administrator changes it. The definer is used only for immutable audit
-- inserts; this function lives outside the exposed public API schema.
CREATE OR REPLACE FUNCTION eternyx_private.record_service_request_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_request_activity
      (request_id, actor_id, event_type, body, to_status)
    VALUES (NEW.id, NEW.user_id, 'request_created', 'Project brief received', NEW.status);
  ELSIF OLD.status IS DISTINCT FROM NEW.status
      OR OLD.client_update IS DISTINCT FROM NEW.client_update THEN
    INSERT INTO public.service_request_activity
      (request_id, actor_id, event_type, body, from_status, to_status)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_changed',
      NULLIF(btrim(NEW.client_update), ''),
      OLD.status,
      NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.record_service_request_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_request_activity_insert ON public.service_requests;
CREATE TRIGGER service_request_activity_insert
AFTER INSERT ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION eternyx_private.record_service_request_activity();

DROP TRIGGER IF EXISTS service_request_activity_status ON public.service_requests;
CREATE TRIGGER service_request_activity_status
AFTER UPDATE OF status, client_update ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION eternyx_private.record_service_request_activity();

COMMENT ON TABLE public.service_request_activity IS
  'Append-only customer/admin service desk conversation and server-authored request history. No payments or binding agreements.';
