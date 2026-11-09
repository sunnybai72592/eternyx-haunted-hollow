const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
      return json({ error: "Invalid messages" }, 400);
    }
    const clean = messages
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Eternyx, an expert cybersecurity assistant. Give clear, accurate, practical answers about security threats, defenses and best practices. Be concise. Refuse to help with clearly malicious attacks on systems the user doesn't own." },
          ...clean,
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("OpenAI error", r.status, data?.error?.message);
      return json({ error: data?.error?.message || "AI request failed" }, r.status === 429 ? 429 : 502);
    }
    return json({ reply: data.choices?.[0]?.message?.content ?? "" });
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected error" }, 500);
  }
});
