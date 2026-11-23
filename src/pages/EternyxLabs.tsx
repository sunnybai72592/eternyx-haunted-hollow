import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BookOpen, Braces, CheckCircle2, Code2, FileCode2,
  FlaskConical, Globe2, LockKeyhole, Play, RotateCcw, ShieldAlert, ShieldCheck,
  TerminalSquare, XCircle, Binary, Link2, FileKey2, ScanText, Hash,
  Network, Calculator, ShieldCheck as ShieldSettings, Cookie,
} from "lucide-react";
import {
  auditResponseHeaders, buildDomXssDocument, buildPlaygroundDocument,
  evaluateAccess, labCatalog, sampleHeaders, sqlQueryComparison,
} from "@/lib/eternyxLabs.mjs";
import BrowserSecurityToolkit from "@/components/labs/BrowserSecurityToolkit";
import BrowserSecurityFoundations from "@/components/labs/BrowserSecurityFoundations";

const startingHtml = '<main><h1>Hello, ETERNYX!</h1><p id="result">Build something real.</p><button id="hello">Run an interaction</button></main>';
const startingCss = 'body { background: #f8fafc; }\nh1 { color: #4f46e5; }\nbutton { padding: 12px; background: #111827; color: white; border: 0; border-radius: 8px; cursor: pointer; }';
const startingJs = "document.getElementById('hello').addEventListener('click', () => {\n  document.getElementById('result').textContent = 'JavaScript ran in the isolated preview.';\n});";
const startingPayload = '<img src=x onerror="this.insertAdjacentText(\'afterend\', \'Local event handler ran\')">';

const labIcons = {
  web: Code2,
  xss: ShieldAlert,
  headers: ShieldCheck,
  sql: Braces,
  access: LockKeyhole,
  codec: Binary,
  urls: Link2,
  jwt: FileKey2,
  redact: ScanText,
  sha: Hash,
  subnet: Network,
  chmod: Calculator,
  csp: ShieldSettings,
  cors: ShieldSettings,
  cookie: Cookie,
};
type LabId = keyof typeof labIcons;
type AccessRole = "viewer" | "editor" | "admin";
type AccessAction = "read" | "edit" | "delete";

const editorClass = "min-h-[150px] w-full resize-y rounded-xl border border-border/70 bg-background/80 p-3 font-mono text-xs leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const fieldClass = "w-full rounded-xl border border-border/70 bg-background/80 px-3 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const secondaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/80 px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function LabNotice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-primary/15 bg-primary/[0.05] p-3 text-sm leading-6 text-muted-foreground">{children}</p>;
}

export default function EternyxLabs() {
  const [selected, setSelected] = useState<LabId>("web");
  const [labSearch, setLabSearch] = useState("");
  const [html, setHtml] = useState(startingHtml);
  const [css, setCss] = useState(startingCss);
  const [js, setJs] = useState(startingJs);
  const [preview, setPreview] = useState(() => buildPlaygroundDocument({ html: startingHtml, css: startingCss, js: startingJs }));
  const [payload, setPayload] = useState(startingPayload);
  const [submittedPayload, setSubmittedPayload] = useState(startingPayload);
  const [headers, setHeaders] = useState(sampleHeaders);
  const [headerResult, setHeaderResult] = useState<ReturnType<typeof auditResponseHeaders> | null>(null);
  const [email, setEmail] = useState("user@example.com' OR '1'='1");
  const [role, setRole] = useState<AccessRole>("viewer");
  const [action, setAction] = useState<AccessAction>("delete");

  const current = useMemo(() => labCatalog.find((lab) => lab.id === selected)!, [selected]);
  const filteredLabs = useMemo(() => {
    const query = labSearch.trim().toLowerCase();
    return labCatalog.filter(lab => !query ||
      [lab.title,lab.area,lab.level,lab.description].some(value =>
        value.toLowerCase().includes(query)));
  }, [labSearch]);
  const sql = useMemo(() => sqlQueryComparison(email), [email]);
  const access = useMemo(() => evaluateAccess(role, action), [role, action]);

  const resetEditor = () => {
    setHtml(startingHtml);
    setCss(startingCss);
    setJs(startingJs);
    setPreview(buildPlaygroundDocument({ html: startingHtml, css: startingCss, js: startingJs }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-20 pt-3 sm:px-6 lg:px-8">
        <Link to="/explore" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to ecosystem
        </Link>

        <header className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-accent/[0.09] p-6 sm:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <FlaskConical className="h-4 w-4" /> ETERNYX Labs · Phase 1
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Learn it. Break it locally. Fix it properly.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Hands-on web development and security exercises. These fifteen workstations operate in your browser.
              They are not remote virtual machines, internet scanners, or proof of a vulnerability in a real target.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-lg border border-border bg-background/60 px-3 py-1.5">15 working exercises</span>
              <span className="rounded-lg border border-border bg-background/60 px-3 py-1.5">Browser-only execution</span>
              <span className="rounded-lg border border-border bg-background/60 px-3 py-1.5">No outside targets</span>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.12] via-card to-accent/[0.08] p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">New · Capture the flag</p>
              <h2 className="mt-2 text-2xl font-bold">ETERNYX CTF Challenge Rooms</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Hunt real flags in four interactive, intentionally vulnerable browser mini-apps.
                Explore source leaks, broken access control, DOM XSS and path traversal.
                Reveal hints, check answers and save local practice progress.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Browser-only starter CTF · no remote vulnerable server or trusted leaderboard</p>
            </div>
            <Link to="/labs/ctf" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Open CTF rooms <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-card/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Account-linked missions</p>
            <h2 className="mt-2 text-xl font-bold">Verified CTF Forensics</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Recover per-user flags from security casefiles. Verified progress is stored server-side, never inferred from browser storage. Requires deployed backend and sign-in.</p>
          </div>
          <Link to="/labs/verified" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 px-5 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10">Explore verified missions <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] to-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">New milestone · Local network-backed range</p>
            <h2 className="mt-2 text-xl font-bold">ETERNYX HTTP Cyber Range</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Three actual HTTP security challenges in a disposable, resource-limited Docker container:
              broken ticket authorization, path traversal, and spoofed role headers. Starts locally on your machine,
              not on ETERNYX hosting or Supabase.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Docker Desktop / local Docker required · no public deployment · 30-minute session</p>
          </div>
          <Link to="/labs/range" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
            Explore local cyber range <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-card/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">New · Account-linked session controls</p>
            <h2 className="mt-2 text-xl font-bold">My Cyber Range Sessions</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Check honest provider availability, view account-owned reservations and expiry, and request cleanup.
              Cloud lab launches are disabled until an isolated provider and secure ingress have been deployed and approved.
            </p>
          </div>
          <Link to="/labs/sessions" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10">
            Session dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(245px,290px)_minmax(0,1fr)]">
          <nav aria-label="Choose a practical lab" className="rounded-2xl border border-border/70 bg-card/70 p-3">
            <p className="px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Practical workstations</p>
            <label htmlFor="labs-workstation-search" className="sr-only">Search practical workstations</label>
            <input id="labs-workstation-search" type="search" value={labSearch}
              onChange={(event) => setLabSearch(event.target.value)}
              placeholder="Search 15 workstations…"
              className="mb-3 w-full rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {filteredLabs.map((lab) => {
                const Icon = labIcons[lab.id as LabId];
                return (
                  <button
                    key={lab.id}
                    type="button"
                    aria-pressed={selected === lab.id}
                    onClick={() => setSelected(lab.id as LabId)}
                    className={"flex min-h-[92px] w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                      (selected === lab.id ? "border-primary/40 bg-primary/[0.09]" : "border-transparent bg-background/30 hover:border-border hover:bg-background/70")}
                  >
                    <span className="rounded-lg border border-primary/15 bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-sm font-semibold">{lab.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{lab.area} · {lab.level}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {filteredLabs.length === 0 && <p role="status" className="p-3 text-sm text-muted-foreground">No matching workstation. Try another search term.</p>}
          </nav>

          <section aria-labelledby="lab-title" className="min-w-0 space-y-5 rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
            <div className="border-b border-border/60 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{current.area} · {current.level}</p>
              <h2 id="lab-title" className="mt-2 text-2xl font-bold">{current.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{current.description}</p>
            </div>

            {selected === "web" && (
              <div className="space-y-5">
                <LabNotice>
                  Edit the three files and select Run preview. HTML and JavaScript run inside an opaque-origin iframe. The preview policy blocks fetches, forms, and external subresources; browser navigation protections vary, so do not paste secrets or treat this as a virtual machine.
                </LabNotice>
                <div className="grid gap-4 xl:grid-cols-3">
                  <div><label htmlFor="lab-html" className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileCode2 className="h-4 w-4" /> HTML</label><textarea id="lab-html" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} className={editorClass} /></div>
                  <div><label htmlFor="lab-css" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Braces className="h-4 w-4" /> CSS</label><textarea id="lab-css" value={css} onChange={(event) => setCss(event.target.value)} spellCheck={false} className={editorClass} /></div>
                  <div><label htmlFor="lab-js" className="mb-2 flex items-center gap-2 text-sm font-semibold"><TerminalSquare className="h-4 w-4" /> JavaScript</label><textarea id="lab-js" value={js} onChange={(event) => setJs(event.target.value)} spellCheck={false} className={editorClass} /></div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className={buttonClass} type="button" onClick={() => setPreview(buildPlaygroundDocument({ html, css, js }))}><Play className="h-4 w-4" /> Run preview</button>
                  <button className={secondaryButtonClass} type="button" onClick={resetEditor}><RotateCcw className="h-4 w-4" /> Reset starter</button>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Restricted live preview</h3>
                  <iframe title="Isolated web development preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview} className="h-[330px] w-full rounded-xl border border-border bg-white" />
                </div>
              </div>
            )}

            {selected === "xss" && (
              <div className="space-y-5">
                <LabNotice>
                  This is a local DOM rendering exercise, not a vulnerable public site. Compare the exact same input when inserted as HTML versus inserted as text. Both previews are sandboxed and have no access to ETERNYX account cookies or APIs.
                </LabNotice>
                <label htmlFor="lab-payload" className="block text-sm font-semibold">Untrusted input to render</label>
                <textarea id="lab-payload" className={editorClass} rows={3} spellCheck={false} value={payload} onChange={(event) => setPayload(event.target.value)} />
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={buttonClass} onClick={() => setSubmittedPayload(payload)}><Play className="h-4 w-4" /> Compare rendering</button>
                  <button type="button" className={secondaryButtonClass} onClick={() => { setPayload(startingPayload); setSubmittedPayload(startingPayload); }}><RotateCcw className="h-4 w-4" /> Reset example</button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-destructive">Unsafe: element.innerHTML</h3>
                    <iframe title="Sandboxed unsafe DOM insertion demo" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={buildDomXssDocument(submittedPayload, true)} className="h-[170px] w-full rounded-xl border border-border bg-white" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-primary">Safer: element.textContent</h3>
                    <iframe title="Sandboxed safe DOM text demo" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={buildDomXssDocument(submittedPayload, false)} className="h-[170px] w-full rounded-xl border border-border bg-white" />
                  </div>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">Lesson: untrusted markup must not be sent to HTML-interpreting sinks. This demonstration is deliberately contained; never use active payloads against sites without permission.</p>
              </div>
            )}

            {selected === "headers" && (
              <div className="space-y-5">
                <LabNotice>
                  Paste the response headers from an application you own or have permission to inspect. No request is sent: the analysis reads only what you paste and does not verify a live server.
                </LabNotice>
                <label htmlFor="lab-headers" className="block text-sm font-semibold">HTTP response headers</label>
                <textarea id="lab-headers" value={headers} onChange={(event) => { setHeaders(event.target.value); setHeaderResult(null); }} rows={10} spellCheck={false} className={editorClass} />
                <button type="button" className={buttonClass} onClick={() => setHeaderResult(auditResponseHeaders(headers))}><ShieldCheck className="h-4 w-4" /> Analyze pasted headers</button>
                {headerResult && (
                  <div aria-live="polite" className="space-y-3">
                    {headerResult.error ? <p role="alert" className="text-sm text-destructive">{headerResult.error}</p> : (
                      <>
                        <p className="text-sm text-muted-foreground">Local configuration checks: {headerResult.checks.filter((check: { passed: boolean }) => check.passed).length} of {headerResult.checks.length} met. This is not a security certification.</p>
                        {headerResult.checks.map((check: { name: string; passed: boolean; detail: string }) => (
                          <div key={check.name} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/40 p-4">
                            {check.passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                            <div><h3 className="font-semibold">{check.name} · {check.passed ? "Present / meets rule" : "Review required"}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{check.detail}</p></div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {selected === "sql" && (
              <div className="space-y-5">
                <LabNotice>
                  This exercise shows the difference between string-built SQL and parameter binding. Neither query is executed, and no database is connected.
                </LabNotice>
                <label htmlFor="lab-email" className="block text-sm font-semibold">Untrusted email lookup input</label>
                <input id="lab-email" type="text" className={fieldClass} value={email} onChange={(event) => setEmail(event.target.value)} />
                <div className="space-y-4">
                  <div className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
                    <h3 className="mb-2 text-sm font-semibold text-destructive">Unsafe concatenation</h3>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6">{sql.concatenated}</pre>
                  </div>
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
                    <h3 className="mb-2 text-sm font-semibold text-primary">Parameterized PostgreSQL query</h3>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6">{sql.parameterized}</pre>
                    <p className="mt-2 text-xs text-muted-foreground">Bound value (data only):</p>
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6">{JSON.stringify(sql.values)}</pre>
                  </div>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">Lesson: parameters keep untrusted values separate from SQL syntax. Actual protection also requires proper server-side binding and authorization.</p>
              </div>
            )}

            {selected === "access" && (
              <div className="space-y-5">
                <LabNotice>
                  Run a deterministic least-privilege policy on a local training example. This is an authorization decision exercise, not a test of any deployed ETERNYX role or Supabase RLS policy.
                </LabNotice>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="lab-role" className="mb-2 block text-sm font-semibold">Subject role</label><select id="lab-role" className={fieldClass} value={role} onChange={(event) => setRole(event.target.value as AccessRole)}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Administrator</option></select></div>
                  <div><label htmlFor="lab-action" className="mb-2 block text-sm font-semibold">Requested action</label><select id="lab-action" className={fieldClass} value={action} onChange={(event) => setAction(event.target.value as AccessAction)}><option value="read">Read record</option><option value="edit">Edit record</option><option value="delete">Delete record</option></select></div>
                </div>
                <div aria-live="polite" className={"flex items-center gap-3 rounded-xl border p-5 " + (access.allowed ? "border-primary/30 bg-primary/[0.07]" : "border-destructive/30 bg-destructive/[0.06]")}>
                  {access.allowed ? <CheckCircle2 className="h-7 w-7 text-primary" /> : <XCircle className="h-7 w-7 text-destructive" />}
                  <div><h3 className="font-semibold">{access.allowed ? "Allow" : "Deny"}</h3><p className="mt-1 text-sm text-muted-foreground">{role} attempting to {action} a training record</p></div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                  <h3 className="text-sm font-semibold">Practice cases</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Try viewer + delete, editor + edit, and administrator + delete. Denying a request in this client-side demo is not a security boundary: real applications must enforce authorization on the server.</p>
                </div>
              </div>
            )}
            <BrowserSecurityToolkit selected={selected} />
            <BrowserSecurityFoundations selected={selected} />
          </section>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <Link to="/black-hat-pentesting" className="group rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <ShieldAlert className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Authorized pentesting</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Move from training into scoped, documented security engagements.</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open workbench <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link to="/developer-studio" className="group rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <Globe2 className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Developer Studio</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Continue with JSON, API, infrastructure, and development tools.</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open studio <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link to="/education" className="group rounded-2xl border border-border/70 bg-card/70 p-5 transition hover:border-primary/40">
            <BookOpen className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Education</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Continue with formal assessments alongside practical exercises.</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open education <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </section>

        <footer className="rounded-xl border border-border/70 bg-card/60 p-4 text-xs leading-6 text-muted-foreground">
          <strong className="text-foreground">Scope & privacy:</strong> These browser workstations run without a training VM or an external scanning endpoint. The preview iframes are deliberately sandboxed without same-origin access. Do not paste secrets or sensitive personal data; no verified cross-device progress, badges, or course certification is claimed.
        </footer>
      </div>
    </div>
  );
}
