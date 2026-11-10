import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Package, Tag, Search, RefreshCw, ExternalLink, Download, GitCompareArrows, ShieldCheck, AlertTriangle, Clock3, GitBranch, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGitHubRepositoryInput, githubApiUrl } from "@/lib/githubHubUtils.mjs";
import { filterGitHubReleases, formatGitHubAssetSize, normalizeGitHubComparison, normalizeGitHubReleases, normalizeGitHubTags, summarizeGitHubReleases } from "@/lib/githubReleaseUtils.mjs";

type Release = ReturnType<typeof normalizeGitHubReleases>[number];
type Tag = ReturnType<typeof normalizeGitHubTags>[number];
type Comparison = ReturnType<typeof normalizeGitHubComparison>;

async function requestGitHub<T>(url: string, signal: AbortSignal): Promise<{ data: T; remaining: string | null }> {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit", cache: "no-store", redirect: "error", signal });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository or release resource not found. Check the public repository name.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub's unauthenticated API rate limit or access restriction was reached. Try again later.");
    throw new Error("GitHub API returned HTTP " + response.status + ".");
  }
  return { data: await response.json() as T, remaining: response.headers.get("x-ratelimit-remaining") };
}

export default function GitHubReleaseIntelligence() {
  const [repositoryInput, setRepositoryInput] = useState("");
  const [releases, setReleases] = useState<Release[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [baseTag, setBaseTag] = useState("");
  const [headTag, setHeadTag] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [error, setError] = useState("");
  const [compareError, setCompareError] = useState("");
  const [lastChecked, setLastChecked] = useState("");
  const [rateRemaining, setRateRemaining] = useState<string | null>(null);

  const filtered = useMemo(() => filterGitHubReleases(releases, { query, channel }), [releases, query, channel]);
  const summary = useMemo(() => summarizeGitHubReleases(releases), [releases]);

  const loadRepository = async () => {
    let parsed;
    try { parsed = parseGitHubRepositoryInput(repositoryInput); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Enter a valid public repository."); return; }
    setBusy(true); setError(""); setCompareError(""); setComparison(null); setReleases([]); setTags([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const [releaseResponse, tagResponse] = await Promise.all([
        requestGitHub<unknown>(githubApiUrl(parsed.owner, parsed.repository, "releases?per_page=50"), controller.signal),
        requestGitHub<unknown>(githubApiUrl(parsed.owner, parsed.repository, "tags?per_page=50"), controller.signal)
      ]);
      const normalizedReleases = normalizeGitHubReleases(releaseResponse.data);
      const normalizedTags = normalizeGitHubTags(tagResponse.data);
      setReleases(normalizedReleases);
      setTags(normalizedTags);
      setBaseTag(normalizedTags[1]?.name || normalizedTags[0]?.name || "");
      setHeadTag(normalizedTags[0]?.name || "");
      setRateRemaining(releaseResponse.remaining ?? tagResponse.remaining);
      setLastChecked(new Date().toLocaleString());
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError" ? "GitHub did not respond within 25 seconds. Try again." : cause instanceof Error ? cause.message : "Unable to load releases and tags.");
    } finally { window.clearTimeout(timeout); setBusy(false); }
  };

  const compareVersions = async () => {
    if (!baseTag || !headTag || baseTag === headTag) { setCompareError("Choose two different tags to compare."); return; }
    let parsed;
    try { parsed = parseGitHubRepositoryInput(repositoryInput); }
    catch (cause) { setCompareError(cause instanceof Error ? cause.message : "Invalid repository."); return; }
    setCompareBusy(true); setCompareError(""); setComparison(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const resource = "compare/" + encodeURIComponent(baseTag) + "..." + encodeURIComponent(headTag);
      const result = await requestGitHub<unknown>(githubApiUrl(parsed.owner, parsed.repository, resource), controller.signal);
      setComparison(normalizeGitHubComparison(result.data));
      setRateRemaining(result.remaining);
    } catch (cause) {
      setCompareError(cause instanceof Error && cause.name === "AbortError" ? "Version comparison timed out. Try again." : cause instanceof Error ? cause.message : "Unable to compare these tags.");
    } finally { window.clearTimeout(timeout); setCompareBusy(false); }
  };

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">ETERNYX · Developer Studio</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">GitHub Release <span className="text-cyan-300">Intelligence</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">A release engineering workbench for public repositories. Explore stable releases and pre-releases, inspect release notes and downloadable assets, review tags, and compare versions with real commit and file-change statistics.</p>
    </section>

    <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-cyan-300" /> Repository release explorer</CardTitle><CardDescription className="text-slate-400">Enter owner/repository or a GitHub URL. Public data only; no token required.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="release-repo">GitHub repository</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="release-repo" value={repositoryInput} onChange={(event) => setRepositoryInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRepository(); }} placeholder="owner/repository" className="border-slate-700 bg-slate-950 text-white" /><Button onClick={() => void loadRepository()} disabled={busy} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className={"mr-2 h-4 w-4 " + (busy ? "animate-spin" : "")} />{busy ? "Loading..." : "Load releases & tags"}</Button></div>{error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}</CardContent></Card>

    {releases.length > 0 && <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Releases loaded</p><p className="mt-2 text-2xl font-semibold">{summary.total}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Stable / pre-releases</p><p className="mt-2 text-2xl font-semibold"><span className="text-emerald-300">{summary.stable}</span> / <span className="text-amber-300">{summary.prereleases}</span></p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Release assets</p><p className="mt-2 text-2xl font-semibold">{summary.assets}</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs text-slate-500">Asset downloads</p><p className="mt-2 text-2xl font-semibold">{summary.downloads.toLocaleString()}</p></div></div>
      {summary.latestStable && <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300"><Star className="h-4 w-4" /> Latest stable release</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{summary.latestStable.name}</h2><p className="mt-1 text-sm text-slate-400">{summary.latestStable.tag_name} · Published {summary.latestStable.published_at ? new Date(summary.latestStable.published_at).toLocaleDateString() : "date unavailable"}</p></div><a href={summary.latestStable.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">View release <ExternalLink className="h-4 w-4" /></a></div></div>}
      <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-cyan-300" /> Release history</CardTitle><CardDescription className="text-slate-400">Up to 50 releases returned by GitHub. Release notes are displayed as plain text; embedded HTML is never rendered.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label htmlFor="release-search">Search releases</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input id="release-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, tag, notes, author..." className="border-slate-700 bg-slate-950 pl-9 text-white" /></div></div><div className="space-y-1"><Label htmlFor="release-channel">Release channel</Label><select id="release-channel" value={channel} onChange={(event) => setChannel(event.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white"><option value="all">All channels</option><option value="stable">Stable only</option><option value="prerelease">Pre-releases</option><option value="draft">Drafts</option></select></div></div>
        <div className="space-y-3">{filtered.map((release) => <article key={release.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{release.name}</h3><span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-cyan-200">{release.tag_name}</span>{release.prerelease && <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-xs text-amber-200">Pre-release</span>}{release.draft && <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-400">Draft</span>}</div><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>By {release.author}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{release.published_at ? new Date(release.published_at).toLocaleString() : "Not published"}</span><span><GitBranch className="mr-1 inline h-3 w-3" />{release.target_commitish || "Target unavailable"}</span></p></div><a href={release.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">GitHub <ExternalLink className="h-4 w-4" /></a></div>{release.body && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-slate-300">Read release notes</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 p-3 font-sans text-sm leading-6 text-slate-300">{release.body}</pre></details>}<div className="mt-4 space-y-2">{release.assets.length > 0 ? release.assets.map((asset) => <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-sm"><div className="min-w-0"><p className="truncate text-slate-200">{asset.name}</p><p className="text-xs text-slate-500">{formatGitHubAssetSize(asset.size)} · {asset.download_count.toLocaleString()} downloads · {asset.content_type}</p></div><a href={asset.browser_download_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-300"><Download className="h-3.5 w-3.5" /> Download</a></div>) : <p className="text-xs text-slate-500">No downloadable assets attached.</p>}</div></article>)}</div>
        {filtered.length === 0 && <p className="rounded-lg border border-slate-800 p-5 text-center text-sm text-slate-400">No releases match these filters. This repository may publish tags without formal GitHub releases.</p>}
      </CardContent></Card>
    </section>}

    {tags.length > 0 && <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-cyan-300" /> Version tags & comparison</CardTitle><CardDescription className="text-slate-400">Up to 50 recent tags. Compare two tags to inspect commit distance and changed-file statistics.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><div className="space-y-1"><Label htmlFor="base-tag">Base version</Label><select id="base-tag" value={baseTag} onChange={(event) => setBaseTag(event.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">{tags.map((tag) => <option key={tag.name} value={tag.name}>{tag.name}</option>)}</select></div><div className="space-y-1"><Label htmlFor="head-tag">Compare with</Label><select id="head-tag" value={headTag} onChange={(event) => setHeadTag(event.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">{tags.map((tag) => <option key={tag.name} value={tag.name}>{tag.name}</option>)}</select></div><div className="flex items-end"><Button onClick={() => void compareVersions()} disabled={compareBusy || tags.length < 2} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 md:w-auto"><GitCompareArrows className="mr-2 h-4 w-4" />{compareBusy ? "Comparing..." : "Compare"}</Button></div></div>{compareError && <p role="alert" className="text-sm text-rose-300">{compareError}</p>}{comparison && <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-sm text-slate-300">Comparison: <strong>{baseTag}</strong> → <strong>{headTag}</strong> · {comparison.status}</p><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-slate-500">Commits ahead</p><p className="text-2xl font-semibold text-emerald-300">{comparison.ahead_by}</p></div><div><p className="text-xs text-slate-500">Commits behind</p><p className="text-2xl font-semibold text-amber-300">{comparison.behind_by}</p></div><div><p className="text-xs text-slate-500">Changed files</p><p className="text-2xl font-semibold">{comparison.files.length}</p></div></div><div className="space-y-2">{comparison.files.map((file) => <div key={file.filename} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-sm"><div className="min-w-0"><p className="break-all text-slate-200">{file.filename}</p><p className="text-xs text-slate-500">{file.status}{file.previous_filename ? " · from " + file.previous_filename : ""}</p></div><p className="shrink-0 text-xs"><span className="text-emerald-300">+{file.additions}</span> / <span className="text-rose-300">-{file.deletions}</span></p></div>)}</div>{comparison.files.length === 0 && <p className="text-sm text-slate-400">No changed files were returned for this comparison.</p>}</div>}</CardContent></Card>)}

    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5"><h2 className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle className="h-5 w-5" /> Security & scope</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Public repositories only. Private release metadata requires a future secure GitHub App connection.</li><li>Read-only: ETERNYX does not create, edit, publish, delete, or download releases automatically.</li><li>Up to 50 releases and 50 tags are requested per repository. GitHub unauthenticated API limits apply.</li><li>Release notes are rendered as escaped plain text; external links open in a new tab.</li><li>No GitHub token is requested or stored. Data is fetched directly from GitHub and is not persisted by ETERNYX.</li></ul></section>
    <div className="flex flex-wrap gap-3"><Link to="/developer-studio/github-actions" className="text-sm text-cyan-300 hover:text-cyan-100">Actions Intelligence →</Link><Link to="/developer-studio/github-changes" className="text-sm text-cyan-300 hover:text-cyan-100">Change Intelligence →</Link><Link to="/developer-studio/github-hub" className="text-sm text-cyan-300 hover:text-cyan-100">GitHub Hub →</Link></div>
    <p className="text-xs text-slate-500">Last checked: {lastChecked || "Not checked yet"}{rateRemaining !== null ? " · API requests remaining: " + rateRemaining : ""}. GitHub data is fetched live and not stored by ETERNYX.</p>
    <div className="flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck className="h-4 w-4" /> Read-only · No credential storage · Bounded requests</div>
  </div></div>;
}
