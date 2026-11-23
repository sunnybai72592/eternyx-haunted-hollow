import { useEffect, useState } from "react";
import { Download, HardDriveDownload, RefreshCcw, RotateCcw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { type normalizeDeveloperProject } from "@/lib/developerProjectLab.mjs";
import {
  PROJECT_RECOVERY_STORAGE, createProjectRecovery, deleteProjectRecovery, exportProjectRecovery,
  importProjectRecovery, parseProjectRecoveryStorage, recoverySummary, upsertProjectRecovery,
  verifyProjectRecovery,
} from "@/lib/developerProjectRecovery.mjs";

type Project = ReturnType<typeof normalizeDeveloperProject>;
type Snapshot = Awaited<ReturnType<typeof createProjectRecovery>>;
function readEntries(): Snapshot[] {
  try { return parseProjectRecoveryStorage(localStorage.getItem(PROJECT_RECOVERY_STORAGE) || "[]"); }
  catch { return []; }
}
function downloadRecovery(raw: string) {
  const href = URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = "eternyx-project-recovery.json";
  a.click();
  URL.revokeObjectURL(href);
}
export default function ProjectRecoveryPanel({ project, dirty, onRestore }: {
  project: Project; dirty: boolean; onRestore: (restored: Project) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<Snapshot[]>(readEntries);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const flash = (text: string, failed = false) => { setStatus(text); setError(failed); };
  const persist = (next: Snapshot[]) => {
    try {
      localStorage.setItem(PROJECT_RECOVERY_STORAGE, JSON.stringify(next));
      setEntries(next);
      return true;
    } catch {
      setEnabled(false);
      flash("Browser storage is full or unavailable. Recovery was not saved; export your project manually.", true);
      return false;
    }
  };

  useEffect(() => {
    if (!enabled || !dirty) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void createProjectRecovery(project).then(snapshot => {
        if (!cancelled) {
          const prior = readEntries();
          const next = upsertProjectRecovery(prior, snapshot);
          if (persist(next)) flash("Local recovery copy updated. This copy contains full source code.");
        }
      }).catch(() => { if (!cancelled) flash("Could not create a recovery copy. Export your project manually.", true); });
    }, 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // Recovery is explicitly opted into and only runs after the editor is idle.
  }, [enabled, dirty, project]);

  const recover = async (snapshot: Snapshot) => {
    if (busy) return;
    setBusy(true);
    try {
      const checked = await verifyProjectRecovery(snapshot);
      if (dirty && !window.confirm("Replace current unsaved edits with this verified recovery copy?")) return;
      onRestore(checked.project);
      setEnabled(false);
      flash("Checksum verified and project restored. Review and save explicitly; recovery autosave was disabled.");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Recovery verification failed.", true); }
    finally { setBusy(false); }
  };
  const exportCurrent = async () => {
    setBusy(true);
    try {
      const snapshot = await createProjectRecovery(project);
      downloadRecovery(exportProjectRecovery(snapshot));
      flash("Downloaded a checksum-protected backup of the full project. It is not encrypted.");
    } catch { flash("Backup export failed. Check browser crypto/download permissions.", true); }
    finally { setBusy(false); }
  };
  const importBackup = async () => {
    setBusy(true);
    try {
      const backup = await importProjectRecovery(importText);
      if (dirty && !window.confirm("Replace current unsaved edits with imported backup?")) return;
      onRestore(backup.project);
      setEnabled(false);
      setImportText("");
      flash("Imported and checksum-verified the project. Preview was not executed. Save it explicitly to retain it.");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Backup import failed.", true); }
    finally { setBusy(false); }
  };
  const clearEntry = (id: string) => {
    if (!window.confirm("Permanently discard this browser-local recovery copy?")) return;
    if (persist(deleteProjectRecovery(entries, id))) flash("Recovery copy deleted from this browser.");
  };

  return <Card className="border-slate-800 bg-slate-900/70 text-white">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><HardDriveDownload className="h-5 w-5 text-cyan-300" />Project recovery & verified backup</CardTitle>
      <CardDescription className="text-slate-400">Optional local recovery, integrity-checked export/import and explicit restoration. No server, account sync, encryption or silent preview execution.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-slate-700 p-3">
        <Checkbox id="project-auto-recovery" checked={enabled} onCheckedChange={checked => setEnabled(checked === true)} />
        <Label htmlFor="project-auto-recovery" className="text-sm leading-5">Enable browser-local draft recovery while editing this page (off by default, resets on reload)</Label>
      </div>
      <p className="text-xs leading-5 text-amber-200">Opting in writes full project source into this browser’s localStorage after 1.2 seconds of editing inactivity. This is not encrypted and can be read by scripts running on this origin. Avoid API keys, passwords and private code. Up to five latest project recovery copies are kept; oldest copies can be replaced. Explicit Save and Export are still necessary for durable backups.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void exportCurrent()}>
          <Download className="mr-2 h-4 w-4" />Export verified backup</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setEntries(readEntries()); flash("Read current recovery copies from this browser."); }}>
          <RefreshCcw className="mr-2 h-4 w-4" />Refresh copies</Button>
      </div>
      <div className="space-y-2" aria-label="Recovery copies">
        {entries.length === 0 ? <p className="text-sm text-slate-400">No browser recovery copies. Enable recovery and edit a project to create one.</p> :
          entries.map(snapshot => {
            const info = recoverySummary(snapshot);
            return <div key={info.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 p-3 text-sm">
              <div className="min-w-0"><p className="break-words font-semibold">{info.name}</p>
                <p className="text-xs text-slate-400">{info.files} files · {info.characters} characters · {info.capturedAt}</p></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void recover(snapshot)}><RotateCcw className="mr-2 h-4 w-4" />Verify & restore</Button>
                <Button size="sm" variant="ghost" aria-label={"Discard recovery copy for " + info.name} disabled={busy} onClick={() => clearEntry(info.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>;
          })}
      </div>
      <div className="space-y-2 border-t border-slate-800 pt-4">
        <Label htmlFor="project-backup-import">Import checksum-verified ETERNYX recovery backup</Label>
        <Textarea id="project-backup-import" value={importText} onChange={e => setImportText(e.target.value.slice(0,165001))}
          placeholder='{"schema":"eternyx-project-recovery-v1",...}' spellCheck={false} className="min-h-24 border-slate-700 bg-slate-950 font-mono text-xs text-white" />
        <Button size="sm" variant="outline" disabled={!importText.trim() || busy} onClick={() => void importBackup()}>
          <Upload className="mr-2 h-4 w-4" />Verify and import backup</Button>
      </div>
      {status && <p role={error ? "alert" : "status"} className={"text-sm " + (error ? "text-rose-300" : "text-cyan-200")}>{status}</p>}
      <p className="text-xs leading-5 text-slate-500"><ShieldCheck className="mr-1 inline h-4 w-4" />SHA-256 verifies accidental changes to backup bytes when restoring. It is not a digital signature, malware check, encryption or proof of trusted origin. Never restore untrusted projects.</p>
    </CardContent>
  </Card>;
}
