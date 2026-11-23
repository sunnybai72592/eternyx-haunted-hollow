import { useState } from "react";
import { useAIStudioChat } from "@/hooks/useAIStudioChat";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, FileCheck2, Link2, RotateCcw, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  LocalResearchError,
  MAX_RESEARCH_EVIDENCE,
  MAX_RESEARCH_SOURCES,
  RESEARCH_STANCES,
  addResearchEvidence,
  addResearchSource,
  countResearchStances,
  filterResearchEvidence,
  formatLocalResearchBrief,
  formatResearchDraft,
  formatResearchNotebookAIRequest,
  prepareResearchDraft,
  removeResearchSource,
  type ResearchDraft,
  type ResearchEvidence,
  type ResearchMode,
  type ResearchSource,
  type ResearchStance,
} from "@/lib/ai/research-local-tools";

const features = getFeaturesForStudio("research");

const AIResearchStudio = () => {
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [evidence, setEvidence] = useState<ResearchEvidence[]>([]);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePublisher, setSourcePublisher] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [stance, setStance] = useState<ResearchStance>("supports");
  const [claim, setClaim] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [notes, setNotes] = useState("");
  const [filterText, setFilterText] = useState("");
  const [mode, setMode] = useState<ResearchMode>("research");
  const [question, setQuestion] = useState("");
  const [draft, setDraft] = useState<ResearchDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ai = useAIStudioChat();

  const counts = countResearchStances(evidence);
  const visibleEvidence = filterResearchEvidence(sources, evidence, filterText);
  const brief = formatLocalResearchBrief(sources, evidence);

  const invalidate = () => {
    ai.invalidate();
    setDraft(null);
    setError(null);
    setNotice(null);
  };
  const describe = (e: unknown): string => {
    if (!(e instanceof LocalResearchError)) return "The local research operation could not be completed.";
    return ({
      invalid_id: "Could not create a unique local reference. Please retry.",
      invalid_source: "Enter a source title (maximum 200 characters) and optional publisher (maximum 120).",
      invalid_url: "Enter a valid HTTPS reference URL (maximum 2,048 characters) without credentials.",
      duplicate_source: "This reference URL is already in your notebook.",
      source_limit: "The local notebook allows up to 25 sources.",
      invalid_evidence: "Enter a claim (maximum 1,000 characters), optional excerpt (2,000), and notes (1,000).",
      duplicate_evidence: "This evidence was already added.",
      evidence_limit: "The local notebook allows up to 100 evidence items.",
      missing_source: "Choose a source before adding evidence.",
      invalid_query: "The filter must be 100 characters or fewer.",
      invalid_question: "Enter a research question of 1–1,000 characters.",
    }[e.code]);
  };
  const addSource = () => {
    try {
      const id = crypto.randomUUID();
      const next = addResearchSource(sources, {
        id, title: sourceTitle, url: sourceUrl, publisher: sourcePublisher,
      });
      setSources(next);
      if (!sourceId) setSourceId(id);
      setSourceTitle("");
      setSourceUrl("");
      setSourcePublisher("");
      invalidate();
      setNotice("Reference added locally. Its contents and credibility have not been checked.");
    } catch (e) {
      setError(describe(e));
      setNotice(null);
    }
  };
  const dropSource = (id: string) => {
    if (!window.confirm("Remove this reference and every evidence note linked to it?")) return;
    const next = removeResearchSource(sources, evidence, id);
    setSources(next.sources);
    setEvidence(next.evidence);
    if (sourceId === id) setSourceId(next.sources[0]?.id ?? "");
    invalidate();
    setNotice("Reference and its linked notes were removed locally.");
  };
  const addEvidence = () => {
    try {
      const next = addResearchEvidence(evidence, sources, {
        id: crypto.randomUUID(), sourceId, stance, claim, excerpt, notes,
      });
      setEvidence(next);
      setClaim("");
      setExcerpt("");
      setNotes("");
      invalidate();
      setNotice("User-entered evidence note saved in this browser session.");
    } catch (e) {
      setError(describe(e));
      setNotice(null);
    }
  };
  const dropEvidence = (id: string) => {
    setEvidence(existing => existing.filter(item => item.id !== id));
    invalidate();
    setNotice("Evidence note removed locally.");
  };
  const prepare = () => {
    setDraft(null);
    setError(null);
    setNotice(null);
    try {
      setDraft(prepareResearchDraft(mode, question, sources, evidence));
    } catch (e) {
      setError(describe(e));
    }
  };
  const synthesizeWithAI = () => {
    try {
      if (!sources.length || !evidence.length) {
        setError("Add at least one user-entered reference and evidence note before asking AI to synthesize it.");
        return;
      }
      const request = prepareResearchDraft(mode, question, sources, evidence);
      setDraft(request);
      setError(null);
      setNotice(null);
      // Research search remains planned. This is only note synthesis through
      // the existing ai.chat entitlement and no external browsing is performed.
      void ai.run("ai.research.summarize", formatResearchNotebookAIRequest(request));
    } catch (failure) {
      setError(describe(failure));
    }
  };
  const copyAIResult = async () => {
    if (!ai.result) return;
    try {
      await navigator.clipboard.writeText(ai.result);
      setNotice("AI-generated synthesis copied.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the response manually.");
    }
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(label + " copied. No research was submitted or verified.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select the displayed text and copy it manually.");
      setNotice(null);
    }
  };
  const clear = () => {
    if ((sources.length || evidence.length) && !window.confirm("Clear all local references and evidence notes?")) return;
    setSources([]);
    setEvidence([]);
    setSourceTitle("");
    setSourceUrl("");
    setSourcePublisher("");
    setSourceId("");
    setStance("supports");
    setClaim("");
    setExcerpt("");
    setNotes("");
    setFilterText("");
    setMode("research");
    setQuestion("");
    invalidate();
  };

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>
        <section className="rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-950/50 via-slate-950 to-cyan-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-fuchsia-200"><Search className="h-7 w-7" />MANUAL EVIDENCE WORKSPACE</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Research Studio</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Collect evidence notes and opposing viewpoints, then optionally ask ETERNYX AI to synthesize your unverified notebook.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">
            Local notebook · opt-in AI note synthesis
          </Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            No URLs are fetched, checked or ranked. Titles, publishers, excerpts and stance tags are user-entered
            and unverified. Research notes are in memory only until refresh. Local actions never submit data, but clicking
            Synthesize notes with AI Chat sends your whole bounded notebook to the configured provider and saves chat history;
            ai.chat credits apply. This is NOT independent research, fact-checking or a live search engine.
            Never enter private, token-bearing or confidential links without authorization.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Live research backend planned · opt-in note synthesis via AI Chat</Badge></CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">1. Reference notebook</CardTitle>
            <CardDescription className="text-slate-400">
              Enter HTTPS links manually. ETERNYX does not open or verify sources automatically.
              {sources.length} / {MAX_RESEARCH_SOURCES} references.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span>Reference title · required</span>
                <input value={sourceTitle} maxLength={200} onChange={e => setSourceTitle(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Name this source" />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Publisher · optional, not verified</span>
                <input value={sourcePublisher} maxLength={120} onChange={e => setSourcePublisher(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Publisher or author" />
              </label>
            </div>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>HTTPS source URL · required, maximum 2,048 characters</span>
              <input type="url" value={sourceUrl} maxLength={2048} onChange={e => setSourceUrl(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="https://example.org/article" />
            </label>
            <Button type="button" disabled={!sourceTitle.trim() || !sourceUrl.trim() || sources.length >= MAX_RESEARCH_SOURCES}
              onClick={addSource}><Link2 className="mr-2 h-4 w-4" />Add reference</Button>
            <div className="space-y-2">
              {sources.length === 0 && <p className="text-sm text-slate-500">No references yet. Add your first verified-by-you source link above.</p>}
              {sources.map((source, index) => (
                <div key={source.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-semibold text-white">[{index + 1}] {source.title}</p>
                    <p className="break-all text-xs text-slate-400">{source.url}</p>
                    {source.publisher && <p className="text-xs text-slate-400">User-entered publisher: {source.publisher}</p>}
                    <a href={source.url} target="_blank" rel="noopener noreferrer"
                      className="inline-block text-xs text-cyan-300 underline">Open reference (external site)</a>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => dropSource(source.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />Remove source + notes
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">2. Evidence & viewpoints</CardTitle>
            <CardDescription className="text-slate-400">
              Connect each note to a reference and tag it as supporting, challenging or contextual evidence.
              These tags are your labels, not verified judgments. {evidence.length} / {MAX_RESEARCH_EVIDENCE} entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Associated reference</span>
              <select value={sourceId} onChange={e => { setSourceId(e.target.value); invalidate(); }}
                disabled={sources.length === 0} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                {sources.length === 0 && <option value="">Add a reference first</option>}
                {sources.map((source, index) => <option key={source.id} value={source.id}>[{index + 1}] {source.title}</option>)}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Evidence tag · user-assigned</span>
              <select value={stance} onChange={e => { setStance(e.target.value as ResearchStance); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                {RESEARCH_STANCES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Claim or observation · required, maximum 1,000 characters</span>
              <textarea value={claim} maxLength={1000} rows={3} onChange={e => { setClaim(e.target.value); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Summarize what this source appears to say…" />
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Excerpt · optional, user-entered and unverified, maximum 2,000 characters</span>
              <textarea value={excerpt} maxLength={2000} rows={3} onChange={e => { setExcerpt(e.target.value); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Paste a relevant passage…" />
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Notes · optional, maximum 1,000 characters</span>
              <textarea value={notes} maxLength={1000} rows={2} onChange={e => { setNotes(e.target.value); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Limitations, context or questions…" />
            </label>
            <Button type="button" onClick={addEvidence}
              disabled={!sourceId || !claim.trim() || evidence.length >= MAX_RESEARCH_EVIDENCE}>
              <FileCheck2 className="mr-2 h-4 w-4" />Add evidence note
            </Button>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">Supports: <strong>{counts.supports}</strong></div>
              <div className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">Challenges: <strong>{counts.challenges}</strong></div>
              <div className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">Context: <strong>{counts.context}</strong></div>
            </div>
            <p className="text-xs text-slate-500">These counts reflect user tags only. They are not a consensus, ranking, or truth score.</p>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>Filter your evidence · maximum 100 characters</span>
              <input value={filterText} maxLength={100} onChange={e => setFilterText(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Search claims, notes, titles or tags…" />
            </label>
            <div className="max-h-96 space-y-2 overflow-auto">
              {visibleEvidence.length === 0 && <p className="text-sm text-slate-500">No matching evidence notes.</p>}
              {visibleEvidence.map(entry => {
                const source = sources.find(item => item.id === entry.sourceId);
                return (
                  <div key={entry.id} className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Badge variant="outline">{entry.stance} · user-tagged</Badge>
                      <Button type="button" size="sm" variant="outline" onClick={() => dropEvidence(entry.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />Remove note
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{entry.claim}</p>
                    <p className="text-xs text-cyan-200">Source: {source?.title ?? "Reference removed"}</p>
                    {entry.excerpt && <p className="whitespace-pre-wrap break-words text-xs text-slate-400">User-entered excerpt (unverified): {entry.excerpt}</p>}
                    {entry.notes && <p className="whitespace-pre-wrap break-words text-xs text-slate-400">Notes: {entry.notes}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">3. Research brief & request draft</CardTitle>
            <CardDescription className="text-slate-400">
              Copy your manually compiled notes, prepare a request, or explicitly submit the notebook to AI Chat for an unverified synthesis.
              No source is fetched, and AI synthesis consumes existing chat credits only when you choose to submit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
              <Badge variant="outline">User-supplied evidence only · not fact-checked</Badge>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">{brief}</pre>
              <Button type="button" variant="outline" disabled={!sources.length}
                onClick={() => copy(brief, "Local research brief")}>
                <ClipboardCopy className="mr-2 h-4 w-4" />Copy research brief
              </Button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Future AI request type">
              <Button type="button" variant={mode === "research" ? "default" : "outline"} aria-pressed={mode === "research"}
                onClick={() => { setMode("research"); invalidate(); }}>Research request</Button>
              <Button type="button" variant={mode === "summarize" ? "default" : "outline"} aria-pressed={mode === "summarize"}
                onClick={() => { setMode("summarize"); invalidate(); }}>Summarize notes</Button>
            </div>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Research question · maximum 1,000 characters</span>
              <textarea value={question} maxLength={1000} rows={3}
                onChange={e => { setQuestion(e.target.value); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="What would you like to investigate?" />
            </label>
            <Button type="button" onClick={prepare} disabled={!question.trim()}>
              <FileCheck2 className="mr-2 h-4 w-4" />Prepare request locally
            </Button>
            {draft && (
              <div className="space-y-2 rounded-lg border border-cyan-400/20 bg-slate-950 p-3">
                <Badge variant="outline">Local only · not sent to AI</Badge>
                <p className="text-xs text-slate-400">Feature: {draft.featureKey}</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">{formatResearchDraft(draft)}</pre>
                <Button type="button" variant="outline" onClick={() => copy(formatResearchDraft(draft), "Research request")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy prepared request
                </Button>
              </div>
            )}
            <section className="space-y-3 rounded-xl border border-violet-400/20 bg-slate-950 p-4" aria-label="Optional AI note synthesis">
              <h3 className="font-semibold text-white">Synthesize your notes with AI Chat</h3>
              <p className="text-sm text-slate-400">
                Explicit network action using ai.chat credits and saved conversation history. No webpages are opened
                or verified. AI answers may be wrong; all references remain user-entered. The total notebook and instructions
                must fit 4,000 characters; oversized requests are rejected before submission without truncating evidence.
              </p>
              <Button type="button" disabled={!question.trim() || sources.length === 0 || evidence.length === 0 || ai.loading}
                onClick={synthesizeWithAI}>
                <Search className="mr-2 h-4 w-4" />{ai.loading ? "Synthesizing with AI…" : "Synthesize notes with AI Chat"}
              </Button>
              {ai.loading && <p role="status" className="text-xs text-cyan-200">AI request running. Changes hide the old result but cannot cancel a submitted credit charge.</p>}
              {ai.error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{ai.error}</AlertDescription></Alert>}
              {ai.result && (
                <div className="space-y-3">
                  <Badge variant="outline">AI-generated · sources not independently verified</Badge>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{ai.result}</pre>
                  <Button type="button" variant="outline" onClick={copyAIResult}><ClipboardCopy className="mr-2 h-4 w-4" />Copy AI synthesis</Button>
                </div>
              )}
            </section>
            <Button type="button" variant="ghost" onClick={clear}>
              <RotateCcw className="mr-2 h-4 w-4" />Clear entire notebook
            </Button>
            {error && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
            </Alert>}
            {notice && <Alert role="status" aria-live="polite">
              <ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default AIResearchStudio;
