import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { readCopies, saveCopy, suggestedTitle } from "@/lib/workspaceNotes.mjs";
import { ListFilter } from "lucide-react";
import { cleanLines } from "@/lib/cleanLines.mjs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function LineWorkflow() {
  const copyId = useLocation().state?.workspaceCopyId;
  const [imported] = useState(() => {
    if (typeof copyId !== "string") return null;
    try { return readCopies(localStorage).find(note => note.id === copyId) ?? null; }
    catch { return null; }
  });
  const [source, setSource] = useState<string>(imported?.body ?? "");
  const [deduplicate, setDeduplicate] = useState(true);
  const [order, setOrder] = useState("input");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [title, setTitle] = useState(imported ? suggestedTitle(imported.title.slice(0, 90) + " (cleaned)") : "");
  const [saved, setSaved] = useState<{ title: string; body: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const resultField = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const { lines, blanks, duplicates, trimmed } = useMemo(
    () => cleanLines(source, { deduplicate, ignoreCase, order }),
    [source, deduplicate, ignoreCase, order]
  );
  const result = lines.join("\n");

  const noteTitle = title.trim() || suggestedTitle(result);
  const alreadySaved = saved?.title === noteTitle && saved.body === result;
  function saveResult() {
    try {
      saveCopy(localStorage, crypto.randomUUID(), noteTitle, result, Date.now());
      setSaved({ title: noteTitle, body: result });
      setSaveError("");
    } catch {
      setSaveError("Could not save this list in browser storage. You can still download it.");
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      setCopyStatus("Copied.");
    } catch {
      resultField.current?.focus();
      resultField.current?.select();
      setCopyStatus("Result selected. Use your device’s Copy command.");
    }
  }

  function downloadResult(format: "txt" | "json") {
    const json = format === "json";
    const url = URL.createObjectURL(new Blob([json ? JSON.stringify(lines, null, 2) : result], {
      type: json ? "application/json" : "text/plain;charset=utf-8"
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-clean-list." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-6" onChange={() => { setCopyStatus(""); setSaveError(""); }}>
    <h2 className="flex items-center gap-2 text-xl font-semibold"><ListFilter aria-hidden="true" className="size-5 text-primary" />Clean a list</h2>
    <p className="text-sm text-muted-foreground">Paste one item per line. Blank lines and outer spaces are removed in your browser.</p>
    {typeof copyId === "string" && <p role="status" className="break-words text-sm text-muted-foreground">
      {imported ? "Editing a copy of " + imported.title + "." : "The saved copy could not be opened. Paste a list to continue."}
    </p>}
    <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <legend className="sr-only">Cleanup options</legend>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={deduplicate} onChange={e => setDeduplicate(e.target.checked)} /> Remove duplicates</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!deduplicate} checked={deduplicate && ignoreCase} onChange={e => setIgnoreCase(e.target.checked)} /> Ignore case for duplicates</label>
      <div className="flex items-center gap-2"><label htmlFor="workflow-order">Order</label>
        <select id="workflow-order" className="min-h-11 rounded-md border bg-background px-2" value={order} onChange={e => setOrder(e.target.value)}>
          <option value="input">Original</option><option value="ascending">A to Z</option><option value="descending">Z to A</option>
        </select>
      </div>
    </fieldset>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-2"><label htmlFor="workflow-input">Input lines</label>
        <Textarea id="workflow-input" rows={8} value={source} onChange={e => setSource(e.target.value)} />
      </div>
      <div className="min-w-0 space-y-2"><label htmlFor="workflow-output">Result ({lines.length} lines)</label>
        <Textarea id="workflow-output" rows={8} ref={resultField} readOnly value={result} />
      </div>
    </div>
    {source && <p className="text-sm text-muted-foreground">Blank lines removed: {blanks} · Duplicates removed: {duplicates} · Nonblank lines trimmed: {trimmed}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!result} onClick={copyResult}>Copy result</Button>
      <Button variant="outline" disabled={!result} onClick={() => downloadResult("txt")}>Download .txt</Button>
      <Button variant="outline" disabled={!result} onClick={() => downloadResult("json")}>Download .json</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{copyStatus}</p>
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">Save to Digital Workspace</summary>
      <div className="mt-3 space-y-2">
        <p className="text-sm text-muted-foreground">Save a named copy in this browser profile. Anyone using the profile can open it.</p>
        <label htmlFor="clean-list-title">Saved list title</label>
        <Input id="clean-list-title" maxLength={100} value={title} placeholder={suggestedTitle(result) || "List title"} onChange={e => setTitle(e.target.value)} />
        <Button variant="outline" onClick={saveResult} disabled={!result || alreadySaved}>Save cleaned list</Button>
        {saveError && <p role="alert">{saveError}</p>}
        {alreadySaved && <p role="status" className="text-sm">Saved as {saved.title}. <Link className="underline" to="/workspace">View saved copies</Link></p>}
      </div>
    </details>
  </section>;
}
