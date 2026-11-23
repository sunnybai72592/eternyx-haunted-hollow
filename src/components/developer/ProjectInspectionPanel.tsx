import { useMemo, useState } from "react";
import { ArrowRight, Download, FileSearch, Replace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  compareDeveloperProjectFiles, exportDeveloperInspectionReport,
  inspectDeveloperProject, searchDeveloperFiles,
} from "@/lib/developerProjectInspection.mjs";
import { normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import { developerLinePosition } from "@/lib/developerLocalWorkflows.mjs";
import { summarizeDeveloperProjectIntegration } from "@/lib/developerProjectIntegration.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type Result = { file: string; index: number; length: number; line: number; column: number };

function downloadReport(json: string) {
  const href = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = "eternyx-project-inspection.json";
  link.click();
  URL.revokeObjectURL(href);
}

export default function ProjectInspectionPanel({ project, baseline, activeFile, onJump, onReplace }: {
  project: Project;
  baseline: Project | null;
  activeFile: string;
  onJump: (result: Result) => void;
  onReplace: (query: string, replacement: string, replaceAll: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const results = useMemo(() => searchDeveloperFiles(project, query, { caseSensitive }), [project, query, caseSensitive]);
  const changes = useMemo(() => compareDeveloperProjectFiles(project, baseline), [project, baseline]);
  const diagnostics = useMemo(() => inspectDeveloperProject(project), [project]);
  const errors = diagnostics.filter(d => d.level === "error").length;
  const warnings = diagnostics.filter(d => d.level === "warning").length;
  const integration = useMemo(() => summarizeDeveloperProjectIntegration(project), [project]);

  return <div className="grid gap-5 lg:grid-cols-2">
    <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-cyan-300"/>Find & replace</CardTitle>
        <CardDescription className="text-slate-400">Search up to 120 literal matches across project files. Selecting a match opens the file and selects the text; nothing is sent online.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-search-input">Find in all files</Label>
          <Input id="project-search-input" value={query} maxLength={80} onChange={e => setQuery(e.target.value)}
            placeholder="Type a code symbol or phrase" className="border-slate-700 bg-slate-950 text-white" />
          <div className="flex items-center gap-2">
            <Checkbox id="project-search-case" checked={caseSensitive} onCheckedChange={checked => setCaseSensitive(checked === true)}/>
            <Label htmlFor="project-search-case" className="text-xs text-slate-300">Match case</Label>
          </div>
        </div>
        <div className="max-h-56 space-y-1 overflow-auto" role="list" aria-label="Project-wide search results">
          {!query ? <p className="text-sm text-slate-400">Enter a search term to find matching files.</p> :
          !results.length ? <p className="text-sm text-slate-400">No matching text found.</p> :
          results.map((result, index) => <div role="listitem" key={result.file + ":" + result.index + ":" + index}>
            <button type="button" onClick={() => onJump(result)}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-950/60 p-2 text-left text-xs text-cyan-200 hover:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              <span className="break-all">{result.file} · line {result.line}, col {result.column}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            </button>
          </div>)}
        </div>
        <p role="status" className="text-xs text-slate-400">{results.length} search match(es){results.length === 120 ? " (display limit reached)" : ""}</p>
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <Label htmlFor="project-replace-input">Replace with (active file: {activeFile})</Label>
          <Input id="project-replace-input" value={replacement} maxLength={2000} onChange={e => setReplacement(e.target.value)}
            placeholder="New literal text" className="border-slate-700 bg-slate-950 text-white"/>
          <p className="text-xs text-amber-200">Replacement is exact-case and literal (no regex); even when case-insensitive search is selected. Each replacement creates an in-memory restore checkpoint, not an automatic disk save.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!query} onClick={() => onReplace(query, replacement, false)}>
              <Replace className="mr-2 h-4 w-4"/>Replace first in active file</Button>
            <Button size="sm" variant="outline" disabled={!query} onClick={() => onReplace(query, replacement, true)}>
              Replace all in active file</Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300"/>Project diagnostics & change review</CardTitle>
        <CardDescription className="text-slate-400">Offline, heuristic checks of HTML, JSON, local file references and restricted preview compatibility. Not a full compiler, accessibility audit or security scan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-300">
          <p className="font-semibold">Changes compared with last explicitly saved/opened version</p>
          <p className="mt-1">{changes.added.length} added · {changes.modified.length} modified · {changes.deleted.length} deleted · {changes.unchanged.length} unchanged</p>
          {!baseline && <p className="mt-1 text-amber-200">No saved baseline is loaded. All current files are counted as new.</p>}
          {(changes.added.length > 0 || changes.modified.length > 0 || changes.deleted.length > 0) &&
            <ul className="mt-2 max-h-28 space-y-1 overflow-auto">
              {changes.added.map(name => <li key={"add-"+name} className="break-all">New: {name}</li>)}
              {changes.modified.map(name => <li key={"mod-"+name} className="break-all">Changed: {name}</li>)}
              {changes.deleted.map(name => <li key={"del-"+name} className="break-all">Deleted: {name}</li>)}
            </ul>}
        </div>
        <p role="status" className="text-xs text-cyan-200">Cross-file references: {integration.resolved}/{integration.checked} matched by exact filename · {integration.unresolved} need review. Filename integrity is not runtime loadability.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-slate-300">{errors} errors · {warnings} warnings · {diagnostics.length} findings</p>
          <Button size="sm" variant="outline" onClick={() => downloadReport(exportDeveloperInspectionReport(project))}>
            <Download className="mr-2 h-4 w-4"/>Export inspection report</Button>
        </div>
        <div className="max-h-80 space-y-2 overflow-auto" aria-label="Advisory project diagnostics">
          {!diagnostics.length ? <p className="rounded-lg border border-emerald-500/25 p-3 text-sm text-emerald-200">No issues found by these limited checks. Runtime behavior and production security remain unverified.</p> :
          diagnostics.map((item, index) => <div key={item.rule + "-" + index}
            className={"rounded-lg border p-3 text-xs leading-5 " + (item.level === "error" ? "border-rose-500/40 text-rose-200" : item.level === "warning" ? "border-amber-500/30 text-amber-200" : "border-slate-700 text-slate-300")}>
            <p className="font-semibold">{item.level.toUpperCase()} · {item.rule}</p>
            {item.file && <p className="break-all">{item.file} · line {item.line}</p>}
            <p>{item.message}</p>
            {item.file && item.line > 0 && project.files.some(file => file.name === item.file) &&
              <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                const target = project.files.find(file => file.name === item.file)!;
                const location = developerLinePosition(target.content, item.line);
                onJump({ file: item.file, index: location.index, length: 0, line: location.line, column: 1 });
              }}>Open location</Button>}
          </div>)}
        </div>
        <p className="text-xs leading-5 text-slate-500">The report contains file names, file lengths and rule findings, but excludes source text, matched substrings and secrets from file bodies. File names themselves may be sensitive—review before sharing.</p>
      </CardContent>
    </Card>
  </div>;
}
