import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Download, FolderKanban, Play, Save, StopCircle, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STORAGE_KEY, normalizeSavedDeveloperProjects } from "@/lib/developerProjectLab.mjs";
import { resolveApiEnvironmentSuite } from "@/lib/projectApiEnvironment.mjs";
import { API_RUN_HISTORY_KEY, readApiRunHistory, startApiRun, checkpointApiRun, upsertApiRun, summarizeApiRun, exportApiRunHistory } from "@/lib/projectApiRunHistory.mjs";
import { API_BASELINE_KEY, readApiBaselines, storeApiBaseline, fingerprintApiSuite, createApiBaseline, compareApiBaselines, exportApiRegression } from "@/lib/projectApiRegression.mjs";
import {
  PROJECT_API_SUITE_KEY, MAX_PROJECT_SCENARIOS, addProjectApiScenario, exportProjectApiReport,
  exportProjectApiSuite, importProjectApiSuite, normalizeProjectApiScenarios,
  runProjectApiSuite, summarizeProjectApiResults, projectApiSuiteSignature, isProjectApiRunComplete,
  updateProjectApiScenario, moveProjectApiScenario, duplicateProjectApiScenario,
} from "@/lib/projectApiSuite.mjs";

type Scenario = { id: string; projectId: string; name: string; method: string; url: string; expectedStatus: number; maxDurationMs: number; expectedContentType?: string; jsonContract?: { path:string; type:string } };
type ReportRow = { scenarioId: string; method: string; origin: string; status: number | null; elapsedMs: number; passed: boolean; reason: string; contentTypeCheck?: string; jsonCheck?: string };
type Project = { id: string; name: string };
type Baseline = ReturnType<typeof createApiBaseline>;
type RunReceipt = ReturnType<typeof startApiRun>;
function loadRunHistory(): RunReceipt[] { try { return readApiRunHistory(localStorage.getItem(API_RUN_HISTORY_KEY) || "[]"); } catch { return []; } }
function loadBaselines(): Baseline[] { try { return readApiBaselines(localStorage.getItem(API_BASELINE_KEY) || "[]"); } catch { return []; } }

function readProjects(): Project[] {
  try {
    return normalizeSavedDeveloperProjects(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || "[]"))
      .map(({ id, name }) => ({ id, name }));
  } catch { return []; }
}
function readSuites(projects: Project[]): Scenario[] {
  try {
    return normalizeProjectApiScenarios(JSON.parse(localStorage.getItem(PROJECT_API_SUITE_KEY) || "[]"), projects.map(p => p.id));
  } catch { return []; }
}
function saveJson(filename: string, value: string) {
  const href = URL.createObjectURL(new Blob([value], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export default function ProjectApiSuitePanel({ initialProjectId = "", draft }: {
  initialProjectId?: string;
  draft: { method: string; url: string; headers: string; body: string };
}) {
  const [projects, setProjects] = useState<Project[]>(readProjects);
  const [projectId, setProjectId] = useState(() => {
    const p = readProjects();
    return p.some(x => x.id === initialProjectId) ? initialProjectId : p[0]?.id || "";
  });
  const [scenarios, setScenarios] = useState<Scenario[]>(() => readSuites(readProjects()));
  const [scenarioName, setScenarioName] = useState("");
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editMethod, setEditMethod] = useState("GET");
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [expectedStatus, setExpectedStatus] = useState("200");
  const [maxDurationMs, setMaxDurationMs] = useState("3000");
  const [expectedContentType, setExpectedContentType] = useState("any");
  const [jsonPath, setJsonPath] = useState("");
  const [jsonType, setJsonType] = useState("exists");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReportRow[]>([]);
  const [runHistory, setRunHistory] = useState<RunReceipt[]>(loadRunHistory);
  const [historyWarning, setHistoryWarning] = useState("");
  const projectHistory = runHistory.filter(run=>run.projectId===projectId);
  const [runProjectId, setRunProjectId] = useState("");
  const [runSignature, setRunSignature] = useState("");
  const [environment, setEnvironment] = useState("saved");
  const [targetOrigin, setTargetOrigin] = useState("");
  const [runEnvironment, setRunEnvironment] = useState("saved");
  const [baselines, setBaselines] = useState<Baseline[]>(loadBaselines);
  const [currentEvidence, setCurrentEvidence] = useState<{signature:string; baseline:Baseline} | null>(null);
  const [baselineError, setBaselineError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const savedScenarios = scenarios.filter(s => s.projectId === projectId);
  let available: Scenario[] = [];
  let targetError = "";
  try { available = resolveApiEnvironmentSuite(savedScenarios,environment,targetOrigin); }
  catch (cause) { targetError = cause instanceof Error ? cause.message : "Invalid environment target."; }
  const targetOrigins = [...new Set(available.map(item=>new URL(item.url).origin))];
  const summary = summarizeProjectApiResults(results);
  const stale = runProjectId !== projectId || runSignature !== projectApiSuiteSignature(available) || runEnvironment !== environment || !!targetError;
  const complete = !stale && !running && isProjectApiRunComplete(available, results);
  useEffect(() => () => abortRef.current?.abort(), []);
  const baseline = baselines.find(b => b.projectId === projectId && b.environment === environment);
  const current = complete && currentEvidence?.signature === runSignature ? currentEvidence.baseline : null;
  const comparison = baseline && current ? compareApiBaselines(baseline,current) : null;
  useEffect(() => {
    let active = true;
    setCurrentEvidence(null);
    setBaselineError("");
    if (complete) {
      fingerprintApiSuite(available).then(fingerprint => {
        if (active) setCurrentEvidence({signature:runSignature, baseline:createApiBaseline(available,results,fingerprint,undefined,environment)});
      }).catch(() => { if (active) setBaselineError("Unable to create comparable evidence in this browser."); });
    }
    return () => { active = false; };
  }, [complete, runSignature, results, environment]);
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === API_BASELINE_KEY || event.key === null) setBaselines(loadBaselines()); };
    window.addEventListener("storage",refresh);
    return () => window.removeEventListener("storage",refresh);
  }, []);

  useEffect(() => { setEnvironment("saved"); setTargetOrigin(""); setEditing(null); }, [projectId]);
  useEffect(() => {
    if (projects.some(p => p.id === initialProjectId)) setProjectId(initialProjectId);
  }, [initialProjectId, projects]);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key !== PROJECT_STORAGE_KEY && event.key !== PROJECT_API_SUITE_KEY && event.key !== null) return;
      const next = readProjects();
      setProjects(next);
      setScenarios(readSuites(next));
      setProjectId(current => next.some(p => p.id === current) ? current : next[0]?.id || "");
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === API_RUN_HISTORY_KEY || event.key === null) setRunHistory(loadRunHistory()); };
    window.addEventListener("storage",refresh);
    return () => window.removeEventListener("storage",refresh);
  }, []);
  const flash = (value: string, isError = false) => { setMessage(value); setError(isError); };
  const persistRun = (receipt: RunReceipt) => {
    const next=upsertApiRun(loadRunHistory(),receipt);
    localStorage.setItem(API_RUN_HISTORY_KEY,JSON.stringify(next));
    setRunHistory(next);
  };
  const clearRunHistory = () => {
    if (running || !window.confirm("Clear this project's local API execution history?")) return;
    try {
      const next=loadRunHistory().filter(run=>run.projectId!==projectId);
      localStorage.setItem(API_RUN_HISTORY_KEY,JSON.stringify(next));
      setRunHistory(next);
      setHistoryWarning("");
    } catch { setHistoryWarning("Unable to clear history in this browser."); }
  };
  const persist = (items: Scenario[]) => {
    try {
      const latestProjects = readProjects();
      const latest = readSuites(latestProjects);
      if (projectApiSuiteSignature(latest) !== projectApiSuiteSignature(scenarios)) {
        setProjects(latestProjects); setScenarios(latest);
        flash("Saved checks changed in another tab. Review them and retry.", true); return false;
      }
      const safe = normalizeProjectApiScenarios(items, latestProjects.map(p => p.id));
      if (safe.length !== items.length) throw new Error("Saved project or scenario is no longer valid.");
      localStorage.setItem(PROJECT_API_SUITE_KEY, JSON.stringify(safe));
      setScenarios(safe);
      flash("Project API suite saved to this browser. No credentials or response bodies stored.");
      return true;
    } catch { flash("Browser storage is unavailable or project changed; no changes were saved.", true); return false; }
  };
  const saveBaseline = () => {
    if (!current || !complete || running) return;
    try {
      const latest = loadBaselines();
      if (latest.some(b=>b.projectId===projectId && b.environment===environment) && !window.confirm("Replace the saved baseline for this project and selected environment?")) return;
      const next = storeApiBaseline(latest,current);
      localStorage.setItem(API_BASELINE_KEY,JSON.stringify(next));
      setBaselines(next);
      flash("Saved local metadata-only regression baseline.");
    } catch { flash("Unable to save baseline in this browser.",true); }
  };
  const removeBaseline = () => {
    if (running || !window.confirm("Delete this project’s baseline for the selected environment?")) return;
    try {
      const next = loadBaselines().filter(b=>b.projectId!==projectId || b.environment!==environment);
      localStorage.setItem(API_BASELINE_KEY,JSON.stringify(next));
      setBaselines(next);
      flash("Saved regression baseline removed.");
    } catch { flash("Unable to remove baseline.",true); }
  };
  const beginEdit = (item: Scenario) => {
    setEditing(item); setEditMethod(item.method); setEditUrl(item.url); setScenarioName(item.name);
    setExpectedStatus(String(item.expectedStatus)); setMaxDurationMs(String(item.maxDurationMs));
    setExpectedContentType(item.expectedContentType || "any"); setJsonPath(item.jsonContract?.path || ""); setJsonType(item.jsonContract?.type || "exists");
  };
  const resetEditor = () => { setEditing(null); setScenarioName(""); setExpectedStatus("200"); setMaxDurationMs("3000"); setExpectedContentType("any"); setJsonPath(""); setJsonType("exists"); };
  const mutate = (operation: () => Scenario[]) => {
    if (running || editing) return;
    try { persist(operation()); } catch (cause) { flash(cause instanceof Error ? cause.message : "Unable to change sequence.",true); }
  };
  const add = () => {
    try {
      if (editing) {
        const existing = scenarios.find(item=>item.id===editing.id && item.projectId===projectId);
        if (!existing || projectApiSuiteSignature([existing]) !== projectApiSuiteSignature([editing])) throw new Error("Saved check changed. Cancel editing and reopen it.");
        const next = updateProjectApiScenario(scenarios,projectId,editing.id,{
          name:scenarioName, method:editMethod, url:editUrl, expectedStatus,maxDurationMs,expectedContentType,
          jsonContract:jsonPath.trim()?{path:jsonPath.trim(),type:jsonType}:undefined,
        },projects.map(p=>p.id));
        if (persist(next)) resetEditor();
        return;
      }
      const next = addProjectApiScenario(scenarios, {
        id: crypto.randomUUID(), projectId, name: scenarioName, method: draft.method, url: draft.url,
        expectedStatus, maxDurationMs, expectedContentType,
        ...(jsonPath.trim() ? {jsonContract:{path:jsonPath.trim(),type:jsonType}} : {}),
      }, projects.map(p => p.id));
      if (persist(next)) setScenarioName("");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Unable to save check.", true); }
  };
  const imported = () => {
    try {
      if (!projectId) throw new Error("Choose a saved project.");
      const entries = importProjectApiSuite(importText, projectId, () => crypto.randomUUID());
      let next = scenarios;
      for (const scenario of entries) next = addProjectApiScenario(next, scenario, projects.map(p => p.id));
      if (persist(next)) setImportText("");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Import failed.", true); }
  };
  const run = async () => {
    if (running || abortRef.current || editing || !projectId || !available.length || targetError) return;
    const latestProjects=readProjects();
    if (!latestProjects.some(p=>p.id===projectId) || projectApiSuiteSignature(readSuites(latestProjects))!==projectApiSuiteSignature(scenarios)) {
      setProjects(latestProjects);setScenarios(readSuites(latestProjects));flash("Saved checks changed. Review the sequence and run again.",true);return;
    }
    const targets = targetOrigins;
    if (!window.confirm("Run " + available.length + " GET/HEAD check(s) against " + targets.join(", ") +
      "? This will send actual network requests without cookies or authorization headers. Optional JSON checks read up to 64 KiB per response. " + (stopOnFailure?"Stop on first failure.":"Run every check."))) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setResults([]);
    setCurrentEvidence(null);
    setRunProjectId(projectId);
    setRunSignature(projectApiSuiteSignature(available));
    setRunEnvironment(environment);
    setRunning(true);
    setHistoryWarning("");
    let receipt: RunReceipt | null = null;
    let observed: ReportRow[] = [];
    let terminal = "execution-error";
    try {
      const fingerprint=await fingerprintApiSuite(available);
      if (abort.signal.aborted) { flash("Cancelled before execution."); return; }
      const refreshedProjects=readProjects();
      if (!refreshedProjects.some(p=>p.id===projectId) || projectApiSuiteSignature(readSuites(refreshedProjects))!==projectApiSuiteSignature(scenarios)) {
        setProjects(refreshedProjects);setScenarios(readSuites(refreshedProjects));flash("Saved checks changed before execution. Review and run again.",true);return;
      }
      const startedReceipt=startApiRun({runId:crypto.randomUUID(),projectId,environment,fingerprint,scenarioIds:available.map(item=>item.id),stopOnFailure});
      // Save start evidence before dispatching network requests.
      persistRun(startedReceipt);
      receipt=startedReceipt;
      flash("Running real browser requests, one at a time. The target API must permit CORS.");
      const finished = await runProjectApiSuite(available, { signal: abort.signal, stopOnFailure, onProgress: (_row, rows) => {
        observed=rows; setResults(rows);
        try { if(receipt) { const next=checkpointApiRun(receipt,rows); persistRun(next); receipt=next; } }
        catch { setHistoryWarning("History checkpoint could not be saved; live results remain available."); }
      } });
      observed=finished;
      setResults(finished);
      terminal=abort.signal.aborted?"cancelled":finished.length<available.length?"stopped-on-failure":"completed";
      flash(abort.signal.aborted ? "Suite stopped. Partial results retained for this visit." : finished.length < available.length ? "Stopped on first failure. Remaining checks were not run." : "Suite completed. Review genuine HTTP outcomes below.");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Suite could not start.", true); }
    finally {
      if(receipt) {
        try { persistRun(checkpointApiRun(receipt,observed,terminal)); }
        catch { setHistoryWarning("Terminal history receipt could not be saved. Unfinished records are not completed evidence."); }
      }
      abortRef.current = null; setRunning(false);
    }
  };
  const chooseProject = (value: string) => {
    if (running) return;
    setProjectId(value);
    setEnvironment("saved");
    setTargetOrigin("");
    setResults([]);
    setRunProjectId("");
    setRunSignature("");
  };

  return <Card className="border-cyan-400/20 bg-slate-900/70 text-white">
    <CardHeader><CardTitle className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-cyan-300" />Project-linked API smoke tests</CardTitle>
      <CardDescription className="text-slate-400">
        Connect browser-saved Project Lab projects to safe GET/HEAD checks. Explicit execution, real outcomes, and sanitized reports—no backend, cloud testing service or scheduled monitoring.
      </CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-2"><Label htmlFor="linked-project">Local development project</Label>
          <select id="linked-project" value={projects.some(p => p.id === projectId) ? projectId : ""}
            disabled={running} onChange={e => chooseProject(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
            {projects.length ? projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">No saved projects</option>}
          </select></div>
        <Button variant="outline" asChild><Link to="/developer-studio/project-lab">Open Project Lab</Link></Button>
      </div>
      {!projects.length && <p role="status" className="text-sm text-amber-300">Save a project in Project Lab first. This connects only to projects saved on this device.</p>}
      {!!projectId && <>
        {editing && <div className="space-y-3 rounded-lg border border-cyan-400/30 p-3">
          <p className="font-medium">Editing saved check: {editing.name}</p>
          <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)]">
            <div><Label htmlFor="api-edit-method">Method</Label><select id="api-edit-method" value={editMethod} onChange={e=>setEditMethod(e.target.value)} className="h-10 w-full rounded-md bg-slate-950 text-white"><option>GET</option><option>HEAD</option></select></div>
            <div><Label htmlFor="api-edit-url">Saved request URL</Label><Input id="api-edit-url" value={editUrl} onChange={e=>setEditUrl(e.target.value)} className="border-slate-700 bg-slate-950 text-white"/></div>
          </div>
        </div>}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2"><Label htmlFor="api-scenario-name">Scenario name</Label>
            <Input id="api-scenario-name" value={scenarioName} onChange={e => setScenarioName(e.target.value.slice(0, 72))} placeholder="GET health endpoint" className="border-slate-700 bg-slate-950 text-white"/></div>
          <div className="space-y-2"><Label htmlFor="api-scenario-status">Expected HTTP status</Label>
            <Input id="api-scenario-status" inputMode="numeric" value={expectedStatus} onChange={e => setExpectedStatus(e.target.value)} className="border-slate-700 bg-slate-950 text-white"/></div>
          <div className="space-y-2"><Label htmlFor="api-scenario-time">Timeout and max latency (ms)</Label>
            <Input id="api-scenario-time" inputMode="numeric" value={maxDurationMs} onChange={e => setMaxDurationMs(e.target.value)} className="border-slate-700 bg-slate-950 text-white"/></div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="api-scenario-content-type">Expected response content type</Label>
          <select id="api-scenario-content-type" value={expectedContentType} onChange={e => { setExpectedContentType(e.target.value); if (e.target.value !== "json") setJsonPath(""); }} disabled={running}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
            <option value="any">Any (status and latency only)</option>
            <option value="json">JSON (including +json)</option>
            <option value="html">HTML</option>
            <option value="text">Plain text</option>
          </select>
          <p className="text-xs text-slate-400">Use 401 or 403 to check anonymous denial. This does not prove authenticated access or RLS. Latency measures response headers, or total read time when a JSON field check is enabled.</p>
        </div>
        {expectedContentType === "json" && <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="api-scenario-json-path">Optional JSON field path</Label>
            <Input id="api-scenario-json-path" value={jsonPath} maxLength={120} disabled={running} onChange={e => setJsonPath(e.target.value)} placeholder="data.0.id" className="border-slate-700 bg-slate-950 text-white"/></div>
          <div className="space-y-2"><Label htmlFor="api-scenario-json-type">Expected field type</Label>
            <select id="api-scenario-json-type" value={jsonType} disabled={running} onChange={e => setJsonType(e.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
              {["exists","string","number","boolean","object","array","null"].map(type => <option key={type} value={type}>{type}</option>)}
            </select></div>
          <p className="text-xs text-slate-400 sm:col-span-2">GET only. Checks own JSON fields within 64 KiB. Field values and body content are never retained or exported. Do not put secrets in paths.</p>
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={running || (!editing && savedScenarios.length >= MAX_PROJECT_SCENARIOS) || (!!jsonPath.trim() && (editing?editMethod:draft.method) !== "GET")} onClick={add}>
            <Save className="mr-2 h-4 w-4"/>{editing?"Save check changes":"Save current request as check"}</Button>
          {editing && <Button variant="outline" onClick={resetEditor}>Cancel editing</Button>}
          <span className="self-center text-xs text-slate-400">{savedScenarios.length} / {MAX_PROJECT_SCENARIOS} checks linked</span>
        </div>
        <p className="text-xs text-amber-200">Only the current request method, URL without query string or fragment, scenario name, expected status and timeout are saved. Headers, request bodies and credentials are discarded. Do not put secrets in URL paths or names. Only GET/HEAD are supported.</p>
        <div className="space-y-2" aria-label="Saved API scenarios">
          {savedScenarios.length ? savedScenarios.map((s,index) => <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{index+1}. {s.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-400">{s.method} {s.url} · Expect {s.expectedStatus} ≤{s.maxDurationMs}ms · {s.expectedContentType || "any content type"}{s.jsonContract ? " · JSON " + s.jsonContract.path + " : " + s.jsonContract.type : ""}</p>
            </div>
            <Button size="sm" variant="outline" disabled={running || !!editing} aria-label={"Edit " + s.name} onClick={()=>beginEdit(s)}>Edit</Button>
            <Button size="sm" variant="outline" disabled={running || !!editing || savedScenarios.length>=MAX_PROJECT_SCENARIOS} aria-label={"Duplicate " + s.name} onClick={()=>mutate(()=>duplicateProjectApiScenario(scenarios,projectId,s.id,crypto.randomUUID(),projects.map(p=>p.id)))}>Duplicate</Button>
            <Button size="sm" variant="outline" disabled={running || !!editing || index===0} aria-label={"Move up " + s.name} onClick={()=>mutate(()=>moveProjectApiScenario(scenarios,projectId,s.id,-1,projects.map(p=>p.id)))}>↑</Button>
            <Button size="sm" variant="outline" disabled={running || !!editing || index===savedScenarios.length-1} aria-label={"Move down " + s.name} onClick={()=>mutate(()=>moveProjectApiScenario(scenarios,projectId,s.id,1,projects.map(p=>p.id)))}>↓</Button>
            <Button size="sm" variant="ghost" disabled={running || !!editing} aria-label={"Remove " + s.name} onClick={() => persist(scenarios.filter(item => item.id !== s.id))}>
              <Trash2 className="h-4 w-4"/></Button>
          </div>) : <p className="rounded-lg border border-dashed border-slate-700 p-3 text-sm text-slate-400">Add GET or HEAD requests using the composer below.</p>}
        </div>
        <section aria-label="API execution environment" className="space-y-3 rounded-xl border border-cyan-400/20 p-4">
          <h3 className="font-semibold">Execution environment</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="api-execution-environment">Target selection</Label>
              <select id="api-execution-environment" value={environment} disabled={running} onChange={e=>{setEnvironment(e.target.value);setTargetOrigin("");}} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
                <option value="saved">Original saved URLs</option><option value="development">Development override</option><option value="staging">Staging override</option><option value="preview">Preview override</option>
              </select></div>
            {environment!=="saved" && <div className="space-y-2"><Label htmlFor="api-execution-origin">Exact authorized target origin</Label>
              <Input id="api-execution-origin" value={targetOrigin} disabled={running} maxLength={512} onChange={e=>setTargetOrigin(e.target.value)} placeholder="https://staging.example.com" className="border-slate-700 bg-slate-950 text-white"/></div>}
          </div>
          <p className="text-xs text-slate-400">Overrides replace only the origin of a single-origin suite, never saved paths or contracts. They are session-only. Environment names are labels, not proof of host ownership; use authorized targets only.</p>
          {targetError && <p role="status" className="text-sm text-amber-300">{targetError}</p>}
          {!!targetOrigins.length && <p className="break-all text-xs text-cyan-200">Effective targets: {targetOrigins.join(", ")}</p>}
        </section>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stopOnFailure} disabled={running} onChange={e=>setStopOnFailure(e.target.checked)}/>Stop on first failed check</label>
        <p className="text-xs text-slate-400">Checks execute in the displayed order. A stopped run is incomplete if any checks remain; it cannot become a complete report or baseline.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={running || !!editing || !!targetError || available.length === 0} onClick={() => void run()}><Play className="mr-2 h-4 w-4"/>Run selected project suite</Button>
          {running && <Button type="button" variant="destructive" onClick={() => abortRef.current?.abort()}>
            <StopCircle className="mr-2 h-4 w-4"/>Cancel current request and stop</Button>}
          <Button type="button" size="sm" variant="outline" disabled={!savedScenarios.length || running}
            onClick={() => saveJson("eternyx-api-suite.json", exportProjectApiSuite(scenarios, projectId))}>
            <Download className="mr-2 h-4 w-4"/>Export sanitized suite</Button>
        </div>
        {results.length > 0 && runProjectId === projectId && <div className="rounded-xl border border-slate-700 p-4">
          <p className="font-semibold"><Activity className="mr-2 inline h-4 w-4 text-cyan-300"/>Actual results: {summary.passed} passed · {summary.failed} failed · {summary.cancelled} cancelled</p>
          {stale && <p role="status" className="mt-2 text-sm text-amber-300">Suite changed. Previous results are stale; rerun before exporting.</p>}
          {!stale && !running && !complete && <p role="status" className="mt-2 text-sm text-amber-300">Run incomplete or cancelled. {Math.max(0,available.length-results.length)} checks not run. Rerun before exporting.</p>}
          <p className="mt-1 text-xs text-slate-400">Results show origin, status, latency, content-type and optional JSON field outcomes, and reason. No response body, request path, URL query or raw headers are retained in the report.</p>
          <div className="mt-3 space-y-2">{results.map((r, i) => <p key={r.scenarioId + i} className={"rounded-md border p-2 text-xs " +
              (r.passed ? "border-emerald-500/30 text-emerald-200" : "border-rose-500/30 text-rose-200")}>
              {r.passed ? "PASS" : "FAIL"} · {r.method} {r.origin} · HTTP {r.status ?? "unavailable"} · {r.elapsedMs} ms · {r.reason}{r.contentTypeCheck ? " · content type: " + r.contentTypeCheck : ""}{r.jsonCheck ? " · JSON field: " + r.jsonCheck : ""}</p>)}</div>
          <Button className="mt-3" size="sm" variant="outline" disabled={!complete} onClick={() => { if (complete) saveJson("eternyx-api-smoke-report.json", exportProjectApiReport(results)); }}>
            <Download className="mr-2 h-4 w-4"/>Export sanitized results</Button>
        </div>}
        <section aria-label="API execution history" className="space-y-3 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold">API execution history</h3>
          <p className="text-xs text-slate-400">Up to 30 recent runs across browser projects. Saved start and progress checkpoints survive reloads. An unfinished receipt means no terminal outcome was recorded, not a confirmed completed run. No endpoint URLs or response contents are stored.</p>
          {historyWarning && <p role="alert" className="text-sm text-amber-300">{historyWarning}</p>}
          {projectHistory.length ? <div className="space-y-2 max-h-80 overflow-y-auto">{projectHistory.map(run=>{
            const counts=summarizeApiRun(run);
            return <div key={run.runId} className="rounded-md border border-slate-700 p-2 text-xs">
              <p className="font-medium">{run.state==="started"?"No terminal receipt":run.state} · {run.environment} · {run.stopOnFailure?"fail-fast":"run all"}</p>
              <p className="text-slate-400">{new Date(run.startedAt).toLocaleString()} · {counts.attempted}/{counts.planned} attempted · {counts.passed} passed · {counts.failed} failed · {counts.cancelled} cancelled · {counts.notRun} not run</p>
              <details className="mt-1"><summary>Recorded check outcomes</summary>{run.cases.map((row,i)=><p key={row.scenarioId}>Check {i+1}: {row.reason} · HTTP {row.status??"unavailable"} · {row.elapsedMs} ms</p>)}</details>
            </div>;
          })}</div> : <p className="text-sm text-slate-400">No saved API runs for this project.</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={running || !projectHistory.length} onClick={()=>saveJson("eternyx-api-run-history.json",exportApiRunHistory(loadRunHistory(),projectId))}>Export API run history</Button>
            <Button size="sm" variant="outline" disabled={running || !projectHistory.length} onClick={clearRunHistory}>Clear API run history</Button>
          </div>
        </section>
        <section aria-label="API regression intelligence" className="space-y-3 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold">API regression intelligence</h3>
          <p className="text-xs text-slate-400">Compare completed runs of the exact same suite and selected environment. Only fixed outcomes, identifiers, timings and a SHA-256 configuration fingerprint are saved. Local observations, not production certification.</p>
          {baseline ? <p className="text-xs text-slate-300">Baseline saved: {new Date(baseline.savedAt).toLocaleString()} · {baseline.cases.length} checks</p> : <p className="text-sm text-slate-400">No saved baseline. Complete a run and save it for comparison.</p>}
          {baselineError && <p role="alert" className="text-xs text-amber-300">{baselineError}</p>}
          {comparison?.state === "incompatible" && <p role="status" className="text-sm text-amber-300">Suite configuration changed. The saved baseline is not comparable.</p>}
          {comparison?.state === "comparable" && <div className="space-y-2">
            <p role="status" className="text-sm font-semibold">Regression comparison: {comparison.regressed} regressed · {comparison.recovered} recovered · {comparison.changed} changed</p>
            <p className="text-xs text-slate-400">{comparison.latencyIncreases} possible latency increases (at least 100 ms and 50% slower; single-run observations).</p>
            {comparison.cases.map((row,i)=><p key={row.scenarioId} className="break-words text-xs text-slate-300">Check {i+1}: {row.outcome} · latency {row.deltaMs>0?"+":""}{row.deltaMs} ms{row.latencyIncrease?" · possible slowdown":""}</p>)}
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!current || running} onClick={saveBaseline}>{baseline?"Replace API baseline":"Save API baseline"}</Button>
            {baseline && <Button size="sm" variant="outline" disabled={running} onClick={removeBaseline}>Delete API baseline</Button>}
            <Button size="sm" variant="outline" disabled={comparison?.state!=="comparable" || !complete} onClick={()=>{if(baseline && current && complete && comparison?.state==="comparable")saveJson("eternyx-api-regression.json",exportApiRegression(baseline,current));}}>Export regression comparison</Button>
          </div>
        </section>
        <div className="space-y-2"><Label htmlFor="api-project-suite-import">Import ETERNYX project API suite JSON</Label>
          <Textarea id="api-project-suite-import" value={importText} onChange={e => setImportText(e.target.value.slice(0, 40001))}
            spellCheck={false} className="min-h-24 border-slate-700 bg-slate-950 font-mono text-xs" placeholder='{"schema":"eternyx-project-api-suite-v1","scenarios":[]}'/>
          <Button type="button" size="sm" variant="outline" disabled={running || !!editing || !importText.trim()} onClick={imported}>
            <Upload className="mr-2 h-4 w-4"/>Import into selected project</Button></div>
      </>}
      {message && <p role={error ? "alert" : "status"} className={error ? "text-sm text-rose-200" : "text-sm text-cyan-200"}>{message}</p>}
      <p className="text-xs leading-5 text-slate-500">
        All tests run sequentially from this browser, only after confirmation. Cookies and authorization headers are never attached by this suite. Network/CORS failures are failures, not fabricated successful tests. Raw results exist only in current page memory; execution history and optional baselines retain sanitized metadata locally.
      </p>
    </CardContent>
  </Card>;
}
