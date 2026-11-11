-- Align AI ownership foreign keys with Supabase Auth, the identity
-- source used by the application and by the AI Edge Function.
--
-- The live database audit confirmed that all three AI tables currently
-- reference public.users(id), while authenticated users exist in auth.users.
-- The AI tables are currently empty, so this forward migration preserves
-- their schema and data while correcting only the ownership relationships.

BEGIN;

ALTER TABLE public.ai_documents
  DROP CONSTRAINT IF EXISTS ai_documents_user_id_fkey,
  ADD CONSTRAINT ai_documents_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.conversation_sessions
  DROP CONSTRAINT IF EXISTS conversation_sessions_user_id_fkey,
  ADD CONSTRAINT conversation_sessions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.chat_history
  DROP CONSTRAINT IF EXISTS chat_history_user_id_fkey,
  ADD CONSTRAINT chat_history_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

COMMIT;
