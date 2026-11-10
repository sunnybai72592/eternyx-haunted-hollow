import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "./supabase.ts";

/**
 * Verify the caller's Supabase access token even when platform-level JWT
 * verification is disabled for an Edge Function. Never trust a user ID from
 * the request body as an authentication identity.
 */
export async function authenticateUser(req: Request): Promise<{
  user: User | null;
  supabase: ReturnType<typeof createClient> | null;
}> {
  const authorization = req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, supabase: null };

  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return { user: null, supabase: null };

  try {
    const key = getSupabaseSecretKey();
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data.user) return { user: null, supabase: null };
    return { user: data.user, supabase };
  } catch {
    return { user: null, supabase: null };
  }
}
