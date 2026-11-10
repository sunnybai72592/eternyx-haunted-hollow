import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, AlertTriangle, CheckCircle2, Clipboard, Cloud, FileJson, Gauge, KeyRound, Rocket, Search, ShieldCheck, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { auditDeploymentReadiness, analyzeBuildLog, compareEnvironmentKeys } from "@/lib/deploymentIntelligenceUtils.mjs";

type Finding = { level: "error" | "warning" | "info"; title: string; detail: string };
const samplePackage = JSON.stringify({ name: "my-app", version: "1.0.0", packageManager: "npm@10.8.2", engines: { node: ">=20" }, scripts: { dev: "vite", build: "vite build", preview: "vite preview", test: "vitest run" }, devDependencies: { vite: "^5.4.0" } }, null, 2);
const sampleConfig = '{\n  "cleanUrls": true,\n  "rewrites": []\n}';

function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <p className="text-sm text-slate-400">No findings to display.</p>;
  return <div className="space-y-3">{findings.map((item, index) => <div key={item.title + index} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="mt-0.5">{item.level === "error" ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : item.level === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : <CheckCircle2 className="h-4 w-4 text-cyan-300" />}</div><div><p className="text-sm font-medium text-white">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p></div></div>)}</div>;
}

export default function DeploymentIntelligence() {
  const [provider, setProvider] = useState<"vercel" | "netlify">("vercel");
  const [packageJson, setPackageJson] = useState(samplePackage);
  const [config, setConfig] = useState(sampleConfig);
  const [envExample, setEnvExample] = useState("VITE_API_URL=\nVITE_PUBLIC_KEY=\n");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [framework, setFramework] = useState("");
  const [envConfigured, setEnvConfigured] = useState("VITE_API_URL");
  const [envResult, setEnvResult] = useState<ReturnType<typeof compareEnvironmentKeys> | null>(null);
  const [buildLog, setBuildLog] = useState("");
  const [buildResult, setBuildResult] = useState<ReturnType<typeof analyzeBuildLog> | null>(null);
  const [feedback, setFeedback] = useState("");

  const runAudit = () => {
    try {
      const result = auditDeploymentReadiness({ packageJson, provider, config, envExample });
      setFindings(result.findings);
      setScore(result.score);
      setFramework(result.project.framework);
      setFeedback("Analysis complete. Review each finding before deploying.");
    } catch (error) {
      setFindings(null); setScore(null);
      setFeedback(error instanceof Error ? error.message : "Unable to analyze this project.");
    }
  };
  const runEnvAudit = () => {
    const names = envConfigured.split(/\r?\n|,/).map((name) => name.trim()).filter(Boolean);
    setEnvResult(compareEnvironmentKeys(envExample, names));
  };
  const runLogAnalysis = () => {
    try { setBuildResult(analyzeBuildLog(buildLog)); setFeedback("Build-log pattern analysis complete."); }
    catch (error) { setBuildResult(null); setFeedback(error instanceof Error ? error.message : "Unable to analyze this log."); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setFeedback("Copied to clipboard."); }
    catch { setFeedback("Clipboard access is unavailable. Select and copy the text manually."); }
  };

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/70 via-slate-950 to-violet-950/60 p-7 sm:p-10">
      <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · Cloud engineering</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Deployment <span className="text-cyan-300">Intelligence</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">Inspect project readiness, audit deployment configuration, compare environment-variable names, and diagnose common build-log failures before your next release.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Vercel readiness", "Netlify readiness", "Environment audit", "Build diagnostics", "Local analysis"].map((label) => <span key={label} className="rounded-full border border-slate-700 px-3 py-1.5">{label}</span>)}</div>
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      {[{ name: "Vercel", detail: "Builds, preview deployments, domains and project settings", url: "https://vercel.com/dashboard", icon: Rocket }, { name: "Netlify", detail: "Build deploys, deploy previews, domains and site settings", url: "https://app.netlify.com", icon: Cloud }].map((item) => <Card key={item.name} className="border-slate-800 bg-slate-900/60 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><item.icon className="h-5 w-5 text-cyan-300" />{item.name}</CardTitle><CardDescription className="text-slate-400">{item.detail}</CardDescription></CardHeader><CardContent><a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200">Open {item.name} dashboard ↗</a></CardContent></Card>)}
    </div>
    <Tabs defaultValue="readiness" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-slate-900 p-1"><TabsTrigger value="readiness">Readiness audit</TabsTrigger><TabsTrigger value="environment">Environment audit</TabsTrigger><TabsTrigger value="logs">Build diagnostics</TabsTrigger></TabsList>
      <TabsContent value="readiness"><Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-cyan-300" /> Project deployment readiness</CardTitle><CardDescription className="text-slate-400">Paste your package.json and optional provider config. Analysis runs locally in this browser.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button variant={provider === "vercel" ? "default" : "outline"} onClick={() => { setProvider("vercel"); setConfig(sampleConfig); setFindings(null); }}>Vercel</Button><Button variant={provider === "netlify" ? "default" : "outline"} onClick={() => { setProvider("netlify"); setConfig('[build]\n  command = "npm run build"\n  publish = "dist"'); setFindings(null); }}>Netlify</Button></div>
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><div className="flex items-center justify-between"><Label>package.json</Label><Button size="sm" variant="outline" onClick={() => void copy(packageJson)}><Clipboard className="mr-2 h-4 w-4" />Copy</Button></div><Textarea value={packageJson} onChange={(e) => setPackageJson(e.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></div><div className="space-y-2"><Label>{provider === "vercel" ? "vercel.json (optional)" : "netlify.toml (optional)"}</Label><Textarea value={config} onChange={(e) => setConfig(e.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></div></div>
        <div className="space-y-2"><Label>.env.example (names only; leave values blank)</Label><Textarea value={envExample} onChange={(e) => setEnvExample(e.target.value)} spellCheck={false} className="min-h-24 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /><p className="text-xs text-amber-200/80">Never paste real credentials, API keys, passwords, or production .env contents. This tool only extracts variable names.</p></div>
        <Button onClick={runAudit} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><ShieldCheck className="mr-2 h-4 w-4" />Run readiness audit</Button>
        {feedback && <p role="status" className="text-sm text-cyan-200">{feedback}</p>}
        {findings && <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-slate-500">Local readiness estimate</p><p className="text-3xl font-bold text-cyan-300">{score}/100</p></div><div className="text-right"><p className="text-sm text-white">{framework}</p><p className="text-xs text-slate-500">{provider === "vercel" ? "Vercel" : "Netlify"} · static analysis</p></div></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: score + "%" }} /></div><FindingList findings={findings} /></div>}
      </CardContent></Card></TabsContent>
      <TabsContent value="environment"><Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-cyan-300" /> Environment variable coverage</CardTitle><CardDescription className="text-slate-400">Compare expected names from .env.example with names configured in your provider dashboard. No values are needed.</CardDescription></CardHeader><CardContent className="space-y-3"><Label>Expected variables (.env.example)</Label><Textarea value={envExample} onChange={(e) => setEnvExample(e.target.value)} className="min-h-28 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /><Label>Configured variable names (one per line or comma-separated)</Label><Textarea value={envConfigured} onChange={(e) => setEnvConfigured(e.target.value)} className="min-h-24 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /><Button onClick={runEnvAudit} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">Compare variable names</Button>{envResult && <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-slate-800 p-3"><p className="text-xs text-slate-500">Expected</p><p className="text-2xl font-semibold">{envResult.expected.length}</p></div><div className="rounded-lg border border-amber-500/30 p-3"><p className="text-xs text-amber-200">Missing</p><p className="text-2xl font-semibold">{envResult.missing.length}</p><p className="mt-2 break-all text-xs text-slate-400">{envResult.missing.join(", ") || "None"}</p></div><div className="rounded-lg border border-cyan-500/30 p-3"><p className="text-xs text-cyan-200">Extra</p><p className="text-2xl font-semibold">{envResult.extra.length}</p><p className="mt-2 break-all text-xs text-slate-400">{envResult.extra.join(", ") || "None"}</p></div></div>}<p className="text-xs text-slate-500">This compares names only. It cannot confirm that a variable exists in Vercel or Netlify, or validate its value.</p></CardContent></Card></TabsContent>
      <TabsContent value="logs"><Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5 text-cyan-300" /> Build-log diagnostics</CardTitle><CardDescription className="text-slate-400">Paste a build log to identify common failure signatures and practical next checks.</CardDescription></CardHeader><CardContent className="space-y-3"><Label>Build output / error log</Label><Textarea value={buildLog} onChange={(e) => setBuildLog(e.target.value)} spellCheck={false} placeholder="Paste build output here..." className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /><Button onClick={runLogAnalysis} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Search className="mr-2 h-4 w-4" />Analyze build log</Button>{buildResult && <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4"><p className="text-sm text-cyan-200">{buildResult.summary}</p>{buildResult.matches.length ? buildResult.matches.map((item) => <div key={item.title} className="rounded-lg border border-slate-800 p-3"><p className="font-medium text-white">{item.title}</p><p className="mt-1 text-sm text-slate-400">{item.advice}</p></div>) : <p className="text-sm text-slate-400">No known pattern matched. Inspect the first error and surrounding context.</p>}</div>}<p className="text-xs text-slate-500">Pattern matching provides investigation hints, not a definitive root-cause analysis. Logs stay in the browser and are not uploaded.</p></CardContent></Card></TabsContent>
    </Tabs>
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm leading-6 text-slate-400"><Activity className="mr-2 inline h-4 w-4 text-cyan-300" />This milestone is a local pre-deployment workbench. It does not connect to Vercel or Netlify accounts, read live deployments, create deployments, or verify production status. Secure provider OAuth and live deployment monitoring are separate future work.</div>
  </div></div>;
}
