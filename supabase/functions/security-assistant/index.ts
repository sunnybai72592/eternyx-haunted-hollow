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

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        instructions: "You are Eternyx, an expert cybersecurity assistant. Give clear, accurate, practical answers about security threats, defenses and best practices. Be concise. Refuse to help with clearly malicious attacks on systems the user doesn't own.",
        input: clean,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("AI gateway error", r.status, JSON.stringify(data).slice(0, 500));
      const msg = r.status === 402 ? "AI credits are used up. Please top up Lovable credits." : r.status === 429 ? "Too many requests, please wait a moment." : "AI request failed";
      return json({ error: msg }, 200);
    }
    const reply = data.output_text ?? (data.output || []).flatMap((o: any) => o.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
    return json({ reply });
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected error" }, 200);
  }
});
