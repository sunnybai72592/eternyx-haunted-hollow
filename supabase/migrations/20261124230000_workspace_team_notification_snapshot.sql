-- Workspace Phase 20: consistent, authenticated notification snapshots.
-- Requires Phases 17-19; no changes to personal Workspace or Storage.
-- SQL STABLE SELECT uses a single PostgreSQL statement snapshot for all fields.
CREATE OR REPLACE FUNCTION public.workspace_team_notification_snapshot(
  p_space_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $notification_snapshot$
  SELECT pg_catalog.jsonb_build_object(
    'last_seen_event_id', COALESCE(c.last_seen_event_id,0),
    'unread_count', (
      SELECT count(*) FROM public.workspace_team_events e
      WHERE e.space_id=m.space_id
        AND e.actor_id<>m.user_id
        AND e.created_at>=m.joined_at
        AND e.id>COALESCE(c.last_seen_event_id,0)
    ),
    'latest_event_id', (
      SELECT max(e.id) FROM public.workspace_team_events e
      WHERE e.space_id=m.space_id
    )
  )
  FROM public.workspace_team_members m
  LEFT JOIN public.workspace_team_read_cursors c
    ON c.space_id=m.space_id AND c.user_id=m.user_id
  WHERE m.space_id=p_space_id AND m.user_id=(SELECT auth.uid())
  LIMIT 1;
$notification_snapshot$;
REVOKE ALL ON FUNCTION public.workspace_team_notification_snapshot(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_team_notification_snapshot(uuid)
  TO authenticated;
