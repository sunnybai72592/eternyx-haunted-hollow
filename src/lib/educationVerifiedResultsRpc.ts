import { supabase } from "@/integrations/supabase/client";
import { writtenReviewEnabled } from "@/lib/educationWrittenReviewRpc";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** All preceding Education staging services must be enabled together. */
export const verifiedStudentResultsEnabled = writtenReviewEnabled &&
  import.meta.env.VITE_EDUCATION_VERIFIED_RESULTS_RPC === "true";

export type VerifiedEducationReceipt = {
  attempt_id: string;
  grade_status: "finalized" | "pending_review" | "in_progress";
  score: number | null;
  max_score: number | null;
  finalized_at: string | null;
};
type RpcResult = { data: unknown; error: { message: string } | null };

export async function readVerifiedStudentGrade(attemptId: string): Promise<VerifiedEducationReceipt> {
  if (!verifiedStudentResultsEnabled) {
    throw new Error("Verified Education results are not configured.");
  }
  if (!uuid.test(attemptId)) throw new Error("A valid attempt ID is required.");
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  const { data, error } = await rpc("education_student_verified_result",
    { p_attempt_id: attemptId });
  if (error || !data || typeof data !== "object") {
    throw new Error("Official grade verification is unavailable.");
  }
  const record = data as Record<string, unknown>;
  if (record.attempt_id !== attemptId ||
      !["finalized", "pending_review", "in_progress"].includes(String(record.grade_status))) {
    throw new Error("Official grade verification returned an invalid receipt.");
  }
  if (record.grade_status === "finalized") {
    if (!Number.isSafeInteger(record.score) || !Number.isSafeInteger(record.max_score) ||
        (record.score as number) < 0 || (record.max_score as number) < 1 ||
        (record.score as number) > (record.max_score as number) ||
        typeof record.finalized_at !== "string" ||
        !Number.isFinite(Date.parse(record.finalized_at))) {
      throw new Error("Finalized grade receipt is inconsistent.");
    }
  } else if (record.score !== null || record.max_score !== null ||
             record.finalized_at !== null) {
    throw new Error("Pending grade receipt contained unverifiable marks.");
  }
  return record as VerifiedEducationReceipt;
}
