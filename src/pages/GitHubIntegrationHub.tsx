import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Github, GitBranch, GitCommit, ExternalLink, RefreshCw, ShieldCheck, Activity, Star, Eye, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGitHubRepositoryInput, githubApiUrl } from "@/lib/githubHubUtils.mjs";

type Repository = {
  full_name: string; html_url: string; description: string | null; language: string | null;
  stargazers_count: number; forks_count: number; open_issues_count: number; watchers_count: number;
  default_branch: string; license: { spdx_id?: string } | null; archived: boolean; visibility: string;
  created_at: string; updated_at: string; pushed_at: string;
};
type Branch = { name: string; protected: boolean; commit: { sha: string } };
type Commit = { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null }; author: { login: string } | null };
type WorkflowRun = { id: number; name: string; event: string; status: string; conclusion: string | null; html_url: string; created_at: string; head_branch: string };

const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : "—";
const shortSha = (value: string) => value.slice(0, 7);

async function fetchGitHubJson<T>(url: string, signal: AbortSignal): Promise<{ data: T; remaining: string | null }> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository or resource not found. It may be private, deleted, or have no Actions runs.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub API rate limit or access restriction reached. Wait a little and try again.");
    throw new Error("GitHub API returned HTTP " + response.status + ".");
  }
  return { data: await response.json() as T, remaining };
}

function Stat({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4 text-cyan-300" />{label}</div><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
}

export default function GitHubIntegrationHub() {
  const [input, setInput] = useState("facebook/react");
  const [repository, setRepository] = useState<Repository | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [rateRemaining, setRateRemaining] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastChecked, setLastChecked] = useState("");

  const inspectRepository = async () => {
    let parsed;
    try { parsed = parseGitHubRepositoryInput(input); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid repository input."); return; }

    setBusy(true);
    setError("");
    setNotice("");
    setRepository(null);
    setBranches([]);
    setCommits([]);
    setRuns([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const [repoResult, branchResult, commitResult, workflowResult] = await Promise.allSettled([
        fetchGitHubJson<Repository>(githubApiUrl(parsed.owner, parsed.repository), controller.signal),
        fetchGitHubJson<Branch[]>(githubApiUrl(parsed.owner, parsed.repository, "branches?per_page=100"), controller.signal),
        fetchGitHubJson<Commit[]>(githubApiUrl(parsed.owner, parsed.repository, "commits?per_page=10"), controller.signal),
        fetchGitHubJson<{ workflow_runs?: WorkflowRun[] }>(githubApiUrl(parsed.owner, parsed.repository, "actions/runs?per_page=10"), controller.signal),
      ]);

      if (repoResult.status === "rejected") throw repoResult.reason;
      setRepository(repoResult.value.data);
      if (branchResult.status === "fulfilled") setBranches(branchResult.value.data);
      else setNotice((current) => current + " Branch listing unavailable. ");
      if (commitResult.status === "fulfilled") setCommits(commitResult.value.data);
      else setNotice((current) => current + " Recent commits unavailable. ");
      if (workflowResult.status === "fulfilled") setRuns(workflowResult.value.data.workflow_runs || []);
      else setNotice((current) => current + " GitHub Actions data unavailable (Actions may be disabled or restricted). ");
      const remaining = [repoResult, branchResult, commitResult, workflowResult]
        .filter((item) => item.status === "fulfilled")
        .map((item) => item.value.remaining)
        .filter((value): value is string => value !== null);
      setRateRemaining(remaining.length ? remaining.sort((a, b) => Number(a) - Number(b))[0] : null);
      setLastChecked(new Date().toLocaleString());
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError" ? "GitHub did not respond within 20 seconds. Please try again." : cause instanceof Error ? cause.message : "Unable to inspect this repository.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  };

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · Developer Studio</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">GitHub <span className="text-cyan-300">Integration Hub</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">Inspect public repositories using live GitHub data. Explore repository health, branches, recent commits, and GitHub Actions activity in one workspace.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Live public API", "Repository overview", "Branches", "Recent commits", "Actions activity"].map((item) => <span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}</div>
    </section>

    <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Github className="h-5 w-5 text-cyan-300" /> Public repository inspector</CardTitle><CardDescription className="text-slate-400">Enter owner/repository or a GitHub repository URL. No GitHub login or token is requested.</CardDescription></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="github-repository">GitHub repository</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input id="github-repository" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void inspectRepository(); }} placeholder="owner/repository" className="border-slate-700 bg-slate-950 text-white" /><Button onClick={() => void inspectRepository()} disabled={busy} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />{busy ? "Inspecting..." : "Inspect repository"}</Button></div>
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">{notice}</p>}
    </CardContent></Card>

    {repository && <>
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Repository overview</p><h2 className="mt-1 text-2xl font-bold">{repository.full_name}</h2><p className="mt-1 max-w-3xl text-sm text-slate-400">{repository.description || "No repository description provided."}</p></div><a href={repository.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">Open on GitHub <ExternalLink className="h-4 w-4" /></a></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={Star} label="Stars" value={repository.stargazers_count.toLocaleString()} /><Stat icon={GitBranch} label="Forks" value={repository.forks_count.toLocaleString()} /><Stat icon={Eye} label="Watchers" value={repository.watchers_count.toLocaleString()} /><Stat icon={Activity} label="Open issues" value={repository.open_issues_count.toLocaleString()} /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle>Repository details</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-slate-500">Primary language</p><p className="mt-1 font-medium">{repository.language || "Not specified"}</p></div><div><p className="text-slate-500">Default branch</p><p className="mt-1 font-medium">{repository.default_branch}</p></div><div><p className="text-slate-500">License</p><p className="mt-1 font-medium">{repository.license?.spdx_id || "Not specified"}</p></div><div><p className="text-slate-500">Visibility</p><p className="mt-1 font-medium">{repository.visibility}</p></div><div><p className="text-slate-500">Created</p><p className="mt-1 font-medium">{formatDate(repository.created_at)}</p></div><div><p className="text-slate-500">Last push</p><p className="mt-1 font-medium">{formatDate(repository.pushed_at)}</p></div></CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" /> Repository signals</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="flex items-center justify-between gap-3"><span className="text-slate-400">Archived</span><span>{repository.archived ? "Yes" : "No"}</span></p><p className="flex items-center justify-between gap-3"><span className="text-slate-400">Last updated</span><span>{formatDate(repository.updated_at)}</span></p><p className="flex items-center justify-between gap-3"><span className="text-slate-400">Default branch</span><span>{repository.default_branch}</span></p><p className="flex items-center justify-between gap-3"><span className="text-slate-400">API requests remaining</span><span>{rateRemaining ?? "Not exposed"}</span></p><p className="text-xs text-slate-500">Signals are descriptive metadata, not a security audit or code-quality score.</p></CardContent></Card>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-cyan-300" /> Branches <span className="text-sm font-normal text-slate-500">({branches.length})</span></CardTitle><CardDescription className="text-slate-400">Up to 100 branches returned by the public API.</CardDescription></CardHeader><CardContent><div className="max-h-80 space-y-2 overflow-auto">{branches.length ? branches.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="font-mono text-xs text-slate-500">{shortSha(item.commit.sha)}</p></div>{item.protected && <span className="shrink-0 rounded-full border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300">Protected</span>}</div>) : <p className="text-sm text-slate-500">No branch data available.</p>}</div></CardContent></Card>

        <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><GitCommit className="h-5 w-5 text-cyan-300" /> Recent commits</CardTitle><CardDescription className="text-slate-400">Latest 10 commits from the repository default branch.</CardDescription></CardHeader><CardContent><div className="max-h-80 space-y-2 overflow-auto">{commits.length ? commits.map((item) => <div key={item.sha} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-3"><a href={item.html_url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-cyan-300 hover:underline">{shortSha(item.sha)}</a><span className="text-xs text-slate-500">{formatDate(item.commit.author?.date)}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-200">{item.commit.message.split("\n")[0]}</p><p className="mt-1 text-xs text-slate-500">{item.author?.login || item.commit.author?.name || "Unknown author"}</p></div>) : <p className="text-sm text-slate-500">No commit data available.</p>}</div></CardContent></Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-300" /> GitHub Actions activity</CardTitle><CardDescription className="text-slate-400">Latest workflow runs visible through the public repository API.</CardDescription></CardHeader><CardContent><div className="space-y-2">{runs.length ? runs.map((run) => <div key={run.id} className="flex flex-col justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium">{run.name}</p><p className="mt-1 text-xs text-slate-500">{run.event} · {run.head_branch} · {formatDate(run.created_at)}</p></div><div className="flex items-center gap-3"><span className={"rounded-full border px-2 py-1 text-xs " + (run.conclusion === "success" ? "border-emerald-500/30 text-emerald-300" : run.conclusion === "failure" ? "border-rose-500/30 text-rose-300" : "border-slate-700 text-slate-300")}>{run.conclusion || run.status}</span><a href={run.html_url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200" aria-label={"Open workflow run " + run.id}><ExternalLink className="h-4 w-4" /></a></div></div>) : <p className="text-sm text-slate-500">No workflow runs were returned for this repository.</p>}</div></CardContent></Card>
      <p className="text-xs text-slate-500">Last checked: {lastChecked}. Data is fetched live from api.github.com and is not stored by ETERNYX.</p>
    </>}

    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 sm:p-6"><h2 className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle className="h-5 w-5" /> Access, privacy & limits</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>This milestone reads public repository data only. Private repositories and personal account data are not accessible.</li><li>No GitHub token is requested, saved, or sent. Requests go directly from your browser to GitHub's public REST API.</li><li>GitHub applies unauthenticated API rate limits. The remaining-request count is shown when GitHub exposes it.</li><li>This tool is read-only. It cannot create branches, commits, pull requests, edit files, trigger deployments, or change repository settings.</li><li>Private repository access and write operations require a future secured GitHub App/OAuth integration with backend token handling and minimal permissions.</li></ul></section>
  </div></div>;
}
