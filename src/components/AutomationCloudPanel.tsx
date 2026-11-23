import { useEffect, useRef, useState } from "react";
import AutomationWebhookPanel from "@/components/AutomationWebhookPanel";
import AutomationSchedulePanel from "@/components/AutomationSchedulePanel";
import AutomationGitHubReadPanel from "@/components/AutomationGitHubReadPanel";
import AutomationGitHubIssuesPanel from "@/components/AutomationGitHubIssuesPanel";
import AutomationWorkflowPolicyPanel from "@/components/AutomationWorkflowPolicyPanel";
import AutomationOperationsPanel from "@/components/AutomationOperationsPanel";
import AutomationAuditRecoveryPanel from "@/components/AutomationAuditRecoveryPanel";
import AutomationIncidentCenter from "@/components/AutomationIncidentCenter";
import AutomationIncidentEvidencePanel from "@/components/AutomationIncidentEvidencePanel";
import AutomationInvestigationPlanPanel from "@/components/AutomationInvestigationPlanPanel";
import AutomationClosureGovernancePanel from "@/components/AutomationClosureGovernancePanel";
import AutomationReopenGovernancePanel from "@/components/AutomationReopenGovernancePanel";
import AutomationLifecycleReadinessPanel from "@/components/AutomationLifecycleReadinessPanel";
import AutomationCaseCoveragePanel from "@/components/AutomationCaseCoveragePanel";
import AutomationAuditPackagePanel from "@/components/AutomationAuditPackagePanel";
import AutomationTemplateGallery from "@/components/AutomationTemplateGallery";
import { Archive, Cloud, CloudOff, LockKeyhole, PauseCircle, Play, RefreshCcw, Save, Trash2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeWorkflowSteps } from "@/lib/automationWorkflow.mjs";
import { automationControlFailure, shouldInvalidateAutomationCloud, verifyAutomationRunHistory } from "@/lib/automationCloudStatus.mjs";

type Step = {
  id: string; kind: string; value?: string; replacement?: string; caseSensitive?: boolean;
};
type SavedWorkflow = {
  id: string; name: string; steps: Step[]; revision: number; active: boolean;
  trigger_kind: "manual"; updated_at: string;
};
type SavedRun = {
  id: string; workflow_id: string | null; workflow_revision: number; status: "completed";
  trigger_type?: "manual" | "webhook" | "scheduled"; webhook_trigger_id?: string | null; schedule_id?: string | null;
  input_lines: number; output_lines: number; input_characters: number; output_characters: number;
  trace: Array<{ id: string; kind: string; changed: boolean }>; created_at: string;
};
type CloudResult = {
  runId: string; output: string; outputLines: number; createdAt: string;
  replayed: boolean; trace: Array<{ id: string; label: string; beforeLines: number; afterLines: number; changed: boolean }>;
};
type CloudReply = Record<string, unknown>;

async function callAutomation(action: string, args: Record<string, unknown> = {}): Promise<CloudReply> {
  const { data, error } = await supabase.functions.invoke("automation-control", { body: { action, ...args } });
  if (error) {
    const context = error.context as Response | undefined;
    const status = typeof context?.status === "number" ? context.status : null;
    const failure = automationControlFailure(action, status);
    // Do not surface server bodies: they can contain private data or credentials.
    const result = new Error(failure.message) as Error & { cloudKind?: string };
    result.cloudKind = failure.kind;
    throw result;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid Automation response.");
  return data as CloudReply;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readWorkflows(raw: unknown): SavedWorkflow[] {
  if (!Array.isArray(raw)) throw new Error("Invalid saved workflow list.");
  return raw.map((value: unknown) => {
    if (!isRecord(value) || typeof value.id !== "string" ||
        typeof value.name !== "string" || typeof value.revision !== "number" ||
        typeof value.active !== "boolean" || value.trigger_kind !== "manual" ||
        typeof value.updated_at !== "string") {
      throw new Error("Invalid saved workflow record.");
    }
    return { ...value, steps: normalizeWorkflowSteps(value.steps) } as SavedWorkflow;
  });
}
function readHistory(raw: unknown): SavedRun[] {
  // Reject instead of silently hiding malformed or privacy-unsafe records.
  return verifyAutomationRunHistory(raw) as SavedRun[];
}

export default function AutomationCloudPanel({
  steps, input, onLoadSteps,
}: { steps: Step[]; input: string; onLoadSteps: (steps: Step[]) => void }) {
  const userId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [name, setName] = useState("My automation");
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [history, setHistory] = useState<SavedRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [output, setOutput] = useState<CloudResult | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    output:string; outputLines:number; revision:number;
    trace:CloudResult["trace"]; replayed:boolean; previewedAt:string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"unchecked" | "available" | "unavailable" | "sign_in_required">("unchecked");
  const ownerRef = useRef(userId);
  // Assign during render: old async replies cannot win the next account render.
  ownerRef.current = userId;
  // Preserve a request key across transport failures for safe user-initiated retries.
  const pendingRun = useRef<{ signature: string; key: string } | null>(null);
  const pendingPreview = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    setWorkflows([]); setHistory([]); setSelectedId(null);
    setOutput(null); setPreviewResult(null); setError(""); setNotice(""); setLoaded(false);
    setBackendStatus("unchecked"); setBusy(false);
    pendingRun.current = null; pendingPreview.current = null;
  }, [userId]);

  const selected = workflows.find((item) => item.id === selectedId);
  let unchanged = false;
  try {
    unchanged = !!selected && JSON.stringify(normalizeWorkflowSteps(steps)) ===
      JSON.stringify(normalizeWorkflowSteps(selected.steps)) && name.trim() === selected.name;
  } catch { unchanged = false; }

  async function manage(task: () => Promise<void>) {
    if (!userId || busy) return;
    const owner = userId;
    setBusy(true); setError(""); setNotice("");
    try { await task(); }
    catch (cause) {
      if (ownerRef.current !== owner) return;
      const kind = cause instanceof Error && "cloudKind" in cause
        ? (cause as Error & { cloudKind?: string }).cloudKind : undefined;
      if (kind && shouldInvalidateAutomationCloud(kind)) {
        setLoaded(false); setWorkflows([]); setHistory([]); setSelectedId(null);
        setOutput(null); setPreviewResult(null);
        pendingRun.current = null; pendingPreview.current = null;
        setBackendStatus(kind === "sign_in_required" ? "sign_in_required" : "unavailable");
      }
      setError(cause instanceof Error ? cause.message : "Automation cloud request failed.");
    }
    finally { if (ownerRef.current === owner) setBusy(false); }
  }
  async function refresh() {
    const owner = userId;
    const response = await callAutomation("list");
    if (ownerRef.current !== owner) throw Error("Automation account changed; retry the request.");
    if (response.source !== "authenticated_server") throw new Error("The server could not verify the workflow list.");
    const verified=readWorkflows(response.workflows);
    setWorkflows(verified);
    setBackendStatus("available");
    setLoaded(true);
    return verified;
  }
  function select(workflow: SavedWorkflow) {
    pendingRun.current = null; pendingPreview.current = null;
    setSelectedId(workflow.id);
    setName(workflow.name);
    onLoadSteps(workflow.steps);
    setOutput(null); setPreviewResult(null); setError(""); setNotice("Saved workflow loaded into the editor.");
  }
  function clearSelection() {
    pendingRun.current = null; pendingPreview.current = null;
    setSelectedId(null); setName("My automation"); setOutput(null); setPreviewResult(null);
  }

  return <section aria-labelledby="automation-cloud-title" className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
    <div className="flex items-center gap-3"><Cloud className="size-5 text-primary" /><h3 id="automation-cloud-title" className="text-xl font-semibold">Authenticated manual runs & history</h3></div>
    <p className="text-sm leading-6 text-muted-foreground">
      Save named workflows to your ETERNYX account and run their stored steps on the server on demand.
      Only execution counts and operation traces are stored; your input and output text are never persisted to the run-history table.
      Cloud runs use existing backend resources, so hosting/compute usage may have a cost.
    </p>
    <p role="status" aria-live="polite" className="rounded-lg border border-border/70 bg-background/60 p-3 text-xs leading-6 text-muted-foreground">
      <strong>Cloud manual API:</strong>{" "}
      {backendStatus === "available" ? "Verified for this account by a real workflow-list response. Other integrations and migrations are not verified." :
        backendStatus === "unavailable" ? "Unavailable or unreachable. Existing cloud records cannot be assumed current; use the local runner above until repaired." :
        backendStatus === "sign_in_required" ? "Your session was rejected. Sign in again before using cloud actions." :
        "Not checked for this session. Select Check cloud & load workflows to verify the actual backend. Local execution above works without it."}
    </p>
    <p className="rounded-lg border border-border/70 bg-background/60 p-3 text-xs leading-6 text-muted-foreground">
      <strong>Permission boundaries:</strong> Manual runs require your action. Signed webhooks, scheduled runs and GitHub integrations are separately configured below; GitHub issue writes additionally require owner approval. Workflow templates only copy deterministic text steps. Maximum 20 saved workflows and 30 recorded cloud runs per 24 hours.
    </p>
    {!isAuthenticated || !userId ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" /> Sign in to use account-owned workflows. Local Automation above still works without an account.</p> :
      <>
        <AutomationTemplateGallery key={userId} disabled={busy}
          onInstalled={async(workflowId)=>{
            const list=await refresh();
            const installed=list.find(w=>w.id===workflowId);
            if(!installed)throw Error("Installed workflow is not listed on this account.");
            select(installed);
          }}/>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-sm">Workflow name
            <Input className="mt-1" maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setOutput(null); }} />
          </label>
          <Button disabled={busy} type="button" variant="outline" onClick={() => manage(async () => { await refresh(); setNotice("Account workflows refreshed."); })}><RefreshCcw className="mr-2 size-4" /> Check cloud & load workflows</Button>
          <Button disabled={busy || !steps.length || !name.trim() || name.trim().length > 80} type="button"
            onClick={() => manage(async () => {
              const response = await callAutomation("save", { name, steps, ...(selectedId ? { workflowId: selectedId } : {}) });
              if (response.ok !== true || typeof response.workflow_id !== "string") throw new Error("Workflow was not saved.");
              const id = response.workflow_id;
              await refresh(); if (ownerRef.current !== userId) return;
              setSelectedId(id); setOutput(null);
              setNotice("Saved on the server. Choose Run saved workflow to execute.");
            })}><Save className="mr-2 size-4" /> {selectedId ? "Save changes" : "Save new workflow"}</Button>
        </div>
        {loaded && <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{workflows.length} saved workflows on this account</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" variant={!selectedId ? "default" : "outline"} onClick={clearSelection}>New workflow</Button>
            {workflows.map((workflow) => <Button key={workflow.id} size="sm" type="button"
              variant={workflow.id === selectedId ? "default" : "outline"} onClick={() => select(workflow)}>
              {workflow.name}{!workflow.active ? " (paused)" : ""}
            </Button>)}
          </div>
        </div>}
        {selected && <div className="space-y-3 rounded-xl border border-border/70 bg-background/50 p-4">
          <p className="text-sm">Saved revision <strong>{selected.revision}</strong> · <strong>{selected.active ? "Active for manual runs" : "Paused"}</strong></p>
          {!unchanged && <p role="status" className="text-xs text-amber-600 dark:text-amber-300">Local steps or name differ from the saved workflow. Save changes before running on the server.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline"
              disabled={busy || !selected.active || !unchanged ||
                new TextEncoder().encode(input).byteLength>2000}
              onClick={()=>manage(async()=>{
                const signature=JSON.stringify([selected.id,selected.revision,input]);
                const requestKey=pendingPreview.current?.signature===signature
                  ?pendingPreview.current.key:crypto.randomUUID();
                pendingPreview.current={signature,key:requestKey};
                const response=await callAutomation("previewWorkflow",{
                  workflowId:selected.id,input,requestKey,
                });
                if (ownerRef.current !== userId) return;
                if(response.source!=="authenticated_preview"||response.executed!==false||
                   response.cloudRunRecorded!==false||
                   response.externalActionTriggered!==false||
                   response.rawOutputStored!==false||
                   typeof response.output!=="string"||
                   typeof response.revision!=="number"||
                   !Array.isArray(response.trace)){
                  throw Error("Preview was not verified as side-effect free.");
                }
                if(response.revision!==selected.revision)throw Error("Saved workflow changed; reload it.");
                pendingPreview.current=null;
                setPreviewResult(response as unknown as {
                  output:string;outputLines:number;revision:number;
                  trace:CloudResult["trace"];replayed:boolean;previewedAt:string;
                });
                setNotice("Verified server-side preview. No recorded run, webhook, schedule or GitHub write was started.");
              })}><FlaskConical className="mr-2 size-4"/> Preview safely (20/day)</Button>
            <Button type="button" disabled={busy || !selected.active || !unchanged || input.length > 12000}
              onClick={() => manage(async () => {
                const signature = JSON.stringify([selected.id, selected.revision, input]);
                const requestKey = pendingRun.current?.signature === signature
                  ? pendingRun.current.key : crypto.randomUUID();
                pendingRun.current = { signature, key: requestKey };
                const response = await callAutomation("run", {
                  workflowId: selected.id, input, requestKey,
                });
                if (ownerRef.current !== userId) return;
                if (response.source !== "authenticated_server" || typeof response.output !== "string" ||
                    typeof response.runId !== "string" || !Array.isArray(response.trace)) throw new Error("Invalid cloud run result.");
                pendingRun.current = null;
                setOutput(response as unknown as CloudResult);
                setNotice("Executed against the saved server-side workflow. Raw output is available only in this response.");
              })}><Play className="mr-2 size-4" /> Run saved workflow</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => manage(async () => {
              const response = await callAutomation("toggle", { workflowId: selected.id, active: !selected.active });
              if (ownerRef.current !== userId) return;
              if (response.ok !== true) throw new Error("Could not update workflow state.");
              await refresh(); if (ownerRef.current !== userId) return;
              setNotice(selected.active ? "Workflow paused." : "Workflow enabled for manual runs.");
            })}><PauseCircle className="mr-2 size-4" /> {selected.active ? "Pause" : "Resume"}</Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => {
              if (!window.confirm("Delete this saved workflow? Existing run metadata will remain in your account.")) return;
              void manage(async () => {
                const response = await callAutomation("delete", { workflowId: selected.id });
                if (ownerRef.current !== userId) return;
                if (response.ok !== true) throw new Error("Workflow was not deleted.");
                clearSelection(); await refresh(); if (ownerRef.current !== userId) return;
                setNotice("Saved workflow deleted.");
              });
            }}><Trash2 className="mr-2 size-4" /> Delete</Button>
          </div>
          {input.length > 12000 && <p className="text-xs text-muted-foreground">Cloud input limit: 12,000 characters. The local runner supports larger inputs.</p>}
          {new TextEncoder().encode(input).byteLength>2000 && <p className="text-xs text-muted-foreground">
            Private server preview limit: 2,000 UTF-8 input bytes. Use manual execution for larger payloads.
          </p>}
        </div>}
        {previewResult&&<div className="space-y-2 rounded-xl border border-primary/20 p-4">
          <h4 className="text-sm font-semibold">Actual saved workflow preview · {previewResult.outputLines} lines</h4>
          <p className="text-xs text-muted-foreground">
            Saved revision {previewResult.revision}. Preview receipt at {formatDate(previewResult.previewedAt)}.
            No cloud run was recorded and no external trigger or write was activated.
          </p>
          <Textarea readOnly rows={6} className="font-mono text-xs" value={previewResult.output}/>
          <p className="text-xs text-muted-foreground">
            {previewResult.trace.length} deterministic steps tested.
            Raw preview inputs/outputs are not stored in audit metadata.
          </p>
        </div>}
        {output && <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
          <h4 className="font-semibold">Server-computed output · {output.outputLines} lines</h4>
          <p className="text-xs text-muted-foreground">Run ID: <code className="break-all">{output.runId}</code> · {formatDate(output.createdAt)}</p>
          <Textarea readOnly rows={7} className="font-mono text-xs" value={output.output} />
          <ol className="space-y-1 text-xs text-muted-foreground">
            {output.trace.map((entry, index) => <li key={entry.id}>{index + 1}. {entry.label}: {entry.beforeLines} → {entry.afterLines} lines · {entry.changed ? "changed" : "unchanged"}</li>)}
          </ol>
        </div>}
        <div className="space-y-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => manage(async () => {
            const result = await callAutomation("history");
            if (ownerRef.current !== userId) return;
            if (result.source !== "authenticated_server" || result.rawInputsStored !== false || result.rawOutputsStored !== false) throw new Error("Invalid run-history response.");
            setHistory(readHistory(result.runs)); setNotice("Loaded the 20 most recent authenticated runs.");
          })}><Archive className="mr-2 size-4" /> Load run history</Button>
          {history.length > 0 && <ol className="space-y-2">
            {history.map((item) => <li key={item.id} className="rounded-lg border border-border/70 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-foreground">{item.trigger_type === "webhook" ? "Signed webhook" : item.trigger_type === "scheduled" ? "Scheduled run" : "Manual run"} · Completed · {item.input_lines} → {item.output_lines} lines</span><span>{formatDate(item.created_at)}</span></div>
              <span>Run {item.id} · {item.trace.length} recorded steps · No input/output text saved</span>
            </li>)}
          </ol>}
        </div>
        {selected&&<AutomationWorkflowPolicyPanel key={userId+":"+selected.id} workflowId={selected.id} revision={selected.revision} input={input} />}
        {loaded&&<AutomationOperationsPanel key={userId} disabled={busy}
          workflows={workflows.map(w=>({
            id:w.id,name:w.name,revision:w.revision,active:w.active,
          }))}
          refresh={refresh}/>}
        {loaded&&<AutomationAuditRecoveryPanel key={userId}
          disabled={busy} workflows={workflows.map(w=>({
            id:w.id,name:w.name,revision:w.revision,active:w.active,
          }))}/>}
        {loaded&&<AutomationIncidentCenter key={userId}
          disabled={busy} workflows={workflows.map(w=>({
            id:w.id,name:w.name,revision:w.revision,active:w.active,
          }))}/>}
        {loaded&&<AutomationIncidentEvidencePanel key={userId} disabled={busy}/>}
        {loaded&&<AutomationInvestigationPlanPanel key={userId} disabled={busy}/>}
        {loaded&&<AutomationClosureGovernancePanel key={userId} disabled={busy}/>}
        {loaded&&<AutomationReopenGovernancePanel key={userId} disabled={busy}/>}
        {loaded&&<AutomationLifecycleReadinessPanel key={userId} disabled={busy}/>}
        {loaded&&<AutomationCaseCoveragePanel key={userId} disabled={busy}/>}
        {loaded&&<AutomationAuditPackagePanel key={userId} disabled={busy}/>}
        <AutomationWebhookPanel selectedWorkflowId={selectedId} />
        <AutomationGitHubReadPanel />
        <AutomationGitHubIssuesPanel />
        <AutomationSchedulePanel selectedWorkflowId={selectedId} currentInput={input}
          scheduledRuns={history.filter((item) => item.trigger_type === "scheduled")} />
        {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><CloudOff className="mr-2 inline size-4" /> {error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      </>}
  </section>;
}
