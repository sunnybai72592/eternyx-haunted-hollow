import { useState } from "react";
import type { ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitBranch, Github, Cloud, Rocket, Copy, Terminal, FileCode2, ShieldCheck, ExternalLink, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildGitWorkflow, generateGitignore, validateDeploymentConfig } from "@/lib/devopsLaunchpadUtils.mjs";

type Feedback = { kind: "success" | "error" | "info"; message: string } | null;
const templates = [{ id: "react", label: "React / Vite" }, { id: "node", label: "Node.js" }, { id: "next", label: "Next.js" }, { id: "python", label: "Python" }, { id: "docker", label: "Docker" }, { id: "vscode", label: "VS Code" }];

function ToolCard({ title, description, icon: Icon, children }: { title: string; description: string; icon: ElementType; children: ReactNode }) {
  return <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-300" />{title}</CardTitle><CardDescription className="text-slate-400">{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>;
}

export default function DevOpsLaunchpad() {
  const [branch, setBranch] = useState("feature/my-change");
  const [message, setMessage] = useState("Describe the change");
  const [remote, setRemote] = useState("");
  const [gitOutput, setGitOutput] = useState("");
  const [gitFeedback, setGitFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string[]>(["react", "node"]);
  const [ignoreOutput, setIgnoreOutput] = useState("");
  const [provider, setProvider] = useState<"vercel" | "netlify">("vercel");
  const [config, setConfig] = useState('{\n  "rewrites": [],\n  "cleanUrls": true\n}');
  const [configFeedback, setConfigFeedback] = useState<Feedback>(null);
  const [configResult, setConfigResult] = useState("");

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
  };
  const runGit = () => {
    try { setGitOutput(buildGitWorkflow({ branch, commitMessage: message, remoteUrl: remote })); setGitFeedback({ kind: "success", message: "Workflow generated. Review every command before running it in your terminal." }); }
    catch (error) { setGitOutput(""); setGitFeedback({ kind: "error", message: error instanceof Error ? error.message : "Unable to build this workflow." }); }
  };
  const runIgnore = () => {
    try { setIgnoreOutput(generateGitignore(selected)); }
    catch { setIgnoreOutput(""); }
  };
  const toggleTemplate = (id: string) => setSelected((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  const runConfig = () => {
    try { const result = validateDeploymentConfig(provider, config); setConfigResult(result.summary + "\n\n" + result.note); setConfigFeedback({ kind: "success", message: "Basic local checks passed. This does not confirm deployment success." }); }
    catch (error) { setConfigResult(""); setConfigFeedback({ kind: "error", message: error instanceof Error ? error.message : "Configuration check failed." }); }
  };
  const feedbackClass = (value: Feedback) => value?.kind === "error" ? "text-rose-300" : value?.kind === "success" ? "text-emerald-300" : "text-slate-400";

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Developer Studio</Link>
    <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/70 via-slate-950 to-violet-950/60 p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · DevOps workspace</p><h1 className="mt-3 text-4xl font-bold sm:text-5xl">DevOps <span className="text-cyan-300">Launchpad</span></h1><p className="mt-4 max-w-3xl leading-7 text-slate-300">Prepare Git workflows, generate project-specific ignore rules, and run lightweight deployment configuration preflights — without pretending to execute commands or deploy your app.</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Git workflow builder", ".gitignore generator", "Vercel preflight", "Netlify preflight"].map((x) => <span key={x} className="rounded-full border border-slate-700 px-3 py-1.5">{x}</span>)}</div></section>
    <div className="grid gap-4 md:grid-cols-3">
      {[{ name: "GitHub", detail: "Repository hosting, pull requests, issues and Actions", icon: Github, url: "https://github.com" }, { name: "Vercel", detail: "Frontend hosting, previews and production deployments", icon: Rocket, url: "https://vercel.com/dashboard" }, { name: "Netlify", detail: "Web hosting, deploy previews and build workflows", icon: Cloud, url: "https://app.netlify.com" }].map((item) => <Card key={item.name} className="border-slate-800 bg-slate-900/60 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><item.icon className="h-5 w-5 text-cyan-300" />{item.name}</CardTitle><CardDescription className="text-slate-400">{item.detail}</CardDescription></CardHeader><CardContent><a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">Open {item.name} <ExternalLink className="h-3.5 w-3.5" /></a><p className="mt-2 text-xs text-slate-500">External service · account connection is not enabled in this milestone.</p></CardContent></Card>)}
    </div>
    <Tabs defaultValue="git" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-900 p-1 sm:grid-cols-3"><TabsTrigger value="git"><GitBranch className="mr-2 h-4 w-4" />Git workflow</TabsTrigger><TabsTrigger value="ignore"><FileCode2 className="mr-2 h-4 w-4" />.gitignore</TabsTrigger><TabsTrigger value="deploy"><ShieldCheck className="mr-2 h-4 w-4" />Deploy config</TabsTrigger></TabsList>
      <TabsContent value="git"><ToolCard title="Git workflow command builder" description="Create a reviewable feature-branch workflow for Git Bash, WSL, macOS or Linux. Commands are generated only; ETERNYX does not execute them." icon={Terminal}><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3"><div><Label>Feature branch</Label><Input value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1 border-slate-700 bg-slate-950 text-white" /></div><div><Label>Commit message</Label><Input value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 border-slate-700 bg-slate-950 text-white" /></div><div><Label>Optional remote URL</Label><Input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://github.com/owner/repository.git" className="mt-1 border-slate-700 bg-slate-950 text-white" /></div><Button onClick={runGit} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><WandSparkles className="mr-2 h-4 w-4" />Generate Git workflow</Button>{gitFeedback && <p role="status" className={"text-sm " + feedbackClass(gitFeedback)}>{gitFeedback.message}</p>}</div><div className="space-y-2"><div className="flex items-center justify-between"><Label>Review before running</Label><Button size="sm" variant="outline" disabled={!gitOutput} onClick={async () => { const ok = await copy(gitOutput); setGitFeedback({ kind: ok ? "success" : "error", message: ok ? "Commands copied." : "Clipboard unavailable; select and copy manually." }); }}><Copy className="mr-2 h-4 w-4" />Copy</Button></div><Textarea readOnly value={gitOutput} className="min-h-72 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></div></div><p className="mt-3 text-xs text-amber-200/80">Commands assume an existing origin remote when no remote URL is supplied. Review the staged diff before committing. The generated syntax targets POSIX-compatible shells, not Windows PowerShell.</p></ToolCard></TabsContent>
      <TabsContent value="ignore"><ToolCard title=".gitignore generator" description="Combine practical ignore rules for common application stacks. Secret-safe defaults are included." icon={FileCode2}><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3"><Label>Project stack</Label><div className="grid grid-cols-2 gap-2">{templates.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleTemplate(item.id)} className="accent-cyan-400" />{item.label}</label>)}</div><Button onClick={runIgnore} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">Generate .gitignore</Button></div><div className="space-y-2"><div className="flex items-center justify-between"><Label>.gitignore output</Label><Button size="sm" variant="outline" disabled={!ignoreOutput} onClick={async () => { const ok = await copy(ignoreOutput); if (!ok) window.alert("Clipboard unavailable. Select and copy the output."); }}><Copy className="mr-2 h-4 w-4" />Copy</Button></div><Textarea readOnly value={ignoreOutput} className="min-h-72 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></div></div><p className="mt-3 text-xs text-slate-500">Review generated rules against your project. Never commit real .env files, private keys, or credentials.</p></ToolCard></TabsContent>
      <TabsContent value="deploy"><ToolCard title="Deployment configuration preflight" description="Run limited local checks on vercel.json or netlify.toml before you push. This is not a substitute for the provider CLI or deployment." icon={ShieldCheck}><div className="space-y-4"><div className="flex flex-wrap gap-2"><Button variant={provider === "vercel" ? "default" : "outline"} onClick={() => { setProvider("vercel"); setConfig('{\n  "rewrites": [],\n  "cleanUrls": true\n}'); setConfigFeedback(null); setConfigResult(""); }}>Vercel · vercel.json</Button><Button variant={provider === "netlify" ? "default" : "outline"} onClick={() => { setProvider("netlify"); setConfig('[build]\n  command = "npm run build"\n  publish = "dist"'); setConfigFeedback(null); setConfigResult(""); }}>Netlify · netlify.toml</Button></div><Label>{provider === "vercel" ? "vercel.json" : "netlify.toml"}</Label><Textarea value={config} onChange={(e) => setConfig(e.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /><Button onClick={runConfig} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><ShieldCheck className="mr-2 h-4 w-4" />Run local preflight</Button>{configFeedback && <p role="status" className={"text-sm " + feedbackClass(configFeedback)}>{configFeedback.message}</p>}{configResult && <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">{configResult}</pre>}</div></ToolCard></TabsContent>
    </Tabs>
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400"><ShieldCheck className="mr-2 inline h-4 w-4 text-cyan-300" />All current Launchpad processing is local in your browser. GitHub, Vercel and Netlify account connections, repository APIs and live deployments are future integration work and are not simulated here.</div>
  </div></div>;
}
