import { supabase } from "@/integrations/supabase/client";
import { instructorRpcEnabled } from "@/lib/educationInstructorRpc";
import { normalizeEducationTest } from "@/lib/educationCatalog.mjs";

type RpcResult<T> = { data: T | null; error: { message: string } | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * All three Education staging backends must be deployed and reviewed together.
 * The build flag changes client availability only, never server authorization.
 */
export const publicationRpcEnabled = instructorRpcEnabled &&
  import.meta.env.VITE_EDUCATION_PUBLICATION_RPC === "true";

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!publicationRpcEnabled) throw new Error("Reviewed publication is not configured.");
  const invoke = supabase.rpc.bind(supabase) as unknown as
    (fn: string, parameters?: Record<string, unknown>) => Promise<RpcResult<T>>;
  const { data, error } = await invoke(name, args);
  if (error || data === null) throw new Error(error?.message || "Publication service did not respond.");
  return data;
}

export type PublicationRequest = {
  test_id: string; title: string; teacher_id: string;
  requested_at: string; status: "pending";
};

function checkId(id: string) {
  if (!uuid.test(id)) throw new Error("A valid record ID is required.");
  return id;
}

export async function requestEducationPublication(testId: string) {
  const result = await rpc<{ test_id: string; status: string }>(
    "education_request_publication", { p_test_id: checkId(testId) });
  if (result?.test_id !== testId || result?.status !== "pending") {
    throw new Error("Server did not confirm the review request.");
  }
  return result;
}

export async function listEducationPublicationQueue(): Promise<PublicationRequest[]> {
  const result = await rpc<unknown>("education_admin_publication_queue");
  if (!Array.isArray(result) || result.length > 100 || result.some(row =>
    !row || typeof row !== "object" ||
    !uuid.test(row.test_id) || !uuid.test(row.teacher_id) ||
    typeof row.title !== "string" || row.status !== "pending" ||
    typeof row.requested_at !== "string")) {
    throw new Error("Invalid publication queue response.");
  }
  return result as PublicationRequest[];
}

export async function reviewEducationPublication(testId: string, approve: boolean) {
  const result = await rpc<{ test_id: string; status: string }>(
    "education_admin_review_publication",
    { p_test_id: checkId(testId), p_approve: approve });
  if (result?.test_id !== testId ||
      result?.status !== (approve ? "approved" : "rejected")) {
    throw new Error("Server did not confirm the publication decision.");
  }
  return result;
}

export async function enrollEducationStudent(testId: string, studentUserId: string) {
  const result = await rpc<{ test_id: string; user_id: string; status: string }>(
    "education_admin_enroll_student",
    { p_test_id: checkId(testId), p_user_id: checkId(studentUserId) });
  if (result?.status !== "enrolled" || result?.test_id !== testId ||
      result?.user_id !== studentUserId) {
    throw new Error("Server did not confirm enrollment.");
  }
  return result;
}

export async function revokeEducationEnrollment(testId: string, studentUserId: string) {
  const result = await rpc<boolean>("education_admin_revoke_enrollment",
    { p_test_id: checkId(testId), p_user_id: checkId(studentUserId) });
  if (typeof result !== "boolean") throw new Error("Invalid enrollment revocation response.");
  return result;
}

/** Caller gets only the enrollments held by their authenticated account. */
export async function listEnrolledEducationTests() {
  const rows = await rpc<unknown>("education_student_enrolled_catalog");
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error("Invalid student catalog returned by server.");
  }
  const validated = rows.map(normalizeEducationTest);
  if (validated.some(row => row === null)) throw new Error("Invalid enrolled assessment metadata.");
  return validated.filter((row): row is NonNullable<typeof row> => row !== null);
}
