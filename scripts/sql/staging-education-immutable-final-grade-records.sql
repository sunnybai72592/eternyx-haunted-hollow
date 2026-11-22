-- ETERNYX Education — STAGING/REVIEW ONLY: irrevocable final-grade state.
-- Install AFTER all existing coordinated CBT, trusted finalizer and verified
-- result scripts. This is NOT an automatic production migration.
--
-- Defense in depth: an official grading ledger must never be edited in place;
-- a finalized attempt and its answers must never be mutated directly, even
-- by an accidental trusted database-owner write.
--
-- PostgreSQL superusers or owners with ALTER TABLE permission can DISABLE
-- triggers; this is a database integrity control, not a substitute for
-- production change management and protected administrator credentials.
BEGIN;

-- Make existing grade receipts append-only. There is intentionally no
-- maintenance bypass: approved deletion/erasure requires a separately
-- reviewed retention and integrity migration, not an ordinary application RPC.
CREATE OR REPLACE FUNCTION public.education_block_final_grade_ledger_rewrite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $lock$
BEGIN
  RAISE EXCEPTION 'Official final-grade ledger is append-only'
    USING ERRCODE = '22023';
END;
$lock$;
REVOKE ALL ON FUNCTION public.education_block_final_grade_ledger_rewrite()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS education_immutable_final_grade_row
  ON public.education_final_grades;
CREATE TRIGGER education_immutable_final_grade_row
  BEFORE UPDATE OR DELETE ON public.education_final_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.education_block_final_grade_ledger_rewrite();

-- Serialize with trusted finalization using the same attempt row lock.
-- The official finalizer updates answer/attempt grades BEFORE the ledger
-- insertion; once the ledger is committed, every edit is forbidden,
-- including otherwise harmless no-op updates and new answers.
CREATE OR REPLACE FUNCTION public.education_block_finalized_attempt_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $lock$
DECLARE
  v_attempt_id uuid;
BEGIN
  v_attempt_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  IF EXISTS (SELECT 1 FROM public.education_final_grades AS f
             WHERE f.attempt_id = v_attempt_id) THEN
    RAISE EXCEPTION 'Finalized Education attempt cannot be modified'
      USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Education attempt identity cannot be reassigned'
      USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$lock$;
REVOKE ALL ON FUNCTION public.education_block_finalized_attempt_change()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS education_immutable_finalized_attempt
  ON public.user_attempts;
CREATE TRIGGER education_immutable_finalized_attempt
  BEFORE UPDATE OR DELETE ON public.user_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.education_block_finalized_attempt_change();

CREATE OR REPLACE FUNCTION public.education_block_finalized_answer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $lock$
DECLARE
  v_attempt_id uuid;
BEGIN
  v_attempt_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.attempt_id ELSE NEW.attempt_id END;
  -- Always lock the parent before deciding. If a grader currently holds the
  -- parent lock, this reader waits until the ledger is committed.
  PERFORM 1 FROM public.user_attempts AS a
    WHERE a.id = v_attempt_id FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Education answer must reference an existing attempt'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.education_final_grades AS f
             WHERE f.attempt_id = v_attempt_id) THEN
    RAISE EXCEPTION 'Finalized Education answer cannot be modified'
      USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND
      (NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Education answer ownership cannot be reassigned'
      USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$lock$;
REVOKE ALL ON FUNCTION public.education_block_finalized_answer_change()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS education_immutable_finalized_answer
  ON public.user_answers;
CREATE TRIGGER education_immutable_finalized_answer
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.education_block_finalized_answer_change();

-- Row-level triggers do not fire during TRUNCATE. Refuse any bulk TRUNCATE
-- of the ledger, answers or attempts while even one official grade exists.
-- This also prevents silent cascade erasure during ordinary maintenance.
CREATE OR REPLACE FUNCTION public.education_block_final_grade_bulk_erasure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $lock$
BEGIN
  IF EXISTS (SELECT 1 FROM public.education_final_grades) THEN
    RAISE EXCEPTION 'Final-grade retention review required before bulk erasure'
      USING ERRCODE = '22023';
  END IF;
  RETURN NULL;
END;
$lock$;
REVOKE ALL ON FUNCTION public.education_block_final_grade_bulk_erasure()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS education_block_grade_truncate
  ON public.education_final_grades;
CREATE TRIGGER education_block_grade_truncate
  BEFORE TRUNCATE ON public.education_final_grades
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.education_block_final_grade_bulk_erasure();
DROP TRIGGER IF EXISTS education_block_attempt_truncate
  ON public.user_attempts;
CREATE TRIGGER education_block_attempt_truncate
  BEFORE TRUNCATE ON public.user_attempts
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.education_block_final_grade_bulk_erasure();
DROP TRIGGER IF EXISTS education_block_answer_truncate
  ON public.user_answers;
CREATE TRIGGER education_block_answer_truncate
  BEFORE TRUNCATE ON public.user_answers
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.education_block_final_grade_bulk_erasure();

-- Existing RLS, browser grants and service-only finalizer rules are preserved.
-- Caller must audit SQL owner trust, pg_trigger state and dependent functions
-- before separately approving any staging deployment.
COMMIT;
