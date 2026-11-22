import { useEffect, useRef, useState } from "react";
import AutomationWebhookPanel from "@/components/AutomationWebhookPanel";
import AutomationSchedulePanel from "@/components/AutomationSchedulePanel";
import AutomationGitHubReadPanel from "@/components/AutomationGitHubReadPanel";
import AutomationGitHubIssuesPanel from "@/components/AutomationGitHubIssuesPanel";
import { Archive, Cloud, CloudOff, LockKeyhole, PauseCircle, Play, RefreshCcw, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeWorkflowSteps } from "@/lib/automationWorkflow.mjs";

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
    let message = "Cloud automation is unavailable. Deploy the database migration and Edge Function first.";
    try {
      const response = error.context as Response;
      if (response && typeof response.json === "function") {
        const detail = await response.json();
        if (typeof detail?.error === "string" && detail.error.length <= 200) message = detail.error;
      }
    } catch { /* No trusted response payload */ }
    throw new Error(message);
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
  if (!Array.isArray(raw)) throw new Error("Invalid execution history.");
  return raw.filter((value: unknown): value is SavedRun =>
    isRecord(value) && typeof value.id === "string" &&
    typeof value.created_at === "string" && value.status === "completed" &&
    typeof value.output_lines === "number" && Array.isArray(value.trace));
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Preserve a request key across transport failures for safe user-initiated retries.
  const pendingRun = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    setWorkflows([]); setHistory([]); setSelectedId(null);
    setOutput(null); setError(""); setNotice(""); setLoaded(false);
    pendingRun.current = null;
  }, [userId]);

  const selected = workflows.find((item) => item.id === selectedId);
  let unchanged = false;
  try {
    unchanged = !!selected && JSON.stringify(normalizeWorkflowSteps(steps)) ===
      JSON.stringify(normalizeWorkflowSteps(selected.steps)) && name.trim() === selected.name;
  } catch { unchanged = false; }

  async function manage(task: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Automation cloud request failed."); }
    finally { setBusy(false); }
  }
  async function refresh() {
    const response = await callAutomation("list");
    if (response.source !== "authenticated_server") throw new Error("The server could not verify the workflow list.");
    setWorkflows(readWorkflows(response.workflows));
    setLoaded(true);
  }
  function select(workflow: SavedWorkflow) {
    setSelectedId(workflow.id);
    setName(workflow.name);
    onLoadSteps(workflow.steps);
    setOutput(null); setError(""); setNotice("Saved workflow loaded into the editor.");
  }
  function clearSelection() {
    setSelectedId(null); setName("My automation"); setOutput(null);
  }

  return <section aria-labelledby="automation-cloud-title" className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6">
    <div className="flex items-center gap-3"><Cloud className="size-5 text-primary" /><h3 id="automation-cloud-title" className="text-xl font-semibold">Authenticated manual runs & history</h3></div>
    <p className="text-sm leading-6 text-muted-foreground">
      Save named workflows to your ETERNYX account and run their stored steps on the server on demand.
      Only execution counts and operation traces are stored; your input and output text are never persisted to the run-history table.
      Cloud runs use existing backend resources, so hosting/compute usage may have a cost.
    </p>
    <p className="rounded-lg border border-border/70 bg-background/60 p-3 text-xs leading-6 text-muted-foreground">
      <strong>Manual only.</strong> Cloud schedules, recurring triggers, webhooks, arbitrary code, AI providers and external actions are not enabled. Maximum 20 saved workflows and 30 manual runs per 24 hours.
    </p>
    {!isAuthenticated || !userId ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" /> Sign in to use account-owned workflows. Local Automation above still works without an account.</p> :
      <>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-sm">Workflow name
            <Input className="mt-1" maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setOutput(null); }} />
          </label>
          <Button disabled={busy} type="button" variant="outline" onClick={() => manage(async () => { await refresh(); setNotice("Account workflows refreshed."); })}><RefreshCcw className="mr-2 size-4" /> Load workflows</Button>
          <Button disabled={busy || !steps.length || !name.trim() || name.trim().length > 80} type="button"
            onClick={() => manage(async () => {
              const response = await callAutomation("save", { name, steps, ...(selectedId ? { workflowId: selectedId } : {}) });
              if (response.ok !== true || typeof response.workflow_id !== "string") throw new Error("Workflow was not saved.");
              const id = response.workflow_id;
              await refresh(); setSelectedId(id); setOutput(null);
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
            <Button type="button" disabled={busy || !selected.active || !unchanged || input.length > 12000}
              onClick={() => manage(async () => {
                const signature = JSON.stringify([selected.id, selected.revision, input]);
                const requestKey = pendingRun.current?.signature === signature
                  ? pendingRun.current.key : crypto.randomUUID();
                pendingRun.current = { signature, key: requestKey };
                const response = await callAutomation("run", {
                  workflowId: selected.id, input, requestKey,
                });
                if (response.source !== "authenticated_server" || typeof response.output !== "string" ||
                    typeof response.runId !== "string" || !Array.isArray(response.trace)) throw new Error("Invalid cloud run result.");
                pendingRun.current = null;
                setOutput(response as unknown as CloudResult);
                setNotice("Executed against the saved server-side workflow. Raw output is available only in this response.");
              })}><Play className="mr-2 size-4" /> Run saved workflow</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => manage(async () => {
              const response = await callAutomation("toggle", { workflowId: selected.id, active: !selected.active });
              if (response.ok !== true) throw new Error("Could not update workflow state.");
              await refresh(); setNotice(selected.active ? "Workflow paused." : "Workflow enabled for manual runs.");
            })}><PauseCircle className="mr-2 size-4" /> {selected.active ? "Pause" : "Resume"}</Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => {
              if (!window.confirm("Delete this saved workflow? Existing run metadata will remain in your account.")) return;
              void manage(async () => {
                const response = await callAutomation("delete", { workflowId: selected.id });
                if (response.ok !== true) throw new Error("Workflow was not deleted.");
                clearSelection(); await refresh(); setNotice("Saved workflow deleted.");
              });
            }}><Trash2 className="mr-2 size-4" /> Delete</Button>
          </div>
          {input.length > 12000 && <p className="text-xs text-muted-foreground">Cloud input limit: 12,000 characters. The local runner supports larger inputs.</p>}
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
