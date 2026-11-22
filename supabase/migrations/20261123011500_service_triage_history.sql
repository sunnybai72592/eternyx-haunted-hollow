-- ETERNYX Services Phase 9: private append-only operator accountability.
-- Requires service_review_planner.sql. Does not change customer-visible status.
-- Historical text notes are intentionally NOT copied to this log; the flag
-- records that the note changed without duplicating confidential content.

CREATE TABLE IF NOT EXISTS public.service_triage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('created', 'updated')),
  old_priority text,
  new_priority text NOT NULL,
  old_assigned_admin_id uuid,
  new_assigned_admin_id uuid,
  old_next_action_kind text,
  new_next_action_kind text NOT NULL,
  old_next_review_on date,
  new_next_review_on date,
  internal_note_changed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_triage_history_request_latest_idx
  ON public.service_triage_history(request_id, created_at DESC, id DESC);

ALTER TABLE public.service_triage_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_triage_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_triage_history TO authenticated;

CREATE POLICY "service_triage_history_admin_read"
  ON public.service_triage_history FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- No direct INSERT, UPDATE, or DELETE grants/policies to authenticated users.
-- This function is private, never exposed as a public RPC, and writes only
-- metadata from a committed triage row change. Owner RLS on triage remains.
CREATE OR REPLACE FUNCTION eternyx_private.record_service_triage_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  previous_priority text;
  previous_admin uuid;
  previous_action text;
  previous_review date;
  note_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.priority, OLD.assigned_admin_id, OLD.internal_note, OLD.next_action_kind, OLD.next_review_on)
       IS NOT DISTINCT FROM
       ROW(NEW.priority, NEW.assigned_admin_id, NEW.internal_note, NEW.next_action_kind, NEW.next_review_on)
    THEN
      RETURN NEW;
    END IF;
    previous_priority := OLD.priority;
    previous_admin := OLD.assigned_admin_id;
    previous_action := OLD.next_action_kind;
    previous_review := OLD.next_review_on;
    note_changed := OLD.internal_note IS DISTINCT FROM NEW.internal_note;
  ELSE
    note_changed := NEW.internal_note <> '';
  END IF;

  INSERT INTO public.service_triage_history (
    request_id, actor_id, operation,
    old_priority, new_priority,
    old_assigned_admin_id, new_assigned_admin_id,
    old_next_action_kind, new_next_action_kind,
    old_next_review_on, new_next_review_on,
    internal_note_changed
  )
  VALUES (
    NEW.request_id, auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    previous_priority, NEW.priority,
    previous_admin, NEW.assigned_admin_id,
    previous_action, NEW.next_action_kind,
    previous_review, NEW.next_review_on,
    note_changed
  );

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.record_service_triage_history()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_triage_history_after_write ON public.service_request_triage;
CREATE TRIGGER service_triage_history_after_write
AFTER INSERT OR UPDATE ON public.service_request_triage
FOR EACH ROW EXECUTE FUNCTION eternyx_private.record_service_triage_history();

COMMENT ON TABLE public.service_triage_history IS
  'Server-authored append-only history of admin triage decisions; visible only to verified admins. No customer SLAs or contracts.';
COMMENT ON COLUMN public.service_triage_history.internal_note_changed IS
  'True when internal note text changed; the private note content itself is deliberately not duplicated.';
