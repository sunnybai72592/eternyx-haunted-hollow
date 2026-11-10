import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowLeft, Braces, Boxes, Copy, FileCode2, Fingerprint, KeyRound, Gauge,
  Link2, RefreshCw, ShieldAlert, Sparkles, WandSparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decodeBase64Utf8, decodeJwt as decodeJwtToken, decodeUriComponent, encodeBase64Utf8, encodeUriComponent, formatJson as formatJsonInput, generateUuids } from "@/lib/developerStudioUtils.mjs";

type Feedback = { kind: "success" | "error" | "info"; message: string } | null;

const Output = ({ value, label, onCopy }: { value: string; label: string; onCopy: () => void }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <Label>{label}</Label>
      <Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={!value}>
        <Copy className="mr-2 h-4 w-4" /> Copy
      </Button>
    </div>
    <Textarea value={value} readOnly spellCheck={false} className="min-h-48 border-slate-700 bg-slate-950/80 font-mono text-sm text-slate-100" />
  </div>
);

const FeedbackLine = ({ feedback }: { feedback: Feedback }) => feedback ? (
  <p role="status" aria-live="polite" className={`text-sm ${feedback.kind === "error" ? "text-rose-300" : feedback.kind === "success" ? "text-emerald-300" : "text-slate-400"}`}>
    {feedback.message}
  </p>
) : null;

export default function DeveloperStudio() {
  const [jsonInput, setJsonInput] = useState('{"name":"ETERNYX","status":"building","tools":[]}');
  const [jsonOutput, setJsonOutput] = useState("");
  const [jsonFeedback, setJsonFeedback] = useState<Feedback>(null);
  const [base64Input, setBase64Input] = useState("");
  const [base64Output, setBase64Output] = useState("");
  const [base64Mode, setBase64Mode] = useState<"encode" | "decode">("encode");
  const [base64Feedback, setBase64Feedback] = useState<Feedback>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlOutput, setUrlOutput] = useState("");
  const [urlMode, setUrlMode] = useState<"encode" | "decode">("encode");
  const [urlFeedback, setUrlFeedback] = useState<Feedback>(null);
  const [uuidOutput, setUuidOutput] = useState("");
  const [uuidCount, setUuidCount] = useState("5");
  const [jwtInput, setJwtInput] = useState("");
  const [jwtOutput, setJwtOutput] = useState("");
  const [jwtFeedback, setJwtFeedback] = useState<Feedback>(null);
  const [copyFeedback, setCopyFeedback] = useState("");

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback("Copied to clipboard.");
      window.setTimeout(() => setCopyFeedback(""), 1800);
    } catch {
      setCopyFeedback("Clipboard access was blocked. Select the output and copy it manually.");
    }
  };

  const formatJson = () => {
    try {
      setJsonOutput(formatJsonInput(jsonInput));
      setJsonFeedback({ kind: "success", message: "Valid JSON. Output formatted successfully." });
    } catch (error) {
      setJsonOutput("");
      setJsonFeedback({ kind: "error", message: error instanceof Error ? error.message : "Invalid JSON input." });
    }
  };

  const runBase64 = () => {
    try {
      setBase64Output(base64Mode === "encode" ? encodeBase64Utf8(base64Input) : decodeBase64Utf8(base64Input));
      setBase64Feedback({ kind: "success", message: base64Mode === "encode" ? "UTF-8 text encoded successfully." : "Base64 decoded successfully as UTF-8 text." });
    } catch {
      setBase64Output("");
      setBase64Feedback({ kind: "error", message: "Unable to decode this value. Check that it is valid Base64 containing UTF-8 text." });
    }
  };

  const runUrl = () => {
    try {
      setUrlOutput(urlMode === "encode" ? encodeUriComponent(urlInput) : decodeUriComponent(urlInput));
      setUrlFeedback({ kind: "success", message: urlMode === "encode" ? "Value URL-encoded successfully." : "Value URL-decoded successfully." });
    } catch {
      setUrlOutput("");
      setUrlFeedback({ kind: "error", message: "Invalid percent-encoded input. Check the escape sequences and try again." });
    }
  };

  const generateUuids = () => {
    const count = Number(uuidCount);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      setUuidOutput("");
      return;
    }
    setUuidOutput(generateUuids(count));
  };

  const decodeJwt = () => {
    try {
      const { header, payload } = decodeJwtToken(jwtInput);
      setJwtOutput(JSON.stringify({ header, payload }, null, 2));
      setJwtFeedback({ kind: "info", message: "Decoded locally. This does NOT verify the signature, issuer, audience, or token validity." });
    } catch (error) {
      setJwtOutput("");
      setJwtFeedback({ kind: "error", message: error instanceof Error ? error.message : "Unable to decode this JWT." });
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Link to="/explore" className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-cyan-300">
          <ArrowLeft className="h-4 w-4" /> All ecosystem pillars
        </Link>

        <section className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-slate-950 to-cyan-950/60 p-7 sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-400/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> Developer workspace · Browser-based
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Developer <span className="text-cyan-300">Studio</span></h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              A practical workbench for everyday development tasks. These utilities run locally in your browser; your input is not sent to an ETERNYX server.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-400">
              {["JSON", "Base64 · UTF-8", "URL encoding", "UUID v4", "JWT decoding"].map((item) => (
                <span key={item} className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5">{item}</span>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Workbench</p>
            <h2 className="mt-1 text-2xl font-bold">Choose a utility</h2>
          </div>
          <p className="text-xs text-slate-500">Client-side processing · No account required for these utilities</p>
        </div>

        <Card className="border-cyan-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-cyan-300" /> Container & Infrastructure Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Analyze Dockerfiles, Compose services, and Kubernetes manifests for common security and readiness issues.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/container-infrastructure" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">Open infrastructure workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-violet-300" /> Infrastructure as Code Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Review Terraform, Ansible, and Helm configurations for common security and deployment risks.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/infrastructure-as-code" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">Open IaC workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-cyan-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-300" /> Observability Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Review Prometheus scrape jobs, alert rules, and Grafana dashboard exports for reliability gaps.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/observability" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">Open observability workbench ↗</Link></CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-emerald-300" /> SRE Reliability Workbench</CardTitle>
            <CardDescription className="text-slate-400">Calculate SLOs and error budgets, and generate incident postmortems and operational runbooks.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/sre-reliability" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">Open SRE workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-300" /> CI/CD Pipeline Security Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Review GitHub Actions workflows for risky permissions, unpinned actions, pull-request attack paths, and secret exposure.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/cicd-security" className="text-sm font-medium text-rose-300 hover:text-rose-200">Open pipeline security workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-fuchsia-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-fuchsia-300" /> Software Supply Chain Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Inventory npm dependencies, generate CycloneDX SBOMs, and review lockfile drift, dependency sources, and install-time script risks.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/supply-chain" className="text-sm font-medium text-fuchsia-300 hover:text-fuchsia-200">Open supply chain workbench ↗</Link></CardContent>
        </Card>
        <Card className="border-cyan-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-cyan-300" /> Artifact Provenance & Release Trust</CardTitle>
            <CardDescription className="text-slate-400">Review release assets, SHA-256 digests, in-toto/SLSA-style provenance statements, and CycloneDX or SPDX SBOM structure.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/artifact-provenance" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">Open release trust workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-slate-900/60 text-white">
          <CardHeader><CardTitle className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-emerald-300" /> Database & SQL Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Review SQL scripts and PostgreSQL migrations for destructive operations, unsafe updates, privilege risks, and query-quality issues.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/database-sql" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">Open database workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-sky-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-sky-300" /> Supabase & PostgreSQL RLS Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Review Row-Level Security coverage, policy scope, permissive predicates, and anonymous or public grants.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/rls-security" className="text-sm font-medium text-sky-300 hover:text-sky-200">Open RLS security workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-slate-900/60 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-300" /> API Security & Threat Intelligence</CardTitle>
            <CardDescription className="text-slate-400">Review OpenAPI security requirements, JWT validation settings, CORS, HTTP security headers, rate limits, and authorization design with prioritized findings.</CardDescription>
          </CardHeader>
          <CardContent><Link to="/developer-studio/api-security" className="text-sm font-medium text-rose-300 hover:text-rose-200">Open API security workbench ↗</Link></CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-slate-900/60 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-violet-300"/> Web Application Security Review</CardTitle><CardDescription className="text-slate-400">Review response headers, CSP, cookie flags, CSRF/session settings, and security.txt with prioritized defensive guidance.</CardDescription></CardHeader><CardContent><Link to="/cybersecurity/web-security" className="text-sm font-medium text-violet-300 hover:text-violet-200">Open Cybersecurity Hub security review ↗</Link></CardContent></Card>
        <Tabs defaultValue="json" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-900 p-1 sm:grid-cols-5">
            <TabsTrigger value="json" className="gap-2 py-2"><Braces className="h-4 w-4" /><span>JSON</span></TabsTrigger>
            <TabsTrigger value="base64" className="gap-2 py-2"><FileCode2 className="h-4 w-4" /><span>Base64</span></TabsTrigger>
            <TabsTrigger value="url" className="gap-2 py-2"><Link2 className="h-4 w-4" /><span>URL</span></TabsTrigger>
            <TabsTrigger value="uuid" className="gap-2 py-2"><Fingerprint className="h-4 w-4" /><span>UUID</span></TabsTrigger>
            <TabsTrigger value="jwt" className="gap-2 py-2"><KeyRound className="h-4 w-4" /><span>JWT</span></TabsTrigger>
          </TabsList>

          <TabsContent value="json">
            <Card className="border-slate-800 bg-slate-900/70 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Braces className="h-5 w-5 text-cyan-300" /> JSON Formatter & Validator</CardTitle>
                <CardDescription className="text-slate-400">Parse JSON, report syntax errors, and produce readable two-space indentation.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="json-input">JSON input</Label>
                  <Textarea id="json-input" value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950/80 font-mono text-sm text-slate-100" placeholder='{"key":"value"}' />
                  <Button onClick={formatJson} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><WandSparkles className="mr-2 h-4 w-4" /> Validate & format</Button>
                  <FeedbackLine feedback={jsonFeedback} />
                </div>
                <Output label="Formatted JSON" value={jsonOutput} onCopy={() => void copyValue(jsonOutput)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="base64">
            <Card className="border-slate-800 bg-slate-900/70 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-cyan-300" /> Base64 Encoder & Decoder</CardTitle>
                <CardDescription className="text-slate-400">Encode and decode UTF-8 text, including non-English characters and emoji.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant={base64Mode === "encode" ? "default" : "outline"} onClick={() => { setBase64Mode("encode"); setBase64Feedback(null); }}>Encode</Button>
                    <Button variant={base64Mode === "decode" ? "default" : "outline"} onClick={() => { setBase64Mode("decode"); setBase64Feedback(null); }}>Decode</Button>
                  </div>
                  <Label htmlFor="base64-input">{base64Mode === "encode" ? "Text to encode" : "Base64 to decode"}</Label>
                  <Textarea id="base64-input" value={base64Input} onChange={(event) => setBase64Input(event.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950/80 font-mono text-sm text-slate-100" />
                  <Button onClick={runBase64} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><WandSparkles className="mr-2 h-4 w-4" /> {base64Mode === "encode" ? "Encode text" : "Decode Base64"}</Button>
                  <FeedbackLine feedback={base64Feedback} />
                </div>
                <Output label="Result" value={base64Output} onCopy={() => void copyValue(base64Output)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="url">
            <Card className="border-slate-800 bg-slate-900/70 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-cyan-300" /> URL Encoder & Decoder</CardTitle>
                <CardDescription className="text-slate-400">Encode or decode a URI component using the browser's standard JavaScript functions.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant={urlMode === "encode" ? "default" : "outline"} onClick={() => { setUrlMode("encode"); setUrlFeedback(null); }}>Encode</Button>
                    <Button variant={urlMode === "decode" ? "default" : "outline"} onClick={() => { setUrlMode("decode"); setUrlFeedback(null); }}>Decode</Button>
                  </div>
                  <Label htmlFor="url-input">{urlMode === "encode" ? "Text to encode" : "Encoded text to decode"}</Label>
                  <Textarea id="url-input" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950/80 font-mono text-sm text-slate-100" />
                  <Button onClick={runUrl} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><WandSparkles className="mr-2 h-4 w-4" /> {urlMode === "encode" ? "Encode value" : "Decode value"}</Button>
                  <FeedbackLine feedback={urlFeedback} />
                </div>
                <Output label="Result" value={urlOutput} onCopy={() => void copyValue(urlOutput)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="uuid">
            <Card className="border-slate-800 bg-slate-900/70 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-cyan-300" /> UUID v4 Generator</CardTitle>
                <CardDescription className="text-slate-400">Generate random version-4 UUIDs using the browser cryptographic random number generator.</CardDescription>
              </CardHeader>
              <CardContent className="max-w-2xl space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="uuid-count">Number of UUIDs (1–100)</Label>
                  <Input id="uuid-count" type="number" min="1" max="100" step="1" value={uuidCount} onChange={(event) => setUuidCount(event.target.value)} className="border-slate-700 bg-slate-950 text-white" />
                </div>
                <Button onClick={generateUuids} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><RefreshCw className="mr-2 h-4 w-4" /> Generate UUIDs</Button>
                <Output label="Generated UUIDs" value={uuidOutput} onCopy={() => void copyValue(uuidOutput)} />
                {(Number(uuidCount) < 1 || Number(uuidCount) > 100 || !Number.isInteger(Number(uuidCount))) && <p className="text-sm text-rose-300">Enter a whole number from 1 to 100.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jwt">
            <Card className="border-slate-800 bg-slate-900/70 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-cyan-300" /> JWT Decoder</CardTitle>
                <CardDescription className="text-slate-400">Inspect the header and payload of a JSON Web Token locally.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="jwt-input">JWT token</Label>
                  <Textarea id="jwt-input" value={jwtInput} onChange={(event) => setJwtInput(event.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950/80 font-mono text-sm text-slate-100" placeholder="header.payload.signature" />
                  <Button onClick={decodeJwt} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><KeyRound className="mr-2 h-4 w-4" /> Decode token</Button>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">
                    <ShieldAlert className="mr-1 inline h-4 w-4" /> Decoding is not verification. Never treat this output as proof that a token is authentic or safe.
                  </div>
                  <FeedbackLine feedback={jwtFeedback} />
                </div>
                <Output label="Decoded header & payload" value={jwtOutput} onCopy={() => void copyValue(jwtOutput)} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {copyFeedback && <p role="status" aria-live="polite" className="text-center text-sm text-emerald-300">{copyFeedback}</p>}

        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-950/40 to-violet-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Level up your workflow</p><h2 className="mt-1 text-xl font-semibold text-white">Explore Advanced Developer Tools</h2><p className="mt-1 text-sm text-slate-400">Markdown preview, JSON-to-CSV, HTML entities, timestamps, and line-by-line diff.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/advanced">Open advanced workbench <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-950/40 to-violet-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">API engineering</p><h2 className="mt-1 text-xl font-semibold text-white">API Engineering Workbench</h2><p className="mt-1 text-sm text-slate-400">Compose HTTP requests, inspect responses, measure latency, and export cURL commands.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/api-workbench">Open API workbench <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-950/40 to-violet-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Git · GitHub · Cloud deployment</p><h2 className="mt-1 text-xl font-semibold text-white">DevOps Launchpad</h2><p className="mt-1 text-sm text-slate-400">Build Git workflows, generate .gitignore files, and preflight Vercel or Netlify configuration.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/devops">Open DevOps Launchpad <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-950/40 to-violet-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Vercel · Netlify · Cloud engineering</p><h2 className="mt-1 text-xl font-semibold text-white">Deployment Intelligence</h2><p className="mt-1 text-sm text-slate-400">Audit project readiness, compare environment-variable names, and diagnose common deployment build failures.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/deployment-intelligence">Open Deployment Intelligence <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-950/40 to-cyan-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Live GitHub intelligence</p><h2 className="mt-1 text-xl font-semibold text-white">GitHub Integration Hub</h2><p className="mt-1 text-sm text-slate-400">Inspect public repository details, branches, recent commits, and Actions activity with live GitHub data.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/github-hub">Open GitHub Hub <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-950/40 to-cyan-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">GitHub collaboration</p><h2 className="mt-1 text-xl font-semibold text-white">Pull Requests & Issues Center</h2><p className="mt-1 text-sm text-slate-400">Review public repository queues, filter issues and pull requests, and inspect labels, authors, assignees, and activity.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/github-collaboration">Open Collaboration Center <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-950/40 to-cyan-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">GitHub change intelligence</p><h2 className="mt-1 text-xl font-semibold text-white">Branch & Commit Comparison</h2><p className="mt-1 text-sm text-slate-400">Compare public branches, inspect commits, review changed files, and measure additions and deletions.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/github-changes">Open Change Intelligence <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-950/40 to-violet-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">CI/CD intelligence</p><h2 className="mt-1 text-xl font-semibold text-white">GitHub Actions Intelligence</h2><p className="mt-1 text-sm text-slate-400">Monitor workflow runs, filter failures and branches, and inspect job and step outcomes with live GitHub data.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/github-actions">Open Actions Intelligence <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>


        <section className="rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-950/40 to-cyan-950/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Release engineering</p><h2 className="mt-1 text-xl font-semibold text-white">GitHub Release Intelligence</h2><p className="mt-1 text-sm text-slate-400">Explore releases, inspect notes and downloadable assets, track tags, and compare versions across public repositories.</p></div>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to="/developer-studio/github-releases">Open Release Intelligence <WandSparkles className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <h2 className="font-semibold">Privacy & security</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Browser-based utilities process pasted input locally. No tool in this workbench sends your text, manifests, lockfiles, or tokens to an ETERNYX backend. JWT decoding only reads the token's first two segments and does not validate its signature or claims. Avoid pasting production secrets into shared or public devices.
          </p>
        </section>
      </div>
    </div>
  );
}
