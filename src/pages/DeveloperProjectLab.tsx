import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FilePlus2, FolderOpen, Play, RotateCcw, Save, ShieldCheck, Trash2, Upload, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
function download(name: string, data: string) {
  const blob = new Blob([data], { type: "application/json;charset=utf-8" });
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
  const file = project.files.find((item) => item.name === activeFile) || project.files[0];
  const currentSource = JSON.stringify(project.files);
  const dirty = savedCopy !== JSON.stringify(project);
  const previewStale = previewHtml !== null && previewSource !== currentSource;
  const findings = useMemo(() => checkDeveloperProject(project), [project]);
  const alert = (message: string, error = false) => setFeedback({ message, error });

  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [dirty]);

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
            <div className="space-y-1" role="group" aria-label="Project files">{project.files.map((entry) =>
              <button type="button" key={entry.name} aria-pressed={file.name === entry.name} onClick={() => { setActiveFile(entry.name); setRenameName(""); }}
                className={"w-full rounded-md border px-3 py-2 text-left font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 " + (entry.name === file.name ? "border-cyan-400/70 bg-cyan-950/60 text-cyan-100" : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-cyan-500/40")}>{entry.name}</button>)}</div>
            <p className="text-xs text-slate-400">{project.files.length} / {MAX_PROJECT_FILES} files</p>
            <div className="space-y-2"><Label htmlFor="add-filename">New file name</Label>
              <Input id="add-filename" value={newFileName} maxLength={64} onChange={(e) => setNewFileName(e.target.value)} placeholder="notes.md"
                className="border-slate-700 bg-slate-950 text-white"/>
              <Button variant="outline" size="sm" disabled={!newFileName.trim() || project.files.length >= MAX_PROJECT_FILES} onClick={createFile}><FilePlus2 className="mr-2 h-4 w-4" />Add file</Button></div>
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
            <Textarea id="project-editor" value={file.content} onChange={(e) => update((old) => editDeveloperFile(old, file.name, e.target.value))}
              spellCheck={false} className="min-h-[420px] max-h-[70vh] overflow-y-auto border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" />
            <div className="flex flex-wrap justify-between gap-2"><span className="text-xs text-slate-400">{file.content.length} / 20,000 characters</span>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={createCheckpoint}><Save className="mr-2 h-4 w-4" />Checkpoint</Button>
                <Button size="sm" variant="outline" disabled={checkpoints.length === 0} onClick={restore}><RotateCcw className="mr-2 h-4 w-4" />Restore ({checkpoints.length})</Button></div></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-cyan-300" />Run preview</CardTitle><CardDescription className="text-slate-400">Uses index.html, all CSS files and all JavaScript files, assembled locally. Only Run executes the preview. JSON/Markdown are editable but not served as network assets.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3"><Button onClick={runPreview}><Play className="mr-2 h-4 w-4" />Run preview</Button>
              {previewStale && <span className="text-xs text-amber-300">Preview is older than your current files</span>}</div>
            <div className="overflow-hidden rounded-lg border border-slate-700 bg-white">
              {previewHtml ? <iframe key={previewRun} title="Isolated project preview" srcDoc={previewHtml} sandbox="allow-scripts" referrerPolicy="no-referrer" className="h-[350px] w-full" /> :
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
