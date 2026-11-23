import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Bot, ClipboardCopy, Download, FileCheck2, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import { useAIStudioChat } from "@/hooks/useAIStudioChat";
import {
  prepareAgentSuggestionPrompt, prepareAgentReviewPrompt,
  parseAgentAISuggestions, AgentAIReviewError,
  type AgentAISuggestion,
} from "@/lib/ai/agent-ai-assist";
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
  const [suggestions, setSuggestions] = useState<AgentAISuggestion[] | null>(null);
  const aiPlan = useAIStudioChat();
  const aiReview = useAIStudioChat();
  const preview = plan ? formatLocalAgentPlan(plan) : "";

  const invalidate = () => {
    aiPlan.invalidate();
    aiReview.invalidate();
    setSuggestions(null);
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
  const askAIForPlan = () => {
    setError(null);
    setNotice(null);
    setSuggestions(null);
    try {
      const prompt = prepareAgentSuggestionPrompt(goal, constraints);
      void aiPlan.run("ai.agents.plan", prompt);
    } catch (failure) {
      setError(failure instanceof AgentAIReviewError
        ? "Provide a goal and constraints that fit the AI Chat request budget. Nothing was submitted."
        : "Unable to prepare AI plan suggestions.");
    }
  };
  const inspectAISuggestions = () => {
    if (!aiPlan.result) return;
    try {
      const candidates = parseAgentAISuggestions(aiPlan.result);
      if (steps.length + candidates.length > MAX_AGENT_STEPS) {
        setError("Too many suggestions to import. Remove local steps first; nothing was imported.");
        return;
      }
      setSuggestions(candidates);
      setNotice("AI suggestions validated as local draft data only. Review all text and explicitly confirm before importing.");
      setError(null);
    } catch {
      setSuggestions(null);
      setError("The AI response was not valid safe step JSON. Review it manually; no steps were imported.");
    }
  };
  const importAISuggestions = () => {
    if (!suggestions?.length || steps.length + suggestions.length > MAX_AGENT_STEPS) return;
    if (!window.confirm(
      "Import these AI suggestions as LOCAL PROPOSED STEPS only? This does NOT run them or grant tool permissions. Review the content before accepting.",
    )) return;
    try {
      let next = [...steps];
      for (const suggested of suggestions) {
        // New IDs and manual validation; model-supplied IDs, status,
        // permissions and execution flags are never imported.
        next = createAgentStep(next, {
          id: crypto.randomUUID(), title: suggested.title,
          details: suggested.details, kind: suggested.kind,
        });
      }
      setSteps(next);
      invalidate();
      setNotice("Reviewed AI suggestions imported as proposed local steps only. No agent started.");
    } catch {
      setError("Suggestions could not be imported safely. Your existing steps were kept.");
    }
  };
  const askAIForReview = () => {
    if (!plan) return;
    try {
      const prompt = prepareAgentReviewPrompt(formatLocalAgentPlan(plan));
      setError(null);
      setNotice(null);
      void aiReview.run("ai.agents.review", prompt);
    } catch {
      setError("This proposed plan is too long for AI Chat review. Shorten the plan; nothing was truncated or submitted.");
    }
  };
  const exportPlan = () => {
    if (!plan) return;
    const url = URL.createObjectURL(new Blob([preview], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "eternyx-agent-plan-draft.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Local plan export requested; no agent was executed.");
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
            Local drafts · optional AI Chat review
          </Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            No autonomous agent has been started. Manual planning, editing and exports remain local; no tools are executed.
            Optional AI Chat requests send the selected goal, constraints or plan text to an external AI provider,
            use existing ai.chat credits and save chat history ONLY when clicked. A proposed scope grants no permission.
            AI step suggestions require separate human inspection and confirmation before becoming local draft steps.
            No external actions are ever run, scheduled or approved in this studio.
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
                    <Badge variant="outline">{step.kind.replace(/_/g, " ")}</Badge>
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
          <CardHeader>
            <CardTitle className="text-white">4. Optional AI step suggestions</CardTitle>
            <CardDescription className="text-slate-400">
              Use ETERNYX AI Chat to suggest research, drafting and review tasks. AI cannot run them or grant access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-300">
              Explicit opt-in: sending the goal and constraints to the configured external AI provider
              uses existing ai.chat credits and saves a chat session. There are no automatic retries.
              Suggested steps are untrusted text; they must be inspected and manually imported.
            </p>
            <Button type="button" disabled={!goal.trim() || aiPlan.loading} onClick={askAIForPlan}>
              <Bot className="mr-2 h-4 w-4" />{aiPlan.loading ? "Requesting AI suggestions…" : "Suggest steps with AI Chat"}
            </Button>
            {aiPlan.error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" />
              <AlertDescription>{aiPlan.error}</AlertDescription></Alert>}
            {aiPlan.result && <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
              <Badge variant="outline">Untrusted AI plan suggestions · not executed</Badge>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">{aiPlan.result}</pre>
              <Button type="button" variant="outline" onClick={inspectAISuggestions}>
                <FileCheck2 className="mr-2 h-4 w-4" />Validate suggested steps for review
              </Button>
            </div>}
            {suggestions && <section className="space-y-3 rounded-lg border border-cyan-500/30 bg-slate-950 p-3">
              <p className="text-sm text-cyan-200">
                Human review required: {suggestions.length} proposed research/draft/review steps.
                No external or paid steps accepted. Importing does not grant permission or run anything.
              </p>
              {suggestions.map((suggested, i) => (
                <div key={i} className="rounded-md border border-slate-700 p-3 text-sm">
                  <strong>{i + 1}. {suggested.title}</strong>
                  <Badge variant="outline" className="ml-2">{suggested.kind}</Badge>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300">{suggested.details}</p>
                </div>
              ))}
              <Button type="button" disabled={steps.length + suggestions.length > MAX_AGENT_STEPS} onClick={importAISuggestions}>
                Import reviewed suggestions as local proposed steps
              </Button>
            </section>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">5. Preview, AI review & export</CardTitle>
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
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={copy}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />Copy proposed plan
                  </Button>
                  <Button type="button" variant="outline" onClick={exportPlan}>
                    <Download className="mr-2 h-4 w-4" />Download local draft
                  </Button>
                </div>
                <section className="space-y-3 rounded-lg border border-violet-400/20 p-3">
                  <h3 className="font-semibold">Optional AI quality and safety review</h3>
                  <p className="text-xs text-slate-400">
                    A separate click sends this bounded draft to the external ETERNYX AI Chat provider,
                    using ai.chat credits and saved history. It only generates advice, never performs work.
                    Oversized plans are refused locally rather than silently truncated.
                  </p>
                  <Button type="button" disabled={aiReview.loading} onClick={askAIForReview}>
                    {aiReview.loading ? "Reviewing with AI…" : "Review this plan with AI Chat"}
                  </Button>
                  {aiReview.error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" />
                    <AlertDescription>{aiReview.error}</AlertDescription></Alert>}
                  {aiReview.result && <div className="space-y-2">
                    <Badge variant="outline">AI critique · advisory only</Badge>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-800 p-3 text-xs text-slate-200">{aiReview.result}</pre>
                  </div>}
                </section>
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
