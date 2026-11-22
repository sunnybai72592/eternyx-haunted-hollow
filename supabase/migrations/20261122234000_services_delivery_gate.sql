-- Services release safety: do not let a review-only request claim live
-- delivery or completion until an approved agreement/fulfillment module exists.
-- Prerequisite: 20261122201000_service_requests.sql.
--
-- A public scope review or customer interest is NOT a signed statement of work.
-- This constraint is intentional until an explicitly approved launch migration
-- introduces independently verified authorization and service delivery records.

CREATE OR REPLACE FUNCTION eternyx_private.prevent_unverified_service_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION
      'Service delivery status unavailable until a separately verified agreement and delivery workflow is deployed'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.prevent_unverified_service_delivery()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_requests_delivery_gate ON public.service_requests;
CREATE TRIGGER service_requests_delivery_gate
BEFORE UPDATE OF status ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION eternyx_private.prevent_unverified_service_delivery();

COMMENT ON FUNCTION eternyx_private.prevent_unverified_service_delivery() IS
  'Fail closed: project intake, scopes and interest cannot automatically mark paid delivery in progress or completed.';