import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FilePlus2, FolderOpen, Play, RotateCcw, Save, ShieldCheck, Trash2, Upload, WandSparkles, FileJson, FileCheck2, Files, ListFilter, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PREVIEW_VIEWPORTS, developerPreviewWidth, developerLinePosition,
  mergeDeveloperLocalTextFiles, readDeveloperLocalTextFiles,
  restoreSavedDeveloperFile,
} from "@/lib/developerLocalWorkflows.mjs";
import ProjectInspectionPanel from "@/components/developer/ProjectInspectionPanel";
import ProjectRecoveryPanel from "@/components/developer/ProjectRecoveryPanel";
import { exportDeveloperPreflight, runDeveloperPreflight } from "@/lib/developerProjectPreflight.mjs";
import { replaceDeveloperFileText } from "@/lib/developerProjectInspection.mjs";
import { duplicateDeveloperFile, editorCursorInfo, editorTabChange, exportJavascriptValidationReport, filterProjectFilenames, formatProjectJson, normalizeProjectWhitespace, validateProjectJavascript } from "@/lib/developerEditorUtils.mjs";
import {
  PROJECT_STORAGE_KEY, MAX_PROJECT_FILES, MAX_SAVED_PROJECTS,
  addDeveloperFile, checkDeveloperProject, createDeveloperProject, editDeveloperFile,
  exportDeveloperProject, importDeveloperProject, normalizeDeveloperProject,
  normalizeSavedDeveloperProjects, previewDeveloperProject, removeDeveloperFile,
  renameDeveloperFile, saveDeveloperProject,
} from "@/lib/developerProjectLab.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type Template = "starter" | "landing" | "blank";
type Feedback = { message: string; error: boolean } | null;

function readSaved(): Project[] {
  try { return normalizeSavedDeveloperProjects(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || "[]")); }
  catch { return []; }
}
function download(name: string, data: string, mime = "application/json;charset=utf-8") {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DeveloperProjectLab() {
  const [project, setProject] = useState<Project>(() => createDeveloperProject("starter", crypto.randomUUID()));
  const [activeFile, setActiveFile] = useState("index.html");
  const [newFileName, setNewFileName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [importText, setImportText] = useState("");
  const [saved, setSaved] = useState<Project[]>(readSaved);
  const [savedCopy, setSavedCopy] = useState("");
  const [checkpoints, setCheckpoints] = useState<Project[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState("");
  const [previewRun, setPreviewRun] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [importReplacing, setImportReplacing] = useState(false);
  const [importingFiles, setImportingFiles] = useState(false);
  const [lineTarget, setLineTarget] = useState("1");
  const [previewMode, setPreviewMode] = useState("fluid");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const quickOpenRef = useRef<HTMLInputElement>(null);
  const [quickOpen, setQuickOpen] = useState("");
  const [cursor, setCursor] = useState({line:1,column:1,selected:0,lines:1,chars:0});
  const [jsValidation, setJsValidation] = useState<{ filesChecked: number; issues: Array<{file:string;line:number;column:number;code:number;message:string}>; truncated:boolean } | null>(null);
  const [jsSource, setJsSource] = useState("");
  const [validatingJs, setValidatingJs] = useState(false);
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof runDeveloperPreflight>> | null>(null);
  const [preflightSource, setPreflightSource] = useState("");
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [selection, setSelection] = useState<{ file: string; index: number; length: number } | null>(null);
  const file = project.files.find((item) => item.name === activeFile) || project.files[0];
  const currentSource = JSON.stringify(project.files);
  const fileMatches = useMemo(() => filterProjectFilenames(project, quickOpen), [project, quickOpen]);
  const jsStale = jsValidation !== null && jsSource !== currentSource;
  const preflightStale = preflight !== null && preflightSource !== currentSource;
  const dirty = savedCopy !== JSON.stringify(project);
  const previewStale = previewHtml !== null && previewSource !== currentSource;
  const findings = useMemo(() => checkDeveloperProject(project), [project]);
  const savedBaseline = useMemo(() => {
    try { return savedCopy ? normalizeDeveloperProject(JSON.parse(savedCopy)) : null; }
    catch { return null; }
  }, [savedCopy]);
  const alert = (message: string, error = false) => setFeedback({ message, error });

  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [dirty]);

  useEffect(() => {
    if (!selection || selection.file !== file.name) return;
    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(selection.index, selection.index + selection.length);
  }, [selection, file.name]);

  const jumpToMatch = (match: { file: string; index: number; length: number }) => {
    setActiveFile(match.file);
    setSelection({ file: match.file, index: match.index, length: match.length });
  };
  const replaceActiveText = (query: string, replacement: string, all: boolean) => {
    try {
      const result = replaceDeveloperFileText(project, file.name, query, replacement, all);
      if (!result.count) { alert("No exact-case matches in the active file."); return; }
      const next = commit(() => result.project);
      if (next) {
        setSelection(null);
        alert("Replaced " + result.count + " occurrence(s) in " + file.name + ". Change checkpoint created; save explicitly to persist.");
      }
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Replacement failed.", true);
    }
  };

  const safeTransition = () => !dirty || window.confirm("You have unsaved project changes. Continue and discard them?");
  const applyProject = (next: Project, markSaved = false) => {
    setProject(next);
    setActiveFile(next.files[0].name);
    setRenameName("");
    setNewFileName("");
    setPreviewHtml(null);
    setPreviewSource("");
    setCheckpoints([]);
    setSavedCopy(markSaved ? JSON.stringify(next) : "");
    setFeedback(null);
    setQuickOpen("");
    setLineTarget("1");
    setJsValidation(null);
    setJsSource("");
    setPreflight(null);
    setPreflightSource("");
    setCursor(editorCursorInfo(next.files[0].content, 0));
  };
  const update = (fn: (old: Project) => Project) => {
    try {
      const next = fn(project);
      setProject(next);
      setFeedback(null);
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Unable to update file.", true); }
  };
  const commit = (fn: (old: Project) => Project) => {
    try {
      const next = fn(project);
      setCheckpoints((list) => [...list, project].slice(-5));
      setProject(next);
      setFeedback(null);
      return next;
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "File operation failed.", true);
      return null;
    }
  };
  const createFile = () => {
    const next = commit((old) => addDeveloperFile(old, newFileName));
    if (!next) return;
    setActiveFile(newFileName);
    setRenameName("");
    setNewFileName("");
  };
  const renameFile = () => {
    const next = commit((old) => renameDeveloperFile(old, file.name, renameName));
    if (!next) return;
    setActiveFile(renameName);
    setRenameName("");
  };
  const deleteFile = () => {
    if (!window.confirm("Delete " + file.name + " from this unsaved project?")) return;
    const next = commit((old) => removeDeveloperFile(old, file.name));
    if (next) setActiveFile(next.files[0].name);
  };
  const save = () => {
    try {
      const next = saveDeveloperProject(saved, project);
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      setSavedCopy(JSON.stringify(project));
      alert("Saved to this browser. No account synchronization or cloud backup.");
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Local storage is unavailable.", true); }
  };
  const removeSaved = (id: string) => {
    if (!window.confirm("Delete this saved browser copy?")) return;
    try {
      const next = saved.filter((item) => item.id !== id);
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      if (project.id === id) setSavedCopy("");
      alert("Saved browser copy deleted.");
    } catch { alert("Browser storage unavailable; saved project was not deleted.", true); }
  };
  const start = (kind: Template) => {
    if (!safeTransition()) return;
    applyProject(createDeveloperProject(kind, crypto.randomUUID()));
    alert("Started a new " + kind + " project. Save explicitly to retain it in this browser.");
  };
  const importProject = () => {
    try {
      const next = importDeveloperProject(importText, crypto.randomUUID());
      if (!safeTransition()) return;
      applyProject(next);
      setImportText("");
      alert("Imported an editable project. Preview was not run automatically.");
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Import failed.", true); }
  };
  const runPreview = () => {
    try {
      const html = previewDeveloperProject(project);
      setPreviewHtml(html);
      setPreviewSource(currentSource);
      setPreviewRun((n) => n + 1);
      alert("Preview updated in an opaque-origin sandbox. Preview output is not a full security boundary.");
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Unable to preview.", true); }
  };
  const restore = () => {
    const previous = checkpoints.at(-1);
    if (!previous) return;
    setProject(previous);
    setActiveFile(previous.files.some((entry) => entry.name === activeFile) ? activeFile : previous.files[0].name);
    setCheckpoints((items) => items.slice(0, -1));
    setPreviewHtml(null);
    alert("Restored the most recent checkpoint. This does not undo every keystroke.");
  };
  const createCheckpoint = () => {
    setCheckpoints((items) => [...items, project].slice(-5));
    alert("Checkpoint captured in memory. It will disappear when you close this page.");
  };

  const selectFile = (name: string) => {
    setLineTarget("1");
    setActiveFile(name);
    setRenameName("");
    setSelection(null);
    setCursor(editorCursorInfo(project.files.find(entry => entry.name === name)?.content || "", 0));
    setQuickOpen("");
  };
  const goToLine = () => {
    try {
      const location = developerLinePosition(file.content, Number(lineTarget));
      jumpToMatch({ file: file.name, index: location.index, length: 0 });
      setCursor(editorCursorInfo(file.content, location.index));
      alert("Moved to " + file.name + ", line " + location.line + ".");
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Line navigation failed.", true); }
  };
  const restoreActiveSaved = () => {
    if (!savedBaseline || !window.confirm("Restore this file from the last saved project? A checkpoint will preserve the current working version.")) return;
    const next = commit(old => restoreSavedDeveloperFile(old, savedBaseline, file.name));
    if (next) {
      setSelection(null);
      alert("Restored " + file.name + " from the saved browser version. Save explicitly to persist.");
    }
  };
  const importLocalFiles = async (input: HTMLInputElement) => {
    const chosen = Array.from(input.files || []);
    input.value = "";
    if (!chosen.length || importingFiles) return;
    setImportingFiles(true);
    try {
      const loaded = await readDeveloperLocalTextFiles(chosen);
      const result = mergeDeveloperLocalTextFiles(project, loaded, { overwrite: importReplacing });
      if (result.replaced.length && !window.confirm("Replace " + result.replaced.join(", ") + " from your local files? A checkpoint will be created.")) return;
      const next = commit(() => result.project);
      if (next) {
        selectFile(result.selectedName);
        alert("Imported " + result.added.length + " new and " + result.replaced.length + " replaced local text file(s). Preview was not executed; save explicitly.");
      }
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Local text import failed.", true); }
    finally { setImportingFiles(false); }
  };
  const exportStandalonePreview = () => {
    if (!window.confirm("Export a standalone HTML file containing your project JavaScript? Opening it outside ETERNYX may execute that code. Only open trusted code.")) return;
    try {
      const html = previewDeveloperProject(project);
      download("eternyx-standalone-preview.html", html, "text/html;charset=utf-8");
      alert("Exported an offline HTML preview. It is not a deployment, hosted URL, or security certification.");
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Preview export failed.", true); }
  };
  const trackCursor = (target: HTMLTextAreaElement) => {
    setCursor(editorCursorInfo(target.value, target.selectionStart, target.selectionEnd));
  };
  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    try {
      const next = editorTabChange(file.content, target.selectionStart, target.selectionEnd, event.shiftKey);
      if (next.value === file.content) return;
      const updated = editDeveloperFile(project, file.name, next.value);
      setProject(updated);
      setCursor(editorCursorInfo(next.value, next.start, next.end));
      window.requestAnimationFrame(() => editorRef.current?.setSelectionRange(next.start, next.end));
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Unable to indent.", true); }
  };
  const formatSelectedJson = () => {
    if (!file.name.toLowerCase().endsWith(".json")) return;
    try {
      const formatted = formatProjectJson(file.content);
      if (formatted === file.content) { alert("JSON is already formatted."); return; }
      const next = commit((old) => editDeveloperFile(old, file.name, formatted));
      if (next) alert("Formatted the selected JSON file. Restore checkpoint created.");
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Invalid JSON.", true); }
  };
  const cleanWhitespace = () => {
    const normalized = normalizeProjectWhitespace(file.content, { trimTrailing: true });
    if (normalized === file.content) { alert("Line endings and trailing whitespace are already normalized."); return; }
    const next = commit((old) => editDeveloperFile(old, file.name, normalized));
    if (next) alert("Normalized line endings and trailing whitespace. Restore checkpoint created.");
  };
  const duplicateFile = () => {
    try {
      const result = duplicateDeveloperFile(project, file.name);
      const next = commit(() => result.project);
      if (next) selectFile(result.name);
    } catch (cause) { alert(cause instanceof Error ? cause.message : "Could not duplicate file.", true); }
  };
  const validateJs = async () => {
    if (validatingJs) return;
    setValidatingJs(true);
    const source = currentSource;
    try {
      const checked = await validateProjectJavascript(project);
      setJsValidation(checked);
      setJsSource(source);
      alert(checked.issues.length ? "JavaScript parser found " + checked.issues.length + " syntax issue(s)." : "JavaScript parse checks found no syntax errors. Runtime correctness is not verified.");
    } catch { alert("JavaScript parser could not load in this browser.", true); }
    finally { setValidatingJs(false); }
  };
  const handleRecovery = (restored: Project) => {
    applyProject(restored);
    alert("Restored a verified local backup. Save browser copy explicitly to keep this version.");
  };
  const checkPreflight = async () => {
    if (preflightRunning) return;
    const source = currentSource;
    setPreflightRunning(true);
    try {
      const report = await runDeveloperPreflight(project);
      setPreflight(report);
      setPreflightSource(source);
      alert(report.errors ? "Preflight found " + report.errors + " blocking issue(s). This is not a deployment certification." : "Preflight completed with no blocking issues from checked rules. Runtime behavior is still unverified.");
    } catch { alert("Project preflight failed; no result was certified.", true); }
    finally { setPreflightRunning(false); }
  };
  const downloadPreflight = () => {
    if (!preflight || preflightStale) { alert("Rerun preflight on the current project before exporting.", true); return; }
    download("eternyx-preflight-report.json", exportDeveloperPreflight(preflight));
  };
  const exportJsReport = async () => {
    try {
      const report = await exportJavascriptValidationReport(project);
      download("eternyx-js-parse-report.json", report);
      alert("Exported source-free JavaScript parser findings for the current project.");
    } catch { alert("Unable to generate JavaScript parser report.", true); }
  };

  useEffect(() => {
    const onShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!["s", "enter", "p"].includes(key)) return;
      event.preventDefault();
      if (key === "s") save();
      else if (key === "enter") runPreview();
      else quickOpenRef.current?.focus();
    };
    document.addEventListener("keydown", onShortcuts);
    return () => document.removeEventListener("keydown", onShortcuts);
  });

  return <div className="min-h-screen bg-background text-white">
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
      <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-slate-950 to-cyan-950/50 p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">ETERNYX · Developer Studio</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-5xl">Local Project Lab</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Edit multi-file HTML, CSS, JavaScript, JSON, and text projects. Preview runs only when you click Run. This is an isolated browser learning workbench, not a remote IDE or cloud code execution environment.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400"><span>Up to 12 files</span><span>·</span><span>Explicit local save</span><span>·</span><span>Versioned JSON export</span><span>·</span><span>No backend required</span></div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-52 flex-1"><Label htmlFor="project-name">Project name</Label><Input id="project-name" maxLength={80}
          value={project.name} onChange={(e) => update((old) => normalizeDeveloperProject({ ...old, name: e.target.value || "Untitled" }))}
          className="mt-2 max-w-xl border-slate-700 bg-slate-950 text-white" /></div>
        <div className="flex flex-wrap items-center gap-2 self-end">
          <span role="status" className={dirty ? "text-xs text-amber-300" : "text-xs text-emerald-300"}>{dirty ? "Unsaved changes" : "Saved locally"}</span>
          <Button type="button" onClick={save}><Save className="mr-2 h-4 w-4" />Save browser copy</Button>
          <Button type="button" variant="outline" onClick={() => download("eternyx-project.json", exportDeveloperProject(project))}><Download className="mr-2 h-4 w-4" />Export project</Button>
          {saved.some(item => item.id === project.id) && <Button asChild variant="outline"><Link to={"/developer-studio/api-workbench?projectId=" + encodeURIComponent(project.id)}>Open project API tests</Link></Button>}
        </div>
      </div>

      {feedback && <p role={feedback.error ? "alert" : "status"} className={"rounded-lg border p-3 text-sm " + (feedback.error ? "border-rose-400/30 text-rose-300" : "border-cyan-400/30 text-cyan-200")}>{feedback.message}</p>}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5 text-cyan-300" />Project files</CardTitle><CardDescription className="text-slate-400">Text files only; no filesystem or remote repository access.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="project-quick-open">Quick open files (Ctrl+P)</Label>
              <Input ref={quickOpenRef} id="project-quick-open" type="search" value={quickOpen} onChange={e => setQuickOpen(e.target.value.slice(0,80))}
                onKeyDown={e => { if (e.key === "Enter" && fileMatches.length) selectFile(fileMatches[0]); }}
                placeholder="Find filename" className="border-slate-700 bg-slate-950 text-white" /></div>
            <div className="space-y-1" role="group" aria-label="Project files">{project.files.filter(entry => fileMatches.includes(entry.name)).map((entry) =>
              <button type="button" key={entry.name} aria-pressed={file.name === entry.name} onClick={() => selectFile(entry.name)}
                className={"w-full rounded-md border px-3 py-2 text-left font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 " + (entry.name === file.name ? "border-cyan-400/70 bg-cyan-950/60 text-cyan-100" : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-cyan-500/40")}>{entry.name}</button>)}</div>
            {!fileMatches.length && <p className="text-xs text-slate-400">No filename matches.</p>}
            <p className="text-xs text-slate-400">{project.files.length} / {MAX_PROJECT_FILES} files</p>
            <div className="space-y-2"><Label htmlFor="add-filename">New file name</Label>
              <Input id="add-filename" value={newFileName} maxLength={64} onChange={(e) => setNewFileName(e.target.value)} placeholder="notes.md"
                className="border-slate-700 bg-slate-950 text-white"/>
              <Button variant="outline" size="sm" disabled={!newFileName.trim() || project.files.length >= MAX_PROJECT_FILES} onClick={createFile}><FilePlus2 className="mr-2 h-4 w-4" />Add file</Button></div>
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <Label htmlFor="project-local-file-import">Import local text files</Label>
              <Input id="project-local-file-import" type="file" multiple accept=".html,.css,.js,.json,.md,.txt"
                aria-describedby="project-local-file-help" disabled={importingFiles}
                onChange={event => void importLocalFiles(event.currentTarget)}
                className="border-slate-700 bg-slate-950 text-xs text-white file:text-cyan-200" />
              <div className="flex items-start gap-2">
                <Checkbox id="project-local-replace" checked={importReplacing} onCheckedChange={value => setImportReplacing(value === true)}/>
                <Label htmlFor="project-local-replace" className="text-xs leading-5 text-slate-300">Allow replacing files with matching names (asks before overwriting)</Label>
              </div>
              <p id="project-local-file-help" className="text-xs leading-5 text-slate-400">
                UTF-8 text only. One explicit import transaction, max 12 files and 120 KB selected. Invalid, binary, or oversized files reject the entire batch. No network upload or automatic preview.
              </p>
            </div>
            <div className="space-y-2"><Label htmlFor="rename-filename">Rename selected file</Label>
              <Input id="rename-filename" value={renameName} maxLength={64} onChange={(e) => setRenameName(e.target.value)} placeholder={file.name} className="border-slate-700 bg-slate-950 text-white" />
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!renameName.trim() || renameName === file.name} onClick={renameFile}>Rename</Button>
                <Button size="sm" variant="destructive" disabled={project.files.length < 2} onClick={deleteFile}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div></div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle>Code editor · {file.name}</CardTitle><CardDescription className="text-slate-400">Plain text editor. Changes remain in memory until you click Save browser copy or Export. No compilation or IntelliSense is claimed.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="project-editor">File contents</Label>
            <Textarea id="project-editor" ref={editorRef} value={file.content} onChange={(e) => update((old) => editDeveloperFile(old, file.name, e.target.value))}
              onKeyDown={handleEditorKeyDown} onClick={e => trackCursor(e.currentTarget)} onKeyUp={e => trackCursor(e.currentTarget)} onSelect={e => trackCursor(e.currentTarget)}
              spellCheck={false} className="min-h-[420px] max-h-[70vh] overflow-y-auto border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" />
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label htmlFor="editor-goto-line">Go to line</Label>
                <Input id="editor-goto-line" type="number" min={1} max={file.content.split("\n").length}
                  value={lineTarget} onChange={e => setLineTarget(e.target.value.slice(0,7))}
                  onKeyDown={e => { if (e.key === "Enter") goToLine(); }}
                  className="w-24 border-slate-700 bg-slate-950 text-white" /></div>
              <Button variant="outline" size="sm" onClick={goToLine}>Go to line</Button>
              <Button variant="outline" size="sm" disabled={!savedBaseline || !savedBaseline.files.some(f => f.name === file.name && f.content !== file.content)}
                onClick={restoreActiveSaved}>Restore saved file</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Line {cursor.line}, column {cursor.column}</span><span>·</span><span>{cursor.selected} selected</span><span>·</span>
              <span>{file.content.split("\n").length} lines</span><span>·</span><span>{file.content.length} / 20,000 characters</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={project.files.length >= MAX_PROJECT_FILES} onClick={duplicateFile}><Files className="mr-2 h-4 w-4" />Duplicate file</Button>
              <Button size="sm" variant="outline" disabled={!file.name.toLowerCase().endsWith(".json")} onClick={formatSelectedJson}><FileJson className="mr-2 h-4 w-4" />Format JSON</Button>
              <Button size="sm" variant="outline" onClick={cleanWhitespace}><Scissors className="mr-2 h-4 w-4" />Clean whitespace</Button>
              <Button size="sm" variant="outline" onClick={() => { const blob = new Blob([file.content],{ type:"text/plain;charset=utf-8" }); const href = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=href; a.download=file.name; a.click(); URL.revokeObjectURL(href); }}>
                <Download className="mr-2 h-4 w-4" />Download file</Button>
            </div>
            <div className="flex flex-wrap justify-between gap-2"><span className="text-xs text-slate-400">Shortcuts: Ctrl+S save · Ctrl+Enter preview · Ctrl+P quick open · Tab / Shift+Tab indent</span>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={createCheckpoint}><Save className="mr-2 h-4 w-4" />Checkpoint</Button>
                <Button size="sm" variant="outline" disabled={checkpoints.length === 0} onClick={restore}><RotateCcw className="mr-2 h-4 w-4" />Restore ({checkpoints.length})</Button></div></div>
          </CardContent>
        </Card>
      </div>

      <ProjectInspectionPanel project={project} baseline={savedBaseline} activeFile={file.name}
        onJump={jumpToMatch} onReplace={replaceActiveText} />
      <ProjectRecoveryPanel project={project} dirty={dirty} onRestore={handleRecovery} />
      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-300" />Unified project preflight</CardTitle>
          <CardDescription className="text-slate-400">Check current HTML/JSON structure, known restricted-preview compatibility rules and real JavaScript parser syntax together. Runs only when requested; does not run user code or deploy anything.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={preflightRunning} onClick={() => void checkPreflight()}>{preflightRunning ? "Checking project…" : "Run project preflight"}</Button>
            <Button size="sm" variant="outline" disabled={!preflight || preflightStale || preflightRunning} onClick={downloadPreflight}><Download className="mr-2 h-4 w-4" />Export metadata-only preflight</Button>
            {preflightStale && <span role="status" className="text-xs text-amber-200">Project changed. Previous preflight is stale.</span>}
          </div>
          {preflight && <div className="rounded-lg border border-slate-700 p-3 text-sm">
            <p className="font-semibold">{preflight.previewReadiness === "no-blocking-issues-found" && !preflightStale ? "No blocking issues found by these rules" : "Review required or results stale"}</p>
            <p className="mt-1 text-slate-300">{preflight.filesChecked} files checked · {preflight.jsFilesChecked} JavaScript files parsed · {preflight.errors} errors · {preflight.warnings} warnings{preflight.truncated ? " · issues truncated" : ""}</p>
            {preflight.staticFindings.length > 0 && <p className="mt-2 text-xs text-slate-400">Static findings: {preflight.staticFindings.map(issue => issue.rule).slice(0, 10).join(", ")}{preflight.staticFindings.length > 10 ? "…" : ""}</p>}
            {preflight.syntaxFindings.length > 0 && <p className="mt-2 text-xs text-rose-200">JS parse issues: {preflight.syntaxFindings.slice(0, 5).map(issue => issue.file + " line " + issue.line).join("; ")}</p>}
          </div>}
          <p className="text-xs leading-5 text-slate-500">A clean result is limited to checked structural and JavaScript syntax rules. It does not establish deployment readiness, backend integrity, production authorization, browser safety or functional correctness.</p>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-cyan-300" />JavaScript syntax validation</CardTitle>
          <CardDescription className="text-slate-400">Explicit, local TypeScript parser checks for .js files. No code execution, compilation, type checking or external requests; source text stays in this browser.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={validatingJs} onClick={() => void validateJs()}><ListFilter className="mr-2 h-4 w-4" />{validatingJs ? "Parsing..." : "Validate JS syntax"}</Button>
            <Button size="sm" variant="outline" disabled={validatingJs} onClick={() => void exportJsReport()}><Download className="mr-2 h-4 w-4" />Export parse report</Button>
            {jsStale && <span className="text-xs text-amber-300">Results are stale—project files changed</span>}
          </div>
          {jsValidation && <div className="space-y-2">
            <p className="text-xs text-slate-300">{jsValidation.filesChecked} JavaScript file(s) parsed · {jsValidation.issues.length} issue(s){jsValidation.truncated ? " (limited to 80 issues)" : ""}</p>
            <div className="max-h-40 space-y-2 overflow-auto" aria-label="JavaScript syntax findings">
              {jsValidation.issues.length ? jsValidation.issues.map((item, index) =>
                <p key={index} className="break-all rounded border border-rose-400/30 p-2 text-xs text-rose-200">{item.file}, line {item.line}, col {item.column} · Parser code {item.code}</p>) :
                <p className="text-xs text-emerald-200">No parser syntax issues found. This does not establish runtime correctness or safety.</p>}
            </div>
          </div>}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-cyan-300" />Run preview</CardTitle><CardDescription className="text-slate-400">Uses index.html, all CSS files and all JavaScript files, assembled locally. Only Run executes the preview. JSON/Markdown are editable but not served as network assets.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runPreview}><Play className="mr-2 h-4 w-4" />Run preview</Button>
              <Button size="sm" variant="outline" onClick={exportStandalonePreview}><Download className="mr-2 h-4 w-4"/>Export standalone HTML</Button>
              {previewStale && <span className="text-xs text-amber-300">Preview is older than your current files</span>}
            </div>
            <div role="group" aria-label="Preview viewport widths" className="flex flex-wrap gap-2">
              {PREVIEW_VIEWPORTS.map(view => <button key={view.id} type="button" aria-pressed={previewMode === view.id}
                onClick={() => setPreviewMode(view.id)}
                className={"rounded-md border px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 " +
                  (previewMode === view.id ? "border-cyan-400 bg-cyan-950 text-cyan-100" : "border-slate-700 text-slate-300")}>{view.label}</button>)}
            </div>
            <p className="text-xs text-slate-400">Preview size: {previewMode === "fluid" ? "container width" : developerPreviewWidth(previewMode) + "px"}; larger widths scroll horizontally on narrow screens.</p>
            <div className="overflow-x-auto rounded-lg border border-slate-700 bg-white">
              {previewHtml ? <iframe key={previewRun} title="Isolated project preview" srcDoc={previewHtml}
                sandbox="allow-scripts" referrerPolicy="no-referrer" style={{width: previewMode === "fluid" ? "100%" : developerPreviewWidth(previewMode) + "px"}}
                className="block h-[350px] border-0" /> :
                <div className="flex h-[350px] items-center justify-center text-sm text-slate-600">Select Run preview to render this project</div>}
            </div>
            <p className="text-xs leading-5 text-amber-200"><ShieldCheck className="mr-1 inline h-4 w-4" />Sandboxed opaque-origin frame with restrictive CSP. External requests, forms, and subresources are blocked by preview policy; browser navigation behavior varies. Never run untrusted code or paste secrets. This is not a VM or production security guarantee.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-300" />Project checks</CardTitle><CardDescription className="text-slate-400">Real project-shape and JSON syntax checks only. These checks do not compile JavaScript or certify code safety.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {findings.length === 0 ? <p className="rounded-lg border border-emerald-500/20 p-4 text-sm text-emerald-200">File structure and JSON syntax checks passed. No runtime correctness or security guarantee.</p> :
              <ul className="space-y-2">{findings.map((finding, index) => <li key={index} className={"rounded-lg border p-3 text-sm " + (finding.level === "error" ? "border-rose-500/30 text-rose-200" : "border-amber-500/30 text-amber-200")}>{finding.message}</li>)}</ul>}
            <p className="text-xs text-slate-400">Project snapshots store up to five in-memory checkpoints. They are not automatic version control and disappear on refresh.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle>New project templates</CardTitle><CardDescription className="text-slate-400">Create a starter, landing page, or blank HTML project. Unsaved edits are confirmed before replacement.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">{(["starter", "landing", "blank"] as Template[]).map((kind) =>
            <Button variant="outline" key={kind} onClick={() => start(kind)}>{kind === "starter" ? "Interactive starter" : kind === "landing" ? "Landing page" : "Blank"}</Button>)}</CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle>Saved on this browser</CardTitle><CardDescription className="text-slate-400">Maximum {MAX_SAVED_PROJECTS} projects. Saving stores full source code in localStorage on this device, not in ETERNYX Workspace or cloud. Do not save secrets.</CardDescription></CardHeader>
          <CardContent className="space-y-2">{saved.length === 0 ? <p className="text-sm text-slate-400">No saved projects yet.</p> : saved.map((item) =>
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 p-3">
              <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.name}</p><p className="text-xs text-slate-400">{item.files.length} files</p></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { if (safeTransition()) applyProject(item, true); }}>Open</Button>
                <Button size="sm" variant="ghost" aria-label={"Delete saved " + item.name} onClick={() => removeSaved(item.id)}><Trash2 className="h-4 w-4" /></Button></div>
            </div>)}</CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-cyan-300" />Import portable project JSON</CardTitle>
          <CardDescription className="text-slate-400">Only the ETERNYX project JSON schema is accepted (up to 160 KB). Import never executes code or automatically saves a project.</CardDescription></CardHeader>
        <CardContent className="space-y-3"><Label htmlFor="project-import">Paste previously exported project JSON</Label>
          <Textarea id="project-import" value={importText} onChange={(e) => setImportText(e.target.value.slice(0, 160001))}
            placeholder='{"schema":"eternyx-developer-project-v1","name":"Demo","files":[{"name":"index.html","content":"..."}]}' spellCheck={false}
            className="min-h-32 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" />
          <Button variant="outline" disabled={!importText.trim()} onClick={importProject}><Upload className="mr-2 h-4 w-4" />Import project</Button>
          <p className="text-xs text-slate-400">Export includes complete source code. Check files for API keys and personal data before sharing. No GitHub, deployment, or filesystem writes are performed.</p>
        </CardContent>
      </Card>
    </div>
  </div>;
}
