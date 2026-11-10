import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitCompareArrows, GitCommit, FileCode2, ExternalLink, RefreshCw, ShieldCheck, AlertTriangle, Plus, Minus, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGitHubRepositoryInput } from "@/lib/githubHubUtils.mjs";
import { buildGitHubComparePath, summarizeGitHubComparison } from "@/lib/githubChangeUtils.mjs";

type Commit = { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null }; author: { login: string } | null };
type ChangedFile = { filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string; blob_url: string; raw_url: string };
type Comparison = { status: string; ahead_by: number; behind_by: number; total_commits: number; commits: Commit[]; files: ChangedFile[]; html_url: string; base_commit: Commit; merge_base_commit: Commit };

const date = (value?: string) => value ? new Date(value).toLocaleString() : "Date unavailable";
const shortSha = (sha?: string) => sha ? sha.slice(0, 7) : "—";
const statusLabel: Record<string, string> = { ahead: "Compare branch is ahead", behind: "Compare branch is behind", identical: "Branches are identical", diverged: "Branches have diverged" };

async function fetchComparison(url: string, signal: AbortSignal): Promise<Comparison> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    credentials: "omit", cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository or one of the refs was not found. Confirm both refs exist and the repository is public.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub's unauthenticated API rate limit or access restriction was reached. Try again later.");
    if (response.status === 422) throw new Error("GitHub could not compare these refs. Check their names and repository history.");
    throw new Error("GitHub API returned HTTP " + response.status + ".");
  }
  return await response.json() as Comparison;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof GitCommit }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4 text-cyan-300" />{label}</div><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
}

export default function GitHubChangeIntelligence() {
  const [repositoryInput, setRepositoryInput] = useState("facebook/react");
  const [baseRef, setBaseRef] = useState("main");
  const [headRef, setHeadRef] = useState("master");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof summarizeGitHubComparison> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastChecked, setLastChecked] = useState("");

  const compare = async () => {
    let parsed: ReturnType<typeof parseGitHubRepositoryInput>;
    let resource: string;
    try {
      parsed = parseGitHubRepositoryInput(repositoryInput);
      resource = buildGitHubComparePath(baseRef, headRef);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the repository and refs.");
      return;
    }
    setBusy(true); setError(""); setNotice(""); setComparison(null); setSummary(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const compareUrl = "https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.repository) + "/" + resource;
      const result = await fetchComparison(compareUrl, controller.signal);
      const metrics = summarizeGitHubComparison(result);
      setComparison(result); setSummary(metrics); setLastChecked(new Date().toLocaleString());
      if (metrics.truncatedCommits || metrics.truncatedFiles) {
        setNotice("GitHub's compare response is bounded. " +
          (metrics.truncatedCommits ? "Only " + metrics.returnedCommits + " of " + metrics.totalCommits + " commits were returned. " : "") +
          (metrics.truncatedFiles ? "File results may be capped by GitHub. " : ""));
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError" ? "GitHub did not respond within 25 seconds. Try again." : cause instanceof Error ? cause.message : "Unable to compare these refs.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  };

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · Developer Studio</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">GitHub <span className="text-cyan-300">Change Intelligence</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">Compare public branches, tags, or commit references. Understand ahead/behind status, commit history, changed files, and line-change metrics before opening a pull request or reviewing a release.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Branch comparison", "Commit review", "Changed-file inventory", "Live GitHub data"].map((item) => <span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}</div>
    </section>

    <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><GitCompareArrows className="h-5 w-5 text-cyan-300" /> Compare repository refs</CardTitle><CardDescription className="text-slate-400">Public repositories only. Enter two different branch, tag, or commit references. No login or token required.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="change-repo">GitHub repository</Label><Input id="change-repo" value={repositoryInput} onChange={(event) => setRepositoryInput(event.target.value)} placeholder="owner/repository" className="border-slate-700 bg-slate-950 text-white" /></div>
      <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="change-base">Base reference</Label><Input id="change-base" value={baseRef} onChange={(event) => setBaseRef(event.target.value)} placeholder="main" className="border-slate-700 bg-slate-950 text-white" /></div><div className="space-y-2"><Label htmlFor="change-head">Compare reference</Label><Input id="change-head" value={headRef} onChange={(event) => setHeadRef(event.target.value)} placeholder="feature/my-change" className="border-slate-700 bg-slate-950 text-white" /></div></div>
      <Button onClick={() => void compare()} disabled={busy} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />{busy ? "Comparing refs..." : "Compare changes"}</Button>
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">{notice}</p>}
    </CardContent></Card>

    {comparison && summary && <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-slate-500">Comparison result</p><h2 className="mt-1 text-xl font-semibold">{comparison.base_commit ? shortSha(comparison.base_commit.sha) : baseRef} <span className="text-cyan-300">→</span> {headRef}</h2><p className="mt-1 text-sm text-slate-400">{statusLabel[summary.status] || summary.status}</p></div><a href={comparison.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-100">Open comparison on GitHub <ExternalLink className="h-4 w-4" /></a></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Commits ahead" value={summary.aheadBy} icon={GitCommit} /><Metric label="Commits behind" value={summary.behindBy} icon={GitBranch} /><Metric label="Files changed" value={summary.filesChanged} icon={FileCode2} /><Metric label="Total line changes" value={"+" + summary.additions + " / −" + summary.deletions} icon={GitCompareArrows} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><GitCommit className="h-5 w-5 text-cyan-300" /> Commit history</CardTitle><CardDescription className="text-slate-400">{summary.returnedCommits} returned · {summary.totalCommits} total</CardDescription></CardHeader><CardContent className="space-y-3">{comparison.commits.length ? comparison.commits.map((commit) => <article key={commit.sha} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm font-medium text-slate-200">{commit.commit.message.split("\n")[0]}</p><p className="mt-1 text-xs text-slate-500">{commit.author?.login || commit.commit.author?.name || "Unknown author"} · {date(commit.commit.author?.date || undefined)}</p></div><a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-cyan-300" aria-label={"Open commit " + shortSha(commit.sha)}><ExternalLink className="h-4 w-4" /></a></div><p className="mt-2 font-mono text-xs text-slate-500">{shortSha(commit.sha)}</p></article>) : <p className="text-sm text-slate-500">No commits in this comparison.</p>}</CardContent></Card>
        <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-cyan-300" /> Changed files</CardTitle><CardDescription className="text-slate-400">GitHub file-level change summary</CardDescription></CardHeader><CardContent className="space-y-3">{comparison.files.length ? comparison.files.map((file) => <article key={file.filename} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-xs text-slate-200">{file.filename}</p><p className="mt-1 text-xs capitalize text-slate-500">{file.status} · {file.changes} changes</p></div><a href={file.blob_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-cyan-300" aria-label={"Open changed file " + file.filename}><ExternalLink className="h-4 w-4" /></a></div><div className="mt-2 flex items-center gap-3 text-xs"><span className="inline-flex items-center gap-1 text-emerald-300"><Plus className="h-3 w-3" />{file.additions}</span><span className="inline-flex items-center gap-1 text-rose-300"><Minus className="h-3 w-3" />{file.deletions}</span></div>{file.patch && <details className="mt-3"><summary className="cursor-pointer text-xs text-cyan-300">View patch excerpt</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/50 p-3 font-mono text-[11px] leading-5 text-slate-300">{file.patch}</pre></details>}</article>) : <p className="text-sm text-slate-500">No changed files were returned.</p>}</CardContent></Card>
      </div>
      <p className="text-xs text-slate-500">Last checked: {lastChecked}. Comparison data is fetched live and is not stored by ETERNYX.</p>
    </section>}

    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 sm:p-6"><h2 className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle className="h-5 w-5" /> Access, privacy & limits</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Public repositories only; private repositories are not accessible in this unauthenticated mode.</li><li>Read-only comparison. ETERNYX does not create branches, commits, pull requests, or modify files.</li><li>GitHub's compare endpoint may cap returned commit and file data. The interface reports when returned commit history is incomplete.</li><li>No GitHub token is requested, stored, or sent. Requests go directly from your browser to GitHub's public REST API; unauthenticated rate limits apply.</li></ul></section>
    <div className="flex flex-wrap gap-3"><Link to="/developer-studio/github-hub" className="text-sm text-cyan-300 hover:text-cyan-100">Open GitHub Integration Hub →</Link><Link to="/developer-studio/github-collaboration" className="text-sm text-cyan-300 hover:text-cyan-100">Open Collaboration Center →</Link></div>
    <div className="flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck className="h-4 w-4" /> Read-only · No credential storage · Bounded requests</div>
  </div></div>;
}
