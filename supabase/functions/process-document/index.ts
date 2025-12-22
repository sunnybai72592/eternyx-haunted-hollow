import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to chunk text into smaller pieces
function chunkText(text: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
  }

  return chunks;
}

// Helper function to generate embeddings using OpenAI API
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Helper function to extract text from image using OpenAI Vision API
async function extractTextFromImage(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4-vision",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract all text from this image. Return only the extracted text without any additional commentary.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Vision API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Helper function to extract text from PDF
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  // For production, use a proper PDF parsing library
  // This is a simplified approach that works with text-based PDFs
  const text = new TextDecoder().decode(pdfBuffer);
  return text;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { documentId, storagePath, fileType, mimeType } = await req.json();

    if (!documentId || !storagePath || !fileType) {
      return new Response(
        JSON.stringify({ error: "Missing documentId, storagePath, or fileType" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update document status to 'processing'
    await supabase
      .from("ai_documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    let extractedText = "";

    // Extract text based on file type
    if (fileType === "pdf") {
      const pdfBuffer = await fileData.arrayBuffer();
      extractedText = await extractTextFromPDF(pdfBuffer);
    } else if (fileType === "image") {
      // Convert image to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = String.fromCharCode(...uint8Array);
      const imageBase64 = btoa(binaryString);

      // Extract text from image using OpenAI Vision API
      extractedText = await extractTextFromImage(imageBase64, mimeType || "image/jpeg");
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the file");
    }

    // Chunk the text
    const chunks = chunkText(extractedText, 500, 100);

    // Generate embeddings for each chunk and store them
    const chunkRecords = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      chunkRecords.push({
        document_id: documentId,
        content: chunk,
        embedding: embedding,
        chunk_index: i,
      });

      // To avoid rate limiting, add a small delay between API calls
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Insert all chunks into the database
    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(chunkRecords);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    // Update document status to 'ready' and store extracted text
    const { error: updateError } = await supabase
      .from("ai_documents")
      .update({
        status: "ready",
        extracted_text: extractedText.substring(0, 1000), // Store first 1000 chars for preview
      })
      .eq("id", documentId);

    if (updateError) {
      throw new Error(`Failed to update document status: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunksCreated: chunkRecords.length,
        extractedTextLength: extractedText.length,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
