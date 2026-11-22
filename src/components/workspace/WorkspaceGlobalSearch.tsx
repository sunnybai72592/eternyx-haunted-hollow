import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchWorkspaceRecords } from "@/lib/workspaceInsights.mjs";
import type { Database } from "@/integrations/supabase/types";

type Project = Database["public"]["Tables"]["workspace_projects"]["Row"];
type Task = Database["public"]["Tables"]["workspace_tasks"]["Row"];
type Item = Database["public"]["Tables"]["workspace_items"]["Row"];
type SearchHit = ReturnType<typeof searchWorkspaceRecords>[number];

export default function WorkspaceGlobalSearch({
  projects, tasks, items, onOpen,
}: {
  projects: Project[];
  tasks: Task[];
  items: Item[];
  onOpen: (result: SearchHit) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchWorkspaceRecords(projects, tasks, items, query, 30),
    [projects, tasks, items, query]
  );
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex items-center gap-2">
      <Search className="h-5 w-5 text-cyan-400" aria-hidden="true" />
      <h2 className="text-lg font-semibold">Find anything in your Workspace</h2>
    </div>
    <label htmlFor="workspace-global-search" className="text-sm text-muted-foreground">
      Search project names, task titles, due dates, notes and saved links across your loaded private library
    </label>
    <Input id="workspace-global-search" type="search" value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search across all projects…" maxLength={80} />
    {query.trim().length >= 2 && <div className="space-y-2" role="region" aria-label="Workspace search results">
      <p className="text-xs text-muted-foreground">
        {results.length ? results.length + (results.length === 30 ? " results (first 30)" : " matching records") : "No matching records"}
      </p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {results.map((result) => <button type="button" key={result.kind + ":" + result.id}
          onClick={() => onOpen(result)}
          className="flex w-full flex-col gap-1 rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <span className="min-w-0 break-words font-medium">{result.title}</span>
          <span className="text-xs text-muted-foreground">
            {result.kind} · {result.projectName}{result.detail ? " · " + result.detail : ""}
          </span>
        </button>)}
      </div>
    </div>}
  </section>;
}
