import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, NotebookPen } from "lucide-react";
import { resumableNote } from "@/lib/workspaceNotes.mjs";

function readResume() {
  try { return resumableNote(localStorage); }
  catch { return null; }
}

export default function ContinueWork() {
  const [note, setNote] = useState(readResume);
  useEffect(() => {
    function refresh() { setNote(readResume()); }
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  if (!note) return null;
  return <Link to="/workspace" state={{ resumeNote: note }} className="group mt-5 flex min-h-16 items-center gap-4 rounded-xl border border-primary/25 bg-primary/[0.05] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
    <NotebookPen aria-hidden="true" className="size-5 shrink-0 text-primary" />
    <span className="flex-1"><strong className="block text-foreground">Continue my work</strong>
      <span className="text-sm text-muted-foreground">{note.kind === "draft" ? "Open the scratchpad draft saved in this browser." : "Open the latest scratchpad copy saved in this browser."}</span>
    </span><ArrowRight aria-hidden="true" className="size-5 text-primary" />
  </Link>;
}
