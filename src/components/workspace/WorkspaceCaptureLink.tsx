import { Link, useLocation } from "react-router-dom";
import { FolderPlus } from "lucide-react";

/**
 * Explicit handoff: it prepares a bookmark of the CURRENT route in Workspace.
 * No AI output, assessment result, or remote data is represented as captured.
 * The user still chooses a project and confirms saving it.
 */
export default function WorkspaceCaptureLink({ title }: { title: string }) {
  const { pathname } = useLocation();
  const params = new URLSearchParams({ save: pathname, label: title });
  return <Link to={"/workspace?" + params.toString()}
    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-300 hover:border-cyan-300 hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
    <FolderPlus className="h-4 w-4" aria-hidden="true" />
    Save this page to Workspace
  </Link>;
}
