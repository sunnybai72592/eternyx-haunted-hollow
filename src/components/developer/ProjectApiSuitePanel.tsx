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
import { API_BASELINE_KEY, readApiBaselines, storeApiBaseline, fingerprintApiSuite, createApiBaseline, compareApiBaselines, exportApiRegression } from "@/lib/projectApiRegression.mjs";
import {
  PROJECT_API_SUITE_KEY, MAX_PROJECT_SCENARIOS, addProjectApiScenario, exportProjectApiReport,
  exportProjectApiSuite, importProjectApiSuite, normalizeProjectApiScenarios,
  runProjectApiSuite, summarizeProjectApiResults, projectApiSuiteSignature, isProjectApiRunComplete,
} from "@/lib/projectApiSuite.mjs";

type Scenario = { id: string; projectId: string; name: string; method: string; url: string; expectedStatus: number; maxDurationMs: number; expectedContentType?: string; jsonContract?: { path:string; type:string } };
type ReportRow = { scenarioId: string; method: string; origin: string; status: number | null; elapsedMs: number; passed: boolean; reason: string; contentTypeCheck?: string; jsonCheck?: string };
type Project = { id: string; name: string };
type Baseline = ReturnType<typeof createApiBaseline>;
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

  useEffect(() => { setEnvironment("saved"); setTargetOrigin(""); }, [projectId]);
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

  const flash = (value: string, isError = false) => { setMessage(value); setError(isError); };
  const persist = (items: Scenario[]) => {
    try {
      const safe = normalizeProjectApiScenarios(items, projects.map(p => p.id));
      localStorage.setItem(PROJECT_API_SUITE_KEY, JSON.stringify(safe));
      setScenarios(safe);
      flash("Project API suite saved to this browser. No credentials or response bodies stored.");
    } catch { flash("Browser storage is unavailable; no changes were saved.", true); }
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
  const add = () => {
    try {
      const next = addProjectApiScenario(scenarios, {
        id: crypto.randomUUID(), projectId, name: scenarioName, method: draft.method, url: draft.url,
        expectedStatus, maxDurationMs, expectedContentType,
        ...(jsonPath.trim() ? {jsonContract:{path:jsonPath.trim(),type:jsonType}} : {}),
      }, projects.map(p => p.id));
      persist(next);
      setScenarioName("");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Unable to save check.", true); }
  };
  const imported = () => {
    try {
      if (!projectId) throw new Error("Choose a saved project.");
      const entries = importProjectApiSuite(importText, projectId, () => crypto.randomUUID());
      let next = scenarios;
      for (const scenario of entries) next = addProjectApiScenario(next, scenario, projects.map(p => p.id));
      persist(next);
      setImportText("");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Import failed.", true); }
  };
  const run = async () => {
    if (running || abortRef.current || !projectId || !available.length || targetError) return;
    const targets = targetOrigins;
    if (!window.confirm("Run " + available.length + " GET/HEAD check(s) against " + targets.join(", ") +
      "? This will send actual network requests without cookies or authorization headers. Optional JSON checks read up to 64 KiB per response.")) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setResults([]);
    setCurrentEvidence(null);
    setRunProjectId(projectId);
    setRunSignature(projectApiSuiteSignature(available));
    setRunEnvironment(environment);
    setRunning(true);
    flash("Running real browser requests, one at a time. The target API must permit CORS.");
    try {
      const finished = await runProjectApiSuite(available, { signal: abort.signal, onProgress: (_row, rows) => setResults(rows) });
      setResults(finished);
      flash(abort.signal.aborted ? "Suite stopped. Partial results retained for this visit." : "Suite completed. Review genuine HTTP outcomes below.");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Suite could not start.", true); }
    finally { abortRef.current = null; setRunning(false); }
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
          <Button type="button" variant="outline" disabled={running || savedScenarios.length >= MAX_PROJECT_SCENARIOS || (!!jsonPath.trim() && draft.method !== "GET")} onClick={add}>
            <Save className="mr-2 h-4 w-4"/>Save current request as check</Button>
          <span className="self-center text-xs text-slate-400">{savedScenarios.length} / {MAX_PROJECT_SCENARIOS} checks linked</span>
        </div>
        <p className="text-xs text-amber-200">Only the current request method, URL without query string or fragment, scenario name, expected status and timeout are saved. Headers, request bodies and credentials are discarded. Do not put secrets in URL paths or names. Only GET/HEAD are supported.</p>
        <div className="space-y-2" aria-label="Saved API scenarios">
          {savedScenarios.length ? savedScenarios.map(s => <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-400">{s.method} {s.url} · Expect {s.expectedStatus} ≤{s.maxDurationMs}ms · {s.expectedContentType || "any content type"}{s.jsonContract ? " · JSON " + s.jsonContract.path + " : " + s.jsonContract.type : ""}</p>
            </div>
            <Button size="sm" variant="ghost" disabled={running} aria-label={"Remove " + s.name} onClick={() => persist(scenarios.filter(item => item.id !== s.id))}>
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={running || !!targetError || available.length === 0} onClick={() => void run()}><Play className="mr-2 h-4 w-4"/>Run selected project suite</Button>
          {running && <Button type="button" variant="destructive" onClick={() => abortRef.current?.abort()}>
            <StopCircle className="mr-2 h-4 w-4"/>Cancel current request and stop</Button>}
          <Button type="button" size="sm" variant="outline" disabled={!savedScenarios.length || running}
            onClick={() => saveJson("eternyx-api-suite.json", exportProjectApiSuite(scenarios, projectId))}>
            <Download className="mr-2 h-4 w-4"/>Export sanitized suite</Button>
        </div>
        {results.length > 0 && runProjectId === projectId && <div className="rounded-xl border border-slate-700 p-4">
          <p className="font-semibold"><Activity className="mr-2 inline h-4 w-4 text-cyan-300"/>Actual results: {summary.passed} passed · {summary.failed} failed · {summary.cancelled} cancelled</p>
          {stale && <p role="status" className="mt-2 text-sm text-amber-300">Suite changed. Previous results are stale; rerun before exporting.</p>}
          {!stale && !running && !complete && <p role="status" className="mt-2 text-sm text-amber-300">Run incomplete or cancelled. Rerun before exporting.</p>}
          <p className="mt-1 text-xs text-slate-400">Results show origin, status, latency, content-type and optional JSON field outcomes, and reason. No response body, request path, URL query or raw headers are retained in the report.</p>
          <div className="mt-3 space-y-2">{results.map((r, i) => <p key={r.scenarioId + i} className={"rounded-md border p-2 text-xs " +
              (r.passed ? "border-emerald-500/30 text-emerald-200" : "border-rose-500/30 text-rose-200")}>
              {r.passed ? "PASS" : "FAIL"} · {r.method} {r.origin} · HTTP {r.status ?? "unavailable"} · {r.elapsedMs} ms · {r.reason}{r.contentTypeCheck ? " · content type: " + r.contentTypeCheck : ""}{r.jsonCheck ? " · JSON field: " + r.jsonCheck : ""}</p>)}</div>
          <Button className="mt-3" size="sm" variant="outline" disabled={!complete} onClick={() => { if (complete) saveJson("eternyx-api-smoke-report.json", exportProjectApiReport(results)); }}>
            <Download className="mr-2 h-4 w-4"/>Export sanitized results</Button>
        </div>}
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
          <Button type="button" size="sm" variant="outline" disabled={running || !importText.trim()} onClick={imported}>
            <Upload className="mr-2 h-4 w-4"/>Import into selected project</Button></div>
      </>}
      {message && <p role={error ? "alert" : "status"} className={error ? "text-sm text-rose-200" : "text-sm text-cyan-200"}>{message}</p>}
      <p className="text-xs leading-5 text-slate-500">
        All tests run sequentially from this browser, only after confirmation. Cookies and authorization headers are never attached by this suite. Network/CORS failures are failures, not fabricated successful tests. Raw results exist only in current page memory; optional baselines retain sanitized metadata locally.
      </p>
    </CardContent>
  </Card>;
}
