import { authenticateUser } from "../_shared/user-auth.ts";
import { removeOwnedStorage } from "../_shared/workspace-storage-cleanup.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return json({ error: "Please sign in again to delete your account." }, 401);

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return json({ error: "Type DELETE to confirm." }, 400);

  // Never delete the Auth identity while its private Storage objects remain.
  // auth.users cascades Workspace DB rows, but Supabase Storage bytes need
  // explicit API deletion before the identity is removed.
  try {
    await removeOwnedStorage(supabase.storage.from("workspace-private"), user.id);
    await removeOwnedStorage(supabase.storage.from("avatars"), user.id);
  } catch (failure) {
    return json({
      error: "Private file cleanup failed, so the account was not deleted. " +
        "Please retry or contact support before deleting your identity.",
    }, 500);
  }
  const { error: profileError } = await supabase.from("profiles").delete().eq("user_id", user.id);
  if (profileError) return json({ error: "Profile cleanup failed; account was not deleted." }, 500);

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) return json({ error: "Your account could not be deleted. Please try again." }, 500);
  return json({ success: true });
});
