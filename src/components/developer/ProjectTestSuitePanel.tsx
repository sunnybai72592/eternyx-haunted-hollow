import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileCheck2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import {
  DEVELOPER_TEST_STORAGE, MAX_DEVELOPER_TESTS, TEST_KINDS,
  defaultDeveloperTests, normalizeDeveloperTestSuite, exportDeveloperLocalTestReport,
  exportDeveloperTestSuite, importDeveloperTestSuite, readSavedDeveloperTestSuites,
  runDeveloperLocalTests, upsertSavedDeveloperTestSuite,
} from "@/lib/developerProjectTests.mjs";
import { developerLinePosition } from "@/lib/developerLocalWorkflows.mjs";
import { DEVELOPER_HTML_QUALITY_KINDS, recommendedDeveloperQualityTests } from "@/lib/developerProjectQuality.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type TestCase = ReturnType<typeof normalizeDeveloperTestSuite>[number];
type TestRun = Awaited<ReturnType<typeof runDeveloperLocalTests>>;

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function initialTests(projectId: string): TestCase[] {
  try {
    const saved = readSavedDeveloperTestSuites(localStorage.getItem(DEVELOPER_TEST_STORAGE) || "[]");
    return saved.find(item => item.projectId === projectId)?.tests || defaultDeveloperTests();
  } catch { return defaultDeveloperTests(); }
}

const NEEDS_EXPECTED = new Set(["text-contains", "text-absent", "json-path-equals",
  "json-array-length", "html-anchor-exists", "css-selector-exists"]);

export default function ProjectTestSuitePanel({ project, onJump }: {
  project: Project;
  onJump: (match: { file: string; index: number; length: number }) => void;
}) {
  const [cases, setCases] = useState<TestCase[]>(() => initialTests(project.id));
  const [kind, setKind] = useState("file-exists");
  const [filename, setFilename] = useState("index.html");
  const [expected, setExpected] = useState("");
  const [path, setPath] = useState("");
  const [importText, setImportText] = useState("");
  const [running, setRunning] = useState(false);
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [lastRun, setLastRun] = useState<{ signature: string; report: TestRun } | null>(null);

  const signature = useMemo(() => JSON.stringify([project.files, cases]), [project.files, cases]);
  const stale = Boolean(lastRun && lastRun.signature !== signature);
  const report = lastRun?.report || null;
  const tell = (message: string, error = false) => setFeedback({ message, error });

  const addTest = () => {
    try {
      if (cases.length >= MAX_DEVELOPER_TESTS) throw new Error("Local suite is limited to 16 checks.");
      const value = normalizeDeveloperTestSuite([...cases, {
        id: crypto.randomUUID(), kind, file: filename, expected, path,
      }]);
      setCases(value);
      setExpected("");
      setPath("");
      tell("Added a local assertion. Run tests explicitly; save the plan separately if needed.");
    } catch (cause) { tell(cause instanceof Error ? cause.message : "Invalid local assertion.", true); }
  };

  const addRecommended = () => {
    try {
      const suggested = recommendedDeveloperQualityTests(project, cases);
      if (!suggested.length) { tell("All recommended HTML quality checks are already configured."); return; }
      if (cases.length + suggested.length > MAX_DEVELOPER_TESTS) {
        throw new Error("Not enough room for the six recommended checks. Remove unused checks first.");
      }
      const next = normalizeDeveloperTestSuite([...cases, ...suggested]);
      setCases(next);
      tell("Added " + suggested.length + " real HTML quality checks. Run tests explicitly; the plan is not automatically saved.");
    } catch (cause) { tell(cause instanceof Error ? cause.message : "Could not add quality checks.", true); }
  };

  const removeTest = (id: string) => {
    if (cases.length <= 1) { tell("Keep at least one assertion in the test suite.", true); return; }
    setCases(current => current.filter(item => item.id !== id));
    tell("Removed a local assertion from the working suite.");
  };

  const saveSuite = () => {
    try {
      const current = readSavedDeveloperTestSuites(localStorage.getItem(DEVELOPER_TEST_STORAGE) || "[]");
      const next = upsertSavedDeveloperTestSuite(current, project.id, cases);
      localStorage.setItem(DEVELOPER_TEST_STORAGE, JSON.stringify(next));
      tell("Saved this project test plan in this browser only. Assertions may contain source or secrets.");
    } catch (cause) { tell(cause instanceof Error ? cause.message : "Could not save test plan.", true); }
  };

  const removeSavedSuite = () => {
    if (!window.confirm("Delete this project's locally saved test plan and reset to default checks?")) return;
    try {
      const current = readSavedDeveloperTestSuites(localStorage.getItem(DEVELOPER_TEST_STORAGE) || "[]");
      localStorage.setItem(DEVELOPER_TEST_STORAGE,
        JSON.stringify(current.filter(item => item.projectId !== project.id)));
      setCases(defaultDeveloperTests());
      setLastRun(null);
      tell("Deleted saved plan from this browser and restored default checks.");
    } catch { tell("Browser storage unavailable; saved test plan was not deleted.", true); }
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    const before = signature;
    try {
      const next = await runDeveloperLocalTests(project, cases);
      setLastRun({ signature: before, report: next });
      tell(next.status === "passed" ?
        "Local assertions and parser preflight passed. No code was executed; runtime and hosted readiness are unverified." :
        "The local test suite or parser preflight found a failed check. Review results.");
    } catch { setLastRun(null); tell("Local test runner failed; no passing result is recorded.", true); }
    finally { setRunning(false); }
  };

  const downloadReport = () => {
    if (!report || stale || running) { tell("Rerun tests on the current project and plan before exporting.", true); return; }
    download("eternyx-local-test-evidence.json", exportDeveloperLocalTestReport(report));
    tell("Exported source-free test outcomes; no assertion values or project source included.");
  };

  const importPlan = () => {
    try {
      const parsed = importDeveloperTestSuite(importText);
      if (!window.confirm("Replace all current test assertions with the imported plan? This will not modify project files.")) return;
      setCases(parsed);
      setLastRun(null);
      setImportText("");
      tell("Imported an editable local test plan. Tests were not executed and changes are not yet saved.");
    } catch (cause) { tell(cause instanceof Error ? cause.message : "Invalid test plan.", true); }
  };

  const exportPlan = () => {
    if (!window.confirm("The test plan may include source strings or private expected values. Export it as a readable JSON file?")) return;
    download("eternyx-local-test-plan.json", exportDeveloperTestSuite(cases));
  };

  const jump = (file: string, line: number) => {
    const entry = project.files.find(item => item.name.toLowerCase() === file.toLowerCase());
    if (!entry || line <= 0) return;
    try {
      const offset = developerLinePosition(entry.content, line);
      onJump({ file: entry.name, index: offset.index, length: 0 });
    } catch { tell("The result location is no longer available.", true); }
  };

  return <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-cyan-300"/>Local project test suite</CardTitle>
      <CardDescription className="text-slate-400">Real, explicit checks against current project files: presence, literal text, JSON values/array lengths, HTML IDs/quality rules, and CSS selectors. Every run also checks real parser-backed JS preflight. Nothing executes project JavaScript or calls a backend.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={running} onClick={() => void run()}>
          <CheckCircle2 className="mr-2 h-4 w-4"/>{running ? "Checking project…" : "Run project tests"}
        </Button>
        <Button size="sm" variant="outline" disabled={!report || stale || running} onClick={downloadReport}>
          <Download className="mr-2 h-4 w-4"/>Export source-free test report
        </Button>
        {stale && <span role="status" className="text-xs text-amber-200">Project or test plan changed. Test results are stale.</span>}
      </div>

      {feedback && <p role={feedback.error ? "alert" : "status"} className={"text-sm " +
        (feedback.error ? "text-rose-200" : "text-cyan-200")}>{feedback.message}</p>}
      {report && <div className="rounded-lg border border-slate-700 p-3 text-sm">
        <p className={report.status === "passed" && !stale ? "font-semibold text-emerald-200" : "font-semibold text-amber-200"}>
          {report.status === "passed" && !stale ? "Local test suite passed" : "Local tests require review or are stale"}
        </p>
        <p className="mt-1 text-slate-300">{report.passed} assertion(s) passed · {report.failed} failed ·
          preflight {report.preflightPassed ? "passed" : "failed"} ({report.preflightErrors} error(s), {report.preflightWarnings} warning(s))
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">Rule results are source-free; click a location to review in the local editor.</p>
          <Button size="sm" variant="outline" aria-pressed={showFailuresOnly}
            onClick={() => setShowFailuresOnly(current => !current)}>
            {showFailuresOnly ? "Show all results" : "Show failed only"}
          </Button>
        </div>
        <div className="mt-2 max-h-48 space-y-1 overflow-auto" aria-label="Local test results">
          {report.results.filter(result => !showFailuresOnly || result.status === "failed").map(result => <div key={result.index}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2 text-xs">
            <span className={result.status === "passed" ? "text-emerald-200" : "text-rose-200"}>
              #{result.index} {result.kind} · {result.status} · {result.reason}
            </span>
            {result.line > 0 && project.files.some(file => file.name.toLowerCase() === result.file.toLowerCase()) &&
              <Button size="sm" variant="outline" disabled={stale} onClick={() => jump(result.file, result.line)}>
                Open test location
              </Button>}
          </div>)}
        </div>
      </div>}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{cases.length} / {MAX_DEVELOPER_TESTS} assertions</p>
          <Button size="sm" variant="outline" disabled={!project.files.some(f => f.name.toLowerCase() === "index.html") ||
            cases.length >= MAX_DEVELOPER_TESTS} onClick={addRecommended}>
            Add HTML quality checks
          </Button>
        </div>
        <div role="group" aria-label="Configured local tests" className="max-h-48 space-y-2 overflow-auto">
          {cases.map((testCase, i) => <div key={testCase.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-700 p-2 text-xs">
            <span className="min-w-0 break-all">{i + 1}. {testCase.kind} · {testCase.file}</span>
            <Button size="sm" variant="ghost" aria-label={"Remove test " + (i + 1)}
              disabled={cases.length === 1} onClick={() => removeTest(testCase.id)}><Trash2 className="h-4 w-4"/></Button>
          </div>)}
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-slate-700 p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="developer-test-kind">Assertion kind</Label>
          <select id="developer-test-kind" value={kind} onChange={e => setKind(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">
            {TEST_KINDS.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="developer-test-file">Project filename</Label>
          <Input id="developer-test-file" value={filename} maxLength={64} onChange={e => setFilename(e.target.value)}
            className="border-slate-700 bg-slate-950 text-white"/>
        </div>
        {(kind === "json-path-equals" || kind === "json-array-length") && <div className="space-y-1">
          <Label htmlFor="developer-test-path">Object key path (a.b.c)</Label>
          <Input id="developer-test-path" value={path} maxLength={100} onChange={e => setPath(e.target.value)}
            className="border-slate-700 bg-slate-950 text-white"/>
        </div>}
        {NEEDS_EXPECTED.has(kind) && <div className="space-y-1">
          <Label htmlFor="developer-test-expected">{kind === "json-path-equals" ? "Expected JSON scalar" : kind === "json-array-length" ? "Expected array length" : kind === "css-selector-exists" ? "Literal CSS selector" : "Expected literal text / HTML id"}</Label>
          <Input id="developer-test-expected" value={expected} maxLength={120} onChange={e => setExpected(e.target.value)}
            className="border-slate-700 bg-slate-950 text-white"/>
        </div>}
        <div className="flex items-end"><Button size="sm" variant="outline" disabled={cases.length >= MAX_DEVELOPER_TESTS}
          onClick={addTest}><Plus className="mr-2 h-4 w-4"/>Add assertion</Button></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={saveSuite}>Save test plan locally</Button>
        <Button size="sm" variant="outline" onClick={removeSavedSuite}>Reset saved plan</Button>
        <Button size="sm" variant="outline" onClick={exportPlan}><Download className="mr-2 h-4 w-4"/>Export test plan</Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="developer-test-plan-import">Import a test plan JSON</Label>
        <Textarea id="developer-test-plan-import" value={importText}
          onChange={e => setImportText(e.target.value.slice(0, 9001))}
          className="min-h-20 border-slate-700 bg-slate-950 font-mono text-xs text-white"
          placeholder='{"schema":"eternyx-developer-local-tests-v1","tests":[...]}' />
        <Button size="sm" variant="outline" disabled={!importText.trim()} onClick={importPlan}>Verify and import test plan</Button>
      </div>
      <p className="text-xs leading-5 text-slate-500">Test plans can contain literals from your code. Saving stores the full plan in this browser; portable plan exports can expose expected strings. Result exports omit expected values, source and test IDs. HTML and CSS quality checks use bounded source heuristics, not a DOM/CSS parser or accessibility certification. This does not verify runtime behavior, external services, authentication or release readiness.</p>
    </CardContent>
  </Card>;
}
