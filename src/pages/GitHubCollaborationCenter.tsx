import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Github, GitPullRequest, CircleDot, ExternalLink, RefreshCw, Search, MessageSquare, CalendarDays, UserRound, Tag, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseGitHubRepositoryInput, githubApiUrl } from "@/lib/githubHubUtils.mjs";
import { filterGitHubItems, formatGitHubItemNumber, normalizeGitHubState } from "@/lib/githubCollaborationUtils.mjs";

type LabelData = { name: string; color: string; description?: string | null };
type Person = { login: string; html_url: string };
type GitHubItem = {
  number: number; title: string; body: string | null; state: "open" | "closed";
  html_url: string; user: Person | null; labels: LabelData[]; assignees: Person[];
  comments: number; created_at: string; updated_at: string; closed_at: string | null;
  draft?: boolean; merged_at?: string | null; milestone?: { title: string } | null;
};
type Repository = { full_name: string; html_url: string; default_branch: string };

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    credentials: "omit", cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository not found, private, or unavailable through the public API.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub's unauthenticated API rate limit or access restriction was reached. Try again later.");
    throw new Error("GitHub API returned HTTP " + response.status + ".");
  }
  return await response.json() as T;
}

function ItemList({ items, kind }: { items: GitHubItem[]; kind: "pull" | "issue" }) {
  if (!items.length) return <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center"><p className="font-medium text-slate-300">No matching {kind === "pull" ? "pull requests" : "issues"}</p><p className="mt-1 text-sm text-slate-500">Try another state or search term.</p></div>;
  return <div className="space-y-3">{items.map((item) => {
    const merged = Boolean(item.merged_at);
    const status = kind === "pull" && item.draft ? "Draft" : merged ? "Merged" : item.state === "open" ? "Open" : "Closed";
    const statusStyle = merged ? "border-violet-400/30 text-violet-300" : item.state === "open" ? "border-emerald-400/30 text-emerald-300" : "border-slate-600 text-slate-400";
    return <article key={item.number} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-slate-900 p-2 text-cyan-300">{kind === "pull" ? <GitPullRequest className="h-5 w-5" /> : <CircleDot className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold leading-6 text-white">{item.title}</h3><span className={"rounded-full border px-2 py-0.5 text-xs " + statusStyle}>{status}</span></div>
          <p className="mt-1 text-xs text-slate-500">{formatGitHubItemNumber(item.number)} · opened by {item.user?.login || "unknown"} · {date(item.created_at)}</p>
          {item.body && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{item.body}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {item.labels.slice(0, 8).map((label) => <span key={label.name} className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300"><Tag className="h-3 w-3" />{label.name}</span>)}
            {item.milestone && <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400">Milestone: {item.milestone.title}</span>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{item.comments} comments</span>
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Updated {date(item.updated_at)}</span>
            {item.assignees.length > 0 && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{item.assignees.map((person) => person.login).join(", ")}</span>}
          </div>
        </div>
        <a href={item.html_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-cyan-300 hover:text-cyan-100" aria-label={"Open " + kind + " " + item.number + " on GitHub"}><ExternalLink className="h-4 w-4" /></a>
      </div>
    </article>;
  })}</div>;
}

export default function GitHubCollaborationCenter() {
  const [input, setInput] = useState("facebook/react");
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [query, setQuery] = useState("");
  const [repository, setRepository] = useState<Repository | null>(null);
  const [pulls, setPulls] = useState<GitHubItem[]>([]);
  const [issues, setIssues] = useState<GitHubItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastChecked, setLastChecked] = useState("");

  const visiblePulls = useMemo(() => filterGitHubItems(pulls, query), [pulls, query]);
  const visibleIssues = useMemo(() => filterGitHubItems(issues, query), [issues, query]);

  const loadItems = async () => {
    let parsed;
    try { parsed = parseGitHubRepositoryInput(input); normalizeGitHubState(state); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check the repository and state."); return; }
    setBusy(true); setError(""); setNotice(""); setRepository(null); setPulls([]); setIssues([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const queryState = state === "all" ? "all" : state;
      const [repoResult, pullResult, issueResult] = await Promise.allSettled([
        fetchJson<Repository>(githubApiUrl(parsed.owner, parsed.repository), controller.signal),
        fetchJson<GitHubItem[]>(githubApiUrl(parsed.owner, parsed.repository, "pulls?state=" + queryState + "&per_page=50&sort=updated&direction=desc"), controller.signal),
        fetchJson<GitHubItem[]>(githubApiUrl(parsed.owner, parsed.repository, "issues?state=" + queryState + "&per_page=50&sort=updated&direction=desc"), controller.signal),
      ]);
      if (repoResult.status === "rejected") throw repoResult.reason;
      setRepository(repoResult.value);
      if (pullResult.status === "fulfilled") setPulls(pullResult.value);
      else setNotice((value) => value + " Pull requests could not be loaded. ");
      if (issueResult.status === "fulfilled") setIssues(issueResult.value.filter((item) => !("pull_request" in item)));
      else setNotice((value) => value + " Issues could not be loaded. ");
      setLastChecked(new Date().toLocaleString());
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError" ? "GitHub did not respond within 20 seconds. Try again." : cause instanceof Error ? cause.message : "Unable to load collaboration data.");
    } finally { window.clearTimeout(timeout); setBusy(false); }
  };

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · Developer Studio</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">GitHub <span className="text-cyan-300">Collaboration Center</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">A focused command view for public repository pull requests and issue queues. Search titles, descriptions, authors, labels, and assignees, then open the original work on GitHub.</p>
    </section>

    <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Github className="h-5 w-5 text-cyan-300" /> Repository queue</CardTitle><CardDescription className="text-slate-400">Public repositories only. No login, token, or account connection required.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end"><div className="space-y-2"><Label htmlFor="collab-repo">GitHub repository</Label><Input id="collab-repo" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void loadItems(); }} placeholder="owner/repository" className="border-slate-700 bg-slate-950 text-white" /></div><div className="space-y-2"><Label htmlFor="collab-state">Item state</Label><select id="collab-state" value={state} onChange={(event) => setState(event.target.value as "open" | "closed" | "all")} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white"><option value="open">Open</option><option value="closed">Closed</option><option value="all">All states</option></select></div><Button onClick={() => void loadItems()} disabled={busy} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />{busy ? "Loading..." : "Load queue"}</Button></div>
      {repository && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div><p className="font-semibold">{repository.full_name}</p><p className="text-xs text-slate-500">Default branch: {repository.default_branch} · Showing up to 50 items per category</p></div><a href={repository.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">Open repository <ExternalLink className="h-4 w-4" /></a></div>}
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">{notice}</p>}
    </CardContent></Card>

    {repository && <section className="space-y-4">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by title, body, author, label, or assignee..." className="border-slate-700 bg-slate-950 pl-9 text-white" aria-label="Filter GitHub items" /></div>
      <Tabs defaultValue="pulls" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 bg-slate-900 p-1"><TabsTrigger value="pulls" className="gap-2 py-2"><GitPullRequest className="h-4 w-4" />Pull requests ({visiblePulls.length})</TabsTrigger><TabsTrigger value="issues" className="gap-2 py-2"><CircleDot className="h-4 w-4" />Issues ({visibleIssues.length})</TabsTrigger></TabsList>
        <TabsContent value="pulls" className="mt-4"><ItemList items={visiblePulls} kind="pull" /></TabsContent>
        <TabsContent value="issues" className="mt-4"><ItemList items={visibleIssues} kind="issue" /></TabsContent>
      </Tabs>
      <p className="text-xs text-slate-500">Last checked: {lastChecked}. Results are the latest 50 items per category from GitHub's REST API; filtering applies to the loaded results.</p>
    </section>}

    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 sm:p-6"><h2 className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle className="h-5 w-5" /> Access, privacy & limits</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Reads public repository pull requests and issues only. Private repositories and personal account data are not accessible.</li><li>No token or credential is requested, stored, or sent. Data is fetched directly from GitHub and is not saved by ETERNYX.</li><li>Displays at most 50 most recently updated items per category. It does not yet paginate beyond the first API page.</li><li>Read-only: no comments, reviews, assignments, labels, merges, issue creation, or other changes can be made from ETERNYX.</li><li>GitHub's unauthenticated rate limits apply. A secured GitHub App integration is required for private repositories and write actions.</li></ul></section>
  </div></div>;
}
