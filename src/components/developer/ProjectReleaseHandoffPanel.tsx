import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileWarning, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import { developerLinePosition } from "@/lib/developerLocalWorkflows.mjs";
import {
  runDeveloperLocalReleaseHandoff, exportDeveloperLocalReleaseHandoff,
} from "@/lib/developerProjectReleaseHandoff.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type Report = Awaited<ReturnType<typeof runDeveloperLocalReleaseHandoff>>;
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
  const [lastRun, setLastRun] = useState<{ signature: string; report: Report } | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(true);
  const signature = useMemo(() => JSON.stringify([project.id, project.name, project.files, baseline ? [baseline.id, baseline.name, baseline.files] : null]),
    [project.id, project.name, project.files, baseline]);
  const report = lastRun?.report ?? null;
  const stale = Boolean(lastRun && lastRun.signature !== signature);
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
        {stale && <span role="status" className="text-xs text-amber-200">
          Project or baseline changed. Release review is stale; rerun required.
        </span>}
      </div>
      {feedback && <p role={feedback.error ? "alert" : "status"}
        className={feedback.error ? "text-sm text-rose-200" : "text-sm text-cyan-200"}>{feedback.message}</p>}
      <div className="rounded-md border border-amber-500/30 p-3 text-xs text-amber-100">
        Hosted staging, protected backend and production are <strong>NOT VERIFIED</strong> here.
        The explicit offline review never executes project JavaScript, sends network traffic, deploys,
        runs the editable custom test suite or changes accounts. Release decision: HOLD.
      </div>
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
        The local smoke uses exactly two default entry assertions, not your currently edited/saved custom test plan.
        Static HTML/CSS and dependency findings are bounded heuristics; imported modules and linked resources
        are not loaded as original statements in this isolated preview. Review the editable custom suite separately.
        Redacted exports contain fixed check IDs, counts and statuses only, never filenames, source, line details or assertion literals.
      </p>
    </CardContent>
  </Card>;
}
