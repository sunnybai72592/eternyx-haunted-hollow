import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { recordAuthorizationEvent } from "../_shared/security-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  if (!text) return [];
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("chunkSize must be a positive integer");
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be a non-negative integer smaller than chunkSize");
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}

function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + blockSize)));
  }
  return btoa(parts.join(""));
}

async function extractTextFromImage(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("AI is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Extract all readable text from this image. Return only the extracted text." },
          { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` },
        ],
      }],
      max_output_tokens: 4096,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Document image extraction failed", response.status);
    throw new Error("Unable to extract text from the image");
  }

  return data.output_text ?? (data.output || [])
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === "output_text")
    .map((item: any) => item.text)
    .join("");
}

async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  // This remains a basic text-layer extraction, not a full PDF parser or OCR engine.
  return new TextDecoder("utf-8", { fatal: false }).decode(pdfBuffer);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return reply({ error: "Authentication required" }, 401);

  let body: { documentId?: unknown; storagePath?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }

  if (!isUuid(body.documentId)) return reply({ error: "A valid documentId is required" }, 400);

  let ownedDocumentId: string | null = null;
  try {
    // Derive storage path and file metadata from the owner's database record.
    // Never let the caller choose an arbitrary Storage object to process.
    const { data: document, error: documentError } = await supabase
      .from("ai_documents")
      .select("id, user_id, storage_path, file_type, mime_type, file_size")
      .eq("id", body.documentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (documentError) throw new Error("Unable to verify document ownership");
    if (!document) return reply({ error: "Document not found" }, 404);
    ownedDocumentId = document.id;
    if (body.storagePath !== undefined && body.storagePath !== document.storage_path) {
      await recordAuthorizationEvent({
        functionName: "process-document",
        reason: "document_storage_reference_mismatch",
        actorUserId: user.id,
      });
      return reply({ error: "Document storage reference does not match" }, 403);
    }

    const fileType = document.file_type;
    const mimeType = document.mime_type || "";
    if (fileType !== "pdf" && fileType !== "image") {
      return reply({ error: "Unsupported document type" }, 415);
    }
    if (fileType === "pdf" && mimeType !== "application/pdf") {
      return reply({ error: "Invalid PDF content type" }, 415);
    }
    if (fileType === "image" && !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return reply({ error: "Only JPEG, PNG, and WebP images are supported" }, 415);
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);

    if (downloadError || !fileData) {
      throw new Error("Unable to download the uploaded document");
    }
    if (fileData.size > 20 * 1024 * 1024) {
      return reply({ error: "Document exceeds the 20 MB processing limit" }, 413);
    }

    const { error: processingError } = await supabase
      .from("ai_documents")
      .update({ status: "processing", error_message: null })
      .eq("id", document.id)
      .eq("user_id", user.id);
    if (processingError) throw new Error("Unable to update document processing status");

    let extractedText = "";
    if (fileType === "pdf") {
      extractedText = await extractTextFromPDF(await fileData.arrayBuffer());
    } else {
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      extractedText = await extractTextFromImage(toBase64(bytes), mimeType);
    }

    if (!extractedText.trim()) throw new Error("No readable text could be extracted");
    if (extractedText.length > 2_000_000) {
      throw new Error("Extracted document text exceeds the processing limit");
    }

    const chunks = chunkText(extractedText, 500, 100);
    const chunkRecords = chunks.map((content, index) => ({
      document_id: document.id,
      content,
      embedding: null,
      chunk_index: index,
    }));

    // Replace prior chunks so a retried processing request does not duplicate them.
    const { error: deleteError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", document.id);
    if (deleteError) throw new Error("Unable to prepare document chunks");

    const { error: insertError } = await supabase.from("document_chunks").insert(chunkRecords);
    if (insertError) throw new Error("Unable to save extracted document text");

    const { error: readyError } = await supabase
      .from("ai_documents")
      .update({
        status: "ready",
        error_message: null,
        extracted_text: extractedText.substring(0, 1000),
      })
      .eq("id", document.id)
      .eq("user_id", user.id);
    if (readyError) throw new Error("Unable to finalize document processing");

    return reply({
      success: true,
      documentId: document.id,
      chunksCreated: chunkRecords.length,
      extractedTextLength: extractedText.length,
    });
  } catch (error) {
    console.error("Document processing failed:", error);
    if (ownedDocumentId) {
      await supabase.from("ai_documents")
        .update({ status: "failed", error_message: "Document processing failed" })
        .eq("id", ownedDocumentId)
        .eq("user_id", user.id);
    }
    return reply({ error: (error as Error).message || "Document processing failed" }, 500);
  }
});
