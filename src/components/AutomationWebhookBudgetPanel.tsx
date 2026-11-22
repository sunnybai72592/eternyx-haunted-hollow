import { useEffect, useState } from "react";
import { Gauge, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export type WebhookBudget = {
  trigger_id: string;
  executions_24h: number;
  submissions_24h: number;
  pending: number;
};
export type BudgetTrigger = {
  id: string;
  allowed_scope: "text_transform";
  daily_execution_limit: number;
  daily_submission_limit: number;
};

function validLimit(n: number, low: number, high: number) {
  return Number.isInteger(n) && n >= low && n <= high;
}
export default function AutomationWebhookBudgetPanel({
  trigger, usage, refresh, disabled,
}: {
  trigger: BudgetTrigger;
  usage?: WebhookBudget;
  refresh: () => Promise<void>;
  disabled: boolean;
}) {
  const [executions, setExecutions] = useState(trigger.daily_execution_limit);
  const [submissions, setSubmissions] = useState(trigger.daily_submission_limit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setExecutions(trigger.daily_execution_limit);
    setSubmissions(trigger.daily_submission_limit);
    setError("");
    setNotice("");
  }, [trigger.id, trigger.daily_execution_limit, trigger.daily_submission_limit]);

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!validLimit(executions, 1, 30) || !validLimit(submissions, 1, 40)) {
        throw new Error("Limits must be whole numbers: 1–30 executions, 1–40 submissions.");
      }
      const { data, error:remoteError } = await supabase.functions.invoke("automation-control", {
        body: {
          action:"setWebhookLimits",
          triggerId:trigger.id,
          dailyExecutions:executions,
          dailySubmissions:submissions,
        },
      });
      if (remoteError || data?.ok !== true || data?.allowed_scope !== "text_transform") {
        throw new Error("Server did not accept these budget limits. Check the migration and backend.");
      }
      await refresh();
      setNotice("Database-enforced 24-hour limits saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save limits.");
    } finally {
      setBusy(false);
    }
  }
  const usedExecutions = usage?.executions_24h ?? null;
  const usedSubmissions = usage?.submissions_24h ?? null;
  return <div className="space-y-3 rounded-lg border border-border/70 p-3">
    <div className="flex items-center gap-2">
      <Gauge className="size-4 text-primary" />
      <strong className="text-sm">Execution and intake budgets</strong>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Allowed permission: <strong>text_transform only</strong> — no scripts, outgoing HTTP,
      purchases, billing, external writes or AI. The limits below are real database
      guards, not estimates of provider costs or guaranteed monetary spending caps.
    </p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs" htmlFor={"execution-cap-"+trigger.id}>
        Max completed webhook runs per 24h (1–30)
        <Input id={"execution-cap-"+trigger.id} type="number" inputMode="numeric"
          min={1} max={30} step={1} value={executions}
          onChange={(event) => setExecutions(Number(event.target.value))}
          disabled={busy || disabled} />
        <span className="mt-1 block text-muted-foreground">Current: {usedExecutions === null ? "Not loaded" : usedExecutions} / {trigger.daily_execution_limit}</span>
      </label>
      <label className="text-xs" htmlFor={"submission-cap-"+trigger.id}>
        Max review-queue submissions per 24h (1–40)
        <Input id={"submission-cap-"+trigger.id} type="number" inputMode="numeric"
          min={1} max={40} step={1} value={submissions}
          onChange={(event) => setSubmissions(Number(event.target.value))}
          disabled={busy || disabled} />
        <span className="mt-1 block text-muted-foreground">Current: {usedSubmissions === null ? "Not loaded" : usedSubmissions} / {trigger.daily_submission_limit}</span>
      </label>
    </div>
    {usage && <p className="text-xs text-muted-foreground">Pending approval requests: {usage.pending}</p>}
    <Button type="button" size="sm" variant="outline"
      disabled={busy || disabled || !validLimit(executions, 1, 30) ||
        !validLimit(submissions, 1, 40) ||
        (executions === trigger.daily_execution_limit && submissions === trigger.daily_submission_limit)}
      onClick={() => { void save(); }}>
      <Save className="mr-2 size-4" /> Save per-trigger limits
    </Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </div>;
}
