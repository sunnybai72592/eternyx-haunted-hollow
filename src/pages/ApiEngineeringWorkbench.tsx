import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProjectApiSuitePanel from "@/components/developer/ProjectApiSuitePanel";
import { ArrowLeft, Copy, ExternalLink, Globe2, Play, ShieldAlert, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { buildCurlCommand } from "@/lib/apiWorkbenchUtils.mjs";
import { executeApiWorkbenchRequest, API_REQUEST_TIMEOUT_MS } from "@/lib/apiWorkbenchTransport.mjs";
import ApiWorkspacePanel from "@/components/developer/ApiWorkspacePanel";
import { API_HISTORY_STORAGE, normalizeApiHistory, recordApiHistory, resolveApiDraft, runApiAssertions } from "@/lib/apiWorkspaceUtils.mjs";

type ApiResult = {
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  headerDurationMs: number;
  headers: string;
  body: string;
  truncated: boolean;
};

const initialHistory = () => { try { return normalizeApiHistory(JSON.parse(localStorage.getItem(API_HISTORY_STORAGE) || "[]")); } catch { return []; } };

export default function ApiEngineeringWorkbench() {
  const [searchParams] = useSearchParams();
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://jsonplaceholder.typicode.com/todos/1");
  const [headers, setHeaders] = useState("Accept: application/json");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [curl, setCurl] = useState("");
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const [responseSignature, setResponseSignature] = useState("");
  const [curlSignature, setCurlSignature] = useState("");
  useEffect(() => () => activeRequest.current?.abort(), []);
  const [error, setError] = useState("");
  const [envText, setEnvText] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [expectations, setExpectations] = useState({ status: "200", maxDurationMs: "", jsonPath: "", equals: "" });

  useEffect(() => {
    try { localStorage.setItem(API_HISTORY_STORAGE, JSON.stringify(normalizeApiHistory(history))); }
    catch { /* Some browsers block storage; the current session remains usable. */ }
  }, [history]);

  const draft = { method, url, headers, body };
  // Session-only snapshot: never persisted, exported or logged.
  const draftSignature = JSON.stringify([method,url,headers,body,envText]);
  const responseStale = !!result && responseSignature !== draftSignature;
  const curlStale = !!curl && curlSignature !== draftSignature;
  const loadTemplate = (template: { method: string; url: string }) => {
    setMethod(template.method);
    setUrl(template.url);
    setHeaders("");
    setBody("");
    setResult(null);

    setCurl("");
    setError("");
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label + " copied.");
    } catch {
      toast.error("Clipboard access was blocked. Select the text and copy it manually.");
    }
  };

  const prepareCurl = () => {
    try {
      const request = resolveApiDraft(draft, envText);
      setCurl(buildCurlCommand({ url: request.url, method: request.method, headers: request.headers.map(([k, v]) => k + ": " + v).join("\n"), body: request.body }));
      setCurlSignature(draftSignature);
      setError("");
      toast.success("cURL command generated locally.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to validate this request.");
      setCurl("");
    }
  };

  const sendRequest = async () => {
    if (activeRequest.current) return;
    let request;
    try {
      request = resolveApiDraft(draft, envText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid request.");
      setResult(null);

      return;
    }

    if (!["GET","HEAD","OPTIONS"].includes(request.method) &&
        !window.confirm("Send " + request.method + " to " + new URL(request.url).origin +
          "? This may change data on the target service.")) return;
    setBusy(true);
    setError("");
    setResult(null);

    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, API_REQUEST_TIMEOUT_MS);
    try {
      const nextResult = await executeApiWorkbenchRequest(request, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setResponseSignature(draftSignature);
      setResult(nextResult);

      setHistory((current) => recordApiHistory(current, {
        url: request.url, method: request.method, status: nextResult.status,
        durationMs: nextResult.durationMs, at: new Date().toISOString(),
      }));
    } catch {
      setError(controller.signal.aborted
        ? timedOut ? "Request timed out after 30 seconds." : "Request cancelled."
        : "Request failed. The endpoint may be unreachable, redirecting, or blocked by browser CORS policy. Redirects are not followed.");
    } finally {
      window.clearTimeout(timeout);
      activeRequest.current = null;
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300">
          <ArrowLeft className="h-4 w-4" /> Developer Studio
        </Link>

        <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/70 via-slate-950 to-violet-950/60 p-7 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · API engineering</p>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">API <span className="text-cyan-300">Workbench</span></h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-300">Compose browser HTTP requests, save sanitized templates, use session-only environment values, and assert response status, latency, or JSON fields. Sending requires an explicit click.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">
            {["Request collections", "Session environments", "Request history", "Import/export", "Response assertions"].map((item) => <span key={item} className="rounded-full border border-slate-700 px-3 py-1.5">{item}</span>)}
          </div>
        </section>

        <ProjectApiSuitePanel initialProjectId={searchParams.get("projectId") || ""} draft={draft} />

        <ApiWorkspacePanel draft={draft} onLoad={loadTemplate} envText={envText} onEnvText={setEnvText}
          expectations={expectations} onExpectations={setExpectations}
          assertions={result && !responseStale ? runApiAssertions(result, expectations) : []} history={history} onClearHistory={() => setHistory([])} busy={busy} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="border-slate-800 bg-slate-900/70 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-cyan-300" /> Request composer</CardTitle>
              <CardDescription className="text-slate-400">Build and validate the request before sending it to the target endpoint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <div className="space-y-2"><Label htmlFor="api-method">Method</Label><select id="api-method" value={method} onChange={(event) => setMethod(event.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white">{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((item) => <option key={item}>{item}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="api-url">Request URL</Label><Input id="api-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://api.example.com/v1/resource" className="border-slate-700 bg-slate-950 text-white" /></div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-headers">Headers <span className="font-normal text-slate-500">(one per line: Name: value)</span></Label>
                <Textarea id="api-headers" value={headers} onChange={(event) => setHeaders(event.target.value)} spellCheck={false} className="min-h-28 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" placeholder={"Accept: application/json\nAuthorization: Bearer YOUR_TOKEN"} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-body">Request body</Label>
                <Textarea id="api-body" value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} disabled={["GET", "HEAD"].includes(method)} className="min-h-40 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100 disabled:opacity-40" placeholder={'{"name":"ETERNYX"}'} />
                {["GET", "HEAD"].includes(method) && <p className="text-xs text-slate-500">GET and HEAD requests do not accept a request body here.</p>}
              </div>

              {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={sendRequest} disabled={busy} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Play className="mr-2 h-4 w-4" />{busy ? "Sending..." : "Send request"}</Button>
                {busy && <Button variant="destructive" onClick={() => activeRequest.current?.abort()}>Cancel request</Button>}
                <Button variant="outline" onClick={prepareCurl}><TerminalSquare className="mr-2 h-4 w-4" />Generate cURL</Button>
              </div>
              {curl && <div className="space-y-2"><div className="flex items-center justify-between"><Label>cURL command</Label><Button size="sm" variant="outline" disabled={curlStale} onClick={() => { if (!curlStale) void copy(curl, "cURL command"); }}><Copy className="mr-2 h-4 w-4" />Copy</Button></div>{curlStale && <p role="status" className="text-xs text-amber-300">Request changed. Generate cURL again before copying.</p>}<Textarea readOnly value={curl} spellCheck={false} className="min-h-28 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></div>}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-cyan-300" /> Response inspector</CardTitle>
              <CardDescription className="text-slate-400">HTTP status, elapsed time, response headers, and formatted body.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {result ? <>
                {responseStale && <p role="status" className="text-sm text-amber-300">Request changed. This response is from the previous request; send again for current assertions.</p>}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3"><p className="text-xs text-slate-500">HTTP status</p><p className={`mt-1 text-xl font-semibold ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.status} <span className="text-xs">{result.statusText}</span></p></div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3"><p className="text-xs text-slate-500">Total duration</p><p className="mt-1 text-xl font-semibold text-cyan-300">{result.durationMs} ms</p><p className="text-xs text-slate-400">Headers: {result.headerDurationMs} ms</p></div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3"><p className="text-xs text-slate-500">Body limit</p><p className="mt-1 text-xl font-semibold text-white">1 MB</p></div>
                </div>
                <div className="space-y-2"><Label>Response headers</Label><Textarea readOnly value={result.headers} className="min-h-28 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" /></div>
                <div className="space-y-2"><div className="flex items-center justify-between"><Label>Response body</Label><Button size="sm" variant="outline" disabled={!result.body || responseStale} onClick={() => { if (!responseStale) void copy(result.body, "Response body"); }}><Copy className="mr-2 h-4 w-4" />Copy</Button></div><Textarea readOnly value={result.body || "(Empty response body)"} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100" />{result.truncated && <p className="text-xs text-amber-300">Response display was capped at 1 MB to protect browser memory.</p>}</div>
              </> : <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-center"><Globe2 className="h-10 w-10 text-slate-600" /><p className="mt-4 font-medium text-slate-300">Waiting for a request</p><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Send a request to inspect its response. Network access depends on endpoint availability and browser CORS policy.</p></div>}
            </CardContent>
          </Card>
        </div>

        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold text-amber-200"><ShieldAlert className="h-5 w-5" /> Security, privacy & browser limits</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
            <li>Requests are sent directly from your browser only when you choose Send. ETERNYX does not proxy them. Sanitized collections and origin-only response history are stored in this browser; environment values and full request/response content are not persisted by these new workspace features.</li>
            <li>Do not paste production secrets into shared devices. Authorization headers and request bodies are never saved to collections or history. Export files omit them. Temporary test tokens are preferable.</li>
            <li>Browser CORS policy may block requests even when an API works in a server-side client. Redirects are refused, referrer URLs are omitted, and write methods require confirmation. This tool cannot bypass CORS.</li>
            <li>Only HTTP and HTTPS URLs are accepted. Request timeout is 30 seconds and displayed response content is capped at 1 MB.</li>
            <li>Browser JavaScript cannot expose every restricted response header; the displayed headers are those made available by the endpoint and browser.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
