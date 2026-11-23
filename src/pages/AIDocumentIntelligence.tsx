import { useRef, useState } from "react";
import { useAIStudioChat } from "@/hooks/useAIStudioChat";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, FileCheck2, FileSearch, RotateCcw, ScanSearch, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  MAX_COMPARISON_AI_CHANGES, MAX_COMPARISON_LINES,
  DocumentCompareError, compareLocalDocuments,
  formatDocumentComparison, prepareDocumentComparisonAIRequest,
  type DocumentComparison,
} from "@/lib/ai/document-compare-tools";
import {
  MAX_STRUCTURED_AI_CHANGES, StructuredCompareError,
  compareStructuredJson, compareStructuredCsv,
  formatStructuredComparison, prepareStructuredComparisonAIRequest,
  type StructuredComparison,
} from "@/lib/ai/document-structured-compare";
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
  const [aiPassage, setAiPassage] = useState<string | null>(null);
  const ai = useAIStudioChat();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceField = useRef<HTMLTextAreaElement>(null);
  const fileReadVersion = useRef(0);
  const comparisonReadVersion = useRef(0);
  const [comparisonSource, setComparisonSource] = useState("");
  const [comparisonFileName, setComparisonFileName] = useState<string | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonIgnoreWhitespace, setComparisonIgnoreWhitespace] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"line" | "json" | "csv">("line");
  const [comparisonCsvKey, setComparisonCsvKey] = useState("");
  const [structuredComparison, setStructuredComparison] = useState<StructuredComparison | null>(null);
  const [comparison, setComparison] = useState<DocumentComparison | null>(null);
  const [comparisonQuestion, setComparisonQuestion] = useState("");
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const comparisonAI = useAIStudioChat();

  const invalidateComparison = () => {
    comparisonAI.invalidate();
    setComparison(null);
    setStructuredComparison(null);
    setComparisonError(null);
  };
  const invalidate = () => {
    invalidateComparison();
    ai.invalidate();
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
      setAiPassage(null);
      setFileName(loaded.name);
    } catch (e) {
      if (version === fileReadVersion.current) setError(explainError(e));
    } finally {
      if (version === fileReadVersion.current) setLoading(false);
    }
  };

  const chooseComparisonFile = async (file: File | null) => {
    const version = ++comparisonReadVersion.current;
    invalidateComparison();
    setComparisonLoading(!!file);
    setComparisonSource("");
    setComparisonFileName(null);
    if (!file) {
      setComparisonLoading(false);
      return;
    }
    try {
      const loaded = await readLocalDocument(file);
      if (version !== comparisonReadVersion.current) return;
      setComparisonSource(loaded.text);
      setComparisonFileName(loaded.name);
    } catch (failure) {
      if (version === comparisonReadVersion.current) {
        setComparisonError(explainError(failure));
      }
    } finally {
      if (version === comparisonReadVersion.current) setComparisonLoading(false);
    }
  };
  const editComparisonSource = (value: string) => {
    comparisonReadVersion.current += 1;
    setComparisonLoading(false);
    setComparisonSource(value);
    setComparisonFileName(null);
    invalidateComparison();
  };
  const compareDocuments = () => {
    invalidateComparison();
    try {
      if (comparisonMode === "line") {
        setComparison(compareLocalDocuments(source, comparisonSource, {
          beforeName: fileName, afterName: comparisonFileName,
          ignoreWhitespace: comparisonIgnoreWhitespace,
        }));
      } else {
        const options = { sourceA: fileName, sourceB: comparisonFileName };
        setStructuredComparison(comparisonMode === "json"
          ? compareStructuredJson(source, comparisonSource, options)
          : compareStructuredCsv(source, comparisonSource, comparisonCsvKey, options));
      }
    } catch (reason) {
      const messages: Record<string, string> = {
        invalid_source: "Enter nonempty text in both source boxes.",
        too_long: "Each comparison input must contain at most 100,000 characters.",
        too_many_lines: "Each input must have at most 1,200 lines for bounded local comparison.",
      };
      const structuredErrors: Record<string, string> = {
        invalid_input: "Both source documents must contain nonempty, nonbinary text.",
        too_long: "Each structured input must contain at most 100,000 characters.",
        invalid_json: "Both inputs must be valid JSON. No comparison was performed.",
        invalid_csv: "Both inputs must be well-formed CSV with unique headers and equal-width records.",
        too_deep: "JSON nesting exceeds the safe depth limit (32).",
        too_many_nodes: "JSON has too many nested nodes for a bounded local comparison (5,000).",
        too_many_rows: "CSV must contain at most 1,200 data records in each input.",
        too_many_columns: "CSV must contain at most 100 columns in each input.",
        too_many_changes: "Over 2,000 changes; comparison refused rather than silently truncated.",
        invalid_key: "Enter a CSV key column present in both header rows. Every key value must be nonempty.",
        duplicate_key: "Duplicate CSV key values found. Choose a unique column; no arbitrary row matching was performed.",
        schema_mismatch: "CSV column names must match between sources (column order may differ).",
      };
      setComparisonError(reason instanceof StructuredCompareError
        ? structuredErrors[reason.code] || "Structured comparison was rejected safely."
        : reason instanceof DocumentCompareError
          ? messages[reason.code] || "Comparison could not be completed safely."
          : "Local comparison failed.");
    }
  };
  const downloadComparison = (format: "txt" | "json") => {
    if (!comparison) return;
    const contents = format === "txt" ? formatDocumentComparison(comparison)
      : JSON.stringify(comparison, null, 2);
    const url = URL.createObjectURL(new Blob([contents], {
      type: format === "txt" ? "text/plain;charset=utf-8" : "application/json",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-local-document-diff." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadStructuredComparison = (format: "txt" | "json") => {
    if (!structuredComparison) return;
    const contents = format === "txt"
      ? formatStructuredComparison(structuredComparison)
      : JSON.stringify(structuredComparison, null, 2);
    const url = URL.createObjectURL(new Blob([contents], {
      type: format === "txt" ? "text/plain;charset=utf-8" : "application/json",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-structured-comparison." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const analyzeComparison = () => {
    if (!comparison && !structuredComparison) return;
    try {
      const prompt = structuredComparison
        ? prepareStructuredComparisonAIRequest(structuredComparison, comparisonQuestion)
        : prepareDocumentComparisonAIRequest(comparison!, comparisonQuestion);
      setComparisonError(null);
      void comparisonAI.run("ai.documents.analyze", prompt);
    } catch (reason) {
      const message = reason instanceof StructuredCompareError
        ? ({
            no_changes: "No structured changes to analyze. Both inputs match under the selected mode.",
            too_many_changes: "AI Chat accepts at most 12 structural changes. Narrow inputs manually; no request was made.",
            too_long: "Structural changes exceed the AI Chat request budget. Narrow inputs; nothing was silently truncated.",
            invalid_question: "Optional question must contain at most 250 characters.",
          } as Record<string, string>)[reason.code] || "The structured AI request was rejected safely."
        : reason instanceof DocumentCompareError
          ? ({
              no_changes: "No changes to analyze. The two documents match under the selected comparison mode.",
              too_many_changes: "AI analysis accepts at most 12 changed lines. Narrow your source texts; no AI request was made.",
              too_long: "The differences exceed the chat message budget. Narrow both sources manually; no text was silently truncated.",
              invalid_question: "The comparison question must be at most 250 characters.",
              invalid_source: "Both documents are required.",
              too_many_lines: "Too many lines for comparison.",
            }[reason.code])
          : "AI comparison request could not be prepared.";
      setComparisonError(message);
    }
  };
  const setEditedSource = (value: string) => {
    fileReadVersion.current += 1;
    setLoading(false);
    setFileName(null);
    setSource(value);
    setAiPassage(null);
    invalidate();
  };

  const clear = () => {
    if ((source || instruction) && !window.confirm("Clear the document, search results and request draft?")) return;
    fileReadVersion.current += 1;
    setLoading(false);
    setKind("txt");
    setSource("");
    comparisonReadVersion.current += 1;
    setComparisonSource("");
    setComparisonFileName(null);
    setComparisonIgnoreWhitespace(false);
    setComparisonMode("line");
    setComparisonCsvKey("");
    setComparisonQuestion("");
    setComparisonLoading(false);
    setAiPassage(null);
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
  const captureSelectedPassage = () => {
    const field = sourceField.current;
    if (!field || field.selectionStart === field.selectionEnd) {
      setError("Highlight a specific passage in the document text first.");
      return;
    }
    const passage = source.slice(field.selectionStart, field.selectionEnd);
    if (!passage.trim()) {
      setError("Select a nonempty passage to send for AI analysis.");
      return;
    }
    setAiPassage(passage);
    ai.invalidate();
    setError(null);
    setNotice("Excerpt selected. Nothing was uploaded or sent to AI.");
  };
  const askAI = () => {
    try {
      const request = prepareDocumentDraft(aiPassage ?? source, kind, task, instruction);
      setDraft(request);
      setError(null);
      setNotice(null);
      void ai.run(request.featureKey, formatDocumentDraft(request));
    } catch (failure) {
      setError(explainError(failure));
    }
  };
  const copyAIResult = async () => {
    if (!ai.result) return;
    try {
      await navigator.clipboard.writeText(ai.result);
      setNotice("AI-generated response copied.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select the AI response and copy it manually.");
    }
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
            Inspect and search local text, or explicitly request AI analysis or field extraction from a chosen text passage.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Local tools · opt-in AI Chat text analysis</Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            TXT, Markdown, CSV, JSON and LOG inspection stays local. Only clicking Analyze with AI Chat sends
            the full document text or a selected excerpt to the authenticated chat backend and its configured provider,
            and stores it in chat history using ai.chat credits. No automatic upload, PDF parsing, OCR, image analysis,
            independent fact checking or dedicated document model is activated. Do not send sensitive documents without permission.
            The AI request, including task instructions, must fit 4,000 characters; content is never silently truncated.
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
                placeholder="Paste plain text, Markdown, CSV or JSON here. Local inspection stays private; AI submission requires a separate click…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span>{source.length}/{MAX_DOCUMENT_CHARACTERS} characters</span>
              <span>Local file limit: {MAX_DOCUMENT_BYTES / (1024 * 1024)} MiB</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={inspect} disabled={!source.trim() || loading}><FileCheck2 className="mr-2 h-4 w-4" />Inspect document</Button>
              <Button type="button" variant="outline" disabled={!source.trim() || loading} onClick={captureSelectedPassage}>
                <ScanSearch className="mr-2 h-4 w-4" />Use highlighted excerpt for AI
              </Button>
              <Button type="button" variant="ghost" onClick={clear}><RotateCcw className="mr-2 h-4 w-4" />Clear workspace</Button>
            </div>
            {aiPassage && (
              <p role="status" className="text-xs text-cyan-200">
                AI excerpt selected: {aiPassage.length} characters. Only this excerpt—not the entire document—will be submitted if you click Analyze with AI Chat.
              </p>
            )}
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
          <CardHeader>
            <CardTitle className="text-white">Local two-document comparison</CardTitle>
            <CardDescription className="text-slate-400">
              Compare the source above (A) to an independent text file or pasted text (B).
              Compare raw lines, JSON fields by exact RFC 6901 paths, or CSV records by a unique key.
              All differences are computed privately in your browser, not generated by AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-400">
              Raw text comparison is bounded to {MAX_COMPARISON_LINES.toLocaleString()} lines per input.
              Structural JSON/CSV comparison uses additional depth, row and change caps.
              No source files leave the browser unless you explicitly request AI interpretation
              of a small, complete difference report.
            </p>
            <p className="break-all text-sm text-slate-300">Source A: {fileName || "Current pasted/edited document"}</p>
            <label htmlFor="document-compare-file" className="block text-sm text-slate-300">Optional source B text file</label>
            <input
              id="document-compare-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.log"
              onChange={e => {
                void chooseComparisonFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
              className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
            />
            {comparisonLoading && <p role="status" className="text-sm text-cyan-200">Reading source B locally…</p>}
            <label htmlFor="document-compare-source" className="block space-y-2 text-sm text-slate-300">
              <span>Source B {comparisonFileName ? "· " + comparisonFileName : "· pasted or edited text"}</span>
              <textarea id="document-compare-source" rows={7} maxLength={MAX_DOCUMENT_CHARACTERS}
                value={comparisonSource} onChange={e => editComparisonSource(e.target.value)}
                placeholder="Paste the second document to compare with source A above…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white placeholder:text-slate-500"
              />
            </label>
            <label htmlFor="document-comparison-mode" className="block space-y-2 text-sm text-slate-300">
              <span>Comparison method</span>
              <select id="document-comparison-mode" value={comparisonMode}
                onChange={e => {
                  setComparisonMode(e.target.value as "line" | "json" | "csv");
                  invalidateComparison();
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                <option value="line">Line-by-line text</option>
                <option value="json">JSON fields and array indexes</option>
                <option value="csv">CSV rows matched by unique key</option>
              </select>
            </label>
            {comparisonMode === "line" && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={comparisonIgnoreWhitespace} onChange={e => {
                  setComparisonIgnoreWhitespace(e.target.checked); invalidateComparison();
                }} />
                Ignore whitespace changes when matching lines
              </label>
            )}
            {comparisonMode === "json" && (
              <p className="text-xs text-slate-400">
                JSON keys are compared regardless of property order. Pointers follow RFC 6901.
                Arrays are compared by index, not inferred moves; invalid JSON or overly deep documents are rejected.
              </p>
            )}
            {comparisonMode === "csv" && (
              <div className="space-y-2">
                <label htmlFor="document-comparison-key" className="block space-y-1 text-sm text-slate-300">
                  <span>Required unique CSV key column — exact header name, case-sensitive</span>
                  <input id="document-comparison-key" value={comparisonCsvKey} maxLength={100}
                    onChange={e => { setComparisonCsvKey(e.target.value); invalidateComparison(); }}
                    placeholder="For example: asset_id"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
                </label>
                <p className="text-xs text-slate-400">
                  Matching key values must be present and unique in each file. Column order may vary,
                  but the two header sets must match. Quoted commas and multiline cells are supported.
                </p>
              </div>
            )}
            <Button type="button" disabled={!source.trim() || !comparisonSource.trim() || loading || comparisonLoading ||
              (comparisonMode === "csv" && !comparisonCsvKey)}
              onClick={compareDocuments}>
              <FileCheck2 className="mr-2 h-4 w-4" />Compare documents locally
            </Button>
            {comparison && (
              <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Actual local text diff · no AI call</Badge>
                <p role="status" className="text-sm text-slate-300">
                  {comparison.identical ? "No line differences found under this comparison mode." :
                    comparison.removedLines + " removed · " + comparison.addedLines + " added · " +
                    comparison.unchangedLines + " unchanged lines"}
                </p>
                <p className="text-xs text-slate-400">
                  Source A: {comparison.beforeName} ({comparison.beforeLines} lines). Source B:
                  {" "}{comparison.afterName} ({comparison.afterLines} lines). Exact original line numbers are retained.
                </p>
                {comparison.changes.length > 60 && <p className="text-xs text-amber-200">
                  Displaying the first 60 of {comparison.changes.length} changed lines.
                  Download the complete report to inspect all changes.
                </p>}
                <ul className="max-h-72 space-y-2 overflow-y-auto text-xs text-slate-300">
                  {comparison.changes.slice(0, 60).map((entry, index) => (
                    <li key={index} className="rounded-md border border-slate-700 p-2">
                      <strong className={entry.kind === "removed" ? "text-rose-300" : "text-emerald-300"}>
                        {entry.kind === "removed" ? "Removed · A line " + entry.beforeLine : "Added · B line " + entry.afterLine}
                      </strong>
                      <p className="mt-1 whitespace-pre-wrap break-words">{entry.text || "(empty line)"}</p>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void copy(formatDocumentComparison(comparison), "Full document differences")}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />Copy full difference report
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadComparison("txt")}>
                    Download all (.txt)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadComparison("json")}>
                    Download all (.json)
                  </Button>
                </div>
              </div>
            )}
            {structuredComparison && (
              <section aria-label="Structured document differences" className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Exact local {structuredComparison.mode.toUpperCase()} comparison · no AI call</Badge>
                <p role="status" className="text-sm text-slate-300">
                  {structuredComparison.identical ? "No structural changes found." :
                    structuredComparison.added + " added · " + structuredComparison.removed + " removed · " +
                    structuredComparison.changed + " changed"}
                  {" · "}{structuredComparison.unchanged} unchanged fields/cells
                </p>
                <p className="text-xs text-slate-400">
                  {structuredComparison.mode === "json"
                    ? "JSON property names are order-independent. Arrays are index-based; paths use RFC 6901 notation."
                    : "CSV records are aligned by exact unique key values. Column order is ignored; header sets must match."}
                  {" "}Values are copied from source data; no model verifies them.
                </p>
                {structuredComparison.changes.length > 50 && <p className="text-xs text-amber-200">
                  Displaying the first 50 of {structuredComparison.changes.length} changes.
                  TXT/JSON downloads include the full report without truncation.
                </p>}
                <ul className="max-h-80 space-y-2 overflow-y-auto text-xs text-slate-300">
                  {structuredComparison.changes.slice(0, 50).map((entry, index) => (
                    <li key={index} className="rounded-md border border-slate-700 p-3">
                      <strong className="break-all text-cyan-200">
                        {entry.kind.toUpperCase()} · {entry.location || "(JSON root)"}
                      </strong>
                      <p className="mt-2 break-all whitespace-pre-wrap text-rose-200">
                        Before: {entry.before === null ? "(not present)" : entry.before}
                      </p>
                      <p className="mt-1 break-all whitespace-pre-wrap text-emerald-200">
                        After: {entry.after === null ? "(not present)" : entry.after}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline"
                    onClick={() => void copy(formatStructuredComparison(structuredComparison), "Structured difference report")}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />Copy full structural report
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadStructuredComparison("txt")}>
                    Download full report (.txt)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadStructuredComparison("json")}>
                    Download full report (.json)
                  </Button>
                </div>
              </section>
            )}
            <section aria-label="Optional AI difference analysis" className="space-y-3 rounded-xl border border-violet-400/20 bg-slate-950 p-4">
              <h3 className="font-semibold text-white">Optional AI interpretation of actual changes</h3>
              <p className="text-sm text-slate-400">
                Only clicking Analyze changes with AI Chat sends the bounded diff text to an external
                model, uses existing ai.chat credits and stores chat history. Maximum {MAX_COMPARISON_AI_CHANGES}
                changed lines or {MAX_STRUCTURED_AI_CHANGES} JSON/CSV structural changes; larger reports must be
                narrowed manually, without silent truncation.
                The model's interpretation is not independent verification of either original document.
              </p>
              <label htmlFor="document-comparison-question" className="block space-y-2 text-sm text-slate-300">
                <span>Optional comparison question · maximum 250 characters</span>
                <input id="document-comparison-question" value={comparisonQuestion} maxLength={250}
                  onChange={e => { setComparisonQuestion(e.target.value); comparisonAI.invalidate(); }}
                  placeholder="Which requirements changed and need review?"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white"
                />
              </label>
              <Button type="button" onClick={analyzeComparison}
                disabled={comparisonAI.loading ||
                  (!comparison && !structuredComparison) ||
                  (comparison !== null && (comparison.identical || comparison.changes.length > MAX_COMPARISON_AI_CHANGES)) ||
                  (structuredComparison !== null && (structuredComparison.identical ||
                    structuredComparison.changes.length > MAX_STRUCTURED_AI_CHANGES))}>
                {comparisonAI.loading ? "Analyzing comparison…" : "Analyze changes with AI Chat"}
              </Button>
              {comparison && comparison.changes.length > MAX_COMPARISON_AI_CHANGES && (
                <p role="status" className="text-xs text-amber-200">
                  This comparison has {comparison.changes.length} changed lines.
                  Narrow the documents to at most {MAX_COMPARISON_AI_CHANGES} differences for optional AI analysis.
                  Full local copy and downloads still work.
                </p>
              )}
              {structuredComparison && structuredComparison.changes.length > MAX_STRUCTURED_AI_CHANGES && (
                <p role="status" className="text-xs text-amber-200">
                  This structural comparison has {structuredComparison.changes.length} changes.
                  Narrow your input to 12 changes or fewer before sending for AI analysis.
                  Local exports remain available.
                </p>
              )}
              {comparisonAI.error && <Alert role="alert" variant="destructive">
                <XCircle className="h-4 w-4" /><AlertDescription>{comparisonAI.error}</AlertDescription>
              </Alert>}
              {comparisonAI.result && <div className="space-y-2">
                <Badge variant="outline">AI interpretation · verify against both documents</Badge>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{comparisonAI.result}</pre>
                <Button type="button" variant="outline" onClick={() => void copy(comparisonAI.result!, "AI document comparison")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy AI interpretation
                </Button>
              </div>}
            </section>
            {comparisonError && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{comparisonError}</AlertDescription>
            </Alert>}
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
          <CardHeader><CardTitle className="text-white">Document analysis request</CardTitle><CardDescription className="text-slate-400">Prepare a local request, then optionally submit a bounded excerpt for AI analysis using existing chat credits.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div role="group" aria-label="Document request type" className="flex flex-wrap gap-2">
              <Button type="button" variant={task === "analyze" ? "default" : "outline"} aria-pressed={task === "analyze"}
                onClick={() => { setTask("analyze"); setDraft(null); ai.invalidate(); }}>Analyze</Button>
              <Button type="button" variant={task === "extract" ? "default" : "outline"} aria-pressed={task === "extract"}
                onClick={() => { setTask("extract"); setDraft(null); ai.invalidate(); }}>Extract fields</Button>
            </div>
            <label htmlFor="document-instruction" className="block space-y-2 text-sm text-slate-300">
              <span>{task === "extract" ? "Fields to extract · required" : "Question or analysis instructions · optional"} (max 1,000 characters)</span>
              <textarea id="document-instruction" value={instruction} maxLength={1000} rows={3}
                onChange={e => { setInstruction(e.target.value); setDraft(null); ai.invalidate(); }}
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
            <section className="space-y-3 rounded-xl border border-violet-400/20 bg-slate-950 p-4" aria-label="Optional document AI analysis">
              <h3 className="font-semibold text-white">Analyze the selected text with ETERNYX AI</h3>
              <p className="text-sm text-slate-400">
                Only an explicit click sends your {aiPassage ? "highlighted excerpt" : "full document text"} to the
                existing AI Chat provider. Credit usage, saved chat history, and possible external processing apply.
                The 4,000-character total request limit is enforced before any network call.
                Output is not a verified extraction or factual guarantee.
              </p>
              <Button type="button" disabled={!source.trim() || loading || ai.loading || (task === "extract" && !instruction.trim())} onClick={askAI}>
                <FileSearch className="mr-2 h-4 w-4" />{ai.loading ? "Analyzing with AI…" : "Analyze with AI Chat"}
              </Button>
              {ai.loading && <p role="status" className="text-xs text-cyan-200">Request in progress. Changing input hides the old response but does not cancel a submitted credit charge.</p>}
              {ai.error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{ai.error}</AlertDescription></Alert>}
              {ai.result && (
                <div className="space-y-3">
                  <Badge variant="outline">AI-generated · check against source text</Badge>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{ai.result}</pre>
                  <Button type="button" variant="outline" onClick={copyAIResult}><ClipboardCopy className="mr-2 h-4 w-4" />Copy AI analysis</Button>
                </div>
              )}
            </section>
          </CardContent>
        </Card>
        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Dedicated backend planned · opt-in AI Chat text bridge available by entitlement</Badge></CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
};
export default AIDocumentIntelligence;
