import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Bot, ClipboardCopy, FileCheck2, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  AGENT_STEP_KINDS, AGENT_TOOL_SCOPES, LocalAgentPlanError, MAX_AGENT_STEPS,
  buildLocalAgentPlan, createAgentStep, formatLocalAgentPlan,
  moveAgentStep, removeAgentStep,
  type AgentPlan, type AgentPlanStep, type AgentStepKind, type AgentToolScope,
} from "@/lib/ai/agent-local-tools";

const features = getFeaturesForStudio("agents");
const scopeLabels: Record<AgentToolScope, { label: string; detail: string }> = {
  local_notes: { label: "Local notes", detail: "Draft and review on this device only" },
  public_research: { label: "Public research", detail: "A potential future read-only research boundary" },
  external_write: { label: "External write", detail: "Would require separate authorization and explicit approval" },
  paid_action: { label: "Paid action", detail: "Would require financial approval and cost controls" },
};
const kindLabels: Record<AgentStepKind, string> = {
  research: "Research / gather",
  draft: "Draft / prepare",
  review: "Review / verify",
  external_action: "External action (approval required)",
};

const AIAgentsStudio = () => {
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [scopes, setScopes] = useState<AgentToolScope[]>(["local_notes"]);
  const [steps, setSteps] = useState<AgentPlanStep[]>([]);
  const [stepTitle, setStepTitle] = useState("");
  const [stepDetails, setStepDetails] = useState("");
  const [stepKind, setStepKind] = useState<AgentStepKind>("research");
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const preview = plan ? formatLocalAgentPlan(plan) : "";

  const invalidate = () => {
    setPlan(null);
    setError(null);
    setNotice(null);
  };
  const describe = (value: unknown): string => {
    if (!(value instanceof LocalAgentPlanError)) return "The local plan could not be prepared.";
    return ({
      invalid_goal: "Enter a goal between 1 and 2,000 characters.",
      invalid_constraints: "Constraints must be 1,000 characters or fewer.",
      invalid_step: "Each step needs a title up to 180 characters and optional details up to 1,000.",
      invalid_kind: "Select a supported step type.",
      duplicate_step: "A step identifier was not unique; retry adding it.",
      too_many_steps: "A plan may contain at most 12 steps.",
      invalid_scope: "External actions need the proposed external-write scope; paid scope must correspond to an external action. No scopes are active permissions.",
      empty_plan: "Add at least one proposed step.",
    }[value.code]);
  };
  const toggleScope = (scope: AgentToolScope, selected: boolean) => {
    setScopes(current => selected
      ? current.includes(scope) ? current : [...current, scope]
      : current.filter(value => value !== scope));
    invalidate();
  };
  const addStep = () => {
    try {
      const next = createAgentStep(steps, {
        id: crypto.randomUUID(), title: stepTitle, details: stepDetails, kind: stepKind,
      });
      setSteps(next);
      setStepTitle("");
      setStepDetails("");
      invalidate();
      setNotice("Proposed step added. No action was executed.");
    } catch (value) {
      setError(describe(value));
      setNotice(null);
    }
  };
  const changeOrder = (id: string, direction: -1 | 1) => {
    setSteps(current => moveAgentStep(current, id, direction));
    invalidate();
  };
  const dropStep = (id: string) => {
    setSteps(current => removeAgentStep(current, id));
    invalidate();
  };
  const preparePlan = () => {
    setPlan(null);
    setError(null);
    setNotice(null);
    try {
      setPlan(buildLocalAgentPlan(goal, constraints, scopes, steps));
    } catch (value) {
      setError(describe(value));
    }
  };
  const copy = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(preview);
      setNotice("Plan copied. No action was approved or started.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the preview manually.");
      setNotice(null);
    }
  };
  const reset = () => {
    if (steps.length > 0 && !window.confirm("Clear all local agent steps?")) return;
    setGoal("");
    setConstraints("");
    setScopes(["local_notes"]);
    setSteps([]);
    setStepTitle("");
    setStepDetails("");
    setStepKind("research");
    invalidate();
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>
        <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/50 via-slate-950 to-cyan-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-violet-200"><Bot className="h-7 w-7" />CONTROLLED AGENT PLANNING</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Agents Studio</h1>
          <p className="mt-4 max-w-3xl text-slate-300">Plan multi-step work, describe potential tool boundaries and identify steps needing future approval.</p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">
            Local planning workspace · AI disabled
          </Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            No AI agent has been started. This is a manually authored plan, not autonomous AI planning.
            Nothing is executed, scheduled, sent or charged. A proposed tool scope does not grant permission.
            All external actions require separately enforced future approval; local drafts disappear on refresh.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Planned · not enabled</Badge></CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">1. Outcome & constraints</CardTitle>
            <CardDescription className="text-slate-400">Define the goal and safety requirements for a future agent.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Goal · required, max 2,000 characters</span>
              <textarea value={goal} maxLength={2000} rows={4}
                onChange={e => { setGoal(e.target.value); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Describe a desired result..." />
              <span className="block text-xs text-slate-500">{goal.length}/2000</span>
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Constraints · optional, max 1,000 characters</span>
              <textarea value={constraints} maxLength={1000} rows={3}
                onChange={e => { setConstraints(e.target.value); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Privacy, budget, required reviews, limitations..." />
              <span className="block text-xs text-slate-500">{constraints.length}/1000</span>
            </label>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">2. Proposed permissions</CardTitle>
            <CardDescription className="text-slate-400">Select hypothetical tool scopes. Nothing is connected or authorized.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {AGENT_TOOL_SCOPES.map(scope => (
              <label key={scope} className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm">
                <input type="checkbox" checked={scopes.includes(scope)}
                  onChange={e => toggleScope(scope, e.target.checked)} className="mt-1" />
                <span>
                  <strong className="block text-slate-200">{scopeLabels[scope].label}</strong>
                  <span className="text-xs text-slate-400">{scopeLabels[scope].detail}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-amber-200">Even selected external-write and paid scopes do not authorize real actions.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">3. Proposed steps</CardTitle>
            <CardDescription className="text-slate-400">{steps.length} of {MAX_AGENT_STEPS} steps. External actions always require approval.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Step title · required, max 180 characters</span>
              <input value={stepTitle} maxLength={180} onChange={e => setStepTitle(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="What should happen at this step?" />
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Step type</span>
              <select value={stepKind} onChange={e => setStepKind(e.target.value as AgentStepKind)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                {AGENT_STEP_KINDS.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Step instructions · optional, max 1,000 characters</span>
              <textarea value={stepDetails} maxLength={1000} rows={3}
                onChange={e => setStepDetails(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
            </label>
            <Button type="button" disabled={!stepTitle.trim() || steps.length >= MAX_AGENT_STEPS}
              onClick={addStep}><FileCheck2 className="mr-2 h-4 w-4" />Add step</Button>
            <div className="space-y-2">
              {steps.length === 0 && <p className="text-sm text-slate-500">Add at least one step to prepare a plan.</p>}
              {steps.map((step, i) => (
                <div key={step.id} className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="break-words text-sm text-white">{i + 1}. {step.title}</strong>
                    <Badge variant="outline">{step.kind.replaceAll("_", " ")}</Badge>
                  </div>
                  {step.details && <p className="whitespace-pre-wrap break-words text-xs text-slate-400">{step.details}</p>}
                  <p className="text-xs text-amber-200">
                    {step.approvalRequired ? "Needs explicit approval before future execution" : "Proposed · not executed"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={i === 0}
                      onClick={() => changeOrder(step.id, -1)}><ArrowUp className="mr-1 h-3 w-3" />Up</Button>
                    <Button type="button" variant="outline" size="sm" disabled={i === steps.length - 1}
                      onClick={() => changeOrder(step.id, 1)}><ArrowDown className="mr-1 h-3 w-3" />Down</Button>
                    <Button type="button" variant="destructive" size="sm"
                      onClick={() => dropStep(step.id)}><Trash2 className="mr-1 h-3 w-3" />Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">4. Preview & export</CardTitle>
            <CardDescription className="text-slate-400">Copy the proposed plan for human review; it will not run.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!goal.trim() || !steps.length} onClick={preparePlan}>
                <FileCheck2 className="mr-2 h-4 w-4" />Prepare plan
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />Clear workspace
              </Button>
            </div>
            {plan && (
              <div className="space-y-3 rounded-lg border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Local only · execution disabled</Badge>
                <p className="text-xs text-amber-200">
                  {plan.steps.length} proposed steps · {plan.approvalSteps} require future explicit approval.
                  This is not an autonomous agent or permission grant.
                </p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-xs text-slate-300">{preview}</pre>
                <Button type="button" variant="outline" onClick={copy}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy proposed plan
                </Button>
              </div>
            )}
            {error && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
            </Alert>}
            {notice && <Alert role="status" aria-live="polite">
              <ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default AIAgentsStudio;
