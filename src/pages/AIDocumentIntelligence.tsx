import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, FileCheck2, FileSearch, RotateCcw, ScanSearch, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHARACTERS,
  LocalDocumentError,
  findDocumentMatches,
  formatDocumentDraft,
  inspectLocalDocument,
  prepareDocumentDraft,
  readLocalDocument,
  type DocumentSearchResults,
  type LocalDocumentInspection,
  type LocalDocumentKind,
  type LocalDocumentDraft,
  type LocalDocumentTask,
} from "@/lib/ai/document-local-tools";

const features = getFeaturesForStudio("documents");
const AIDocumentIntelligence = () => {
  const [kind, setKind] = useState<LocalDocumentKind>("txt");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspection, setInspection] = useState<LocalDocumentInspection | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchResults, setSearchResults] = useState<DocumentSearchResults | null>(null);
  const [task, setTask] = useState<LocalDocumentTask>("analyze");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<LocalDocumentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceField = useRef<HTMLTextAreaElement>(null);
  const fileReadVersion = useRef(0);

  const invalidate = () => {
    setInspection(null);
    setSearchResults(null);
    setDraft(null);
    setError(null);
    setNotice(null);
  };

  const explainError = (reason: unknown) => reason instanceof LocalDocumentError
    ? ({
      invalid_file: "Choose a nonempty TXT, Markdown, CSV, JSON or LOG text file no larger than 1 MiB.",
      invalid_text: "Document text must contain 1–100,000 characters and cannot contain binary NUL bytes.",
      invalid_kind: "Choose a supported document type.",
      invalid_search: "Enter a search term of 1–100 characters.",
      invalid_task: "Select document analysis or structured extraction.",
      invalid_instruction: "Instructions must be at most 1,000 characters; extraction needs field instructions.",
      read_failed: "The local file could not be read.",
    }[reason.code])
    : "The local document operation failed.";

  const chooseFile = async (file: File | null) => {
    const version = ++fileReadVersion.current;
    setLoading(!!file);
    if (!file) return;
    setError(null);
    try {
      const loaded = await readLocalDocument(file);
      if (version !== fileReadVersion.current) return;
      invalidate();
      setKind(loaded.kind);
      setSource(loaded.text);
      setFileName(loaded.name);
    } catch (e) {
      if (version === fileReadVersion.current) setError(explainError(e));
    } finally {
      if (version === fileReadVersion.current) setLoading(false);
    }
  };

  const setEditedSource = (value: string) => {
    fileReadVersion.current += 1;
    setLoading(false);
    setFileName(null);
    setSource(value);
    invalidate();
  };

  const clear = () => {
    if ((source || instruction) && !window.confirm("Clear the document, search results and request draft?")) return;
    fileReadVersion.current += 1;
    setLoading(false);
    setKind("txt");
    setSource("");
    setFileName(null);
    setSearchTerm("");
    setCaseSensitive(false);
    setTask("analyze");
    setInstruction("");
    invalidate();
  };
  const inspect = () => {
    setError(null);
    setInspection(null);
    try {
      setInspection(inspectLocalDocument(source, kind));
    } catch (e) { setError(explainError(e)); }
  };
  const search = () => {
    setError(null);
    setSearchResults(null);
    try {
      setSearchResults(findDocumentMatches(source, searchTerm, caseSensitive));
    } catch (e) { setError(explainError(e)); }
  };
  const goToHeading = (line: number) => {
    const field = sourceField.current;
    if (!field) return;
    const lines = field.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0);
    field.focus();
    field.setSelectionRange(start, start + lines[line - 1].length);
  };

  const downloadMatches = (format: "json" | "txt") => {
    if (!searchResults) return;
    const report = {
      fileName, kind, caseSensitive, query: searchResults.query,
      total: searchResults.total, truncated: searchResults.truncated,
      matches: searchResults.matches.map(({ line, column, excerpt, excerptOffset, length }) => ({
        line, column, excerpt, matchedText: excerpt.slice(excerptOffset, excerptOffset + length),
      })),
    };
    const contents = format === "json" ? JSON.stringify(report, null, 2) : [
      fileName || "Pasted document",
      `Search: ${report.query} · ${caseSensitive ? "case-sensitive" : "case-insensitive"}`,
      `Showing ${report.matches.length} of ${report.total} matches`,
      ...report.matches.map(m => `Line ${m.line}, column ${m.column} · ${m.matchedText}\n${m.excerpt}`),
    ].join("\n\n");
    const url = URL.createObjectURL(new Blob([contents], { type: format === "json" ? "application/json" : "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-document-matches." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const prepare = () => {
    setError(null);
    setDraft(null);
    try {
      setDraft(prepareDocumentDraft(source, kind, task, instruction));
    } catch (e) { setError(explainError(e)); }
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(label + " copied. No AI service was contacted.");
      setError(null);
    } catch {
      setError("Clipboard permission was denied. Select and copy the text manually.");
      setNotice(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>
        <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-slate-950 to-violet-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-cyan-200"><FileSearch className="h-7 w-7" />LOCAL DOCUMENT WORKSPACE</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Document Intelligence</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Inspect, search, and prepare user-provided text documents privately in your browser.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Local tools ready · AI analysis disabled</Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            TXT, Markdown, CSV, JSON and LOG are supported for local text inspection only. PDF/OCR, image extraction, AI questions and
            server-backed document understanding are not enabled. No file is uploaded, no AI job is created, and no credits are reserved.
            File extension and MIME labels are not verified proof of a document's format.
          </AlertDescription>
        </Alert>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Private document input</CardTitle>
            <CardDescription className="text-slate-400">Read a local text file (maximum 1 MiB) or paste text below (maximum 100,000 characters).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="document-local-file" className="block text-sm text-slate-300">Choose a local text file</label>
            <input
              id="document-local-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.log"
              onChange={e => {
                void chooseFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
              className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
            />
            {loading && <p role="status" className="text-sm text-cyan-200">Reading local file…</p>}
            {fileName && <p className="break-all text-sm text-slate-300">Loaded locally: {fileName}</p>}
            <label htmlFor="document-kind" className="block space-y-2 text-sm text-slate-300">
              <span>Interpret content as</span>
              <select id="document-kind" value={kind} onChange={e => { setKind(e.target.value as LocalDocumentKind); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                {DOCUMENT_KINDS.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}
              </select>
            </label>
            <label htmlFor="document-source" className="block space-y-2 text-sm text-slate-300">
              <span>Document text</span>
              <textarea ref={sourceField} id="document-source" value={source} maxLength={MAX_DOCUMENT_CHARACTERS} rows={10}
                onChange={e => setEditedSource(e.target.value)}
                placeholder="Paste plain text, Markdown, CSV or JSON here. Nothing is sent to a server…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span>{source.length}/{MAX_DOCUMENT_CHARACTERS} characters</span>
              <span>Local file limit: {MAX_DOCUMENT_BYTES / (1024 * 1024)} MiB</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={inspect} disabled={!source.trim() || loading}><FileCheck2 className="mr-2 h-4 w-4" />Inspect document</Button>
              <Button type="button" variant="ghost" onClick={clear}><RotateCcw className="mr-2 h-4 w-4" />Clear workspace</Button>
            </div>
            {inspection && (
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <strong className="text-white">Local document inspection</strong>
                <p className="text-sm text-slate-300">{inspection.metrics.characters} characters · {inspection.metrics.words} words · {inspection.metrics.lines} lines · {inspection.metrics.paragraphs} paragraphs</p>
                {inspection.kind === "md" && (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">Markdown headings (first 100): {inspection.headings.length}{inspection.headingsTruncated ? " · additional headings omitted" : ""}</p>
                    <ul className="max-h-60 space-y-1 overflow-auto text-sm text-slate-400">
                      {inspection.headings.map((heading, index) => <li key={index}><button type="button" onClick={() => goToHeading(heading.line)} className="min-h-11 break-words rounded px-1 text-left text-cyan-200 underline underline-offset-4 focus-visible:ring-2">Line {heading.line} · {heading.text}</button></li>)}
                    </ul>
                  </div>
                )}
                {inspection.json && (
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>JSON syntax: {inspection.json.valid ? "Valid" : "Invalid"} · Root: {inspection.json.root}</p>
                    {inspection.json.itemCount !== null && <p>Array items: {inspection.json.itemCount}</p>}
                    {inspection.json.topLevelKeys.length > 0 && <p className="break-words">First 50 top-level keys: {inspection.json.topLevelKeys.join(", ")}</p>}
                  </div>
                )}
                {inspection.csv && (
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>CSV syntax: {inspection.csv.valid ? "Valid" : "Malformed"} · Rows: {inspection.csv.rows} · Maximum columns: {inspection.csv.columns} · Unequal-width rows: {inspection.csv.inconsistentRows}</p>
                    {inspection.csv.valid && (
                      <div className="max-h-60 overflow-auto">
                        <table className="min-w-full text-left text-xs">
                          <tbody>{inspection.csv.preview.map((row, i) => (
                            <tr key={i} className="border-b border-slate-800">{row.map((value, j) => <td key={j} className="max-w-64 break-words p-2 align-top">{value}</td>)}</tr>
                          ))}</tbody>
                        </table>
                        <p className="text-xs text-slate-500">Preview limited to the first 6 rows and 100 columns; cells truncated for display.</p>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-amber-200">Mechanical inspection only. No semantic AI understanding or verified field extraction.</p>
              </div>
            )}
            {error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <Alert role="status" aria-live="polite"><ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">Local text search</CardTitle><CardDescription className="text-slate-400">Search source lines exactly; results are not AI answers.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="document-search" className="block space-y-2 text-sm text-slate-300">
              <span>Find text · maximum 100 characters</span>
              <input onKeyDown={event => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && source.trim() && searchTerm.trim() && !loading) search();
              }} id="document-search" value={searchTerm} maxLength={100} onChange={e => { setSearchTerm(e.target.value); setSearchResults(null); setError(null); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Enter a keyword or phrase…" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={caseSensitive} onChange={e => { setCaseSensitive(e.target.checked); setSearchResults(null); }} />
              Case-sensitive search
            </label>
            <Button type="button" onClick={search} disabled={!source.trim() || !searchTerm.trim() || loading}>
              <ScanSearch className="mr-2 h-4 w-4" />Search document
            </Button>
            {searchResults && (
              <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <p role="status" className="text-sm text-slate-300">{searchResults.total} text matches for "{searchResults.query}"</p>
                {searchResults.truncated && <p className="text-xs text-amber-200">Displaying only the first 50 matches.</p>}
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => downloadMatches("json")}>Download matches (.json)</Button>
                  <Button type="button" variant="outline" onClick={() => downloadMatches("txt")}>Download matches (.txt)</Button></div>
                <ul className="max-h-72 space-y-2 overflow-auto text-sm text-slate-300">
                  {searchResults.matches.map((match, i) => (
                    <li key={i} className="border-b border-slate-800 pb-2">
                      <button type="button" className="min-h-11 rounded px-1 text-xs text-cyan-200 underline underline-offset-4 focus-visible:ring-2"
                        onClick={() => {
                          sourceField.current?.focus();
                          sourceField.current?.setSelectionRange(match.sourceOffset, match.sourceOffset + match.length);
                        }}>Go to line {match.line}, column {match.column}</button>
                      <p className="whitespace-pre-wrap break-words">{match.excerpt.slice(0, match.excerptOffset)}<mark className="rounded-sm bg-amber-200 px-0.5 text-slate-950">{match.excerpt.slice(match.excerptOffset, match.excerptOffset + match.length)}</mark>{match.excerpt.slice(match.excerptOffset + match.length)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">Future AI analysis request</CardTitle><CardDescription className="text-slate-400">Prepare a local, copyable request using the existing document feature registry. Nothing is submitted.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div role="group" aria-label="Document request type" className="flex flex-wrap gap-2">
              <Button type="button" variant={task === "analyze" ? "default" : "outline"} aria-pressed={task === "analyze"}
                onClick={() => { setTask("analyze"); setDraft(null); }}>Analyze</Button>
              <Button type="button" variant={task === "extract" ? "default" : "outline"} aria-pressed={task === "extract"}
                onClick={() => { setTask("extract"); setDraft(null); }}>Extract fields</Button>
            </div>
            <label htmlFor="document-instruction" className="block space-y-2 text-sm text-slate-300">
              <span>{task === "extract" ? "Fields to extract · required" : "Question or analysis instructions · optional"} (max 1,000 characters)</span>
              <textarea id="document-instruction" value={instruction} maxLength={1000} rows={3}
                onChange={e => { setInstruction(e.target.value); setDraft(null); }}
                placeholder={task === "extract" ? "For example: title, date, total, supplier" : "For example: identify key points and unresolved questions"}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500" />
            </label>
            <Button type="button" onClick={prepare} disabled={!source.trim() || loading || (task === "extract" && !instruction.trim())}>
              <FileCheck2 className="mr-2 h-4 w-4" />Prepare local request
            </Button>
            {draft && (
              <div className="space-y-2 rounded-lg border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Local only · no AI result</Badge>
                <p className="text-xs text-slate-400">Feature: {draft.featureKey}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-300">{formatDocumentDraft(draft)}</pre>
                <Button type="button" variant="outline" onClick={() => copy(formatDocumentDraft(draft), "Document request")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy request
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Planned · AI disabled</Badge></CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
};
export default AIDocumentIntelligence;
