import { useState } from "react";
import { useAIStudioChat } from "@/hooks/useAIStudioChat";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, Code2, FileCheck2, RotateCcw, ScanSearch, ShieldCheck, WandSparkles, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  CODING_LANGUAGES,
  LocalCodingError,
  MAX_LOCAL_CODE_LENGTH,
  formatCodingRequest,
  formatInspectionReport,
  formatLocalJson,
  inspectLocalCode,
  prepareCodingRequest,
  removeLocalTrailingWhitespace,
  type CodingInspection,
  type CodingLanguage,
  type CodingRequestDraft,
  type CodingTask,
} from "@/lib/ai/coding-local-tools";

const features = getFeaturesForStudio("coding");
const AICodingStudio = () => {
  const [language, setLanguage] = useState<CodingLanguage>("typescript");
  const [source, setSource] = useState("");
  const [task, setTask] = useState<CodingTask>("review");
  const [context, setContext] = useState("");
  const [inspection, setInspection] = useState<CodingInspection | null>(null);
  const [draft, setDraft] = useState<CodingRequestDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ai = useAIStudioChat();
  const invalidate = () => {
    ai.invalidate();
    setInspection(null);
    setDraft(null);
    setError(null);
    setNotice(null);
  };
  const describe = (error: unknown): string => {
    if (!(error instanceof LocalCodingError)) return "The local tool could not complete this operation.";
    return ({
      invalid_code: "Enter code between 1 and 50,000 characters.",
      invalid_language: "Choose a supported language.",
      invalid_task: "Choose review or explanation.",
      invalid_context: "Context must be 1,000 characters or fewer.",
      invalid_json: "Invalid JSON: fix its structure before formatting.",
      too_large: "Formatted JSON would exceed the 50,000-character workspace limit.",
    }[error.code]);
  };
  const inspect = () => {
    setError(null);
    setNotice(null);
    setInspection(null);
    try {
      setInspection(inspectLocalCode(source, language));
    } catch (e) {
      setError(describe(e));
    }
  };
  const prepare = () => {
    setDraft(null);
    setError(null);
    setNotice(null);
    try {
      setDraft(prepareCodingRequest(source, language, task, context));
    } catch (e) {
      setError(describe(e));
    }
  };
  const askAI = () => {
    try {
      const request = prepareCodingRequest(source, language, task, context);
      setDraft(request);
      setError(null);
      setNotice(null);
      void ai.run(request.featureKey, formatCodingRequest(request));
    } catch (failure) {
      setError(describe(failure));
    }
  };

  const tidy = () => {
    try {
      setSource(removeLocalTrailingWhitespace(source));
      invalidate();
      setNotice("Trailing whitespace removed locally. Review the changed text before using it.");
    } catch (e) {
      setError(describe(e));
    }
  };
  const prettyJson = () => {
    try {
      setSource(formatLocalJson(source));
      invalidate();
      setNotice("JSON formatted locally. Review the changed text before using it.");
    } catch (e) {
      setError(describe(e));
    }
  };
  const clear = () => {
    setSource("");
    setContext("");
    setLanguage("typescript");
    setTask("review");
    invalidate();
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(label + " copied to clipboard.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the text manually.");
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
          <div className="flex items-center gap-3 text-violet-200"><Code2 className="h-7 w-7" />LOCAL CODE WORKSPACE</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Coding Studio</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Inspect and format code locally, or request an actual AI explanation or review using ETERNYX AI Chat.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Local inspection · optional AI Chat review</Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Local inspection detects a few text patterns but does not compile, execute, or verify security.
            Local inspection stays in your browser. Only clicking Review / Explain with AI sends the prepared code to
            ETERNYX AI Chat and its external provider, and saves a chat session. AI chat credits and entitlements apply.
            Do not paste credentials, secrets, or proprietary code without permission. Maximum AI message: 4,000 characters including instructions.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Dedicated studio backend planned · AI Chat bridge available by entitlement</Badge></CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Local source inspector</CardTitle>
            <CardDescription className="text-slate-400">
              All checks are deterministic and run in your browser. Only JSON receives syntax validation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="coding-language" className="block space-y-2 text-sm text-slate-300">
              <span>Language</span>
              <select
                id="coding-language"
                value={language}
                onChange={e => { setLanguage(e.target.value as CodingLanguage); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white"
              >
                {CODING_LANGUAGES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label htmlFor="coding-source" className="block space-y-2 text-sm text-slate-300">
              <span>Source text · maximum 50,000 characters</span>
              <textarea
                id="coding-source"
                value={source}
                maxLength={MAX_LOCAL_CODE_LENGTH}
                onChange={e => { setSource(e.target.value); invalidate(); }}
                rows={13}
                spellCheck={false}
                placeholder="Paste source code here. It will not be uploaded or executed…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="block text-xs text-slate-400">{source.length}/50000 characters</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={inspect} disabled={!source.trim()}>
                <ScanSearch className="mr-2 h-4 w-4" />Inspect locally
              </Button>
              <Button type="button" variant="outline" onClick={tidy} disabled={!source.trim()}>
                <WandSparkles className="mr-2 h-4 w-4" />Remove trailing whitespace
              </Button>
              <Button type="button" variant="outline" onClick={prettyJson} disabled={language !== "json" || !source.trim()}>
                <FileCheck2 className="mr-2 h-4 w-4" />Format JSON
              </Button>
              <Button type="button" variant="ghost" onClick={clear}>
                <RotateCcw className="mr-2 h-4 w-4" />Clear workspace
              </Button>
            </div>
            {inspection && (
              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-white">Mechanical inspection results</strong>
                  <Badge variant="outline">Not a security audit</Badge>
                </div>
                <p className="text-sm text-slate-300">
                  {inspection.characters} characters · {inspection.lines} lines · {inspection.nonemptyLines} nonempty lines
                </p>
                <p className="text-sm text-slate-400">
                  JSON syntax: {inspection.jsonValid === null ? "Not checked" : inspection.jsonValid ? "Valid" : "Invalid"}
                </p>
                <p className="text-sm text-slate-400">Detected patterns: {inspection.findings.length}{inspection.truncated ? " (additional findings omitted)" : ""}</p>
                <ul className="max-h-64 list-disc space-y-1 overflow-auto pl-5 text-sm text-slate-300">
                  {inspection.findings.map((finding, index) => (
                    <li key={index}>Line {finding.line}: {finding.message}</li>
                  ))}
                  {inspection.findings.length === 0 && <li>No tracked text patterns found. This does not establish code safety.</li>}
                </ul>
                <Button type="button" variant="outline" onClick={() => copy(formatInspectionReport(inspection), "Inspection report")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy inspection report
                </Button>
              </div>
            )}
            {error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <Alert role="status" aria-live="polite"><ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">AI coding request</CardTitle>
            <CardDescription className="text-slate-400">
              Prepare and copy a code explanation or review request without sending it to an AI service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Coding request type">
              <Button type="button" variant={task === "review" ? "default" : "outline"} aria-pressed={task === "review"}
                onClick={() => { setTask("review"); invalidate(); }}>Review</Button>
              <Button type="button" variant={task === "explain" ? "default" : "outline"} aria-pressed={task === "explain"}
                onClick={() => { setTask("explain"); invalidate(); }}>Explain</Button>
            </div>
            <label htmlFor="coding-context" className="block space-y-2 text-sm text-slate-300">
              <span>Additional context · optional, maximum 1,000 characters</span>
              <textarea
                id="coding-context" value={context} maxLength={1000} rows={3}
                onChange={e => { setContext(e.target.value); invalidate(); }}
                placeholder="What should the reviewer focus on?..."
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500"
              />
            </label>
            <Button type="button" disabled={!source.trim()} onClick={prepare}>
              <FileCheck2 className="mr-2 h-4 w-4" />Prepare request draft
            </Button>
            {draft && (
              <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-white">Prepared request</strong>
                  <Badge variant="outline">Local only · no AI response</Badge>
                </div>
                <p className="text-xs text-slate-400">Feature: {draft.featureKey} · Language: {draft.language}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-xs text-slate-300">{formatCodingRequest(draft)}</pre>
                <Button type="button" variant="outline" onClick={() => copy(formatCodingRequest(draft), "Request draft")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy request
                </Button>
                <p className="text-xs text-amber-200">Copying text does not submit or execute code. No AI output or credit charge is claimed.</p>
              </div>
            )}
            <section className="space-y-3 rounded-xl border border-violet-400/20 bg-slate-950 p-4" aria-label="AI code review execution">
              <h3 className="font-semibold text-white">Ask ETERNYX AI about your code</h3>
              <p className="text-sm text-slate-400">
                Optional network action: sends the prepared source and instructions to the authenticated AI Chat backend.
                Uses ai.chat credits and chat history; does not run, compile, deploy or modify any code.
                The chat backend accepts at most 4,000 characters including instructions, not the full 50,000-character local workspace.
              </p>
              <Button type="button" disabled={!source.trim() || ai.loading} onClick={askAI}>
                <WandSparkles className="mr-2 h-4 w-4" />{ai.loading ? "Reviewing with AI…" : task === "review" ? "Review with AI Chat" : "Explain with AI Chat"}
              </Button>
              {ai.loading && <p role="status" className="text-sm text-cyan-200">AI request in progress. Editing the source invalidates the displayed response but cannot cancel an in-flight credit charge.</p>}
              {ai.error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{ai.error}</AlertDescription></Alert>}
              {ai.result && (
                <div className="space-y-3">
                  <Badge variant="outline">Real AI response · not executed or verified</Badge>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{ai.result}</pre>
                  <Button type="button" variant="outline" onClick={() => copy(ai.result!, "AI response")}><ClipboardCopy className="mr-2 h-4 w-4" />Copy AI response</Button>
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AICodingStudio;
