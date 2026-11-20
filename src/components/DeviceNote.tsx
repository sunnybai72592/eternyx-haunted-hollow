import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCopy, matchingCopies, readCopies, saveCopy } from "@/lib/workspaceNotes.mjs";

const draftKey = "eternyx.workspace.device-note";
type Note = { id: string; title: string; body: string; savedAt: number };

export default function DeviceNote() {
  const [draft, setDraft] = useState(() => {
    try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; }
  });
  const [savedDraft, setSavedDraft] = useState(draft);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState<Note[]>([]);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  function refresh() {
    try { setCopies(readCopies(localStorage)); }
    catch { setStatus("Saved notes could not be read. You can still download the text."); }
  }

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  function saveDraft() {
    try {
      const current = localStorage.getItem(draftKey) ?? "";
      if (current !== savedDraft && current !== draft && !window.confirm("Another tab changed the saved draft. Replace it with this text?")) return;
      if (draft) localStorage.setItem(draftKey, draft);
      else localStorage.removeItem(draftKey);
      setSavedDraft(draft);
      setStatus("Draft saved in this browser.");
    } catch { setStatus("Draft could not be saved. Download the text to keep a copy."); }
  }

  function snapshot() {
    try {
      saveCopy(localStorage, crypto.randomUUID(), title, draft, Date.now());
      refresh();
      setStatus("Named copy saved.");
    } catch { setStatus("Copy could not be saved. Download the text to keep a copy."); }
  }

  function open(note: Note) {
    if (draft !== savedDraft && draft !== note.body && !window.confirm("Replace your unsaved edits with this copy?")) return;
    setDraft(note.body);
    setTitle(note.title);
    setStatus("Copy opened in the editor.");
    input.current?.focus();
  }

  function remove(note: Note) {
    if (!window.confirm('Delete the saved copy “' + note.title + '”?')) return;
    try {
      deleteCopy(localStorage, note.id);
      refresh();
      setStatus("Saved copy deleted.");
    } catch { setStatus("Copy could not be deleted."); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([draft], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = (title.trim().replace(/[^\p{L}\p{N} _-]/gu, "_") || "eternyx-note") + ".txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const visible = matchingCopies(copies, search);
  return <section className="space-y-5">
    <div>
      <h2 className="text-xl font-semibold">Device scratchpad</h2>
      <p className="text-sm text-muted-foreground">Drafts and saved copies are shared by people using this browser profile.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor="note-title">Title for saved copies</label>
      <Input id="note-title" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} />
      <label className="block" htmlFor="device-note">Note</label>
      <Textarea id="device-note" rows={8} ref={input} value={draft} onChange={e => { setDraft(e.target.value); setStatus(""); }}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveDraft(); }
        }} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button onClick={saveDraft}>Save draft</Button>
      <Button variant="outline" disabled={!title.trim() || !draft.trim()} onClick={snapshot}>Save named copy</Button>
      <Button variant="outline" disabled={!draft} onClick={download}>Download .txt</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{status || (savedDraft !== draft ? "Unsaved draft changes" : "")}</p>
    <section className="space-y-3 border-t pt-5">
      <h3 className="font-semibold">Saved copies</h3>
      <label className="sr-only" htmlFor="note-search">Search titles and note text</label>
      <Input id="note-search" type="search" placeholder="Search titles and note text" value={search} onChange={e => setSearch(e.target.value)} />
      {visible.length ? <ul className="divide-y">{visible.map((note: Note) => <li key={note.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <button type="button" onClick={() => open(note)} className="min-w-0 flex-1 break-words text-left font-medium underline underline-offset-4">{note.title}</button>
        <time className="text-xs text-muted-foreground">{new Date(note.savedAt).toLocaleString()}</time>
        <Button variant="ghost" aria-label={"Delete " + note.title} onClick={() => remove(note)}>Delete</Button>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">{copies.length ? "No matching copies." : "No saved copies yet."}</p>}
    </section>
  </section>;
}
