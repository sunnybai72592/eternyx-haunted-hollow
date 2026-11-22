import { supabase } from "@/integrations/supabase/client";
import { publicationRpcEnabled } from "@/lib/educationPublicationRpc";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const writtenReviewEnabled = publicationRpcEnabled &&
  import.meta.env.VITE_EDUCATION_WRITTEN_REVIEW_RPC === "true";

export type WrittenResponseReview = {
  answer_id: string; attempt_id: string; test_id: string;
  test_title: string; question_text: string; response_text: string;
  points_possible: number; reviewed_points: number | null;
  reviewed_at: string | null;
};
type RpcResponse<T> = { data: T | null; error: { message: string } | null };

async function rpc<T>(name: string, parameters?: Record<string, unknown>): Promise<T> {
  if (!writtenReviewEnabled) throw new Error("Written review is not configured.");
  const call = supabase.rpc.bind(supabase) as unknown as
    (name: string, args?: Record<string, unknown>) => Promise<RpcResponse<T>>;
  const { data, error } = await call(name, parameters);
  if (error || data === null) throw new Error("Written-review service did not confirm the request.");
  return data;
}

function validRow(row: unknown): row is WrittenResponseReview {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return ["answer_id", "attempt_id", "test_id"].every(id =>
      typeof r[id] === "string" && uuid.test(r[id] as string)) &&
    ["test_title", "question_text", "response_text"].every(key =>
      typeof r[key] === "string" && (r[key] as string).length < 6000) &&
    Number.isInteger(r.points_possible) &&
    (r.points_possible as number) >= 1 && (r.points_possible as number) <= 1000 &&
    (r.reviewed_points === null || (Number.isInteger(r.reviewed_points) &&
      (r.reviewed_points as number) >= 0 && (r.reviewed_points as number) <= (r.points_possible as number))) &&
    (r.reviewed_at === null || (typeof r.reviewed_at === "string" && Number.isFinite(Date.parse(r.reviewed_at))));
}

export async function getWrittenReviewQueue(): Promise<WrittenResponseReview[]> {
  const rows = await rpc<unknown>("education_instructor_written_review_queue");
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(r => !validRow(r))) {
    throw new Error("Invalid written response review data.");
  }
  return rows as WrittenResponseReview[];
}

export async function saveWrittenReview(answerId: string, points: number): Promise<void> {
  if (!uuid.test(answerId) || !Number.isInteger(points) || points < 0 || points > 1000) {
    throw new Error("Provide a valid answer and whole-number mark.");
  }
  const result = await rpc<unknown>("education_instructor_review_written_answer",
    { p_answer_id: answerId, p_points: points });
  if (!result || typeof result !== "object") throw new Error("Invalid review confirmation.");
  const r = result as Record<string, unknown>;
  if (r.answer_id !== answerId || r.points_awarded !== points ||
      r.status !== "review_recorded" || r.official_score_updated !== false) {
    throw new Error("Written review was not confirmed by the server.");
  }
}
