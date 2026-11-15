import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { inspectImageDimensions } from "../_shared/ai-image-inspection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/webp": (b) => b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return reply({ error: "Authentication required" }, 401);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "assetId") ||
      typeof body.assetId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.assetId)) {
    return reply({ error: "A valid asset ID is required" }, 400);
  }

  try {
    const { data: asset, error: lookupError } = await supabase
      .from("ai_generation_input_assets")
      .select("id, user_id, bucket_id, object_path, declared_content_type, declared_size, status, verified_content_type, verified_size")
      .eq("id", body.assetId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error("AI input asset lookup failed", { code: lookupError.code ?? null });
      return reply({ error: "Image verification is temporarily unavailable" }, 503);
    }
    if (!asset) return reply({ error: "Uploaded image not found" }, 404);
    if (asset.status === "ready") {
      return reply({
        success: true,
        asset: { id: asset.id, status: "ready", contentType: asset.verified_content_type, size: asset.verified_size },
      });
    }
    if (asset.status !== "pending") return reply({ error: "This image cannot be verified" }, 409);

    const { data: file, error: downloadError } = await supabase.storage
      .from("ai-generation-inputs")
      .download(asset.object_path);

    if (downloadError || !file) {
      return reply({ error: "Image upload has not completed" }, 409);
    }

    if (file.size < 1 || file.size > MAX_FILE_SIZE || file.size !== asset.declared_size) {
      await supabase.from("ai_generation_input_assets").update({ status: "rejected" })
        .eq("id", asset.id).eq("user_id", user.id).eq("status", "pending");
      await supabase.storage.from("ai-generation-inputs").remove([asset.object_path]);
      return reply({ error: "Uploaded image size does not match the permitted upload" }, 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const signatureMatches = SIGNATURES[asset.declared_content_type]?.(bytes) === true;
    if (!signatureMatches) {
      await supabase.from("ai_generation_input_assets").update({ status: "rejected" })
        .eq("id", asset.id).eq("user_id", user.id).eq("status", "pending");
      await supabase.storage.from("ai-generation-inputs").remove([asset.object_path]);
      return reply({ error: "Uploaded file content does not match its declared image type" }, 415);
    }

    try {
      // Header inspection bounds decompression risk; it is not full decoding or moderation.
      inspectImageDimensions(bytes, asset.declared_content_type);
    } catch {
      await supabase.from("ai_generation_input_assets").update({ status: "rejected" })
        .eq("id", asset.id).eq("user_id", user.id).eq("status", "pending");
      await supabase.storage.from("ai-generation-inputs").remove([asset.object_path]);
      return reply({ error: "Uploaded image dimensions or header are invalid or exceed permitted limits" }, 415);
    }

    const { data: updated, error: updateError } = await supabase
      .from("ai_generation_input_assets")
      .update({
        status: "ready",
        verified_content_type: asset.declared_content_type,
        verified_size: file.size,
        verified_at: new Date().toISOString(),
      })
      .eq("id", asset.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      console.error("AI input asset verification update failed", { code: updateError?.code ?? null });
      return reply({ error: "Image verification is temporarily unavailable" }, 503);
    }

    return reply({
      success: true,
      asset: {
        id: asset.id,
        status: "ready",
        contentType: asset.declared_content_type,
        size: file.size,
      },
    });
  } catch {
    return reply({ error: "Image verification is temporarily unavailable" }, 503);
  }
});
