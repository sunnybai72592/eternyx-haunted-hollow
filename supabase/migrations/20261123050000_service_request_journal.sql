-- ETERNYX Services Phase 14: unified, participant-private activity journal.
-- Requires Phases 1-13 (including service_brief_amendments).
-- This is a read-only SECURITY INVOKER view: source-table RLS remains in
-- force and the original activity, scope, clarification and amendment rows
-- are never copied, rewritten, or given additional client permissions.
-- Internal triage notes, assignments, priorities, admin review targets,
-- tokens, payments and private operator audit history are NEVER included.

CREATE OR REPLACE VIEW public.service_request_journal
WITH (security_invoker = true) AS
SELECT
  e.request_id, e.event_key, e.actor_id, e.occurred_at,
  e.stream, e.event_kind, e.title, e.detail
FROM (
  SELECT
    a.request_id,
    ('activity:' || a.id::text) AS event_key,
    a.actor_id,
    a.created_at AS occurred_at,
    'conversation'::text AS stream,
    a.event_type::text AS event_kind,
    CASE a.event_type
      WHEN 'message' THEN 'Conversation message'
      WHEN 'request_created' THEN 'Request submitted'
      ELSE 'Status or customer update recorded'
    END AS title,
    CASE a.event_type
      WHEN 'status_changed' THEN
        'Status: ' || coalesce(a.from_status,'unspecified') ||
        ' → ' || coalesce(a.to_status,'unspecified') ||
        CASE WHEN a.body IS NOT NULL AND btrim(a.body) <> ''
          THEN E'\n' || a.body ELSE '' END
      WHEN 'request_created' THEN 'Initial service request recorded'
      ELSE a.body
    END AS detail
  FROM public.service_request_activity a

  UNION ALL
  SELECT
    v.request_id,
    ('scope-review:' || v.id::text),
    v.author_id, v.created_at,
    'scope'::text, 'scope_published'::text,
    'Scope review published'::text,
    v.scope_summary
  FROM public.service_scope_reviews v

  UNION ALL
  SELECT
    v.request_id,
    ('scope-response:' || s.id::text),
    s.user_id, s.created_at,
    'scope'::text, 'scope_response'::text,
    CASE s.kind
      WHEN 'ready_to_discuss' THEN 'Customer ready to discuss scope'
      WHEN 'request_changes' THEN 'Customer requested scope changes'
      ELSE 'Customer opted not to proceed'
    END,
    s.note
  FROM public.service_scope_responses s
  JOIN public.service_scope_reviews v ON v.id = s.review_id

  UNION ALL
  SELECT
    q.request_id,
    ('question:' || q.id::text),
    q.author_id, q.created_at,
    'clarifications'::text, 'question_published'::text,
    'Clarification question published'::text,
    q.prompt
  FROM public.service_clarification_questions q

  UNION ALL
  SELECT
    q.request_id,
    ('answer:' || a.id::text),
    a.author_id, a.created_at,
    'clarifications'::text, 'answer_submitted'::text,
    'Customer answered clarification'::text,
    a.answer
  FROM public.service_clarification_answers a
  JOIN public.service_clarification_questions q ON q.id = a.question_id

  UNION ALL
  SELECT
    q.request_id,
    ('question-closed:' || q.id::text),
    q.closed_by, q.closed_at,
    'clarifications'::text, 'question_closed'::text,
    'Clarification marked closed'::text,
    'Administrator closed a clarification question; this does not approve a contract.'
  FROM public.service_clarification_questions q
  WHERE q.state = 'closed' AND q.closed_at IS NOT NULL

  UNION ALL
  SELECT
    a.request_id,
    ('amendment:' || a.id::text),
    a.author_id, a.created_at,
    'brief_changes'::text, 'amendment_submitted'::text,
    'Customer submitted a brief change'::text,
    a.summary || E'\n' || a.details
  FROM public.service_brief_amendments a

  UNION ALL
  SELECT
    a.request_id,
    ('amendment-reviewed:' || a.id::text),
    a.reviewed_by, a.reviewed_at,
    'brief_changes'::text, 'amendment_reviewed'::text,
    'Administrator acknowledged a brief change'::text,
    'Review was recorded; the scope or service has not been approved.'
  FROM public.service_brief_amendments a
  WHERE a.status = 'reviewed' AND a.reviewed_at IS NOT NULL
) e
WHERE EXISTS (
  SELECT 1 FROM public.service_requests r
  WHERE r.id = e.request_id AND
    (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
);

REVOKE ALL ON public.service_request_journal FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_request_journal TO authenticated;
COMMENT ON VIEW public.service_request_journal IS
  'Read-only owner/admin service activity from persisted participant-visible sources; omits all internal triage and administrative audit material. No read receipts or service commitments.';
