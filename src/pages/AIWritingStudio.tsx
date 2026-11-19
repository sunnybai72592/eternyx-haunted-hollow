import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, FileCheck2, PenLine, RotateCcw, ShieldCheck, WandSparkles, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AI_WRITING_LANGUAGES,
  AIWritingDraftError,
  buildAIWritingRequest,
  formatWritingRequestForCopy,
  measureWritingText,
  tidyWritingWhitespace,
  type AIWritingOperation,
  type AIWritingRequestDraft,
  type AIWritingTargetLanguage,
} from "@/lib/ai/writing-request-builder";
import { getFeaturesForStudio } from "@/lib/ai/registry";

const features = getFeaturesForStudio("writing");
const tasks: { id: AIWritingOperation; label: string; detail: string }[] = [
  { id: "draft", label: "Draft", detail: "Describe what to write" },
  { id: "rewrite", label: "Rewrite", detail: "Improve existing text" },
  { id: "summarize", label: "Summarize", detail: "Prepare a summary request" },
  { id: "translate", label: "Translate", detail: "Prepare a translation request" },
];

const AIWritingStudio = () => {
  const [operation, setOperation] = useState<AIWritingOperation>("draft");
  const [input, setInput] = useState("");
  const [instructions, setInstructions] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<AIWritingTargetLanguage>("English");
  const [draft, setDraft] = useState<AIWritingRequestDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const metrics = measureWritingText(input);
  const preview = draft ? formatWritingRequestForCopy(draft) : "";

  const invalidate = () => {
    setDraft(null);
    setError(null);
    setNotice(null);
  };

  const prepare = () => {
    setError(null);
    setNotice(null);
    setDraft(null);
    try {
      setDraft(buildAIWritingRequest(
        operation, input,
        operation === "translate" ? { targetLanguage } : { instructions },
      ));
    } catch (e) {
      const message = e instanceof AIWritingDraftError
        ? ({
            invalid_operation: "Select a supported writing task.",
            invalid_input: "Enter text between 1 and 12,000 characters.",
            invalid_instructions: "Additional instructions must be 1,000 characters or fewer.",
            invalid_language: "Choose a supported target language.",
          }[e.code])
        : "The request could not be prepared.";
      setError(message);
    }
  };

  const tidy = () => {
    setInput(current => tidyWritingWhitespace(current));
    invalidate();
  };

  const clear = () => {
    setInput("");
    setInstructions("");
    setTargetLanguage("English");
    setOperation("draft");
    invalidate();
  };

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(preview);
      setNotice("Request text copied. No AI job was submitted.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the request text below instead.");
      setNotice(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>

        <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/50 via-slate-950 to-cyan-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-violet-200"><PenLine className="h-7 w-7" />CREATIVE WRITING WORKSPACE</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Writing Studio</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Prepare drafting, rewriting, summarization and translation requests. Explore local text tools without activating a paid AI service.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Local workspace · AI generation disabled</Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            AI writing is not enabled: no provider, model, safety policy or cost approval has been activated.
            Preparing a request and tidying text happen entirely in your browser. No AI job, charge or credit reservation is created.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Planned · not enabled</Badge></CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Build a writing request</CardTitle>
            <CardDescription className="text-slate-400">
              Draft a provider-neutral request locally. This is not an AI-generated answer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div role="group" aria-label="Writing task" className="flex flex-wrap gap-2">
              {tasks.map(task => (
                <Button
                  key={task.id}
                  type="button"
                  title={task.detail}
                  variant={operation === task.id ? "default" : "outline"}
                  aria-pressed={operation === task.id}
                  onClick={() => { setOperation(task.id); invalidate(); }}
                >{task.label}</Button>
              ))}
            </div>

            <label htmlFor="writing-source" className="block space-y-2 text-sm text-slate-300">
              <span>{operation === "draft" ? "Writing brief" : "Your source text"} · maximum 12,000 characters</span>
              <textarea
                id="writing-source"
                value={input}
                onChange={e => { setInput(e.target.value); invalidate(); }}
                maxLength={12000}
                rows={9}
                placeholder={operation === "draft" ? "Describe the content you want to write…" : "Paste or type the text to work with…"}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400" aria-live="polite">
              <span>{metrics.characters}/12000 characters</span>
              <span>{metrics.words} words</span>
              <span>{metrics.paragraphs} paragraphs</span>
            </div>

            {operation === "translate" ? (
              <label htmlFor="writing-language" className="block space-y-2 text-sm text-slate-300">
                <span>Target language</span>
                <select
                  id="writing-language"
                  value={targetLanguage}
                  onChange={e => { setTargetLanguage(e.target.value as AIWritingTargetLanguage); invalidate(); }}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white"
                >
                  {AI_WRITING_LANGUAGES.map(language => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
            ) : (
              <label htmlFor="writing-instructions" className="block space-y-2 text-sm text-slate-300">
                <span>Additional instructions · optional, maximum 1,000 characters</span>
                <textarea
                  id="writing-instructions"
                  value={instructions}
                  onChange={e => { setInstructions(e.target.value); invalidate(); }}
                  maxLength={1000}
                  rows={3}
                  placeholder="Tone, audience, length or other constraints…"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500"
                />
                <span className="block text-xs text-slate-500">{instructions.length}/1000</span>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={prepare} disabled={!input.trim()}>
                <FileCheck2 className="mr-2 h-4 w-4" />Prepare request
              </Button>
              <Button type="button" variant="outline" disabled={!input.trim()} onClick={tidy}>
                <WandSparkles className="mr-2 h-4 w-4" />Tidy whitespace
              </Button>
              <Button type="button" variant="ghost" onClick={clear}>
                <RotateCcw className="mr-2 h-4 w-4" />Clear workspace
              </Button>
            </div>

            {error && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
            </Alert>}
            {notice && <Alert role="status" aria-live="polite">
              <ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription>
            </Alert>}

            {draft && (
              <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-white">Prepared request preview</strong>
                  <Badge variant="outline">Local only · no AI output</Badge>
                </div>
                <p className="text-xs text-slate-400">Feature: {draft.featureKey} · Task: {draft.operation}</p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-300">{preview}</pre>
                <Button type="button" variant="outline" onClick={copy}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy request text
                </Button>
                <p className="text-xs text-amber-200">
                  No content was sent to a provider, no generated result is claimed, and no credits were used.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AIWritingStudio;
