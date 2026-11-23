import { useMemo, useState } from "react";
import { Download, GitCompareArrows, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import { developerLinePosition } from "@/lib/developerLocalWorkflows.mjs";
import { exportDeveloperRevisionReport, inspectDeveloperRevision } from "@/lib/developerRevisionTools.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;

function downloadRevisionReport(value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "eternyx-local-change-summary.json";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProjectRevisionReviewPanel({ project, savedBaseline, onJump, onRestore }: {
  project: Project;
  savedBaseline: Project | null;
  onJump: (target: { file: string; index: number; length: number }) => void;
  onRestore: (filename: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const changes = useMemo(() => inspectDeveloperRevision(project, savedBaseline),
    [project, savedBaseline]);
  const current = changes.find(item => item.filename === selected) || changes[0] || null;
  const previewFile = current?.status !== "deleted"
    ? project.files.find(file => file.name === current?.filename) : undefined;
  const savedFile = savedBaseline?.files.find(file => file.name === current?.filename);
  const canRestore = Boolean(previewFile && savedFile &&
    previewFile.content !== savedFile.content);
  const jump = () => {
    if (!current || !previewFile || !current.newLine) return;
    try {
      const line = developerLinePosition(previewFile.content, current.newLine);
      onJump({ file: previewFile.name, index: line.index, length: 0 });
    } catch { /* A stale target cannot modify project source. */ }
  };

  return <Card className="min-w-0 border-slate-800 bg-slate-900/70 text-white">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><GitCompareArrows className="h-5 w-5 text-cyan-300" />
        Saved-vs-working review</CardTitle>
      <CardDescription className="text-slate-400">Compare the current browser-local project with its last saved version. Show the first changed region of each file with source text kept in this browser, or export a metadata-only report.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!savedBaseline && <p className="text-sm text-amber-200">No saved baseline loaded. Existing files are treated as newly added. Save a project to establish a review baseline.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-slate-300">{changes.length} changed file(s) · {changes.filter(item => item.status === "added").length} added · {changes.filter(item => item.status === "modified").length} modified · {changes.filter(item => item.status === "deleted").length} deleted</p>
        <Button size="sm" variant="outline" onClick={() => downloadRevisionReport(exportDeveloperRevisionReport(project, savedBaseline))}>
          <Download className="mr-2 h-4 w-4" />Export source-free changes
        </Button>
      </div>
      {changes.length === 0 ? <p className="rounded border border-emerald-500/30 p-3 text-sm text-emerald-200">No differences from the last explicitly saved project.</p> :
        <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div role="group" aria-label="Changed project files" className="max-h-64 space-y-1 overflow-auto">
            {changes.map(item => <button key={item.filename} type="button"
              aria-pressed={current?.filename === item.filename} onClick={() => setSelected(item.filename)}
              className={"w-full rounded-md border px-2 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 " +
                (current?.filename === item.filename ? "border-cyan-400 bg-cyan-950/60 text-cyan-100" : "border-slate-700 text-slate-300")}>
              <span className="block break-all font-semibold">{item.filename}</span>
              <span className="mt-1 block text-slate-400">{item.status} · −{item.removedLines} / +{item.addedLines} line(s)</span>
            </button>)}
          </div>
          {current && <div className="min-w-0 space-y-3 rounded-md border border-slate-700 p-3">
            <p className="break-all text-sm font-semibold">{current.filename} · {current.status}</p>
            <p className="text-xs text-slate-400">Saved line {current.oldLine || "—"} / working line {current.newLine || "—"} · compares one contiguous region after shared prefix and suffix</p>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="min-w-0"><p className="mb-1 text-xs text-rose-200">Saved (−{current.removedLines} lines)</p>
                <pre aria-label="Saved changed lines" className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-2 text-xs text-rose-100">{current.removedPreview.join("\n") || "(no lines)"}</pre></div>
              <div className="min-w-0"><p className="mb-1 text-xs text-emerald-200">Working (+{current.addedLines} lines)</p>
                <pre aria-label="Working changed lines" className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-2 text-xs text-emerald-100">{current.addedPreview.join("\n") || "(no lines)"}</pre></div>
            </div>
            {current.truncated && <p className="text-xs text-amber-200">Changed region is longer than eight lines per side; preview is truncated. Open the editor to review the complete file.</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!previewFile} onClick={jump}>Open changed line</Button>
              <Button size="sm" variant="outline" disabled={!canRestore} onClick={() => onRestore(current.filename)}>
                <RotateCcw className="mr-2 h-4 w-4" />Restore saved file
              </Button>
            </div>
          </div>}
        </div>}
      <p className="text-xs leading-5 text-slate-500">The on-screen changed lines may contain private source. Export includes only filenames, line numbers and counts, never code strings. Filenames themselves may be sensitive. This is a bounded local review, not a Git diff, merge tool or security scan.</p>
    </CardContent>
  </Card>;
}
