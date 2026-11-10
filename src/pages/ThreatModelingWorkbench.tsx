import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileText, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { analyzeThreatModel, buildThreatModelReport } from "@/lib/threatModelingUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial = { systemName: "", scope: "", assets: "", entryPoints: "", dataFlows: "", trustBoundaries: "", existingControls: "" };
const fieldClass = "border-slate-700 bg-slate-950/80 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400";
const ThreatModelingWorkbench = () => {
  const [form, setForm] = useState(initial);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const update = (key) => (event) => setForm(current => ({ ...current, [key]: event.target.value }));
  const report = useMemo(() => model ? buildThreatModelReport(model) : "", [model]);
  const runAnalysis = () => {
    try { setModel(analyzeThreatModel(form)); setError(""); setCopied(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to build the threat model."); setModel(null); }
  };
  const copyReport = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); }
    catch { setError("Clipboard access was unavailable. Use Download Markdown instead."); }
  };
  const downloadReport = () => {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "eternyx-threat-model.md"; anchor.click();
    URL.revokeObjectURL(url);
  };
  const fields = [
    ["assets", "Assets and components", "One per line. Example: customer database, authentication service, payment records.", "Customer database\nAuthentication service\nPayment records"],
    ["entryPoints", "Entry points", "One per line. Example: public login page, partner API, admin console.", "Public login page\nPartner API\nAdmin console"],
    ["dataFlows", "Important data flows", "Describe how data moves between components and users.", "Browser → API over HTTPS\nAPI → database using service identity"],
    ["trustBoundaries", "Trust boundaries", "Where does trust change? Example: internet to application tier.", "Internet → application tier\nApplication tier → database network"],
    ["existingControls", "Existing security controls (optional)", "List controls already designed or implemented. Their effectiveness still needs validation.", "MFA, RBAC, encryption at rest, audit logging, rate limiting"],
  ];
  return <div className="min-h-screen bg-[#050914] text-slate-100">
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/cybersecurity" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-4 w-4" /> Cybersecurity Hub</Link>
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-[#0a1426] to-violet-950/40 p-6 sm:p-9">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200"><ShieldAlert className="h-7 w-7" /></div>
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Cybersecurity • Architecture Security</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">STRIDE Threat Modeling Workbench</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">Map a system's assets, entry points, data flows, and trust boundaries. Generate a structured STRIDE threat register with transparent baseline risk scores and mitigation guidance.</p></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1">6 STRIDE categories</span><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1">Risk scoring 1–25</span><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1">Local analysis</span></div>
      </section>
      <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
        <CardHeader><CardTitle className="text-white">1. Describe your system</CardTitle><CardDescription className="text-slate-400">Start with a clear scope. Add one asset and entry point per line for a more useful review.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2"><Label htmlFor="systemName">System / application name</Label><Input id="systemName" value={form.systemName} onChange={update("systemName")} placeholder="e.g. Customer Portal" className={fieldClass} /></div>
          <div className="space-y-2"><Label htmlFor="scope">System scope and purpose</Label><Textarea id="scope" value={form.scope} onChange={update("scope")} placeholder="What does the system do? Which users, services, and environments are in scope?" className={fieldClass} /></div>
          <div className="grid gap-5 md:grid-cols-2">
            {fields.map(([key, title, hint, placeholder]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{title}</Label><p className="text-xs leading-5 text-slate-500">{hint}</p><Textarea id={key} value={form[key]} onChange={update(key)} placeholder={placeholder} className={fieldClass+" min-h-28"} /></div>)}
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          <div className="flex flex-wrap gap-3"><Button onClick={runAnalysis} className="bg-cyan-400 font-semibold text-slate-950 hover:bg-cyan-300"><Sparkles className="mr-2 h-4 w-4" /> Generate threat model</Button><Button variant="outline" onClick={() => { setForm(initial); setModel(null); setError(""); }} className="border-slate-700 text-slate-200 hover:bg-slate-800">Clear workspace</Button></div>
        </CardContent>
      </Card>
      {model && <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">2. Assessment results</p><h2 className="mt-1 text-2xl font-bold text-white">{model.systemName} threat register</h2><p className="mt-1 text-sm text-slate-400">{model.threats.length} STRIDE categories generated · analyst review required</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyReport} className="border-slate-700 text-slate-200">{copied ? "Copied!" : "Copy report"}</Button><Button onClick={downloadReport} className="bg-violet-400 text-slate-950 hover:bg-violet-300"><Download className="mr-2 h-4 w-4" /> Download Markdown</Button></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(model.summary).map(([key, value]) => <Card key={key} className="border-slate-800 bg-slate-900/70"><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-slate-400">{key}</p><p className="mt-1 text-2xl font-bold text-white">{value}</p></CardContent></Card>)}</div>
        <div className="grid gap-4 lg:grid-cols-2">{model.threats.map(threat => <Card key={threat.id} className="border-slate-800 bg-slate-900/70 text-slate-100"><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-lg text-white">{threat.name}</CardTitle><span className={"rounded-full border px-3 py-1 text-xs font-semibold "+(threat.severity==="Critical"?"border-rose-500/40 bg-rose-500/10 text-rose-200":threat.severity==="High"?"border-orange-500/40 bg-orange-500/10 text-orange-200":threat.severity==="Medium"?"border-amber-500/40 bg-amber-500/10 text-amber-200":"border-emerald-500/40 bg-emerald-500/10 text-emerald-200")}>{threat.severity} · {threat.score}/25</span></div><CardDescription className="leading-6 text-slate-400">{threat.description}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex gap-4 text-xs text-slate-400"><span>Likelihood: {threat.likelihood}/5</span><span>Impact: {threat.impact}/5</span></div><div><p className="mb-1 font-semibold text-cyan-200">Suggested mitigation</p><p className="leading-6 text-slate-300">{threat.mitigation}</p></div><p className="border-t border-slate-800 pt-3 text-xs leading-5 text-slate-500">{threat.controlSignal}</p></CardContent></Card>)}</div>
        <Card className="border-cyan-400/20 bg-cyan-400/5 text-slate-100"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" /><div><p className="font-semibold text-cyan-100">Interpret the scores carefully</p><p className="mt-1 text-sm leading-6 text-slate-300">{model.methodology} Validate each scenario with system owners and architecture diagrams before accepting or changing its rating.</p></div></CardContent></Card>
      </section>}
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5"><div className="flex gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="font-semibold text-amber-100">Scope and limitations</h3><p className="mt-1 text-sm leading-6 text-slate-300">This workbench creates a rule-based STRIDE planning baseline from information you provide. It does not discover assets, draw or parse architecture diagrams, inspect source code, test endpoints, prove exploitability, or certify compliance. Scores are prioritization prompts—not measured probabilities. Review threats with architects, developers, and security owners.</p></div></div></section>
    </div>
  </div>;
};
export default ThreatModelingWorkbench;
