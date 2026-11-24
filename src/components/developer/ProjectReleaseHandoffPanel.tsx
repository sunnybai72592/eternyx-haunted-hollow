import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileWarning, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import {
  DEVELOPER_RELEASE_PLAN_STORAGE_KEY, runDeveloperCombinedReleaseReview,
  exportDeveloperReleaseEvidencePack,
} from "@/lib/developerProjectReleaseIntegration.mjs";
import { developerLinePosition } from "@/lib/developerLocalWorkflows.mjs";
import {
  analyzeDeveloperReleaseTriage, compareDeveloperReleaseTriage,
  exportDeveloperReleaseTriage, DEVELOPER_TRIAGE_ADVICE,
} from "@/lib/developerProjectReleaseTriage.mjs";
import { readDeveloperReleaseSavedPlan } from "@/lib/developerProjectReleaseIntegration.mjs";
import {
  runDeveloperLocalReleaseHandoff, exportDeveloperLocalReleaseHandoff,
} from "@/lib/developerProjectReleaseHandoff.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type Report = Awaited<ReturnType<typeof runDeveloperLocalReleaseHandoff>>;
type SavedPlanReport = Awaited<ReturnType<typeof runDeveloperCombinedReleaseReview>>["savedPlan"];
type TriageReport = ReturnType<typeof analyzeDeveloperReleaseTriage>;
type TriageDelta = ReturnType<typeof compareDeveloperReleaseTriage>;
type JumpTarget = { file: string; index: number; length: number; line?: number; column?: number };

const CHECK_LABELS: Record<string, string> = {
  "entry-structure": "HTML entry file exists and is nonempty",
  "static-and-js-preflight": "Static findings and real JavaScript syntax preflight",
  "default-local-smoke": "Two default local entry assertions (not custom suite)",
  "cross-file-references": "Recognized local file references resolve",
  "import-cycle-review": "No literal JS/CSS import cycles detected",
  "preview-compatibility": "No known restricted-preview compatibility warnings",
  "hosted-staging": "Real hosted staging and Chrome acceptance",
  "protected-backend": "Protected backend, sessions and data boundaries",
  "production": "Production release and deployment verification",
};

function download(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "eternyx-local-release-handoff.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ProjectReleaseHandoffPanel({ project, baseline, onJump }: {
  project: Project;
  baseline: Project | null;
  onJump: (target: JumpTarget) => void;
}) {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{
    signature: string; report: Report; savedPlan?: SavedPlanReport; planRaw?: string;
    projectId?: string; triage?: TriageReport; delta?: TriageDelta;
  } | null>(null);
  const [showAllTriage, setShowAllTriage] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(true);
  const signature = useMemo(() => JSON.stringify([project.id, project.name, project.files, baseline ? [baseline.id, baseline.name, baseline.files] : null]),
    [project.id, project.name, project.files, baseline]);
  useEffect(() => {
    const bump = () => setPlanVersion(count => count + 1);
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEVELOPER_RELEASE_PLAN_STORAGE_KEY || event.key === null) bump();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", bump);
    window.addEventListener("eternyx:developer-tests-saved", bump);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", bump);
      window.removeEventListener("eternyx:developer-tests-saved", bump);
    };
  }, []);
  const report = lastRun?.report ?? null;
  const stale = Boolean(lastRun && lastRun.signature !== signature);
  const planStale = useMemo(() => {
    if (!lastRun?.savedPlan) return false;
    try { return localStorage.getItem(DEVELOPER_RELEASE_PLAN_STORAGE_KEY) !== lastRun.planRaw; }
    catch { return true; }
  }, [lastRun, planVersion]);
  const combinedStale = stale || planStale;
  const tell = (message: string, error = false) => setFeedback({ message, error });

  const run = async () => {
    if (running) return;
    const startedSignature = signature;
    setRunning(true);
    try {
      const next = await runDeveloperLocalReleaseHandoff(project, baseline);
      setLastRun({ signature: startedSignature, report: next });
      tell(next.localVerdict === "local-checks-passed"
        ? "Local source checks completed. Hosted staging, protected backend and production remain NOT VERIFIED."
        : "Local review found items that require attention. Hosted and production checks are still NOT VERIFIED.");
    } catch {
      setLastRun(null);
      tell("Local release review could not complete. No release evidence was recorded.", true);
    } finally { setRunning(false); }
  };

  const runSavedPlan = async () => {
    if (running) return;
    setRunning(true);
    const startedSignature = signature;
    try {
      const raw = localStorage.getItem(DEVELOPER_RELEASE_PLAN_STORAGE_KEY) || "[]";
      const next = await runDeveloperCombinedReleaseReview(project, raw, baseline);
      // Reject a plan modified during the asynchronous parser/preflight.
      if (localStorage.getItem(DEVELOPER_RELEASE_PLAN_STORAGE_KEY) !== raw) {
        throw new Error("Saved plan changed during the review. Run it again.");
      }
      const tests = readDeveloperReleaseSavedPlan(raw, project.id);
      const triage = analyzeDeveloperReleaseTriage(project, tests, baseline, next);
      const delta = lastRun?.projectId === project.id && lastRun.triage
        ? compareDeveloperReleaseTriage(lastRun.triage, triage) : null;
      setLastRun({ signature: startedSignature, report: next.local, savedPlan: next.savedPlan,
        planRaw: raw, projectId: project.id, triage, delta });
      tell(next.savedPlan.status === "passed"
        ? "Saved project plan executed. Review coverage and the independent local release checks below."
        : "Saved test plan or changed-file coverage requires review. Remote release remains on hold.");
    } catch (cause) {
      setLastRun(null);
      tell(cause instanceof Error ? cause.message : "Saved plan review could not complete.", true);
    } finally { setRunning(false); }
  };

  const exportCombined = () => {
    if (!lastRun?.savedPlan || running || combinedStale) {
      tell("Rerun both checks against current source, baseline and saved test plan before exporting.", true);
      return;
    }
    try {
      if (localStorage.getItem(DEVELOPER_RELEASE_PLAN_STORAGE_KEY) !== lastRun.planRaw) {
        tell("Saved test plan changed. Combined evidence is stale.", true);
        setPlanVersion(count => count + 1);
        return;
      }
      download(exportDeveloperReleaseEvidencePack(lastRun.report, lastRun.savedPlan));
      tell("Exported a filename-free local evidence pack. Staging, backend and production remain NOT VERIFIED.");
    } catch {
      tell("Could not export the combined evidence pack. Rerun both local checks.", true);
    }
  };

  const exportTriage = () => {
    if (!lastRun?.triage || combinedStale || running) {
      tell("Rerun saved-plan diagnostics for the current source and saved plan before export.", true);
      return;
    }
    try {
      if (localStorage.getItem(DEVELOPER_RELEASE_PLAN_STORAGE_KEY) !== lastRun.planRaw) {
        setPlanVersion(count => count + 1);
        tell("Saved plan was modified. Diagnostic evidence is stale.", true);
        return;
      }
      download(exportDeveloperReleaseTriage(lastRun.triage));
      tell("Exported rule-code counts without filenames, expected literals or source.");
    } catch {
      tell("Diagnostics export failed. Rerun the saved-plan review.", true);
    }
  };

  const exportReport = () => {
    if (!report || running || stale) {
      tell("Rerun the review for the current project and saved baseline before exporting.", true);
      return;
    }
    download(exportDeveloperLocalReleaseHandoff(report));
    tell("Exported counts and status categories only. No source, filenames, test IDs or credentials included.");
  };

  const jumpTo = (file: string, line: number) => {
    const entry = project.files.find(item => item.name === file);
    if (!entry || line < 1) return;
    const location = developerLinePosition(entry.content, line);
    onJump({ file, index: location.index, length: 0, line: location.line, column: 1 });
  };

  return <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-cyan-300"/>Local release review & handoff
      </CardTitle>
      <CardDescription className="text-slate-400">
        Explicit, current-file preflight and handoff evidence. This is not a deploy button or hosted release approval.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={running} onClick={() => void run()}>
          <CheckCircle2 className="mr-2 h-4 w-4"/>{running ? "Reviewing local files…" : "Run local release review"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!report || stale || running} onClick={exportReport}>
          <Download className="mr-2 h-4 w-4"/>Export redacted handoff
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={running} onClick={() => void runSavedPlan()}>
          <CheckCircle2 className="mr-2 h-4 w-4"/>{running ? "Reviewing local files…" : "Run with saved test plan"}
        </Button>
        <Button type="button" size="sm" variant="outline"
          disabled={!lastRun?.savedPlan || combinedStale || running} onClick={exportCombined}>
          <Download className="mr-2 h-4 w-4"/>Export combined local evidence
        </Button>
        <Button type="button" size="sm" variant="outline"
          disabled={!lastRun?.triage || combinedStale || running} onClick={exportTriage}>
          <Download className="mr-2 h-4 w-4"/>Export redacted diagnostic summary
        </Button>
        {stale && <span role="status" className="text-xs text-amber-200">
          Project or baseline changed. Release review is stale; rerun required.
        </span>}
        {planStale && <span role="status" className="text-xs text-amber-200">
          Saved test plan changed. Combined evidence is stale; rerun required.
        </span>}
      </div>
      {feedback && <p role={feedback.error ? "alert" : "status"}
        className={feedback.error ? "text-sm text-rose-200" : "text-sm text-cyan-200"}>{feedback.message}</p>}
      <div className="rounded-md border border-amber-500/30 p-3 text-xs text-amber-100">
        Hosted staging, protected backend and production are <strong>NOT VERIFIED</strong> here.
        The explicit offline review never executes project JavaScript, sends network traffic, deploys,
        runs the editable custom test suite unless explicitly requested, or changes accounts. Release decision: HOLD.
      </div>
      {lastRun?.savedPlan && <div className="space-y-3 rounded-lg border border-cyan-700/45 p-3" aria-label="Saved test plan release review">
        <p className="text-sm font-semibold text-cyan-100">Opt-in saved test plan evidence</p>
        <p role="status" className={(combinedStale || lastRun.savedPlan.status !== "passed"
          ? "text-amber-200" : "text-emerald-200") + " text-xs"}>
          {combinedStale ? "Saved plan evidence is stale; rerun required" :
            lastRun.savedPlan.status === "passed" ? "Saved plan assertions passed" : "Saved plan requires review"}
          {" · "}{lastRun.savedPlan.passedAssertions}/{lastRun.savedPlan.assertionCount} assertions passed
          {" · "}{lastRun.savedPlan.coverage.testedFileCount}/{lastRun.savedPlan.coverage.fileCount} files referenced by the plan
        </p>
        <p className="text-xs text-slate-300">
          {lastRun.savedPlan.coverage.baselineCompared ?
            lastRun.savedPlan.coverage.uncoveredChangedFileCount + " changed, " +
            lastRun.savedPlan.coverage.uncoveredAffectedFileCount +
            " potentially affected, and " + lastRun.savedPlan.coverage.deletedFileCount +
            " deleted file(s) need coverage review." :
            "No saved project baseline is loaded; changed-file coverage is unverified."}
        </p>
        {lastRun.savedPlan.coverage.baselineCompared &&
          (lastRun.savedPlan.coverage.uncoveredChangedFileCount > 0 ||
            lastRun.savedPlan.coverage.uncoveredAffectedFileCount > 0 ||
            lastRun.savedPlan.coverage.deletedFileCount > 0) &&
          <p className="break-all text-xs text-amber-200">
            Review impacted files: {[
              ...lastRun.savedPlan.coverage.uncoveredChanged,
              ...lastRun.savedPlan.coverage.uncoveredAffected,
              ...lastRun.savedPlan.coverage.deleted,
            ].filter((file, index, files) => files.indexOf(file) === index).join(", ")}
          </p>}
        {lastRun.savedPlan.failures.length > 0 && <div className="max-h-48 space-y-2 overflow-auto"
          aria-label="Saved plan assertion failures">
          {lastRun.savedPlan.failures.map((item, index) =>
            <div key={item.file + ":" + item.kind + ":" + index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-700 p-2">
              <p className="break-all text-xs text-amber-100">
                {item.kind} · {item.reason} · {item.file}{item.line > 0 ? " · line " + item.line : ""}
              </p>
              {item.line > 0 && project.files.some(file => file.name === item.file) &&
                <Button type="button" size="sm" variant="outline" disabled={combinedStale}
                  onClick={() => jumpTo(item.file, item.line)}>Open failed assertion</Button>}
            </div>)}
        </div>}
        <p className="text-xs text-slate-400">
          This includes only the explicitly saved plan for this project, not unsaved assertions.
          Passing checks prove neither linked-file runtime loading nor hosted integration.
          The portable combined report exports counts and built-in check kinds only.
        </p>
      </div>}
      {lastRun?.triage && <div className="space-y-3 rounded-lg border border-slate-700 p-3"
        aria-label="Integration reliability triage">
        <p className="text-sm font-semibold text-cyan-100">
          Integration reliability triage · {lastRun.triage.totalItems} local finding(s)
        </p>
        <p className="text-xs text-slate-300">
          {lastRun.triage.severityCounts.blocker} blockers · {lastRun.triage.severityCounts.review} review item(s) ·
          {" "}{lastRun.triage.severityCounts.info} informational.
          {lastRun.triage.truncated ? " First 64 shown; export includes all rule counts." : ""}
        </p>
        {lastRun.delta && <p className="text-xs text-amber-100" role="status">
          Since prior explicit run: {lastRun.delta.improved.length} rule category(s) improved ·
          {" "}{lastRun.delta.regressed.length} regressed · {lastRun.delta.unchanged} unchanged.
          Counts compare rule categories, not individual defect identities.
        </p>}
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" aria-pressed={showAllTriage}
            onClick={() => setShowAllTriage(value => !value)}>
            {showAllTriage ? "Show priority findings" : "Show all diagnostic findings"}
          </Button>
        </div>
        <div className="max-h-64 space-y-2 overflow-auto" aria-label="Prioritized integration diagnostics">
          {lastRun.triage.items.filter(item => showAllTriage || item.severity !== "info").length === 0 &&
            <p className="text-xs text-slate-400">No priority findings. Informational gaps are available in the full list.</p>}
          {lastRun.triage.items.filter(item => showAllTriage || item.severity !== "info").map((item, index) =>
            <div key={item.code + ":" + item.file + ":" + item.line + ":" + index}
              className="rounded-md border border-slate-700 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-all font-semibold text-amber-100">
                  {item.severity} · {item.code}
                  {item.file ? " · " + item.file : ""}{item.line > 0 ? " · line " + item.line : ""}
                  {item.count > 1 ? " · " + item.count + " occurrence(s)" : ""}
                </p>
                {item.file && project.files.some(file => file.name === item.file) &&
                  <Button type="button" size="sm" variant="outline" disabled={combinedStale}
                    onClick={() => jumpTo(item.file, item.line || 1)}>Open diagnostic source</Button>}
              </div>
              <p className="mt-1 text-slate-300">{DEVELOPER_TRIAGE_ADVICE[item.code]}</p>
            </div>)}
        </div>
        <p className="text-xs text-slate-500">
          Prioritized diagnostics are bounded browser-local heuristics, not runtime proof.
          Rule-count changes do not prove issues were fixed. Export omits all file names and source.
          Hosted staging, protected backend and production remain NOT VERIFIED.
        </p>
      </div>}
      {report ? <>
        <p role="status" className={(stale || report.localVerdict !== "local-checks-passed" ?
          "text-amber-200" : "text-emerald-200") + " text-sm font-medium"}>
          {stale ? "Stale local evidence — no current decision" :
            report.localVerdict === "local-checks-passed" ?
              "Local source checks passed · hosted release still on hold" : "Local review requires attention"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2" aria-label="Local release checks">
          {report.checks.map(item => <div key={item.id} className="rounded-md border border-slate-700 p-2 text-xs">
            <p className="font-medium text-white">{CHECK_LABELS[item.id] || item.id}</p>
            <p className={"mt-1 " + (item.status === "passed" ? "text-emerald-200" :
              item.status === "not-verified" ? "text-slate-300" : "text-amber-200")}>
              {item.status}{item.count !== null ? " · " + item.count + " issue(s)" : ""}
            </p>
          </div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {report.findings.length} local finding(s){report.findingsTruncated ? " (list truncated)" : ""}
            {report.baselineCompared ?
              " · " + report.changedFileCount + " changed and " + report.potentiallyAffectedFileCount +
              " potentially affected file(s) since saved baseline" : " · no saved baseline comparison"}
          </p>
          <Button type="button" size="sm" variant="outline" aria-pressed={issuesOnly}
            onClick={() => setIssuesOnly(value => !value)}>
            {issuesOnly ? "Show all findings" : "Show errors only"}
          </Button>
        </div>
        <div className="max-h-52 space-y-2 overflow-auto" aria-label="Local release findings">
          {report.findings.filter(item => !issuesOnly || item.level === "error").length === 0 &&
            <p className="text-xs text-slate-400">
              No {issuesOnly ? "errors" : "findings"} in this view. Other checks may still require review.
            </p>}
          {report.findings.filter(item => !issuesOnly || item.level === "error").map((item, index) =>
            <div key={item.rule + ":" + item.file + ":" + item.line + ":" + index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-700 p-2">
              <p className="min-w-0 break-all text-xs text-slate-300">
                <FileWarning className="mr-1 inline h-3 w-3"/>
                {item.level} · {item.rule} {item.file ? "· " + item.file : ""} {item.line > 0 ? "· line " + item.line : ""}
              </p>
              {item.file && item.line > 0 && project.files.some(file => file.name === item.file) &&
                <Button type="button" size="sm" variant="outline" disabled={stale}
                  onClick={() => jumpTo(item.file, item.line)}>Open review location</Button>}
            </div>)}
        </div>
      </> : <p className="text-xs text-slate-400">
        Run the review explicitly to create a source-derived snapshot. No report or release status is fabricated on page load.
      </p>}
      <p className="text-xs leading-5 text-slate-500">
        The default local smoke uses two entry assertions. "Run with saved test plan" separately
        executes the explicitly saved per-project assertions without mutating the plan.
        Static HTML/CSS and dependency findings are bounded heuristics; imported modules and linked resources
        are not loaded as original statements in this isolated preview. Review the editable custom suite separately.
        Redacted exports contain fixed check IDs, counts and statuses only, never filenames, source, line details or assertion literals.
      </p>
    </CardContent>
  </Card>;
}
