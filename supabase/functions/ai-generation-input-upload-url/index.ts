import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return reply({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["contentType", "fileSize"].includes(key))) {
    return reply({ error: "Only contentType and fileSize are accepted" }, 400);
  }

  const contentType = body.contentType;
  const fileSize = body.fileSize;
  if (typeof contentType !== "string" || !Object.hasOwn(MIME_EXTENSIONS, contentType)) {
    return reply({ error: "Only JPEG, PNG, and WebP images are supported" }, 415);
  }
  if (typeof fileSize !== "number" || !Number.isSafeInteger(fileSize) ||
      fileSize < 1 || fileSize > MAX_FILE_SIZE) {
    return reply({ error: "Image must be between 1 byte and 10 MiB" }, 413);
  }

  const assetId = crypto.randomUUID();
  const extension = MIME_EXTENSIONS[contentType];
  const objectPath = `${user.id}/${assetId}/source.${extension}`;

  try {
    const { error: recordError } = await supabase
      .from("ai_generation_input_assets")
      .insert({
        id: assetId,
        user_id: user.id,
        bucket_id: "ai-generation-inputs",
        object_path: objectPath,
        declared_content_type: contentType,
        declared_size: fileSize,
        status: "pending",
      });

    if (recordError) {
      console.error("AI input asset record creation failed", { code: recordError.code ?? null });
      return reply({ error: "Secure image upload is temporarily unavailable" }, 503);
    }

    const { data, error } = await supabase.storage
      .from("ai-generation-inputs")
      .createSignedUploadUrl(objectPath, { upsert: false });

    if (error || !data?.token) {
      await supabase.from("ai_generation_input_assets").delete()
        .eq("id", assetId).eq("user_id", user.id);
      console.error("AI input upload URL creation failed", { message: error?.message ?? null });
      return reply({ error: "Secure image upload is temporarily unavailable" }, 503);
    }

    return reply({
      success: true,
      assetId,
      bucket: "ai-generation-inputs",
      path: objectPath,
      token: data.token,
      contentType,
      maxFileSize: MAX_FILE_SIZE,
    });
  } catch {
    return reply({ error: "Secure image upload is temporarily unavailable" }, 503);
  }
});
