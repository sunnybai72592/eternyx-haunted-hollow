-- ETERNYX Wave 4 security case ledger — STAGED SQL PROPOSAL ONLY.
-- Do not run on production until a CLI-generated migration, staging RLS checks,
-- migrations history review, and two-account authorization tests are complete.
-- Depends on 20261111210000_pentest_engagement_management.sql and
-- 20261111220000_pentest_evidence_and_audit.sql.
-- No secrets, no public buckets, no service-role client grants, no automatic scan.

-- Composite owner/engagement keys block cross-user foreign-key laundering.
CREATE UNIQUE INDEX IF NOT EXISTS pentest_engagements_owner_pk_pair
  ON public.pentest_engagements(owner_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS pentest_evidence_owner_engagement_pk_triple
  ON public.pentest_evidence(owner_id, engagement_id, id);

CREATE TABLE IF NOT EXISTS public.security_case_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL,
  target text NOT NULL CHECK (char_length(btrim(target)) BETWEEN 1 AND 500),
  steward text NOT NULL DEFAULT '' CHECK (char_length(steward) <= 120),
  criticality text NOT NULL DEFAULT 'medium'
    CHECK (criticality IN ('low','medium','high','critical')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_case_assets_parent_fk
    FOREIGN KEY (owner_id, engagement_id)
    REFERENCES public.pentest_engagements(owner_id, id) ON DELETE RESTRICT,
  CONSTRAINT security_case_assets_owner_engagement_id_unique
    UNIQUE (owner_id, engagement_id, id),
  CONSTRAINT security_case_assets_engagement_target_unique
    UNIQUE (owner_id, engagement_id, target)
);
CREATE INDEX IF NOT EXISTS security_case_assets_engagement_idx
  ON public.security_case_assets(owner_id, engagement_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.security_case_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  evidence text NOT NULL DEFAULT '' CHECK (char_length(evidence) <= 4000),
  recommendation text NOT NULL DEFAULT '' CHECK (char_length(recommendation) <= 4000),
  remediation_owner text NOT NULL DEFAULT ''
    CHECK (char_length(remediation_owner) <= 120),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in-progress','blocked','verified','accepted')),
  due_date date,
  retest_note text NOT NULL DEFAULT '' CHECK (char_length(retest_note) <= 2000),
  risk_acceptance_note text NOT NULL DEFAULT ''
    CHECK (char_length(risk_acceptance_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_case_finding_retest_evidence_check CHECK (
    status <> 'verified' OR (
      char_length(btrim(retest_note)) >= 12
      AND char_length(btrim(evidence)) >= 10
    )
  ),
  CONSTRAINT security_case_finding_risk_approval_check CHECK (
    status <> 'accepted' OR char_length(btrim(risk_acceptance_note)) >= 12
  ),
  CONSTRAINT security_case_findings_asset_fk
    FOREIGN KEY (owner_id, engagement_id, asset_id)
    REFERENCES public.security_case_assets(owner_id, engagement_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT security_case_findings_owner_engagement_id_unique
    UNIQUE(owner_id, engagement_id, id)
);
CREATE INDEX IF NOT EXISTS security_case_findings_asset_idx
  ON public.security_case_findings(owner_id, engagement_id, asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_case_findings_triage_idx
  ON public.security_case_findings(owner_id, engagement_id, status, severity, due_date);

-- Stored references to EXISTING private, immutable evidence metadata.
CREATE TABLE IF NOT EXISTS public.security_case_finding_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_case_finding_evidence_finding_fk
    FOREIGN KEY (owner_id, engagement_id, finding_id)
    REFERENCES public.security_case_findings(owner_id, engagement_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT security_case_finding_evidence_private_object_fk
    FOREIGN KEY (owner_id, engagement_id, evidence_id)
    REFERENCES public.pentest_evidence(owner_id, engagement_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT security_case_finding_evidence_unique
    UNIQUE(owner_id, engagement_id, finding_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS security_case_finding_evidence_lookup_idx
  ON public.security_case_finding_evidence(owner_id, engagement_id, finding_id);

-- Audit rows are inserted by triggers only. No app user may insert/update/delete.
CREATE TABLE IF NOT EXISTS public.security_case_finding_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','updated','evidence_linked')),
  previous_status text,
  new_status text,
  changed_fields text[] NOT NULL DEFAULT '{}'::text[],
  evidence_link_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_case_finding_history_finding_fk
    FOREIGN KEY (owner_id, engagement_id, finding_id)
    REFERENCES public.security_case_findings(owner_id, engagement_id, id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS security_case_finding_history_timeline_idx
  ON public.security_case_finding_history(owner_id, engagement_id, created_at DESC, id DESC);

-- Security invariant enforced by database trigger, not merely browser validation.
CREATE OR REPLACE FUNCTION public.security_case_guard_asset_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM (SELECT auth.uid())
    OR NOT EXISTS (
      SELECT 1 FROM public.pentest_engagements e
      WHERE e.id = NEW.engagement_id AND e.owner_id = NEW.owner_id
        AND e.authorization_attested = true
        AND e.authorization_attested_at IS NOT NULL
        AND e.status IN ('authorized','in_progress','on_hold','completed')
        AND NEW.target = ANY(e.scope_targets)
        AND NOT (NEW.target = ANY(e.excluded_targets))
    )
  THEN
    RAISE EXCEPTION 'Security asset is not within a currently attested owned engagement scope'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.security_case_guard_asset_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS security_case_guard_asset_scope_trg ON public.security_case_assets;
CREATE TRIGGER security_case_guard_asset_scope_trg BEFORE INSERT OR UPDATE
  ON public.security_case_assets FOR EACH ROW
  EXECUTE FUNCTION public.security_case_guard_asset_scope();

CREATE OR REPLACE FUNCTION public.security_case_guard_finding_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM (SELECT auth.uid())
    OR NOT EXISTS (
      SELECT 1 FROM public.security_case_assets a
      JOIN public.pentest_engagements e
        ON e.owner_id = a.owner_id AND e.id = a.engagement_id
      WHERE a.id = NEW.asset_id
        AND a.owner_id = NEW.owner_id
        AND a.engagement_id = NEW.engagement_id
        AND e.authorization_attested = true
        AND e.authorization_attested_at IS NOT NULL
        AND e.status IN ('authorized','in_progress','on_hold','completed')
        AND a.target = ANY(e.scope_targets)
        AND NOT (a.target = ANY(e.excluded_targets))
    )
  THEN
    RAISE EXCEPTION 'Finding cannot be written outside a currently attested owned asset scope'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.security_case_guard_finding_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS security_case_guard_finding_scope_trg ON public.security_case_findings;
CREATE TRIGGER security_case_guard_finding_scope_trg BEFORE INSERT OR UPDATE
  ON public.security_case_findings FOR EACH ROW
  EXECUTE FUNCTION public.security_case_guard_finding_scope();

-- History contains status transitions and field names, not whole secret evidence.
CREATE OR REPLACE FUNCTION public.security_case_record_finding_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_fields text[] := '{}'::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_fields := ARRAY['title','severity','status'];
    INSERT INTO public.security_case_finding_history
      (owner_id, engagement_id, finding_id, actor_id, event_type, new_status, changed_fields)
    VALUES (NEW.owner_id, NEW.engagement_id, NEW.id, auth.uid(), 'created', NEW.status, v_fields);
    RETURN NEW;
  END IF;

  v_fields := array_remove(ARRAY[
    CASE WHEN OLD.title IS DISTINCT FROM NEW.title THEN 'title'::text END,
    CASE WHEN OLD.severity IS DISTINCT FROM NEW.severity THEN 'severity'::text END,
    CASE WHEN OLD.evidence IS DISTINCT FROM NEW.evidence THEN 'evidence'::text END,
    CASE WHEN OLD.recommendation IS DISTINCT FROM NEW.recommendation THEN 'recommendation'::text END,
    CASE WHEN OLD.remediation_owner IS DISTINCT FROM NEW.remediation_owner THEN 'remediation_owner'::text END,
    CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status'::text END,
    CASE WHEN OLD.due_date IS DISTINCT FROM NEW.due_date THEN 'due_date'::text END,
    CASE WHEN OLD.retest_note IS DISTINCT FROM NEW.retest_note THEN 'retest_note'::text END,
    CASE WHEN OLD.risk_acceptance_note IS DISTINCT FROM NEW.risk_acceptance_note THEN 'risk_acceptance_note'::text END
  ], NULL);

  IF cardinality(v_fields) > 0 THEN
    INSERT INTO public.security_case_finding_history
      (owner_id, engagement_id, finding_id, actor_id, event_type,
       previous_status, new_status, changed_fields)
    VALUES (NEW.owner_id, NEW.engagement_id, NEW.id, auth.uid(), 'updated',
            OLD.status, NEW.status, v_fields);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.security_case_record_finding_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS security_case_record_finding_history_trg ON public.security_case_findings;
CREATE TRIGGER security_case_record_finding_history_trg
  AFTER INSERT OR UPDATE ON public.security_case_findings FOR EACH ROW
  EXECUTE FUNCTION public.security_case_record_finding_history();

CREATE OR REPLACE FUNCTION public.security_case_record_evidence_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.security_case_finding_history
    (owner_id, engagement_id, finding_id, actor_id, event_type,
     changed_fields, evidence_link_id)
  VALUES (NEW.owner_id, NEW.engagement_id, NEW.finding_id, auth.uid(),
          'evidence_linked', ARRAY['evidence_id'], NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.security_case_record_evidence_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS security_case_record_evidence_link_trg ON public.security_case_finding_evidence;
CREATE TRIGGER security_case_record_evidence_link_trg
  AFTER INSERT ON public.security_case_finding_evidence FOR EACH ROW
  EXECUTE FUNCTION public.security_case_record_evidence_link();

-- RLS is always enabled on exposed public-schema tables before grants.
ALTER TABLE public.security_case_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_case_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_case_finding_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_case_finding_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.security_case_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_case_findings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_case_finding_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_case_finding_history FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.security_case_assets TO authenticated;
GRANT INSERT (owner_id, engagement_id, target, steward, criticality, notes)
  ON TABLE public.security_case_assets TO authenticated;
GRANT UPDATE (steward, criticality, notes)
  ON TABLE public.security_case_assets TO authenticated;

GRANT SELECT ON TABLE public.security_case_findings TO authenticated;
GRANT INSERT (owner_id, engagement_id, asset_id, title, severity, evidence,
  recommendation, remediation_owner, status, due_date, retest_note, risk_acceptance_note)
  ON TABLE public.security_case_findings TO authenticated;
GRANT UPDATE (title, severity, evidence, recommendation, remediation_owner,
  status, due_date, retest_note, risk_acceptance_note)
  ON TABLE public.security_case_findings TO authenticated;

GRANT SELECT ON TABLE public.security_case_finding_evidence TO authenticated;
GRANT INSERT (owner_id, engagement_id, finding_id, evidence_id)
  ON TABLE public.security_case_finding_evidence TO authenticated;
GRANT SELECT ON TABLE public.security_case_finding_history TO authenticated;

CREATE POLICY "Owned security case assets read" ON public.security_case_assets
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY "Owned security case assets insert" ON public.security_case_assets
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "Owned security case assets update" ON public.security_case_assets
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "Owned security case findings read" ON public.security_case_findings
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY "Owned security case findings insert" ON public.security_case_findings
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "Owned security case findings update" ON public.security_case_findings
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "Owned security evidence references read" ON public.security_case_finding_evidence
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY "Owned security evidence references insert" ON public.security_case_finding_evidence
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.security_case_findings f
      JOIN public.security_case_assets a
        ON a.owner_id = f.owner_id AND a.engagement_id = f.engagement_id
       AND a.id = f.asset_id
      JOIN public.pentest_engagements e
        ON e.owner_id = a.owner_id AND e.id = a.engagement_id
      WHERE f.id = finding_id
        AND f.owner_id = security_case_finding_evidence.owner_id
        AND f.engagement_id = security_case_finding_evidence.engagement_id
        AND e.authorization_attested = true
        AND e.authorization_attested_at IS NOT NULL
        AND e.status IN ('authorized','in_progress','on_hold','completed')
        AND a.target = ANY(e.scope_targets)
        AND NOT (a.target = ANY(e.excluded_targets))
    )
  );
CREATE POLICY "Owned security finding history read" ON public.security_case_finding_history
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

COMMENT ON TABLE public.security_case_assets IS
  'Owner-scoped relational assets, limited to an attested pentest engagement target. Not an automated discovery inventory.';
COMMENT ON TABLE public.security_case_findings IS
  'Owner-scoped analyst findings; retest and risk acceptance are unverified user-provided records.';
COMMENT ON TABLE public.security_case_finding_history IS
  'Trigger-written, app-read-only change history; altered field names and status changes only, not full evidence bodies.';
COMMENT ON TABLE public.security_case_finding_evidence IS
  'Owner-composite references to existing private pentest evidence, never public file URLs.';
