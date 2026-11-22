import { useRef, useState } from "react";
import AutomationCloudPanel from "@/components/AutomationCloudPanel";
import { ArrowDown, ArrowUp, Braces, CheckCircle2, ClipboardCopy, Download, Play, Plus, RotateCcw, Trash2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  WORKFLOW_OPERATIONS, WORKFLOW_PRESETS, MAX_WORKFLOW_INPUT, MAX_WORKFLOW_STEPS,
  LocalWorkflowError, exportWorkflowConfiguration, getWorkflowPreset,
  parseWorkflowConfiguration, runLocalWorkflow,
} from "@/lib/automationWorkflow.mjs";

type Step = {
  id: string;
  kind: string;
  value?: string;
  replacement?: string;
  caseSensitive?: boolean;
};
type Run = ReturnType<typeof runLocalWorkflow>;

const valueKinds = new Set(["keep_contains", "drop_contains", "replace", "prefix", "suffix"]);
const caseKinds = new Set(["unique", "keep_contains", "drop_contains", "replace"]);
const card = "rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-6";
const field = "min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const errorMessages: Record<string, string> = {
  invalid_steps: "Maximum 12 steps per workflow.",
  invalid_step: "A step is not supported or has a duplicate identifier.",
  invalid_value: "Check required text values (1–120 characters); replacement may be empty.",
  too_many_lines: "Maximum 2,500 input or output lines.",
  input_too_large: "Input must be 50,000 characters or less.",
  output_too_large: "Workflow output exceeded the 60,000 character limit.",
  empty_workflow: "Add a step before running.",
  invalid_config: "Configuration must be valid ETERNYX workflow JSON, version 1.",
};
function explain(error: unknown): string {
  return error instanceof LocalWorkflowError ? (errorMessages[error.code] || error.message) : "The local workflow could not be completed.";
}
function newStep(kind: string): Step {
  const step: Step = { id: crypto.randomUUID(), kind };
  if (valueKinds.has(kind)) step.value = "";
  if (kind === "replace") step.replacement = "";
  if (caseKinds.has(kind)) step.caseSensitive = false;
  return step;
}

export default function AutomationWorkflowStudio() {
  const [input, setInput] = useState("  Alpha  \nBeta\nalpha\n\nBeta\nReview me");
  const [steps, setSteps] = useState<Step[]>(() => getWorkflowPreset("clean"));
  const [presetId, setPresetId] = useState("clean");
  const [newKind, setNewKind] = useState("trim");
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [config, setConfig] = useState("");
  const outputRef = useRef<HTMLTextAreaElement>(null);

  function invalidate() {
    setRun(null);
    setError("");
    setNotice("");
  }
  function setStep(id: string, patch: Partial<Step>) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
    invalidate();
  }
  function changeKind(id: string, kind: string) {
    setSteps((current) => current.map((step) => step.id === id ? { ...newStep(kind), id } : step));
    invalidate();
  }
  function move(id: string, direction: number) {
    setSteps((current) => {
      const index = current.findIndex((step) => step.id === id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    invalidate();
  }
  function add() {
    if (steps.length >= MAX_WORKFLOW_STEPS) { setError(errorMessages.invalid_steps); return; }
    setSteps((current) => [...current, newStep(newKind)]);
    invalidate();
  }
  function loadPreset() {
    setSteps(getWorkflowPreset(presetId));
    invalidate();
    setNotice("Preset loaded. Run locally to process your input.");
  }
  function execute() {
    setError("");
    setNotice("");
    setRun(null);
    try {
      const result = runLocalWorkflow(input, steps);
      setRun(result);
      setNotice("Completed in this browser only. No remote task was started.");
    } catch (cause) {
      setError(explain(cause));
    }
  }
  function showConfig() {
    try {
      setConfig(exportWorkflowConfiguration(steps));
      setError("");
      setNotice("Workflow steps exported to the JSON field below. Input data is not included.");
    } catch (cause) { setError(explain(cause)); }
  }
  function loadConfig() {
    try {
      const imported = parseWorkflowConfiguration(config);
      setSteps(imported);
      invalidate();
      setNotice("Validated configuration loaded. No data was executed or uploaded.");
    } catch (cause) { setError(explain(cause)); setNotice(""); }
  }
  async function copyOutput() {
    if (!run) return;
    try {
      await navigator.clipboard.writeText(run.output);
      setNotice("Output copied to clipboard.");
    } catch {
      outputRef.current?.focus();
      outputRef.current?.select();
      setNotice("Clipboard unavailable; output selected for manual copying.");
    }
  }
  function downloadOutput() {
    if (!run) return;
    const url = URL.createObjectURL(new Blob([run.output], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "eternyx-automation-output.txt";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-labelledby="automation-studio-title" className="space-y-5">
    <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] via-card to-card p-6 sm:p-8">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500"><Workflow className="size-4" /> Automation workbench</p>
      <h2 id="automation-studio-title" className="mt-3 text-2xl font-bold sm:text-3xl">Build a real local workflow</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
        Chain up to 12 repeatable text-processing steps. Execute them on your data, inspect the outcome of every step and reuse configurations.
        All processing is synchronous in this browser: no server runs, AI calls, external targets, schedules, or privileged integrations.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">Limits: 50,000 input characters, 2,500 lines, and 60,000 output characters. Avoid entering credentials or personal secrets.</p>
    </div>

    <div className={card}>
      <h3 className="text-lg font-semibold">1. Choose a workflow or build your own</h3>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[190px] flex-1 flex-col gap-2 text-sm">Starting template
          <select className={field} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {WORKFLOW_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={loadPreset}><RotateCcw className="mr-2 size-4" /> Load template</Button>
        <label className="flex min-w-[190px] flex-1 flex-col gap-2 text-sm">New step
          <select className={field} value={newKind} onChange={(e) => setNewKind(e.target.value)}>
            {WORKFLOW_OPERATIONS.map((op) => <option key={op.kind} value={op.kind}>{op.label}</option>)}
          </select>
        </label>
        <Button type="button" onClick={add} disabled={steps.length >= MAX_WORKFLOW_STEPS}><Plus className="mr-2 size-4" /> Add step</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{steps.length} / {MAX_WORKFLOW_STEPS} steps · Runs only when you select Run workflow</p>
      {steps.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No steps yet. Select a transformation above.</p>}
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => {
          const operation = WORKFLOW_OPERATIONS.find((op) => op.kind === step.kind);
          return <li key={step.id} className="rounded-xl border border-border/70 bg-background/50 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{index + 1}</span>
              <label className="min-w-[190px] flex-1 text-sm">Operation
                <select aria-label={"Operation for step " + (index + 1)} className={"mt-1 block w-full " + field} value={step.kind} onChange={(e) => changeKind(step.id, e.target.value)}>
                  {WORKFLOW_OPERATIONS.map((op) => <option key={op.kind} value={op.kind}>{op.label}</option>)}
                </select>
              </label>
              <Button type="button" variant="outline" size="icon" aria-label={"Move step " + (index + 1) + " up"} disabled={index === 0} onClick={() => move(step.id, -1)}><ArrowUp className="size-4" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label={"Move step " + (index + 1) + " down"} disabled={index === steps.length - 1} onClick={() => move(step.id, 1)}><ArrowDown className="size-4" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label={"Remove step " + (index + 1)} onClick={() => { setSteps((current) => current.filter((s) => s.id !== step.id)); invalidate(); }}><Trash2 className="size-4" /></Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{operation?.help}</p>
            {(valueKinds.has(step.kind) || caseKinds.has(step.kind)) && <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {valueKinds.has(step.kind) && <label className="text-sm">Literal text
                <Input className="mt-1" maxLength={120} value={step.value ?? ""} placeholder="Required literal phrase" onChange={(e) => setStep(step.id, { value: e.target.value })} />
              </label>}
              {step.kind === "replace" && <label className="text-sm">Replace with (may be empty)
                <Input className="mt-1" maxLength={120} value={step.replacement ?? ""} onChange={(e) => setStep(step.id, { replacement: e.target.value })} />
              </label>}
              {caseKinds.has(step.kind) && <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={step.caseSensitive ?? false} onChange={(e) => setStep(step.id, { caseSensitive: e.target.checked })} /> Match case exactly
              </label>}
            </div>}
          </li>;
        })}
      </ol>
    </div>

    <div className={card}>
      <h3 className="text-lg font-semibold">2. Paste data and run</h3>
      <label className="mt-4 block space-y-2 text-sm" htmlFor="automation-data">One item per line</label>
      <Textarea id="automation-data" className="mt-2 min-h-[160px] font-mono text-xs" maxLength={MAX_WORKFLOW_INPUT} value={input} onChange={(e) => { setInput(e.target.value); invalidate(); }} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={execute} disabled={!steps.length}><Play className="mr-2 size-4" /> Run workflow</Button>
        <span className="text-xs text-muted-foreground">{input.length.toLocaleString()} / {MAX_WORKFLOW_INPUT.toLocaleString()} characters</span>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-muted-foreground">{notice}</p>}
      {run && <div className="mt-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="size-5" /> Completed locally · {run.outputLines} output lines</div>
        <label htmlFor="automation-output" className="block text-sm font-medium">Actual workflow output</label>
        <Textarea id="automation-output" ref={outputRef} readOnly rows={7} className="font-mono text-xs" value={run.output} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copyOutput}><ClipboardCopy className="mr-2 size-4" /> Copy result</Button>
          <Button type="button" variant="outline" onClick={downloadOutput}><Download className="mr-2 size-4" /> Download TXT</Button>
        </div>
        <h4 className="font-semibold">Execution trace — measured results</h4>
        <ol className="grid gap-2">
          {run.trace.map((item, index) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/50 p-3 text-sm">
            <span className="font-medium">{index + 1}. {item.label}</span>
            <span className="text-muted-foreground">{item.beforeLines} → {item.afterLines} lines · {item.beforeChars} → {item.afterChars} chars · {item.changed ? "Changed" : "Unchanged"}</span>
          </li>)}
        </ol>
      </div>}
    </div>

    <div className={card}>
      <div className="flex items-center gap-2"><Braces className="size-5 text-primary" /><h3 className="text-lg font-semibold">3. Save or load a workflow configuration</h3></div>
      <p className="mt-2 text-sm text-muted-foreground">Versioned JSON contains only the workflow operations and options—not your input, execution output, credentials, or account data. Inspect imported steps before running.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={showConfig}>Show config JSON</Button>
        <Button type="button" variant="outline" onClick={loadConfig}>Import config JSON</Button>
      </div>
      <label htmlFor="automation-config" className="mt-4 block text-sm">Configuration JSON</label>
      <Textarea id="automation-config" rows={6} className="mt-2 font-mono text-xs" maxLength={16000} value={config} onChange={(e) => setConfig(e.target.value)} placeholder='{"version":1,"steps":[...]}' />
    </div>
    <AutomationCloudPanel steps={steps} input={input} onLoadSteps={(savedSteps) => { setSteps(savedSteps); invalidate(); }} />
  </section>;
}
