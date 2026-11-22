-- ETERNYX Services Phase 11 — structured, private request clarification.
-- Questions are admin-authored. Each question accepts one immutable owner reply.
-- Closing a question is not an acceptance, contractual approval or SLA.
-- Apply only after 20261123014500_service_request_checkpoints.sql.

CREATE TABLE IF NOT EXISTS public.service_clarification_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 15 AND 1500),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id),
  CONSTRAINT service_clarification_close_consistency CHECK (
    (state = 'open' AND closed_at IS NULL AND closed_by IS NULL)
    OR (state = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS service_clarification_request_created_idx
  ON public.service_clarification_questions(request_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS service_clarification_open_request_idx
  ON public.service_clarification_questions(request_id)
  WHERE state = 'open';

ALTER TABLE public.service_clarification_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_clarification_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_clarification_questions TO authenticated;
GRANT INSERT (request_id, author_id, prompt)
  ON public.service_clarification_questions TO authenticated;
GRANT UPDATE (state) ON public.service_clarification_questions TO authenticated;

CREATE POLICY "service_clarification_question_read_participants"
  ON public.service_clarification_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests r
      WHERE r.id = request_id AND
        (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );

CREATE POLICY "service_clarification_question_create_admin"
  ON public.service_clarification_questions FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND (SELECT public.is_admin())
    AND EXISTS (SELECT 1 FROM public.service_requests r WHERE r.id = request_id)
  );

CREATE POLICY "service_clarification_question_close_admin"
  ON public.service_clarification_questions FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Trigger owns closure metadata and disallows reopening. The web client
-- cannot spoof who closed a question or retroactively alter its prompt.
CREATE OR REPLACE FUNCTION eternyx_private.close_service_clarification()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF OLD.state <> 'open' OR NEW.state <> 'closed'
    OR NOT (SELECT public.is_admin()) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Clarification state change not permitted'
      USING ERRCODE='42501';
  END IF;
  NEW.closed_at := pg_catalog.clock_timestamp();
  NEW.closed_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.close_service_clarification()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_clarification_close_stamp ON public.service_clarification_questions;
CREATE TRIGGER service_clarification_close_stamp
BEFORE UPDATE OF state ON public.service_clarification_questions
FOR EACH ROW EXECUTE FUNCTION eternyx_private.close_service_clarification();

CREATE TABLE IF NOT EXISTS public.service_clarification_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE REFERENCES public.service_clarification_questions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  answer text NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 10 AND 2500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_clarification_answer_author_idx
  ON public.service_clarification_answers(author_id, created_at DESC);
ALTER TABLE public.service_clarification_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_clarification_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_clarification_answers TO authenticated;
GRANT INSERT (question_id, author_id, answer)
  ON public.service_clarification_answers TO authenticated;

CREATE POLICY "service_clarification_answer_read_participants"
  ON public.service_clarification_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_clarification_questions q
      JOIN public.service_requests r ON r.id = q.request_id
      WHERE q.id = question_id AND
        (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );

CREATE POLICY "service_clarification_answer_create_owner"
  ON public.service_clarification_answers FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.service_clarification_questions q
      JOIN public.service_requests r ON r.id = q.request_id
      WHERE q.id = question_id AND q.state = 'open'
        AND r.user_id = (SELECT auth.uid())
    )
  );

-- Complementary real-work queues, retaining all previous metadata and
-- signals. Security-invoker views inherit the underlying RLS policies.
-- A customer sees only their own requests; only admins get the admin view.
CREATE OR REPLACE VIEW public.service_customer_clarification_queue
WITH (security_invoker = true) AS
SELECT q.*,
  counts.open_clarification_count,
  counts.awaiting_customer_count,
  counts.awaiting_admin_review_count
FROM public.service_customer_check_queue q
CROSS JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE c.state = 'open')::integer AS open_clarification_count,
    COUNT(*) FILTER (WHERE c.state = 'open' AND a.id IS NULL)::integer AS awaiting_customer_count,
    COUNT(*) FILTER (WHERE c.state = 'open' AND a.id IS NOT NULL)::integer AS awaiting_admin_review_count
  FROM public.service_clarification_questions c
  LEFT JOIN public.service_clarification_answers a ON a.question_id = c.id
  WHERE c.request_id = q.id
) counts;

REVOKE ALL ON public.service_customer_clarification_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_customer_clarification_queue TO authenticated;

CREATE OR REPLACE VIEW public.service_admin_clarification_queue
WITH (security_invoker = true) AS
SELECT q.*,
  counts.open_clarification_count,
  counts.awaiting_customer_count,
  counts.awaiting_admin_review_count
FROM public.service_admin_check_queue q
CROSS JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE c.state = 'open')::integer AS open_clarification_count,
    COUNT(*) FILTER (WHERE c.state = 'open' AND a.id IS NULL)::integer AS awaiting_customer_count,
    COUNT(*) FILTER (WHERE c.state = 'open' AND a.id IS NOT NULL)::integer AS awaiting_admin_review_count
  FROM public.service_clarification_questions c
  LEFT JOIN public.service_clarification_answers a ON a.question_id = c.id
  WHERE c.request_id = q.id
) counts
WHERE (SELECT public.is_admin());

REVOKE ALL ON public.service_admin_clarification_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_admin_clarification_queue TO authenticated;

COMMENT ON TABLE public.service_clarification_questions IS
  'Admin-authored service request clarification questions; private to request participants, no contract.';
COMMENT ON TABLE public.service_clarification_answers IS
  'One immutable customer reply per clarification question, scoped to the owning request.';
COMMENT ON VIEW public.service_customer_clarification_queue IS
  'Owner-only real clarification counts; no fabricated response or delivery commitments.';
COMMENT ON VIEW public.service_admin_clarification_queue IS
  'Admin-only real clarification counts, while preserving existing service-desk queue fields.';
