import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Database, Download, FileCode2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { analyzeRlsPolicies, buildRlsSecurityReport } from "@/lib/rlsSecurityUtils.mjs";

const sampleSql = [
  "-- Example only: review every role and predicate for your application",
  "CREATE TABLE public.customer_records (",
  "  id uuid PRIMARY KEY,",
  "  owner_id uuid NOT NULL,",
  "  customer_note text",
  ");",
  "ALTER TABLE public.customer_records ENABLE ROW LEVEL SECURITY;",
  "CREATE POLICY customer_records_owner ON public.customer_records",
  "  FOR SELECT TO authenticated",
  "  USING (auth.uid() = owner_id);",
  "-- Intentionally unsafe example for demonstration:",
  "CREATE POLICY customer_records_public ON public.customer_records",
  "  FOR SELECT TO anon USING (true);",
  "GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_records TO anon;"
].join("\n");

type Analysis = ReturnType<typeof analyzeRlsPolicies>;
const severityStyle: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-950/30 text-rose-200",
  high: "border-orange-500/40 bg-orange-950/30 text-orange-200",
  medium: "border-amber-500/40 bg-amber-950/30 text-amber-200",
  low: "border-slate-700 bg-slate-950 text-slate-300"
};

export default function RlsSecurityIntelligence() {
  const [sql, setSql] = useState(sampleSql);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [feedback, setFeedback] = useState("");
  const runReview = () => {
    try {
      setAnalysis(analyzeRlsPolicies({ sql }));
      setFeedback("RLS review complete. Validate findings against the actual database and role behavior.");
    } catch (error) {
      setAnalysis(null);
      setFeedback(error instanceof Error ? error.message : "Unable to review this SQL script.");
    }
  };
  const report = analysis ? buildRlsSecurityReport(analysis) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setFeedback("Security report copied."); }
    catch { setFeedback("Clipboard access was blocked. Select the report and copy it manually."); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "eternyx-rls-security-review.md"; anchor.click();
    URL.revokeObjectURL(url);
    setFeedback("Markdown report exported.");
  };

  return <div className="min-h-screen bg-[#070b14] text-white">
    <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" />Developer Studio</Link>
      <section className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">ETERNYX · Database security</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Supabase & PostgreSQL <span className="text-sky-300">RLS Intelligence</span></h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-300">Review schema and migration SQL for visible Row-Level Security coverage, policy scope, permissive predicates, and risky grants. Analysis runs locally in this browser.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Row-Level Security", "Policy review", "Role grants", "Supabase patterns", "Browser-only analysis"].map(item => <span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}</div>
      </section>

      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-sky-300" />Schema and policy review</CardTitle>
          <CardDescription className="text-slate-400">Paste the relevant CREATE TABLE, ALTER TABLE, CREATE POLICY, and GRANT statements. Comments and string literals are masked before checks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label htmlFor="rls-sql-input">SQL schema or migration</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => { setSql(sampleSql); setAnalysis(null); setFeedback("Sample SQL restored."); }}>Load sample</Button>
              <Button type="button" variant="outline" onClick={() => { setSql(""); setAnalysis(null); setFeedback("Editor cleared."); }}>Clear</Button>
            </div>
          </div>
          <Textarea id="rls-sql-input" value={sql} onChange={event => setSql(event.target.value)} spellCheck={false} className="min-h-[26rem] border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" placeholder="Paste schema and RLS policy SQL here..." />
          <Button type="button" onClick={runReview} className="bg-sky-300 text-slate-950 hover:bg-sky-200"><ShieldCheck className="mr-2 h-4 w-4" />Analyze RLS configuration</Button>
          {feedback && <p role="status" aria-live="polite" className="text-sm text-cyan-200">{feedback}</p>}
        </CardContent>
      </Card>

      {analysis && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[{label:"Tables identified",value:analysis.tableCount},{label:"RLS enabled in script",value:analysis.rlsEnabledCount},{label:"Policies",value:analysis.policyCount},{label:"Grants",value:analysis.grantCount},{label:"Total findings",value:analysis.findings.length}].map(item => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-slate-400">{item.label}</p><p className="mt-2 text-2xl font-semibold text-sky-200">{item.value}</p></div>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["critical","high","medium","low"] as const).map(level => <div key={level} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs uppercase text-slate-400">{level}</p><p className="mt-2 text-2xl font-semibold">{analysis.summary[level]}</p></div>)}</div>
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle>Prioritized security findings</CardTitle><CardDescription className="text-slate-400">Findings are evidence-based review prompts, not a live permission audit.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {analysis.findings.length ? analysis.findings.map((item,index) => <div key={item.id + index} className={"rounded-xl border p-4 " + severityStyle[item.severity]}><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase">{item.severity} · {item.id}</span><h3 className="font-semibold">{item.title}</h3></div><p className="mt-2 text-sm leading-6 opacity-90">{item.detail}</p><p className="mt-2 text-sm"><strong>Recommendation:</strong> {item.recommendation}</p><p className="mt-2 break-all font-mono text-xs opacity-70">{item.evidence}</p></div>) : <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">No configured checks were triggered. This is not proof that access controls are secure.</p>}
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/70 text-white">
          <CardHeader><CardTitle>Security review report</CardTitle><CardDescription className="text-slate-400">Copy or export a Markdown report for peer review and change records.</CardDescription></CardHeader>
          <CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void copy()} disabled={!report}><Copy className="mr-2 h-4 w-4" />Copy report</Button><Button type="button" variant="outline" onClick={download} disabled={!report}><Download className="mr-2 h-4 w-4" />Export report</Button></div><Textarea readOnly value={report} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></CardContent>
        </Card>
      </div>}

      <div className="rounded-xl border border-amber-500/20 bg-slate-900/40 p-4 text-sm leading-6 text-slate-400"><ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300" />Important boundary: this workbench performs static, pattern-based review of the supplied SQL. It does not connect to Supabase/PostgreSQL, inspect live grants or effective privileges, evaluate JWT claims, resolve inherited roles, prove tenant isolation, or execute role-based tests. It is not a full SQL parser. Validate policies in a non-production project before deployment.</div>
    </div>
  </div>;
}
