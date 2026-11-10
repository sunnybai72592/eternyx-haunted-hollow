import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Download, FileJson, PackageCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { analyzeNpmSupplyChain, buildSupplyChainReport } from "@/lib/softwareSupplyChainUtils.mjs";

const sampleManifest = JSON.stringify({ name: "example-app", version: "1.0.0", dependencies: { "example-library": "^2.1.0" }, devDependencies: { typescript: "^5.0.0" } }, null, 2);
const sampleLock = JSON.stringify({ name: "example-app", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "example-app", version: "1.0.0", dependencies: { "example-library": "^2.1.0" }, devDependencies: { typescript: "^5.0.0" } }, "node_modules/example-library": { version: "2.1.4", resolved: "https://registry.npmjs.org/example-library/-/example-library-2.1.4.tgz", integrity: "sha512-YWJjZA==" }, "node_modules/typescript": { version: "5.4.5", resolved: "https://registry.npmjs.org/typescript/-/typescript-5.4.5.tgz", integrity: "sha512-YWJjZA==", dev: true } } }, null, 2);
const field = "min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100";
type Analysis = ReturnType<typeof analyzeNpmSupplyChain>;

export default function SoftwareSupplyChainIntelligence() {
  const [manifest, setManifest] = useState(sampleManifest);
  const [lockfile, setLockfile] = useState(sampleLock);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [feedback, setFeedback] = useState("");
  const runAnalysis = () => {
    try { setAnalysis(analyzeNpmSupplyChain({ manifestText: manifest, lockfileText: lockfile })); setFeedback("Analysis complete. Review each finding before taking action."); }
    catch (error) { setAnalysis(null); setFeedback(error instanceof Error ? error.message : "Unable to analyze these files."); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setFeedback("Copied to clipboard."); }
    catch { setFeedback("Clipboard access was blocked. Select the output and copy it manually."); }
  };
  const download = (filename: string, value: string, type: string) => {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
    setFeedback(`${filename} exported.`);
  };
  const report = analysis ? buildSupplyChainReport(analysis) : "";
  const bomText = analysis ? JSON.stringify(analysis.bom, null, 2) : "";
  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" />Developer Studio</Link>
    <section className="rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">ETERNYX · Software integrity</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Software Supply Chain <span className="text-fuchsia-300">Intelligence</span></h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-300">Inventory npm dependencies, generate a CycloneDX 1.5-style SBOM, and inspect lockfile drift, mutable dependency sources, and install-time script risks.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["npm package.json", "package-lock v1–v3", "CycloneDX 1.5 JSON", "Integrity metadata", "Browser-only analysis"].map(item => <span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}</div>
    </section>
    <Tabs defaultValue="analyze" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-900 p-1"><TabsTrigger value="analyze">Dependency analysis</TabsTrigger><TabsTrigger value="sbom">SBOM & report</TabsTrigger></TabsList>
      <TabsContent value="analyze" className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><FileJson className="h-5 w-5 text-fuchsia-300" />package.json</CardTitle><CardDescription className="text-slate-400">Paste your project manifest. The sample is editable.</CardDescription></CardHeader><CardContent className="space-y-2"><Label htmlFor="manifest">Manifest JSON</Label><Textarea id="manifest" value={manifest} onChange={event => setManifest(event.target.value)} spellCheck={false} className={field} /></CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-cyan-300" />package-lock.json</CardTitle><CardDescription className="text-slate-400">Provide the matching npm lockfile for exact versions and integrity data.</CardDescription></CardHeader><CardContent className="space-y-2"><Label htmlFor="lockfile">Lockfile JSON</Label><Textarea id="lockfile" value={lockfile} onChange={event => setLockfile(event.target.value)} spellCheck={false} className={field} /></CardContent></Card>
        </div>
        <Button onClick={runAnalysis} className="bg-fuchsia-400 text-slate-950 hover:bg-fuchsia-300"><ShieldCheck className="mr-2 h-4 w-4" />Analyze supply chain</Button>
        {analysis && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{label:"Components",value:analysis.inventory.length},{label:"Direct declarations",value:analysis.directDependencyCount},{label:"Critical findings",value:analysis.summary.critical},{label:"High findings",value:analysis.summary.high}].map(item => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-slate-400">{item.label}</p><p className="mt-2 text-2xl font-semibold text-fuchsia-200">{item.value}</p></div>)}</div>
          <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle>Prioritized findings</CardTitle><CardDescription className="text-slate-400">{analysis.summary.total} heuristic findings. Each item includes a recommended next step.</CardDescription></CardHeader><CardContent className="space-y-3">{analysis.findings.length === 0 ? <p className="text-sm text-emerald-300">No configured heuristic checks were triggered. This is not a vulnerability-free certification.</p> : analysis.findings.map((item,index) => <div key={item.id + index} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.severity === "critical" ? "bg-rose-500/20 text-rose-300" : item.severity === "high" ? "bg-orange-500/20 text-orange-300" : "bg-amber-500/20 text-amber-200"}`}>{item.severity}</span><h3 className="font-semibold">{item.title}</h3></div><p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p><p className="mt-2 text-sm text-cyan-200">Recommendation: {item.recommendation}</p>{item.evidence && <p className="mt-2 break-all font-mono text-xs text-slate-500">{item.evidence}</p>}</div>)}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle>Dependency inventory</CardTitle><CardDescription className="text-slate-400">Resolved packages detected in the supplied npm lockfile.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-400"><tr><th className="pb-2 pr-4">Package</th><th className="pb-2 pr-4">Version</th><th className="pb-2">Integrity</th></tr></thead><tbody>{analysis.inventory.map((item,index) => <tr key={item.ref + index} className="border-t border-slate-800"><td className="py-2 pr-4 font-medium text-slate-200">{item.name}</td><td className="py-2 pr-4 font-mono text-xs text-slate-300">{item.version}</td><td className="py-2 text-xs text-slate-400">{item.item?.integrity ? "Recorded" : "Not recorded"}</td></tr>)}</tbody></table></CardContent></Card>
        </>}
      </TabsContent>
      <TabsContent value="sbom" className="space-y-5">
        <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><FileJson className="h-5 w-5 text-fuchsia-300" />CycloneDX SBOM</CardTitle><CardDescription className="text-slate-400">Generate a software bill of materials from the last successful analysis.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Button onClick={() => void copy(bomText)} disabled={!bomText} variant="outline"><Copy className="mr-2 h-4 w-4" />Copy SBOM</Button><Button onClick={() => download("sbom.cdx.json",bomText,"application/json")} disabled={!bomText} className="bg-fuchsia-400 text-slate-950 hover:bg-fuchsia-300"><Download className="mr-2 h-4 w-4" />Export SBOM</Button></div><Textarea readOnly value={bomText || "Run dependency analysis to generate the SBOM."} spellCheck={false} className="min-h-[28rem] border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></CardContent></Card>
        <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle>Review report</CardTitle><CardDescription className="text-slate-400">Export a concise Markdown summary for engineering review.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Button onClick={() => void copy(report)} disabled={!report} variant="outline"><Copy className="mr-2 h-4 w-4" />Copy report</Button><Button onClick={() => download("supply-chain-review.md",report,"text/markdown")} disabled={!report} variant="outline"><Download className="mr-2 h-4 w-4" />Export report</Button></div><Textarea readOnly value={report || "Run dependency analysis to generate the report."} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></CardContent></Card>
      </TabsContent>
    </Tabs>
    {feedback && <p role="status" aria-live="polite" className="text-sm text-amber-200">{feedback}</p>}
    <div className="rounded-xl border border-amber-500/20 bg-slate-900/40 p-4 text-sm leading-6 text-slate-400"><ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300" />Scope: static analysis of the supplied npm manifest and lockfile only. This tool does not install packages, contact registries, query CVE/advisory databases, detect malware, verify provenance, or prove that a dependency is safe. Review findings and SBOM contents before relying on them. Your pasted files remain in this browser workbench.</div>
  </div></div>;
}
