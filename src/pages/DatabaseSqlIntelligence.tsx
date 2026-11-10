import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Download, FileCode2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { analyzeSqlScript, buildSqlReviewReport } from "@/lib/databaseSqlUtils.mjs";

const sampleSql = [
  "-- Review this sample before running it in any environment",
  "BEGIN;",
  "CREATE TABLE public.audit_events (",
  "  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,",
  "  event_name text NOT NULL,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "-- This intentionally risky example demonstrates a missing WHERE check:",
  "UPDATE public.user_profiles SET is_active = false;",
  "SELECT * FROM public.audit_events;",
  "COMMIT;"
].join("\n");
const field = "min-h-[24rem] border-slate-700 bg-slate-950 font-mono text-xs text-slate-100";
type Analysis = ReturnType<typeof analyzeSqlScript>;
const severityStyle: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-950/30 text-rose-200",
  high: "border-orange-500/40 bg-orange-950/30 text-orange-200",
  medium: "border-amber-500/40 bg-amber-950/30 text-amber-200",
  low: "border-slate-700 bg-slate-950 text-slate-300"
};

export default function DatabaseSqlIntelligence() {
  const [sql, setSql] = useState(sampleSql);
  const [dialect, setDialect] = useState("postgresql");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [feedback, setFeedback] = useState("");
  const runReview = () => {
    try { setAnalysis(analyzeSqlScript({ sql, dialect })); setFeedback("Review complete. Validate findings and test changes outside production."); }
    catch (error) { setAnalysis(null); setFeedback(error instanceof Error ? error.message : "Unable to review this SQL script."); }
  };
  const report = analysis ? buildSqlReviewReport(analysis) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setFeedback("Review report copied."); }
    catch { setFeedback("Clipboard access was blocked. Select the report and copy it manually."); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "eternyx-sql-review.md"; anchor.click();
    URL.revokeObjectURL(url); setFeedback("Markdown report exported.");
  };
  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" />Developer Studio</Link>
    <section className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">ETERNYX · Database engineering</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Database & SQL <span className="text-emerald-300">Intelligence</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">Review SQL scripts and PostgreSQL-oriented migrations for destructive statements, unbounded data changes, privilege risks, and query-quality concerns—all locally in your browser.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Migration review", "Destructive-operation checks", "Privilege-risk patterns", "Query-quality hints", "Browser-only analysis"].map(item => <span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}</div>
    </section>
    <Card className="border-slate-800 bg-slate-900/70 text-white">
      <CardHeader><CardTitle className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-emerald-300" />SQL script review</CardTitle><CardDescription className="text-slate-400">Paste a migration or query script. Comments and quoted strings are masked before pattern checks to reduce misleading matches.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2"><Label htmlFor="sql-dialect">Dialect profile</Label><select id="sql-dialect" value={dialect} onChange={event => setDialect(event.target.value)} className="block rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="postgresql">PostgreSQL / Supabase</option><option value="generic">Generic SQL (limited checks)</option></select></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setSql(sampleSql); setAnalysis(null); setFeedback("Sample SQL restored."); }}>Load sample</Button><Button variant="outline" onClick={() => { setSql(""); setAnalysis(null); setFeedback("Editor cleared."); }}>Clear</Button></div>
        </div>
        <Label htmlFor="sql-input">SQL script</Label>
        <Textarea id="sql-input" value={sql} onChange={event => setSql(event.target.value)} spellCheck={false} className={field} placeholder="Paste SQL migration or query here..." />
        <Button onClick={runReview} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"><ShieldCheck className="mr-2 h-4 w-4" />Analyze SQL script</Button>
        {feedback && <p role="status" aria-live="polite" className="text-sm text-cyan-200">{feedback}</p>}
      </CardContent>
    </Card>
    {analysis && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[{label:"Statements",value:analysis.statementCount},{label:"Total findings",value:analysis.findings.length},{label:"Critical",value:analysis.summary.critical},{label:"High",value:analysis.summary.high},{label:"Medium",value:analysis.summary.medium}].map(item => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-slate-400">{item.label}</p><p className="mt-2 text-2xl font-semibold text-emerald-200">{item.value}</p></div>)}</div>
      <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle>Prioritized SQL findings</CardTitle><CardDescription className="text-slate-400">Pattern-based review; inspect the statement and recommendation before acting.</CardDescription></CardHeader><CardContent className="space-y-3">
        {analysis.findings.length ? analysis.findings.map((item,index) => <div key={item.id + index} className={"rounded-xl border p-4 " + severityStyle[item.severity]}><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase">{item.severity} · {item.id}</span><h3 className="font-semibold">{item.title}</h3></div><p className="mt-2 text-sm leading-6 opacity-90">{item.detail}</p><p className="mt-2 text-sm"><strong>Recommendation:</strong> {item.recommendation}</p><p className="mt-2 break-all font-mono text-xs opacity-70">{item.evidence}</p></div>) : <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">No configured checks were triggered. This is not proof that the SQL is correct or safe.</p>}
      </CardContent></Card>
      <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle>Review report</CardTitle><CardDescription className="text-slate-400">Copy or export a Markdown report for engineering review.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy()}><Copy className="mr-2 h-4 w-4" />Copy report</Button><Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Export report</Button></div><Textarea readOnly value={report} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></CardContent></Card>
    </div>}
    <div className="rounded-xl border border-amber-500/20 bg-slate-900/40 p-4 text-sm leading-6 text-slate-400"><ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300" />Important boundary: this tool does not parse SQL with a full grammar, execute statements, connect to a database, inspect live schema or permissions, estimate locks/query plans, or guarantee migration safety. It is a static heuristic reviewer. Always test reviewed migrations against a non-production database and obtain required approvals before production deployment.</div>
  </div></div>;
}
