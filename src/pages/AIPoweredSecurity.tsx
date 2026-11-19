import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bot, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type ChatMessage = { readonly role: "user" | "assistant"; readonly content: string };

const AIPoweredSecurity = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || prompt.length > 4000 || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: prompt }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke("security-assistant", {
        body: { messages: next.slice(-20), requestId: crypto.randomUUID() },
      });
      if (requestError || data?.error || typeof data?.reply !== "string" || !data.reply.trim()) {
        throw new Error("Assistant unavailable");
      }
      setMessages([...next, { role: "assistant", content: data.reply.trim() }]);
    } catch {
      // Errors are not AI answers; never fabricate assistant replies or threat findings.
      setError("The security assistant is unavailable or not enabled for this account. No AI answer was returned.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/cybersecurity"><ArrowLeft className="mr-2 h-4 w-4" />Cybersecurity Hub</Link>
        </Button>
        <section className="rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-950/40 via-slate-950 to-violet-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-blue-200"><Bot className="h-7 w-7" />BACKEND-GATED ASSISTANT</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Security Assistant</h1>
          <p className="mt-4 text-slate-300">Ask defensive security questions using the existing, access-controlled assistant endpoint when available.</p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">
            Backend-dependent · availability not guaranteed
          </Badge>
        </section>
        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Legacy AI malware scores, model accuracy statistics and predictive detection dashboards were simulated and have been removed.
            This page does not scan malware, classify files, inspect networks, monitor threats or provide live AI detection.
            Only an authenticated backend request can produce an assistant reply. That endpoint enforces existing entitlement/credit policy
            and may be unavailable until configured; do not submit sensitive credentials or private systems data.
          </AlertDescription>
        </Alert>
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Security question</CardTitle>
            <CardDescription className="text-slate-400">
              A request is sent only when you press Ask. An unavailable response is shown as an error, never invented text.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="security-assistant-question" className="block space-y-2 text-sm text-slate-300">
              <span>Ask a defensive security question · maximum 4,000 characters</span>
              <textarea id="security-assistant-question" value={input} maxLength={4000}
                onChange={e => setInput(e.target.value)} rows={4}
                placeholder="How should I prioritize remediation of a confirmed finding?"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500" />
            </label>
            <Button type="button" onClick={send} disabled={loading || !input.trim()}>
              {loading ? "Requesting a verified backend response…" : "Ask security assistant"}
            </Button>
            {messages.length > 0 && (
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4" aria-live="polite">
                <h2 className="text-sm font-semibold text-white">Conversation</h2>
                {messages.map((message, index) => (
                  <div key={index} className="space-y-1 border-b border-slate-800 pb-3">
                    <p className="text-xs font-semibold text-cyan-200">{message.role === "user" ? "You" : "Assistant (backend response)"}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
            {error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
        <p className="text-xs text-slate-500">
          ETERNYX is not a replacement for professional incident response, verified vulnerability analysis or independent security assessment.
        </p>
      </div>
    </div>
  );
};
export default AIPoweredSecurity;
