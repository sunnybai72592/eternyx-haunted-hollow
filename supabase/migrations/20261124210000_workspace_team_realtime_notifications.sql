-- Phase 19: per-member in-app notification read cursors and scoped Realtime delivery.
-- Apply only after Workspace Phase 17 and 18 in an approved staging environment.
-- This migration never exposes owner-only personal Workspace projects or files.
CREATE INDEX workspace_team_events_space_id_idx
  ON public.workspace_team_events(space_id,id DESC);

CREATE TABLE public.workspace_team_read_cursors (
  space_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_seen_event_id bigint NOT NULL DEFAULT 0 CHECK(last_seen_event_id>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(space_id,user_id),
  FOREIGN KEY(space_id,user_id)
    REFERENCES public.workspace_team_members(space_id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.workspace_team_read_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_team_read_cursors FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workspace_team_read_cursors TO authenticated;
CREATE POLICY workspace_team_read_cursor_self
  ON public.workspace_team_read_cursors FOR SELECT TO authenticated
  USING(user_id=(SELECT auth.uid())
    AND public.workspace_team_role(space_id) IS NOT NULL);

-- A read receipt can advance only to an event actually stored in that team.
-- Viewers can acknowledge events, including when a team is archived.
-- No browser may forge another account's cursor or modify the table directly.
CREATE OR REPLACE FUNCTION public.workspace_team_mark_events_seen(
  p_space_id uuid,p_event_id bigint
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $team_seen$
DECLARE
  v_actor uuid:=(SELECT auth.uid());
  v_latest bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sign in to acknowledge team activity' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_team_members
    WHERE space_id=p_space_id AND user_id=v_actor FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a current team member can acknowledge activity'
      USING ERRCODE='42501';
  END IF;
  IF p_event_id IS NULL OR p_event_id<=0
    OR NOT EXISTS (
      SELECT 1 FROM public.workspace_team_events
        WHERE space_id=p_space_id AND id=p_event_id
    ) THEN
    RAISE EXCEPTION 'Receipt must reference a real event in the selected team'
      USING ERRCODE='23514';
  END IF;
  INSERT INTO public.workspace_team_read_cursors(
    space_id,user_id,last_seen_event_id
  ) VALUES(p_space_id,v_actor,p_event_id)
  ON CONFLICT(space_id,user_id) DO UPDATE
    SET last_seen_event_id=GREATEST(
      public.workspace_team_read_cursors.last_seen_event_id,
      EXCLUDED.last_seen_event_id
    ), updated_at=now()
  RETURNING last_seen_event_id INTO v_latest;
  RETURN v_latest;
END;
$team_seen$;
REVOKE ALL ON FUNCTION public.workspace_team_mark_events_seen(uuid,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_team_mark_events_seen(uuid,bigint)
  TO authenticated;

-- Supabase production projects normally have this publication. Local isolated
-- PostgreSQL tests do not. Add ONLY the server-generated event table, not
-- private comments, membership secrets, read cursors, or personal files.
DO $workspace_realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication
    WHERE pubname='supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname='supabase_realtime'
        AND schemaname='public'
        AND tablename='workspace_team_events'
    ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_team_events';
  END IF;
END;
$workspace_realtime$;
