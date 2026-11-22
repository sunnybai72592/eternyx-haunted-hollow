import { supabase } from "@/integrations/supabase/client";
import { exportQuestionBankJson, parseQuestionBankJson } from "@/lib/educationQuestionBank.mjs";
import { atomicCbtEnabled } from "@/lib/educationCbtRpc";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

export type InstructorAccess = { approved: boolean };
export type InstructorDraft = {
  id: string; title: string; duration_minutes: number;
  created_at: string; status: "private_draft";
};
export type CreatedInstructorDraft = {
  id: string; status: "private_draft"; question_count: number;
};

// BOTH the approved authoring RPCs and the answer-key isolation/RLS rollout
// must be configured. Merely setting this flag never authorizes a student.
export const instructorRpcEnabled = atomicCbtEnabled &&
  import.meta.env.VITE_EDUCATION_INSTRUCTOR_RPC === "true";

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = supabase.rpc.bind(supabase) as unknown as
    (fn: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>;
  const { data, error } = await invoke(name, args);
  if (error || data === null) throw new Error(error?.message || "Instructor service unavailable.");
  return data;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function readInstructorAccess(): Promise<InstructorAccess> {
  const data = await rpc<InstructorAccess>("education_instructor_access");
  if (!data || typeof data.approved !== "boolean") throw new Error("Invalid instructor access response.");
  return { approved: data.approved };
}

export async function readInstructorDrafts(): Promise<InstructorDraft[]> {
  const rows = await rpc<unknown>("education_instructor_list_drafts");
  if (!Array.isArray(rows) || rows.length > 50 || rows.some(item =>
      !item || typeof item !== "object" || typeof item.id !== "string" ||
      !uuid.test(item.id) || typeof item.title !== "string" ||
      typeof item.duration_minutes !== "number" ||
      item.status !== "private_draft")) {
    throw new Error("Invalid instructor draft list returned by server.");
  }
  return rows as InstructorDraft[];
}

export async function createInstructorDraft(bank: unknown): Promise<CreatedInstructorDraft> {
  // The ready-only check MUST run before sending a bank with answer keys to
  // any server. On successful import, the server creates an unpublished test.
  const validated = JSON.parse(exportQuestionBankJson(bank, true));
  const data = await rpc<unknown>("education_instructor_create_draft", { p_bank: validated });
  if (!data || typeof data !== "object" ||
      !("id" in data) || typeof data.id !== "string" || !uuid.test(data.id) ||
      !("status" in data) || data.status !== "private_draft" ||
      !("question_count" in data) || !Number.isInteger(data.question_count) ||
      (data.question_count as number) < 1 || (data.question_count as number) > 100) {
    throw new Error("The instructor server did not confirm a private draft.");
  }
  return data as CreatedInstructorDraft;
}

export type LoadedInstructorDraft = {
  id: string; status: "private_draft";
  bank: ReturnType<typeof parseQuestionBankJson>;
};

/**
 * Fetch private answer-key material only by an explicit instructor action.
 * An approved server role + ownership check is mandatory on every request.
 */
export async function loadInstructorDraft(draftId: string): Promise<LoadedInstructorDraft> {
  if (!instructorRpcEnabled) throw new Error("Verified instructor draft recovery is not enabled.");
  if (!uuid.test(draftId)) throw new Error("Invalid private draft ID.");
  const data = await rpc<unknown>("education_instructor_load_draft", { p_test_id: draftId });
  if (!data || typeof data !== "object" ||
      !("id" in data) || data.id !== draftId ||
      !("status" in data) || data.status !== "private_draft" ||
      !("bank" in data)) {
    throw new Error("The instructor service returned an invalid private draft.");
  }
  // Round-trip through strict versioned schema validation before touching UI.
  const bank = parseQuestionBankJson(JSON.stringify(data.bank));
  return { id: draftId, status: "private_draft", bank };
}
