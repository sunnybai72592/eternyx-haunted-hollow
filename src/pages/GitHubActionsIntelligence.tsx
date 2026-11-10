import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, Workflow, Search, RefreshCw, ExternalLink, GitBranch, Clock3, CheckCircle2, XCircle, CircleDashed, Loader2, ShieldCheck, AlertTriangle, ListChecks, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGitHubRepositoryInput, githubApiUrl } from "@/lib/githubHubUtils.mjs";
import { filterWorkflowRuns, normalizeWorkflowJobs, normalizeWorkflowRuns, summarizeWorkflowRun } from "@/lib/githubActionsUtils.mjs";

type WorkflowRun = { id: number; name: string; display_title?: string; head_branch?: string; event?: string; status: string; conclusion: string | null; html_url: string; created_at?: string; run_started_at?: string; updated_at?: string; run_attempt?: number; actor?: { login?: string } };
type Job = ReturnType<typeof normalizeWorkflowJobs>[number];

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not available";
const duration = (ms: number | null) => ms === null ? "Not available" : ms < 60000 ? Math.round(ms / 1000) + " sec" : (ms / 60000).toFixed(1) + " min";
const stateClass = (status: string, conclusion: string | null) => conclusion === "success" ? "text-emerald-300" : conclusion && conclusion !== "neutral" && conclusion !== "skipped" ? "text-rose-300" : status === "in_progress" ? "text-cyan-300" : "text-amber-300";
const stateText = (status: string, conclusion: string | null) => conclusion || status.replaceAll("_", " ");

async function githubGet<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit", cache: "no-store", redirect: "error", signal });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository or Actions resource not found. Confirm the repository is public and Actions are enabled.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub's unauthenticated API rate limit or access restriction was reached. Try again later.");
    throw new Error("GitHub API returned HTTP " + response.status + ".");
  }
  return await response.json() as T;
}

function StatusIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (conclusion === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (conclusion && !["neutral", "skipped"].includes(conclusion)) return <XCircle className="h-4 w-4 text-rose-300" />;
  if (status === "in_progress") return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
  return <CircleDashed className="h-4 w-4 text-amber-300" />;
}

export default function GitHubActionsIntelligence() {
  const [repositoryInput, setRepositoryInput] = useState("");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [jobsBusy, setJobsBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobError, setJobError] = useState("");
  const [lastChecked, setLastChecked] = useState("");
  const [rateRemaining, setRateRemaining] = useState<string | null>(null);

  const filteredRuns = useMemo(() => filterWorkflowRuns(runs, { query, branch: branchFilter, status: statusFilter }), [runs, query, branchFilter, statusFilter]);

  const loadRuns = async () => {
    let parsed;
    try { parsed = parseGitHubRepositoryInput(repositoryInput); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Enter a valid public repository."); return; }
    setBusy(true); setError(""); setJobError(""); setRuns([]); setJobs([]); setSelectedRun(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const url = githubApiUrl(parsed.owner, parsed.repository, "actions/runs?per_page=30");
      const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
      setRateRemaining(response.headers.get("x-ratelimit-remaining"));
      if (!response.ok) {
        if (response.status === 404) throw new Error("Repository or Actions resource not found. Confirm the repository is public and Actions are enabled.");
        if (response.status === 403 || response.status === 429) throw new Error("GitHub's unauthenticated API rate limit or access restriction was reached. Try again later.");
        throw new Error("GitHub API returned HTTP " + response.status + ".");
      }
      const payload = await response.json();
      setRuns(normalizeWorkflowRuns(payload));
      setLastChecked(new Date().toLocaleString());
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError" ? "GitHub did not respond within 25 seconds. Try again." : cause instanceof Error ? cause.message : "Unable to load Actions runs.");
    } finally { window.clearTimeout(timeout); setBusy(false); }
  };

  const inspectRun = async (run: WorkflowRun) => {
    setSelectedRun(run); setJobs([]); setJobError(""); setJobsBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const parsed = parseGitHubRepositoryInput(repositoryInput);
      const url = githubApiUrl(parsed.owner, parsed.repository, "actions/runs/" + run.id + "/jobs?per_page=100");
      const payload = await githubGet<{ jobs?: unknown[] }>(url, controller.signal);
      setJobs(normalizeWorkflowJobs(payload));
    } catch (cause) {
      setJobError(cause instanceof Error && cause.name === "AbortError" ? "Job details timed out. Try selecting the run again." : cause instanceof Error ? cause.message : "Unable to load job details.");
    } finally { window.clearTimeout(timeout); setJobsBusy(false); }
  };

  const selectedSummary = selectedRun ? summarizeWorkflowRun(selectedRun) : null;
  const successfulRuns = runs.filter((run) => run.conclusion === "success").length;
  const failedRuns = runs.filter((run) => run.conclusion && !["success", "neutral", "skipped"].includes(run.conclusion)).length;
  const activeRuns = runs.filter((run) => run.status !== "completed").length;

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/70 via-slate-950 to-violet-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · Developer Studio</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">GitHub Actions <span className="text-cyan-300">Intelligence</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">A live CI/CD run inspector for public GitHub repositories. Track recent workflow executions, filter failures and branches, then drill into jobs and individual step outcomes.</p>
    </section>

    <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5 text-cyan-300" /> Repository Actions monitor</CardTitle><CardDescription className="text-slate-400">Enter owner/repository or a GitHub URL. Public data only; no token required.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="actions-repo">GitHub repository</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="actions-repo" value={repositoryInput} onChange={(event) => setRepositoryInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRuns(); }} placeholder="owner/repository" className="border-slate-700 bg-slate-950 text-white" /><Button onClick={() => void loadRuns()} disabled={busy} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />{busy ? "Loading runs..." : "Load Actions"}</Button></div>{error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}</CardContent></Card>

    {runs.length > 0 && <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Recent runs loaded</p><p className="mt-2 text-2xl font-semibold">{runs.length}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Successful runs</p><p className="mt-2 text-2xl font-semibold text-emerald-300">{successfulRuns}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Failed / active</p><p className="mt-2 text-2xl font-semibold"><span className="text-rose-300">{failedRuns}</span> / <span className="text-cyan-300">{activeRuns}</span></p></div></div>
      <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-300" /> Workflow execution history</CardTitle><CardDescription className="text-slate-400">Showing up to 30 latest runs returned by GitHub. Select a run to inspect its jobs and steps.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3"><div className="space-y-1"><Label htmlFor="actions-search">Search workflows</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input id="actions-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Workflow, title, actor..." className="border-slate-700 bg-slate-950 pl-9 text-white" /></div></div><div className="space-y-1"><Label htmlFor="actions-branch">Branch contains</Label><Input id="actions-branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} placeholder="main, release..." className="border-slate-700 bg-slate-950 text-white" /></div><div className="space-y-1"><Label htmlFor="actions-status">Status filter</Label><select id="actions-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white"><option value="all">All outcomes</option><option value="success">Successful</option><option value="failure">Failed / cancelled</option><option value="in_progress">In progress</option><option value="queued">Queued</option><option value="completed">Completed (all)</option></select></div></div>
        <div className="grid gap-3 lg:grid-cols-2">{filteredRuns.map((run) => <button key={run.id} onClick={() => void inspectRun(run)} className={"rounded-xl border p-4 text-left transition hover:border-cyan-400/50 " + (selectedRun?.id === run.id ? "border-cyan-400 bg-cyan-950/30" : "border-slate-800 bg-slate-950/60")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-100">{run.name}</p><p className="mt-1 truncate text-sm text-slate-400">{run.display_title || run.name}</p></div><span className={"flex shrink-0 items-center gap-1.5 text-xs capitalize " + stateClass(run.status, run.conclusion)}><StatusIcon status={run.status} conclusion={run.conclusion} />{stateText(run.status, run.conclusion)}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3" />{run.head_branch || "Unknown branch"}</span><span>{run.event || "event unavailable"}</span><span>#{run.run_number || run.id}</span><span>{formatDate(run.created_at)}</span></div></button>)}</div>
        {filteredRuns.length === 0 && <p className="rounded-lg border border-slate-800 p-5 text-center text-sm text-slate-400">No runs match these filters.</p>}
      </CardContent></Card>
    </section>}

    {selectedRun && selectedSummary && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-slate-500">Selected workflow run</p><h2 className="mt-1 text-xl font-semibold">{selectedSummary.name}</h2><p className="mt-1 text-sm text-slate-400">Run #{selectedSummary.id} · Attempt {selectedSummary.attempt}</p></div><a href={selectedRun.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-100">Open on GitHub <ExternalLink className="h-4 w-4" /></a></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Outcome</p><p className={"mt-2 font-semibold capitalize " + stateClass(selectedSummary.status, selectedSummary.conclusion)}>{stateText(selectedSummary.status, selectedSummary.conclusion)}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Branch / event</p><p className="mt-2 text-sm">{selectedSummary.branch} · {selectedSummary.event}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Actor</p><p className="mt-2 inline-flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-cyan-300" />{selectedSummary.actor}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Elapsed time</p><p className="mt-2 inline-flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4 text-cyan-300" />{duration(selectedSummary.durationMs)}</p></div></div>
      <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-cyan-300" /> Jobs & step outcomes</CardTitle><CardDescription className="text-slate-400">Read-only job and step status returned by GitHub's Actions API.</CardDescription></CardHeader><CardContent className="space-y-3">{jobsBusy && <p className="text-sm text-cyan-300">Loading job details...</p>}{jobError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{jobError}</p>}{!jobsBusy && !jobError && jobs.length === 0 && <p className="text-sm text-slate-400">No job details were returned for this run.</p>}{jobs.map((job) => <article key={job.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{job.name}</h3><span className={"flex items-center gap-2 text-xs capitalize " + stateClass(job.status, job.conclusion)}><StatusIcon status={job.status} conclusion={job.conclusion} />{stateText(job.status, job.conclusion)}</span></div><div className="mt-3 space-y-2">{job.steps.map((step, index) => <div key={step.number ?? index} className="flex items-center justify-between gap-3 border-t border-slate-800/70 pt-2 text-sm"><span className="text-slate-300">{step.number ? step.number + ". " : ""}{step.name}</span><span className={"shrink-0 text-xs capitalize " + stateClass(step.status, step.conclusion)}>{step.conclusion || step.status}</span></div>)}</div></article>)}</CardContent></Card>
    </section>}

    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5"><h2 className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle className="h-5 w-5" /> Security & scope</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Public repositories only; private workflow runs are not accessible without a secure GitHub connection.</li><li>Read-only monitor. It cannot rerun, cancel, approve, dispatch, or modify workflows.</li><li>Up to 30 recent runs and 100 jobs per selected run are requested. GitHub API rate limits apply.</li><li>No GitHub token is requested or stored. Requests are sent directly from your browser to GitHub's public REST API.</li></ul></section>
    <div className="flex flex-wrap gap-3"><Link to="/developer-studio/github-hub" className="text-sm text-cyan-300 hover:text-cyan-100">GitHub Integration Hub →</Link><Link to="/developer-studio/github-changes" className="text-sm text-cyan-300 hover:text-cyan-100">Change Intelligence →</Link></div>
    <p className="text-xs text-slate-500">Last checked: {lastChecked || "Not checked yet"}{rateRemaining !== null ? " · API requests remaining: " + rateRemaining : ""}. Data is fetched live and is not stored by ETERNYX.</p>
    <div className="flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck className="h-4 w-4" /> Read-only · No credential storage · Bounded requests</div>
  </div></div>;
}
