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

// Helper function to retrieve relevant chunks using vector similarity search
async function retrieveRelevantChunks(
  supabase: any,
  queryEmbedding: number[],
  documentId?: string,
  limit: number = 5
): Promise<string[]> {
  let query = supabase
    .from("document_chunks")
    .select("content")
    .order("embedding", { ascending: false })
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

// Helper function to call OpenAI Chat API
async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...chatHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error.message}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
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
    const messageEmbedding = await generateEmbedding(message);

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
