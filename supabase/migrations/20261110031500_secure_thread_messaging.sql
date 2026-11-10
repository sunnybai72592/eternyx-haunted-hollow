-- Messaging authorization is based on the authenticated user's profile row.
-- Both messages.sender_id and thread_participants.user_id reference profiles.id,
-- not auth.users.id.

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;

-- Remove existing policies so no permissive INSERT/ALL policy can remain.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('messages', 'thread_participants')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

-- Browser clients may read messages only when their own profile participates
-- in the message's thread.
CREATE POLICY "thread_members_can_read_messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.thread_participants AS tp
    JOIN public.profiles AS p ON p.id = tp.user_id
    WHERE tp.thread_id = messages.thread_id
      AND p.user_id = (SELECT auth.uid())
  )
);

-- A sender must be the caller's own profile, and that profile must be a
-- participant in the target thread.
CREATE POLICY "thread_members_can_send_own_messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS sender_profile
    JOIN public.thread_participants AS tp
      ON tp.user_id = sender_profile.id
    WHERE sender_profile.id = messages.sender_id
      AND sender_profile.user_id = (SELECT auth.uid())
      AND tp.thread_id = messages.thread_id
  )
);

-- Users can inspect only their own participant records. There is deliberately
-- no client INSERT/UPDATE/DELETE policy for thread_participants; invitations
-- and participant management must be performed by a trusted backend flow.
CREATE POLICY "users_can_read_own_thread_participation"
ON public.thread_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = thread_participants.user_id
      AND p.user_id = (SELECT auth.uid())
  )
);

-- Explicitly limit browser privileges. The service_role is not modified.
REVOKE ALL ON TABLE public.messages, public.thread_participants
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
GRANT SELECT ON TABLE public.thread_participants TO authenticated;

COMMENT ON TABLE public.thread_participants IS
  'Participant records are managed by trusted backend flows; authenticated clients can read only their own participation.';
