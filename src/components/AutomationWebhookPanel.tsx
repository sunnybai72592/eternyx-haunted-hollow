import { useEffect, useState } from "react";
import { ClipboardCopy, LockKeyhole, PauseCircle, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";

type Trigger = {
  id: string; workflow_id: string; enabled: boolean;
  created_at: string; rotated_at: string; last_used_at: string | null;
};
type Reply = Record<string, unknown>;
async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke("automation-control", {
    body: { action, ...extra },
  });
  if (error) {
    let message = "Webhook controls are unavailable. Backend deployment and encryption key configuration are required.";
    try {
      const response = error.context as Response;
      if (response && typeof response.json === "function") {
        const detail = await response.json();
        if (typeof detail?.error === "string" && detail.error.length < 200) message = detail.error;
      }
    } catch { /* keep safe fallback */ }
    throw new Error(message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid webhook response.");
  return data as Reply;
}
function safeTriggers(raw: unknown): Trigger[] {
  if (!Array.isArray(raw)) throw new Error("Invalid webhook trigger listing.");
  return raw.map((t: unknown) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) throw new Error("Invalid trigger metadata.");
    const trigger = t as Record<string, unknown>;
    if (typeof trigger.id !== "string" || typeof trigger.workflow_id !== "string" ||
        typeof trigger.enabled !== "boolean" || typeof trigger.rotated_at !== "string" ||
        typeof trigger.created_at !== "string" ||
        !(trigger.last_used_at === null || typeof trigger.last_used_at === "string")) {
      throw new Error("Invalid trigger record.");
    }
    return trigger as Trigger;
  });
}
function date(value: string | null) {
  if (!value) return "Never";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "Unavailable";
}

export default function AutomationWebhookPanel({ selectedWorkflowId }: { selectedWorkflowId: string | null }) {
  const userId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ triggerId: string; secret: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const webhookUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/automation-webhook";
  useEffect(() => {
    setTriggers([]); setIssued(null); setLoaded(false); setConfigured(false);
    setError(""); setMessage(""); setShowKey(false);
  }, [userId]);

  async function reload() {
    const data = await call("webhooks");
    if (data.source !== "authenticated_server" || typeof data.webhooksConfigured !== "boolean") {
      throw new Error("Webhook configuration has not been verified.");
    }
    setTriggers(safeTriggers(data.triggers));
    setConfigured(data.webhooksConfigured);
    setLoaded(true);
  }
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Webhook request failed."); }
    finally { setBusy(false); }
  }
  async function provision(action: "createWebhook" | "rotateWebhook", identifier: string) {
    const response = await call(action, action === "createWebhook"
      ? { workflowId: identifier } : { triggerId: identifier });
    if (response.ok !== true || typeof response.triggerId !== "string" ||
        typeof response.signingKey !== "string" || !/^[0-9a-f]{64}$/.test(response.signingKey)) {
      throw new Error("Signing key was not returned.");
    }
    setIssued({ triggerId: response.triggerId, secret: response.signingKey });
    setShowKey(false);
    await reload();
    setMessage("One-time signing key created. Copy it to your external service securely, then explicitly enable the trigger.");
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMessage("Copied to clipboard."); }
    catch { setError("Clipboard unavailable. Select the field and copy it manually."); }
  }
  return <section className="space-y-4 rounded-xl border border-primary/20 bg-background/50 p-4 sm:p-5" aria-labelledby="webhook-heading">
    <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h4 id="webhook-heading" className="text-lg font-semibold">Signed inbound webhook triggers</h4></div>
    <p className="text-sm leading-6 text-muted-foreground">
      Connect an external service to one saved text workflow via HMAC-SHA256 signed POST requests.
      Credentials are AES-GCM encrypted on the server; the secret is displayed once and never placed in the URL.
      Triggers start disabled. Up to five per account; webhook runs share the 30-runs-per-day cloud quota.
    </p>
    <p className="text-xs leading-6 text-muted-foreground">No arbitrary scripts, account read access, external outbound calls, scheduled jobs or AI execution. Signed requests return only the transformed text and a measured trace. Avoid secrets and sensitive personal data in webhook payloads.</p>
    {!isAuthenticated || !userId ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" /> Sign in to manage signed triggers.</p> : <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} variant="outline" onClick={() => act(async () => { await reload(); setMessage("Webhook status refreshed."); })}><RefreshCcw className="mr-2 size-4" /> Load triggers</Button>
        <Button type="button" disabled={busy || !loaded || !configured || !selectedWorkflowId ||
          triggers.some((trigger) => trigger.workflow_id === selectedWorkflowId) || triggers.length >= 5}
          onClick={() => act(() => provision("createWebhook", selectedWorkflowId!))}>Create disabled trigger for selected workflow</Button>
      </div>
      {loaded && !configured && <p role="status" className="text-sm text-amber-600 dark:text-amber-300">The server encryption key is not configured; new triggers cannot be created or verified.</p>}
      {loaded && !selectedWorkflowId && <p className="text-xs text-muted-foreground">Load and select a saved workflow above to create a trigger.</p>}
      {issued && <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
        <p className="font-semibold text-sm">One-time signing key — store securely now</p>
        <p className="text-xs text-muted-foreground">This secret cannot be recovered after you hide it or leave this page. Rotation invalidates the old key and disables the trigger until re-enabled.</p>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="One-time webhook signing secret" className="min-w-0 flex-1 font-mono text-xs" type={showKey ? "text" : "password"} readOnly value={issued.secret}/>
          <Button variant="outline" onClick={() => copy(issued.secret)}><ClipboardCopy className="mr-2 size-4" /> Copy key</Button>
          <Button variant="outline" onClick={() => setShowKey((v) => !v)}>{showKey ? "Hide characters" : "Show characters"}</Button>
          <Button variant="outline" onClick={() => { setIssued(null); setShowKey(false); }}>Dismiss key</Button>
        </div>
      </div>}
      {loaded && <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{triggers.length} / 5 registered triggers · Each bound to exactly one saved workflow</p>
        {triggers.map((trigger) => <div key={trigger.id} className="space-y-2 rounded-lg border border-border/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{trigger.enabled ? "Enabled (accepts signed requests)" : "Disabled (rejects requests)"}</span>
            <span className="text-xs text-muted-foreground">Last used: {date(trigger.last_used_at)}</span>
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">Trigger: {trigger.id}</p>
          <p className="break-all text-xs text-muted-foreground">Workflow: {trigger.workflow_id} · Key rotated {date(trigger.rotated_at)}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !configured} size="sm" variant="outline" onClick={() => act(async () => {
              const result = await call("toggleWebhook", { triggerId: trigger.id, enabled: !trigger.enabled });
              if (result.ok !== true) throw new Error("Unable to change trigger status.");
              await reload(); setMessage(trigger.enabled ? "Webhook disabled." : "Webhook enabled for signed traffic.");
            })}><PauseCircle className="mr-2 size-4" /> {trigger.enabled ? "Disable" : "Enable"}</Button>
            <Button disabled={busy || !configured} size="sm" variant="outline" onClick={() => {
              if (!window.confirm("Rotate this webhook signing key? Old signatures will fail and the trigger will be disabled.")) return;
              void act(() => provision("rotateWebhook", trigger.id));
            }}>Rotate key</Button>
            <Button disabled={busy} size="sm" variant="destructive" onClick={() => {
              if (!window.confirm("Permanently delete this webhook trigger? Existing run history remains private.")) return;
              void act(async () => {
                const result = await call("deleteWebhook", { triggerId: trigger.id });
                if (result.ok !== true) throw new Error("Unable to delete trigger.");
                setIssued(null); await reload(); setMessage("Webhook deleted.");
              });
            }}><Trash2 className="mr-2 size-4" /> Delete</Button>
          </div>
        </div>)}
      </div>}
      <div className="rounded-lg border border-border/70 p-3">
        <p className="text-sm font-medium">Webhook endpoint (POST)</p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{webhookUrl}</p>
        <Button size="sm" type="button" variant="outline" className="mt-2" onClick={() => copy(webhookUrl)}><ClipboardCopy className="mr-2 size-4" /> Copy endpoint</Button>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Required headers: x-eternyx-timestamp (epoch seconds), x-eternyx-request-id (new UUID per event),
          x-eternyx-signature (sha256=&lt;hex HMAC&gt;). Sign the exact UTF-8 bytes of
          timestamp + newline + request ID + newline + JSON body. The body contains triggerId and input.
          Maximum five-minute clock skew. Never include the key itself in requests.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </>}
  </section>;
}
