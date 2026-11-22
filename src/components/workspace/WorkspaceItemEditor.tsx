import { useEffect, useState, type FormEvent } from "react";
import { History, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { validWorkspaceLink } from "@/lib/workspaceRules.mjs";
import type { Database } from "@/integrations/supabase/types";

type Item = Database["public"]["Tables"]["workspace_items"]["Row"];
type Revision = Database["public"]["Tables"]["workspace_item_revisions"]["Row"];
type Props = {
  item: Item;
  owner: string;
  readOnly: boolean;
  busy: boolean;
  onRun: (action: () => Promise<void>, success: string) => void;
};

function validateEdit(kind: string, title: string, body: string): string | null {
  if (!title.trim() || title.length > 160) return "Title must have 1–160 characters.";
  if (kind === "note" && (!body.trim() || body.length > 12000))
    return "Notes must contain 1–12,000 characters.";
  if (kind === "link" && !validWorkspaceLink(body))
    return "Use an HTTPS link or a relative ETERNYX route (one leading slash).";
  return null;
}

export default function WorkspaceItemEditor({ item, owner, readOnly, busy, onRun }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.kind === "note" ? item.note_text ?? "" : item.target_url ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Revision[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setTitle(item.title);
    setBody(item.kind === "note" ? item.note_text ?? "" : item.target_url ?? "");
    setEditing(false);
    setFormError("");
    setHistory([]);
    setShowHistory(false);
  }, [item.id, item.revision, item.title, item.note_text, item.target_url]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    const { data, error } = await supabase.from("workspace_item_revisions")
      .select("*").eq("owner_id", owner).eq("item_id", item.id)
      .order("revision", { ascending: false }).limit(20);
    if (error) setHistoryError(error.message);
    else setHistory((data ?? []) as Revision[]);
    setHistoryLoading(false);
  };

  const toggleHistory = () => {
    setShowHistory((value) => !value);
    if (!showHistory) void loadHistory();
  };

  const update = (nextTitle: string, nextBody: string, success: string) => {
    if (readOnly || busy || item.kind === "file") return;
    const validation = validateEdit(item.kind, nextTitle, nextBody);
    if (validation) { setFormError(validation); return; }
    setFormError("");
    onRun(async () => {
      // Optimistic concurrency: a stale tab must not overwrite a newer edit.
      const { data, error } = await supabase.from("workspace_items").update({
        title: nextTitle.trim(),
        note_text: item.kind === "note" ? nextBody.trim() : null,
        target_url: item.kind === "link" ? nextBody.trim() : null,
      }).eq("id", item.id).eq("owner_id", owner).eq("revision", item.revision)
        .select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("This item was changed in another tab, or is no longer editable. Refresh before editing.");
    }, success);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update(title, body, "Saved revision " + (item.revision + 1) + " with history.");
  };

  const restore = (revision: Revision) => {
    if (readOnly || busy) return;
    if (!window.confirm("Restore revision " + revision.revision +
      "? The current version will be preserved in history.")) return;
    update(revision.title, item.kind === "note" ? revision.note_text ?? "" : revision.target_url ?? "",
      "Restored revision " + revision.revision + " and kept the previous version.");
  };

  if (item.kind === "file") return null;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {!readOnly && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {editing ? "Cancel edit" : "Edit"}
      </Button>}
      <Button type="button" size="sm" variant="outline" disabled={busy || historyLoading} onClick={toggleHistory}>
        <History className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {showHistory ? "Hide history" : "Revision history"} · v{item.revision}
      </Button>
    </div>
    {editing && !readOnly && <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={save}>
      <label htmlFor={"workspace-edit-item-title-" + item.id} className="block text-sm font-medium">Title</label>
      <Input id={"workspace-edit-item-title-" + item.id} value={title} required maxLength={160}
        onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor={"workspace-edit-item-body-" + item.id} className="block text-sm font-medium">
        {item.kind === "note" ? "Note" : "HTTPS URL / ETERNYX route"}
      </label>
      {item.kind === "note" ?
        <Textarea id={"workspace-edit-item-body-" + item.id} rows={5} value={body} required maxLength={12000}
          onChange={(event) => setBody(event.target.value)} /> :
        <Input id={"workspace-edit-item-body-" + item.id} value={body} required maxLength={2000}
          onChange={(event) => setBody(event.target.value)} />}
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      <Button type="submit" size="sm" disabled={busy || !title.trim() || !body.trim() ||
        (title.trim() === item.title &&
          body.trim() === (item.kind === "note" ? item.note_text : item.target_url))}>
        Save a new revision
      </Button>
    </form>}
    {showHistory && <div className="space-y-2 rounded-lg border border-border p-3" aria-label={"History for " + item.title}>
      <p className="text-xs text-muted-foreground">
        Last 20 older versions. Saved on the server; only the account owner can view them.
      </p>
      {historyLoading && <p className="text-sm" role="status">Loading revisions…</p>}
      {historyError && <p role="alert" className="text-sm text-destructive">{historyError}</p>}
      {history.map((revision) => <div key={revision.id}
        className="space-y-2 border-b border-border py-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>Version {revision.revision} · {revision.title}</strong>
          <span className="text-xs text-muted-foreground">{new Date(revision.saved_at).toLocaleString()}</span>
        </div>
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {item.kind === "note" ? revision.note_text : revision.target_url}
        </p>
        {!readOnly && <Button type="button" variant="outline" size="sm" disabled={busy}
          onClick={() => restore(revision)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Restore this version
        </Button>}
      </div>)}
      {!historyLoading && !historyError && !history.length &&
        <p className="text-sm text-muted-foreground">No previous versions yet.</p>}
    </div>}
  </div>;
}
