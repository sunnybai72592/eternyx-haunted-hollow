import { useEffect, useState } from "react";
import { Download, FolderOpen, History, ListChecks, Save, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  API_COLLECTION_STORAGE, MAX_API_TEMPLATES, exportApiCollections, importApiCollections,
  normalizeApiTemplates, sanitizeApiTemplate,
} from "@/lib/apiWorkspaceUtils.mjs";

type ApiDraft = { method: string; url: string; headers: string; body: string };
type ApiHistory = { method: string; origin: string; status: number; durationMs: number; at: string };
type ApiExpectation = { status: string; maxDurationMs: string; jsonPath: string; equals: string };
type ApiAssertion = { name: string; passed: boolean; detail: string };
type Template = { id: string; name: string; method: string; url: string };

type Props = {
  draft: ApiDraft;
  onLoad: (template: Template) => void;
  envText: string;
  onEnvText: (text: string) => void;
  expectations: ApiExpectation;
  onExpectations: (value: ApiExpectation) => void;
  assertions: ApiAssertion[];
  history: ApiHistory[];
  onClearHistory: () => void;
  busy: boolean;
};

function initialCollections(): Template[] {
  try { return normalizeApiTemplates(JSON.parse(localStorage.getItem(API_COLLECTION_STORAGE) || "[]")); }
  catch { return []; }
}

function downloadCollection(json: string) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "eternyx-api-collections-sanitized.json";
  a.click();
  URL.revokeObjectURL(href);
}

export default function ApiWorkspacePanel({
  draft, onLoad, envText, onEnvText, expectations, onExpectations, assertions, history, onClearHistory, busy,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialCollections);
  const [collectionName, setCollectionName] = useState("");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(API_COLLECTION_STORAGE, JSON.stringify(normalizeApiTemplates(templates))); }
    catch { /* Browser storage may be disabled; in-memory editing still works. */ }
  }, [templates]);

  const feedback = (text: string, error = false) => { setMessage(text); setMessageError(error); };
  const saveTemplate = () => {
    try {
      if (templates.length >= MAX_API_TEMPLATES) throw new Error("Collection limit reached (30 requests).");
      const item = sanitizeApiTemplate({ id: crypto.randomUUID(), name: collectionName, method: draft.method, url: draft.url });
      setTemplates((items) => [...items, item]);
      setCollectionName("");
      feedback("Saved URL path and method only. Query, headers and body were not saved.");
    } catch (cause) { feedback(cause instanceof Error ? cause.message : "Unable to save request.", true); }
  };
  const importTemplates = () => {
    try {
      const received = importApiCollections(importText);
      if (templates.length + received.length > MAX_API_TEMPLATES) throw new Error("Import would exceed 30 saved requests.");
      setTemplates((current) => [...current, ...received.map((item) => ({ ...item, id: crypto.randomUUID() }))]);
      setImportText("");
      feedback("Imported " + received.length + " sanitized request templates. No headers, bodies or credentials imported.");
    } catch (cause) { feedback(cause instanceof Error ? cause.message : "Unable to import.", true); }
  };
  const setExpectation = (key: keyof ApiExpectation, value: string) => onExpectations({ ...expectations, [key]: value });
  const inputClass = "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5 text-cyan-300" />Saved API collections</CardTitle>
          <CardDescription className="text-slate-400">Reusable request names, methods and safe URL paths only. No query strings, headers, bodies, or secrets are persisted.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-48 flex-1"><Label htmlFor="api-collection-name">Request name</Label>
              <Input id="api-collection-name" value={collectionName} maxLength={80} onChange={(e) => setCollectionName(e.target.value)} placeholder="List projects" className={inputClass} /></div>
            <Button className="self-end" onClick={saveTemplate} disabled={busy || templates.length >= MAX_API_TEMPLATES}><Save className="mr-2 h-4 w-4" />Save template</Button>
          </div>
          <p className="text-xs text-slate-500">{templates.length} / {MAX_API_TEMPLATES} saved on this browser. Do not put secrets in URL paths or template names.</p>
          <div className="max-h-72 space-y-2 overflow-auto" aria-label="Saved API templates">
            {templates.length ? templates.map((item) => <div key={item.id} className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-700 p-3">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-400">{item.method} {item.url}</p></div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { onLoad(item); feedback("Loaded method and URL; enter headers and body manually."); }}>Load</Button>
              <Button size="icon" variant="ghost" disabled={busy} aria-label={"Delete " + item.name} onClick={() => setTemplates((items) => items.filter((entry) => entry.id !== item.id))}>
                <Trash2 className="h-4 w-4" /></Button>
            </div>) : <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">No saved requests yet.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!templates.length} onClick={() => downloadCollection(exportApiCollections(templates))}>
              <Download className="mr-2 h-4 w-4" />Export sanitized JSON</Button>
          </div>
          <div className="space-y-2"><Label htmlFor="api-collection-import">Import ETERNYX collection JSON</Label>
            <Textarea id="api-collection-import" value={importText} onChange={(e) => setImportText(e.target.value.slice(0, 100_001))}
              className="min-h-24 border-slate-700 bg-slate-950 font-mono text-xs" placeholder='{"schema":"eternyx-api-collections-v1","requests":[]}' />
            <Button size="sm" variant="outline" disabled={!importText.trim() || busy} onClick={importTemplates}><UploadCloud className="mr-2 h-4 w-4" />Import collection</Button></div>
          {message && <p role={messageError ? "alert" : "status"} className={"text-sm " + (messageError ? "text-rose-300" : "text-emerald-300")}>{message}</p>}
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle>Environment variables</CardTitle>
          <CardDescription className="text-slate-400">Substitute {"{{baseUrl}}"} or {"{{token}}"} in URL, headers or body when sending. Values remain in memory for this page visit only.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="api-env-variables">Variables (one NAME=value per line)</Label>
          <Textarea id="api-env-variables" spellCheck={false} autoComplete="off" value={envText}
            onChange={(e) => onEnvText(e.target.value.slice(0, 8192))}
            placeholder={"baseUrl=https://api.example.com\nversion=v1"}
            className="min-h-40 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" />
          <p className="text-xs leading-5 text-amber-200">Never paste production credentials. Variables are not stored, exported, or added to request history. Use temporary tokens on trusted devices. The resolved request is sent to the target domain when you press Send.</p>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-cyan-300" />Response assertions</CardTitle>
          <CardDescription className="text-slate-400">Check the actual response immediately after Send. Local validations only; no background monitoring or scheduled tests.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="api-expected-status">Expected HTTP status</Label><Input id="api-expected-status" inputMode="numeric" placeholder="200" value={expectations.status} onChange={(e) => setExpectation("status", e.target.value)} className={inputClass}/></div>
            <div><Label htmlFor="api-expected-latency">Maximum latency (ms)</Label><Input id="api-expected-latency" inputMode="numeric" placeholder="1500" value={expectations.maxDurationMs} onChange={(e) => setExpectation("maxDurationMs", e.target.value)} className={inputClass}/></div>
            <div><Label htmlFor="api-json-path">JSON dotted path</Label><Input id="api-json-path" placeholder="data.id" value={expectations.jsonPath} onChange={(e) => setExpectation("jsonPath", e.target.value)} className={inputClass}/></div>
            <div><Label htmlFor="api-json-value">Expected JSON value</Label><Input id="api-json-value" placeholder="1" value={expectations.equals} onChange={(e) => setExpectation("equals", e.target.value)} className={inputClass}/></div>
          </div>
          <p className="text-xs text-slate-500">Empty fields skip that check. JSON paths require exact matches; arrays use numeric segments such as data.0.id. Assertions are not saved.</p>
          {assertions.length > 0 && <div role="status" aria-live="polite" className="space-y-2">{assertions.map((assertion) =>
            <div key={assertion.name} className={"rounded-lg border p-3 text-sm " + (assertion.passed ? "border-emerald-500/30 text-emerald-200" : "border-rose-500/30 text-rose-200")}>
              <strong>{assertion.passed ? "PASS" : "FAIL"} — {assertion.name}</strong><p className="mt-1 break-words text-xs">{assertion.detail}</p>
            </div>)}</div>}
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/70 text-white">
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-cyan-300" />Request history</CardTitle>
          <CardDescription className="text-slate-400">Recent HTTP status and timing, with origin only. Paths, query strings, headers, request/response bodies and tokens are excluded.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between gap-2"><p className="text-xs text-slate-400">{history.length} recorded requests</p>
            <Button size="sm" variant="ghost" disabled={!history.length || busy} onClick={onClearHistory}>Clear history</Button></div>
          <div className="max-h-80 space-y-2 overflow-auto" aria-label="API response history">
            {history.length ? history.map((item, index) => <div key={item.at + index} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-700 p-3 text-sm">
              <div><p className="font-mono text-xs text-cyan-300">{item.method} {item.origin}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(item.at).toLocaleString()}</p></div>
              <span className={item.status < 400 ? "text-emerald-300" : "text-amber-300"}>{item.status} · {item.durationMs} ms</span>
            </div>) : <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">Send a request to populate local history.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
