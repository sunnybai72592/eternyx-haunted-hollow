import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, NotebookPen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCopy, matchingCopies, noteExcerpt, suggestedTitle, readCopies, saveCopy } from "@/lib/workspaceNotes.mjs";

const draftKey = "eternyx.workspace.device-note";
type Note = { id: string; title: string; body: string; savedAt: number };

export default function DeviceNote() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => {
    try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; }
  });
  const [savedDraft, setSavedDraft] = useState(draft);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState<Note[]>([]);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  function refresh() {
    try { setCopies(readCopies(localStorage)); setListUnavailable(false); }
    catch { setListUnavailable(true); }
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
  const suggestion = !title.trim() ? suggestedTitle(draft) : "";
  return <section className="space-y-5 rounded-xl border bg-card p-4 text-card-foreground sm:p-6">
    <div>
      <h2 className="flex items-center gap-2 text-xl font-semibold"><NotebookPen aria-hidden="true" className="size-5 text-primary" />Device scratchpad</h2>
      <p className="text-sm text-muted-foreground">Drafts and saved copies are shared by people using this browser profile.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor="note-title">Title for saved copies</label>
      <Input id="note-title" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} />
      {suggestion && <Button type="button" variant="outline" size="sm" className="max-w-full" onClick={() => setTitle(suggestion)}><span className="truncate">Use first line: {suggestion}</span></Button>}
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
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" id="note-search" type="search" placeholder="Search titles and note text" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {listUnavailable && <p role="alert">Saved copies could not be refreshed. <button type="button" className="underline" onClick={refresh}>Try again</button></p>}
      {visible.length ? <ul className="divide-y rounded-lg border px-3">{visible.map((note: Note) => <li key={note.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <button type="button" onClick={() => open(note)} className="flex min-w-0 flex-1 items-start gap-2 rounded p-1 text-left hover:bg-muted focus-visible:ring-2">
          <FileText className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0"><span className="block break-words font-medium">{note.title}</span>
            <span className="line-clamp-2 break-words text-sm text-muted-foreground">{noteExcerpt(note.body, search)}</span>
          </span>
        </button>
        <Button variant="outline" aria-label={"Clean list from " + note.title} onClick={() => {
          if (draft !== savedDraft && !window.confirm("Leave your unsaved draft and open the saved copy in Automation?")) return;
          navigate("/automation", { state: { workspaceCopyId: note.id } });
        }}>Clean list</Button>
        <time className="text-xs text-muted-foreground">{new Date(note.savedAt).toLocaleString()}</time>
        <Button variant="ghost" aria-label={"Delete " + note.title} onClick={() => remove(note)}>Delete</Button>
      </li>)}</ul> : !listUnavailable && <p className="text-sm text-muted-foreground">{copies.length ? "No matching copies." : "No saved copies yet."}</p>}
    </section>
  </section>;
}
