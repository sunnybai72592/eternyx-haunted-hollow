import { useMemo, useState } from "react";
import { Download, GitBranch, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import {
  analyzeDeveloperProjectDependencies, exportDeveloperDependencyReport,
} from "@/lib/developerProjectDependencies.mjs";
import { developerLinePosition } from "@/lib/developerLocalWorkflows.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type JumpTarget = { file: string; index: number; length: number; line?: number; column?: number };

function downloadReport(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "eternyx-dependency-summary.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ProjectDependencyPanel({ project, baseline, onJump }: {
  project: Project;
  baseline: Project | null;
  onJump: (result: JumpTarget) => void;
}) {
  const [focusFile, setFocusFile] = useState("all");
  const report = useMemo(() => analyzeDeveloperProjectDependencies(project, baseline), [project, baseline]);
  const focused = project.files.some(f => f.name === focusFile) ? focusFile : "all";
  const references = report.references.filter(item => focused === "all" || item.from === focused || item.to === focused);
  const jump = (file: string, line: number) => {
    const target = project.files.find(item => item.name === file);
    if (!target) return;
    const position = developerLinePosition(target.content, line > 0 ? line : 1);
    onJump({ file, index: position.index, length: 0, line: position.line, column: 1 });
  };

  return <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Network className="h-5 w-5 text-cyan-300"/>Dependency intelligence & change impact</CardTitle>
      <CardDescription className="text-slate-400">
        Browser-local source heuristics for flat project files. A matched link proves filename presence, not actual loading or execution.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-slate-300">
          {report.fileCount} files · {report.matchedCount}/{report.referenceCount} matched references ·
          {" "}{report.unresolvedCount} unresolved · {report.cycles.length} possible CSS/JS cycle(s)
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() =>
          downloadReport(exportDeveloperDependencyReport(project, baseline))}>
          <Download className="mr-2 h-4 w-4"/>Export filename-free graph summary
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-300">
          <p className="font-semibold text-white">Potentially affected by unsaved changes</p>
          {report.impact ? <>
            <p className="mt-1">{report.impact.changed.length} changed file(s) · {report.impact.affected.length} transitively referenced dependent(s)</p>
            <p className="mt-2 text-slate-400">Changed: {report.impact.changed.join(", ") || "none"}</p>
            <p className="mt-1 text-amber-200">May be affected: {report.impact.affected.join(", ") || "none detected"}</p>
          </> : <p className="mt-1 text-amber-200">Save or reopen a project to establish a baseline for change-impact analysis.</p>}
        </div>
        <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-300">
          <p className="font-semibold text-white">Reference coverage</p>
          <p className="mt-1">{report.unreferenced.length} non-entry file(s) have no inbound references in this limited scan.</p>
          <p className="mt-1 break-words text-slate-400">{report.unreferenced.join(", ") || "Every non-entry file has a scanned inbound reference."}</p>
          <p className="mt-1 text-amber-200">Not an unused-file detector. The preview implicitly includes project CSS/JS text.</p>
        </div>
      </div>
      {report.cycles.length > 0 && <div className="space-y-2" aria-label="Possible import cycles">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <GitBranch className="h-4 w-4"/>Possible literal import cycles
        </p>
        {report.cycles.map((cycle, index) => <p key={index}
          className="rounded-md border border-amber-400/30 p-2 text-xs text-amber-100">
          {cycle.kind.toUpperCase()} · {cycle.files.join(" ↔ ")}
        </p>)}
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="developer-dependency-focus" className="text-xs font-medium text-slate-300">Focus dependencies</label>
        <select id="developer-dependency-focus" value={focused} onChange={e => setFocusFile(e.target.value)}
          className="h-9 min-w-44 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-white">
          <option value="all">All project files</option>
          {project.files.map(file => <option key={file.name} value={file.name}>{file.name}</option>)}
        </select>
        <p className="text-xs text-slate-400">{references.length} reference(s) in view</p>
      </div>
      <div aria-label="Dependency relationships" className="max-h-56 space-y-1 overflow-auto">
        {!references.length ? <p className="text-xs text-slate-400">No supported literal references found for this view.</p> :
          references.map((reference, index) => <div key={reference.from + ":" + reference.line + ":" + reference.kind + ":" + index}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 p-2 text-xs">
            <div className="min-w-0 flex-1 break-words text-slate-300">
              <span className="font-medium text-white">{reference.from}</span> · line {reference.line} · {reference.kind}
              <p className={reference.reason === "resolved" ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
                {reference.reason === "resolved" ? "References " + reference.to : reference.reason}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => jump(reference.from, reference.line)}>
              Open source
            </Button>
          </div>)}
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Cycles cover only supported literal CSS imports and JS imports, not dynamic dependency graphs or bundler semantics.
        Change impact traverses known relationships from the current working copy and the last saved/opened baseline;
        it does not prove runtime breakage. The exported summary contains counts only—not project names, source,
        raw reference strings, line numbers or file identifiers. No upload or backend call occurs.
      </p>
    </CardContent>
  </Card>;
}
