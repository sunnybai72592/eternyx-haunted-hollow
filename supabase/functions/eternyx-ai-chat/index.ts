import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatRequest {
  message: string;
  sessionId?: string;
  documentId?: string;
  userId: string;
}

// Helper function to retrieve relevant chunks using vector similarity search
async function retrieveRelevantChunks(
  supabase: any,
  _q: unknown,
  documentId?: string,
  limit: number = 5
): Promise<string[]> {
  let query = supabase
    .from("document_chunks")
    .select("content")
    .order("chunk_index", { ascending: true })
    .limit(limit);

  if (documentId) {
    query = query.eq("document_id", documentId);
  }

  // Use RPC function for vector similarity search (if available)
  // For now, we'll use a simpler approach
  const { data, error } = await query;

  if (error) {
    console.error("Error retrieving chunks:", error);
    return [];
  }

  return data?.map((chunk: any) => chunk.content) || [];
}

async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("AI is not configured");
  const input = [
    ...chatHistory.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      reasoning: { effort: "low" },
      instructions: systemPrompt,
      input,
      max_output_tokens: 2048,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("AI gateway error", response.status, JSON.stringify(data).slice(0, 300));
    if (response.status === 402) throw new Error("AI credits are used up. Please top up Lovable credits.");
    if (response.status === 429) throw new Error("Too many requests, please wait a moment.");
    throw new Error("AI request failed");
  }
  return data.output_text ?? (data.output || []).flatMap((o: any) => o.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: ChatRequest = await req.json();
    const { message, sessionId, documentId, userId } = body;

    if (!message || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing message or userId" }),
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

    // Generate embedding for the user's message
    const messageEmbedding = null;

    // Retrieve relevant chunks if documentId is provided
    let contextChunks: string[] = [];
    if (documentId) {
      contextChunks = await retrieveRelevantChunks(
        supabase,
        messageEmbedding,
        documentId,
        5
      );
    }

    // Fetch recent chat history
    let chatHistory: Array<{ role: string; content: string }> = [];
    if (sessionId) {
      const { data: historyData, error: historyError } = await supabase
        .from("chat_history")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(10); // Get last 10 messages for context

      if (!historyError && historyData) {
        chatHistory = historyData;
      }
    }

    // Construct the system prompt
    let systemPrompt = `You are Eternyx AI, a powerful and helpful assistant built into the Eternyx platform. You are knowledgeable, friendly, and always strive to provide accurate and useful information.

Your capabilities include:
- General knowledge and Q&A
- Document analysis and explanation (when documents are provided)
- Code assistance and technical guidance
- Creative writing and brainstorming
- Problem-solving and reasoning

Always be clear, concise, and professional in your responses. If you don't know something, be honest about it.`;

    // Add document context if available
    if (contextChunks.length > 0) {
      systemPrompt += `\n\nYou have access to the following document content for reference:\n\n`;
      contextChunks.forEach((chunk, index) => {
        systemPrompt += `[Document Chunk ${index + 1}]\n${chunk}\n\n`;
      });
      systemPrompt += `Use this information to answer questions about the document. If the user asks about the document, prioritize information from these chunks.`;
    }

    // Generate response from OpenAI
    const aiResponse = await generateResponse(
      systemPrompt,
      message,
      chatHistory
    );

    // Create or get session
    let finalSessionId = sessionId;
    if (!finalSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from("conversation_sessions")
        .insert({
          user_id: userId,
          document_id: documentId || null,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
        })
        .select("id")
        .single();

      if (sessionError || !newSession) {
        throw new Error("Failed to create session");
      }

      finalSessionId = newSession.id;
    }

    // Save user message to chat history
    await supabase.from("chat_history").insert({
      user_id: userId,
      session_id: finalSessionId,
      document_id: documentId || null,
      role: "user",
      content: message,
    });

    // Save AI response to chat history
    await supabase.from("chat_history").insert({
      user_id: userId,
      session_id: finalSessionId,
      document_id: documentId || null,
      role: "assistant",
      content: aiResponse,
    });

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: finalSessionId,
        response: aiResponse,
        contextUsed: contextChunks.length > 0,
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
