import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Eye, RefreshCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";

type Approval = {
  id: string; trigger_id: string | null; workflow_id: string | null;
  workflow_revision: number; input_bytes: number;
  status: "pending" | "approved" | "rejected" | "expired";
  created_at: string; expires_at: string; decided_at: string | null; run_id: string | null;
};
const statusSet = new Set(["pending","approved","rejected","expired"]);
function date(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : "Unknown";
}
function validateList(value: unknown): Approval[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error("Invalid approval inbox.");
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid approval entry.");
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.created_at !== "string" ||
        typeof item.expires_at !== "string" || typeof item.input_bytes !== "number" ||
        typeof item.workflow_revision !== "number" ||
        !statusSet.has(item.status as string)) {
      throw new Error("Incomplete approval entry.");
    }
    return item as Approval;
  });
}
async function call(action: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("automation-control", {
    body: { action, ...fields },
  });
  if (error) {
    let detail = "Approval inbox is unavailable. Check backend migration and deployment.";
    try {
      const context = error.context as Response;
      if (context && typeof context.json === "function") {
        const body = await context.json();
        if (typeof body?.error === "string" && body.error.length < 220) detail = body.error;
      }
    } catch { /* keep safe fallback */ }
    throw new Error(detail);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid approval response.");
  return data as Record<string, unknown>;
}

export default function AutomationApprovalPanel() {
  const userId = useAuthStore((s) => s.user?.id);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; input: string } | null>(null);
  const [execution, setExecution] = useState<{ id: string; runId: string; output: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setApprovals([]); setLoaded(false); setPreview(null);
    setExecution(null); setError(""); setNotice("");
  }, [userId]);

  async function refresh() {
    const response = await call("approvalInbox");
    if (response.source !== "authenticated_server" || response.plaintextStored !== false ||
        response.pendingLimit !== 10 || response.intakeDailyLimit !== 40) {
      throw new Error("Unverified approval inbox response.");
    }
    const updated = validateList(response.approvals);
    setApprovals(updated); setLoaded(true);
    setPreview((current) => updated.some((x) =>
      x.id === current?.id && x.status === "pending" && Date.parse(x.expires_at) > Date.now()
    ) ? current : null);
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval request was rejected.");
    } finally { setBusy(false); }
  }
  const pending = approvals.filter((a) => a.status === "pending" && Date.parse(a.expires_at) > Date.now());
  return <section aria-labelledby="automation-approval-title" className="space-y-4 rounded-xl border border-primary/20 bg-background/50 p-4 sm:p-5">
    <div className="flex items-center gap-2">
      <ShieldCheck className="size-5 text-primary" />
      <h4 id="automation-approval-title" className="text-lg font-semibold">Signed event approval inbox</h4>
    </div>
    <p className="text-sm leading-6 text-muted-foreground">
      When a signed webhook has Require review enabled, its text is encrypted and queued for you
      rather than executed. Open and review the original input, then explicitly approve or reject
      within 24 hours. Approval executes the saved workflow and uses the existing cloud run quota.
    </p>
    <p className="text-xs text-muted-foreground">
      Maximum 10 pending requests and 40 submissions per account per 24 hours.
      Only the signed-in owner can preview or decide. No external system is called.
    </p>
    {!signedIn || !userId ? <p className="text-sm text-muted-foreground">Sign in to review your webhook requests.</p> : <>
      <Button type="button" variant="outline" disabled={busy} onClick={() => act(async () => {
        await refresh(); setNotice("Loaded server-verified approval requests.");
      })}><RefreshCcw className="mr-2 size-4" /> Load approval inbox</Button>
      {loaded && <p className="text-xs text-muted-foreground">{pending.length} pending in the latest {approvals.length} requests.</p>}
      {loaded && approvals.length === 0 && <p className="text-sm text-muted-foreground">No signed approval requests have been received yet.</p>}
      {loaded && <ol className="space-y-3">
        {approvals.map((a) => {
          const available = a.status === "pending" && Date.parse(a.expires_at) > Date.now();
          const reviewed = preview?.id === a.id;
          return <li key={a.id} className="space-y-2 rounded-lg border border-border/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{available ? "Awaiting review" :
                a.status === "pending" ? "Expired (not processed)" :
                a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span>
              <span className="text-xs text-muted-foreground">{date(a.created_at)}</span>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              Request {a.id} · {a.input_bytes} encrypted input bytes · workflow revision {a.workflow_revision}
            </p>
            <p className="text-xs text-muted-foreground">Decision deadline {date(a.expires_at)}</p>
            {available && <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => act(async () => {
                  const r = await call("previewApproval", { approvalId:a.id });
                  if (r.source !== "authenticated_owner_preview" || r.executed !== false ||
                      typeof r.input !== "string" || r.approvalId !== a.id) {
                    throw new Error("Unverified preview response.");
                  }
                  setPreview({id:a.id,input:r.input});
                  setExecution(null);
                  setNotice("Review the input below before deciding. No workflow has executed.");
                })}><Eye className="mr-2 size-4"/> Review input</Button>
              <Button type="button" size="sm" disabled={busy || !reviewed} onClick={() => {
                if (!window.confirm("Approve and EXECUTE this saved text workflow now? This counts toward your cloud quota.")) return;
                void act(async () => {
                  const r = await call("approveWebhook",{approvalId:a.id});
                  if (r.source !== "authenticated_owner_approval" || r.executed !== true ||
                      typeof r.output !== "string" || typeof r.runId !== "string" || r.approvalId !== a.id) {
                    throw new Error("Unverified approval result.");
                  }
                  setExecution({id:a.id,runId:r.runId,output:r.output});
                  setPreview(null); await refresh();
                  setNotice("Request approved; saved workflow executed on the server.");
                });
              }}><Check className="mr-2 size-4"/> Approve & run</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act(async () => {
                const r = await call("rejectWebhook",{approvalId:a.id});
                if (r.ok !== true) throw new Error("Rejection was not recorded.");
                setPreview(null); setExecution(null); await refresh();
                setNotice("Request rejected. No workflow was run.");
              })}><X className="mr-2 size-4"/> Reject</Button>
            </div>}
            {reviewed && available && <div className="space-y-2 rounded-lg border border-primary/20 p-3">
              <p className="text-sm font-medium">Verified original text — review before approval</p>
              <Textarea readOnly rows={5} className="font-mono text-xs" value={preview.input}/>
            </div>}
          </li>;
        })}
      </ol>}
      {execution && <div className="space-y-2 rounded-xl border border-primary/30 p-3">
        <p className="font-semibold text-sm">Approved workflow execution completed</p>
        <p className="text-xs text-muted-foreground">Run ID: {execution.runId}. Output is not saved to the approval inbox.</p>
        <Textarea readOnly rows={5} className="font-mono text-xs" value={execution.output} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => {
            void navigator.clipboard.writeText(execution.output).then(
              () => setNotice("Result copied."), () => setError("Clipboard unavailable."),
            );
          }}><ClipboardCopy className="mr-2 size-4"/> Copy output</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => {
            setExecution(null); setNotice("Decrypted output cleared from view.");
          }}>Clear result</Button>
        </div>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    </>}
  </section>;
}
