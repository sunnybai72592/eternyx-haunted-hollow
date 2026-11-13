import { authenticateUser } from "../_shared/user-auth.ts";

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

  // Remove the user's own avatar files, then the profile row, then the auth identity.
  try {
    const { data: files } = await supabase.storage.from("avatars").list(user.id);
    if (files?.length) await supabase.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
  } catch (_) { /* storage cleanup is best effort */ }
  await supabase.from("profiles").delete().eq("user_id", user.id);

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) return json({ error: "Your account could not be deleted. Please try again." }, 500);
  return json({ success: true });
});
