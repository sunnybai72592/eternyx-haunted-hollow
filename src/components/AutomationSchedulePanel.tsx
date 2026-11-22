import { useEffect, useState } from "react";
import { CalendarClock, CloudOff, LockKeyhole, PauseCircle, Play, RefreshCcw, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Schedule = {
  id: string; workflow_id: string; interval_minutes: number;
  enabled: boolean; revision: number; next_run_at: string;
  last_run_at: string | null; last_status: string; attempt_count: number; created_at: string;
};
type ScheduledRun = { id: string; trigger_type?: string; schedule_id?: string | null; created_at: string };
const intervals = [
  { minutes: 60, label: "Every hour" },
  { minutes: 1440, label: "Every day" },
  { minutes: 10080, label: "Every week" },
];
const formatter = (value: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unavailable";
};
async function requestSchedule(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("automation-schedule-control", {
    body: { action, ...extra },
  });
  if (error) {
    let detail = "Schedules are not deployed or their encryption key is missing.";
    try {
      const res = error.context as Response;
      if (res && typeof res.json === "function") {
        const payload = await res.json();
        if (typeof payload?.error === "string" && payload.error.length < 200) detail = payload.error;
      }
    } catch { /* generic error */ }
    throw new Error(detail);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unexpected schedule response.");
  return data as Record<string, unknown>;
}
function readScheduleList(value: unknown): Schedule[] {
  if (!Array.isArray(value) || value.length > 3) throw new Error("Invalid schedule listing.");
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid schedule record.");
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.workflow_id !== "string" ||
        typeof item.interval_minutes !== "number" || typeof item.enabled !== "boolean" ||
        typeof item.revision !== "number" || typeof item.next_run_at !== "string" ||
        typeof item.last_status !== "string" || typeof item.attempt_count !== "number") {
      throw new Error("Incomplete schedule record.");
    }
    return item as Schedule;
  });
}
export default function AutomationSchedulePanel({
  selectedWorkflowId, currentInput, scheduledRuns,
}: { selectedWorkflowId: string | null; currentInput: string; scheduledRuns: ScheduledRun[] }) {
  const userId = useAuthStore((state) => state.user?.id);
  const signedIn = useAuthStore((state) => state.isAuthenticated);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [encryptionConfigured, setEncryptionConfigured] = useState(false);
  const [workerConfigured, setWorkerConfigured] = useState(false);
  const [interval, setInterval] = useState(1440);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ runId: string; output: string; expiresAt: string } | null>(null);

  useEffect(() => {
    setSchedules([]); setLoaded(false); setSchedulerEnabled(false);
    setEncryptionConfigured(false); setWorkerConfigured(false);
    setText(""); setResult(null); setNotice(""); setError("");
  }, [userId]);
  const selected = schedules.find((s) => s.workflow_id === selectedWorkflowId);
  const ready = schedulerEnabled && encryptionConfigured && workerConfigured;

  async function load() {
    const response = await requestSchedule("list");
    if (response.source !== "authenticated_server" ||
        typeof response.schedulerEnabled !== "boolean" ||
        typeof response.encryptionConfigured !== "boolean" ||
        typeof response.workerConfigured !== "boolean") {
      throw new Error("The scheduler cannot be verified.");
    }
    setSchedules(readScheduleList(response.schedules));
    setSchedulerEnabled(response.schedulerEnabled);
    setEncryptionConfigured(response.encryptionConfigured);
    setWorkerConfigured(response.workerConfigured);
    setLoaded(true);
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "The schedule request failed."); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="scheduler-heading" className="space-y-4 rounded-xl border border-primary/20 bg-background/50 p-4 sm:p-5">
    <div className="flex items-center gap-2"><CalendarClock className="size-5 text-primary"/><h4 id="scheduler-heading" className="text-lg font-semibold">Scheduled workflow runs</h4></div>
    <p className="text-sm leading-6 text-muted-foreground">
      Schedule a saved text workflow hourly, daily, or weekly using encrypted static input. The server executes the saved operations and retains encrypted output for seven days. Nothing runs until the trusted scheduler is deployed, enabled by the operator, and you explicitly enable a schedule.
    </p>
    <p className="text-xs leading-6 text-muted-foreground">
      Up to 3 schedules/account, sharing the 30 completed cloud runs/account/24h limit.
      UTC-based intervals, no time-zone/DST cron expressions, arbitrary scripts, outbound network, paid AI or external writes. Scheduled invocation and storage may incur hosting charges.
    </p>
    {!signedIn || !userId ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" /> Sign in to manage schedules.</p> : <>
      <Button type="button" disabled={busy} variant="outline" onClick={() => act(async () => { await load(); setNotice("Schedule status refreshed."); })}><RefreshCcw className="mr-2 size-4" /> Load schedules</Button>
      {loaded && <p role="status" className="text-xs text-muted-foreground">{schedules.length} / 3 saved schedules · Operator scheduler: {schedulerEnabled ? "enabled" : "disabled"} · Encryption: {encryptionConfigured ? "configured" : "missing"} · Worker authentication: {workerConfigured ? "configured" : "missing"}</p>}
      {loaded && !ready && <p className="rounded-lg border border-amber-500/30 p-3 text-xs text-amber-600 dark:text-amber-300">Scheduled processing is not activated on this backend. You may save a disabled schedule once encryption is configured; you cannot enable it until the worker and operator gate are ready.</p>}
      {selectedWorkflowId && <div className="space-y-3 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-semibold">{selected ? "Edit selected workflow schedule" : "Prepare a new disabled schedule"}</p>
        <label className="block text-sm" htmlFor="schedule-frequency">Interval, measured in UTC
          <select id="schedule-frequency" className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3"
            value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            {intervals.map((entry) => <option key={entry.minutes} value={entry.minutes}>{entry.label}</option>)}
          </select>
        </label>
        <label htmlFor="schedule-input" className="text-sm">Static input (encrypted at rest, maximum 2,000 UTF-8 bytes)</label>
        <Textarea id="schedule-input" rows={5} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Data for future scheduled runs. Do not paste passwords, tokens or sensitive data."/>
        <Button type="button" size="sm" variant="outline" onClick={() => { setText(currentInput); setResult(null); }}>Use current workflow input</Button>
        {selected && <p className="text-xs text-muted-foreground">Editing replaces encrypted input, pauses this schedule and resets the next due time. Previously saved input is never returned to the browser.</p>}
        <Button type="button" disabled={busy || !loaded || !encryptionConfigured || !text.trim() ||
          new TextEncoder().encode(text).length > 2000 || (!selected && schedules.length >= 3)}
          onClick={() => act(async () => {
            const res = await requestSchedule("save", {
              workflowId:selectedWorkflowId,intervalMinutes:interval,input:text,
              ...(selected ? {scheduleId:selected.id} : {}),
            });
            if (res.ok !== true) throw new Error("Schedule not saved.");
            setText(""); await load(); setNotice("Encrypted schedule saved DISABLED. It will not run until enabled.");
          })}><Save className="mr-2 size-4" /> {selected ? "Replace & pause schedule" : "Save disabled schedule"}</Button>
      </div>}
      {loaded && <div className="space-y-3">
        {schedules.map((item) => <div key={item.id} className="rounded-xl border border-border/70 p-3 text-sm">
          <p className="font-semibold">{item.enabled ? "Enabled" : "Disabled"} · {intervals.find(x => x.minutes === item.interval_minutes)?.label || "Unknown interval"}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">Workflow: {item.workflow_id}</p>
          <p className="mt-1 text-xs text-muted-foreground">Next due: {formatter(item.next_run_at)} · Last: {formatter(item.last_run_at)} · Status: {item.last_status} · Attempts: {item.attempt_count}/3</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || (!item.enabled && !ready)} onClick={() => act(async () => {
              const response = await requestSchedule("toggle", {scheduleId:item.id,enabled:!item.enabled});
              if (response.ok !== true) throw new Error("Could not update schedule.");
              await load(); setNotice(item.enabled ? "Schedule paused." : "Schedule enabled for the next interval.");
            })}><PauseCircle className="mr-2 size-4" /> {item.enabled ? "Pause" : "Enable"}</Button>
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => {
              if (!window.confirm("Delete this schedule? Its run history remains private.")) return;
              void act(async () => {
                const r = await requestSchedule("delete", {scheduleId:item.id});
                if (r.ok !== true) throw new Error("Schedule not deleted.");
                await load(); setNotice("Schedule deleted.");
              });
            }}><Trash2 className="mr-2 size-4" /> Delete</Button>
          </div>
        </div>)}
      </div>}
      {scheduledRuns.length>0 && <div className="space-y-3">
        <h5 className="font-semibold">Encrypted scheduled outputs</h5>
        <p className="text-xs text-muted-foreground">Loaded from the run history above. Results expire seven days after creation, even if the metadata remains.</p>
        {scheduledRuns.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-3">
          <span className="break-all text-xs text-muted-foreground">{run.id}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => {
            const r = await requestSchedule("output",{runId:run.id});
            if (r.source !== "authenticated_server" || typeof r.output !== "string" ||
                typeof r.expiresAt !== "string" || typeof r.runId !== "string") throw new Error("Invalid output response.");
            setResult({runId:r.runId,output:r.output,expiresAt:r.expiresAt}); setNotice("Owned scheduled output decrypted for this session only.");
          })}><Play className="mr-2 size-4" /> View output</Button>
        </div>)}
      </div>}
      {result && <div className="space-y-2 rounded-lg border border-primary/30 p-3">
        <p className="text-sm font-semibold">Decrypted scheduled result</p>
        <p className="break-all text-xs text-muted-foreground">Run {result.runId} · Expires {formatter(result.expiresAt)}</p>
        <Textarea rows={6} readOnly className="font-mono text-xs" value={result.output}/>
        <Button size="sm" variant="outline" onClick={() => { setResult(null);setNotice("Decrypted result cleared from view."); }}>Clear result</Button>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive"><CloudOff className="mr-2 inline size-4"/>{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </>}
  </section>;
}
