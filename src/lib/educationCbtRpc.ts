import { supabase } from "@/integrations/supabase/client";

export type CbtAttempt = { id: string; start_time: string; status: string };
export type CbtSaveOutcome = { status: "saved" | "cleared" | "expired" | "already_submitted" };
export type CbtSubmitOutcome = { id: string; status: "submitted" | "auto_submitted" | "in_progress" };

type RpcResponse<T> = { data: T | null; error: { message: string } | null };

/**
 * Staging-gated until reviewed SQL functions, column grants and browser auth
 * are deployed together. Existing production remains on its current path.
 */
export const atomicCbtEnabled = import.meta.env.VITE_CBT_ATOMIC_RPC === "true";

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // The generated Database types must be regenerated after the staging SQL
  // rollout; this narrow adapter keeps the provisional RPC types local.
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResponse<T>>;
  const { data, error } = await rpc(name, args);
  if (error || !data) throw new Error(error?.message || "CBT server did not return a result.");
  return data;
}

export function startCbtAttempt(testId: string) {
  return callRpc<CbtAttempt>("start_cbt_attempt", { p_test_id: testId });
}

export async function saveCbtAnswer(attemptId: string, answer: {
  questionId: string; selectedOptionId?: string; shortAnswer?: string;
}) {
  const result = await callRpc<CbtSaveOutcome>("save_cbt_answer", {
    p_attempt_id: attemptId,
    p_question_id: answer.questionId,
    p_selected_option_id: answer.selectedOptionId || null,
    p_short_answer_text: answer.shortAnswer || null,
  });
  if (!["saved", "cleared"].includes(result.status)) {
    throw new Error("This answer was not saved: attempt ended or expired.");
  }
  return result;
}

export function submitCbtAttempt(attemptId: string) {
  return callRpc<CbtSubmitOutcome>("submit_cbt_attempt", { p_attempt_id: attemptId });
}
