import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Copy, Download, FileUp, Plus, Redo2, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import EducationWrittenReviewPanel from "@/components/education/EducationWrittenReviewPanel";
import { useAuthStore } from "@/store/authStore";
import { publicationRpcEnabled, requestEducationPublication } from "@/lib/educationPublicationRpc";
import {
  createInstructorDraft, instructorRpcEnabled, loadInstructorDraft,
  readInstructorAccess, readInstructorDrafts,
} from "@/lib/educationInstructorRpc";
import {
  emptyQuestionBank, exportQuestionBankJson, learnerQuestionPreview,
  newQuestion, parseQuestionBankJson, QUESTION_BANK_LIMITS,
  questionBankSummary, validateQuestionBank, validateQuestionBankDraft,
} from "@/lib/educationQuestionBank.mjs";
import {
  createBankUndoHistory, duplicateBankQuestion, duplicatePromptWarnings,
  moveBankQuestion, questionIssueTargets, searchBankQuestions,
} from "@/lib/educationBankWorkbench.mjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Choice = { id: string; text: string; correct: boolean };
type Question = { id: string; type: "multiple_choice" | "true_false" | "short_answer"; text: string; points: number; options: Choice[] };
type Bank = { version: number; title: string; description: string; duration_minutes: number; questions: Question[] };
type QuestionType = Question["type"];

function downloadJson(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** This is local authoring, not teacher authorization or a database exam. */
export default function EducationInstructorStudio() {
  const [bank, setBank] = useState<Bank>(() => emptyQuestionBank() as Bank);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "learner">("edit");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState<"all" | QuestionType>("all");
  const [historyController] = useState(() => createBankUndoHistory(emptyQuestionBank() as Bank));
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const [serverSaving, setServerSaving] = useState(false);
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [sourceDraftId, setSourceDraftId] = useState<string | null>(null);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const currentUserRef = useRef(user?.id);
  const accountGenerationRef = useRef(0);
  const resetEditor = (next: Bank) => {
    const state = historyController.reset(next);
    setBank(state.bank as Bank);
    setHistoryCounts({ undo: 0, redo: 0 });
    setQuestionSearch("");
    setQuestionTypeFilter("all");
  };
  const commitBank = (apply: (current: Bank) => Bank) => {
    try {
      const state = historyController.edit(apply);
      setBank(state.bank as Bank);
      setHistoryCounts({ undo: state.undoCount, redo: state.redoCount });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not edit this local draft.");
    }
  };
  const travelHistory = (direction: "undo" | "redo") => {
    const state = direction === "undo" ? historyController.undo() : historyController.redo();
    setBank(state.bank as Bank);
    setHistoryCounts({ undo: state.undoCount, redo: state.redoCount });
    setActiveId(previous => state.bank.questions.some(q => q.id === previous)
      ? previous : state.bank.questions.at(-1)?.id ?? null);
    setMessage(direction === "undo" ? "Local edit undone." : "Local edit restored.");
  };
  // Clear ALL private answer keys (including local-only drafts) before
  // painting a different account. No previous-user snapshot survives undo.
  useLayoutEffect(() => {
    if (currentUserRef.current === user?.id) return;
    currentUserRef.current = user?.id;
    accountGenerationRef.current += 1;
    resetEditor(emptyQuestionBank() as Bank);
    setActiveId(null);
    setSourceDraftId(null);
    setMode("edit");
    setMessage("Editor cleared after the account changed.");
  }, [user?.id]);

  const accessQuery = useQuery({
    queryKey: ["education-instructor-access", user?.id],
    enabled: instructorRpcEnabled && isAuthenticated && !!user?.id,
    queryFn: readInstructorAccess,
    retry: 1,
  });
  const draftsQuery = useQuery({
    queryKey: ["education-instructor-private-drafts", user?.id],
    enabled: instructorRpcEnabled && isAuthenticated && !!user?.id && accessQuery.data?.approved === true,
    queryFn: readInstructorDrafts,
    retry: 1,
  });
  const readiness = useMemo(() => validateQuestionBank(bank), [bank]);
  const draftCheck = useMemo(() => validateQuestionBankDraft(bank), [bank]);
  const summary = useMemo(() => questionBankSummary(bank), [bank]);
  const learnerView = useMemo(() => draftCheck.valid ? learnerQuestionPreview(bank) : [], [bank, draftCheck.valid]);
  const activeIndex = bank.questions.findIndex(q => q.id === activeId);
  const active = activeIndex >= 0 ? bank.questions[activeIndex] : null;
  const visibleQuestions = useMemo(() => searchBankQuestions(bank, questionSearch, questionTypeFilter),
    [bank, questionSearch, questionTypeFilter]);
  const duplicateWarnings = useMemo(() => duplicatePromptWarnings(bank), [bank]);
  const issueTargets = useMemo(() => questionIssueTargets(bank, readiness.issues),
    [bank, readiness.issues]);

  const changeBank = (fields: Partial<Bank>) => {
    commitBank(previous => ({ ...previous, ...fields }));
  };
  const updateQuestion = (id: string, apply: (question: Question) => Question) => {
    commitBank(previous => ({
      ...previous,
      questions: previous.questions.map(q => q.id === id ? apply(q) : q),
    }));
  };
  const addQuestion = (type: QuestionType) => {
    if (bank.questions.length >= QUESTION_BANK_LIMITS.questions) {
      setMessage("This bank has reached its 100-question limit.");
      return;
    }
    const question = newQuestion(type, crypto.randomUUID()) as Question;
    commitBank(previous => ({ ...previous, questions: [...previous.questions, question] }));
    setActiveId(question.id);
    setMode("edit");
    setMessage("");
  };
  const changeType = (type: QuestionType) => {
    if (!active) return;
    updateQuestion(active.id, q => ({
      ...newQuestion(type, q.id), text: q.text, points: q.points,
    }) as Question);
  };
  const changeOption = (optionId: string, text: string) => {
    if (!active) return;
    updateQuestion(active.id, q => ({ ...q,
      options: q.options.map(o => o.id === optionId ? { ...o, text } : o),
    }));
  };
  const chooseCorrect = (optionId: string) => {
    if (!active) return;
    updateQuestion(active.id, q => ({ ...q,
      options: q.options.map(o => ({ ...o, correct: o.id === optionId })),
    }));
  };
  const addOption = () => {
    if (!active || active.type !== "multiple_choice" ||
        active.options.length >= QUESTION_BANK_LIMITS.choices) return;
    updateQuestion(active.id, q => ({
      ...q, options: [...q.options, { id: crypto.randomUUID(), text: "", correct: false }],
    }));
  };
  const removeOption = (optionId: string) => {
    if (!active || active.type !== "multiple_choice" || active.options.length <= 2) return;
    updateQuestion(active.id, q => ({ ...q, options: q.options.filter(o => o.id !== optionId) }));
  };
  const moveQuestion = (direction: -1 | 1) => {
    if (!active || activeIndex + direction < 0 || activeIndex + direction >= bank.questions.length) return;
    commitBank(previous => moveBankQuestion(previous, active.id, direction));
  };
  const deleteQuestion = () => {
    if (!active || !window.confirm("Delete this question from the local draft?")) return;
    commitBank(previous => ({ ...previous, questions: previous.questions.filter(q => q.id !== active.id) }));
    setActiveId(null);
  };
  const duplicateActiveQuestion = () => {
    if (!active || !draftCheck.valid || bank.questions.length >= QUESTION_BANK_LIMITS.questions) return;
    try {
      const duplicate = duplicateBankQuestion(bank, active.id, () => crypto.randomUUID());
      commitBank(() => duplicate.bank as Bank);
      setActiveId(duplicate.questionId);
      setMode("edit");
      setMessage("Question duplicated locally with fresh question and option IDs. Verify its answer key before export.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Question duplication failed.");
    }
  };
  const handleExport = (ready: boolean) => {
    try {
      const contents = exportQuestionBankJson(bank, ready);
      downloadJson(contents, ready ? "eternyx-question-bank-ready.json" : "eternyx-question-bank-draft.json");
      toast.success(ready ? "Validated question bank downloaded." : "Local question-bank draft downloaded.");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cannot export this bank.");
    }
  };
  const handleLoadPrivateDraft = async (draftId: string) => {
    if (!instructorRpcEnabled || !accessQuery.data?.approved || loadingDraftId || serverSaving) return;
    if (!window.confirm("Load this private instructor draft? Unsaved edits in the current editor will be lost. Export local JSON first if needed.")) return;
    const generation = accountGenerationRef.current;
    setLoadingDraftId(draftId);
    setMessage("");
    try {
      const draft = await loadInstructorDraft(draftId);
      if (generation !== accountGenerationRef.current) return;
      resetEditor(draft.bank as Bank);
      setSourceDraftId(draft.id);
      setActiveId(draft.bank.questions[0]?.id ?? null);
      setMode("edit");
      setMessage("Private draft loaded. Saving these edits will create a NEW unpublished draft; the original is preserved.");
    } catch (error) {
      if (generation === accountGenerationRef.current)
        setMessage(error instanceof Error ? error.message : "Private draft could not be loaded.");
    } finally {
      setLoadingDraftId(null);
    }
  };
  const handleRequestPublication = async (draftId: string) => {
    if (!publicationRpcEnabled || !accessQuery.data?.approved || reviewRequestId || serverSaving) return;
    if (!window.confirm("Submit this unpublished assessment for administrator review? This will not make it available to students.")) return;
    const generation = accountGenerationRef.current;
    setReviewRequestId(draftId);
    setMessage("");
    try {
      await requestEducationPublication(draftId);
      if (generation !== accountGenerationRef.current) return;
      setMessage("Publication review requested. The exam remains unpublished until a trusted administrator approves it.");
      toast.success("Publication review requested.");
    } catch (error) {
      if (generation === accountGenerationRef.current)
        setMessage(error instanceof Error ? error.message : "Publication review could not be requested.");
    } finally {
      setReviewRequestId(null);
    }
  };
  const handlePrivateDraftSave = async () => {
    if (!instructorRpcEnabled || !accessQuery.data?.approved || !readiness.valid || serverSaving) return;
    const generation = accountGenerationRef.current;
    setServerSaving(true);
    setMessage("");
    try {
      const created = await createInstructorDraft(bank);
      if (generation !== accountGenerationRef.current) return;
      if (created.question_count !== bank.questions.length) {
        throw new Error("The server returned an unexpected question count; inspect your draft list.");
      }
      setSourceDraftId(created.id);
      setMessage("New private draft saved. It is inactive and unpublished. Earlier drafts are preserved.");
      toast.success("Unpublished instructor draft saved.");
      await queryClient.invalidateQueries({ queryKey: ["education-instructor-private-drafts", user?.id] });
    } catch (error) {
      if (generation === accountGenerationRef.current)
        setMessage(error instanceof Error ? error.message : "The instructor draft could not be saved.");
    } finally {
      setServerSaving(false);
    }
  };
  const handleImport = async (file?: File) => {
    if (!file) return;
    if (file.size > QUESTION_BANK_LIMITS.fileBytes) {
      setMessage("The selected JSON file is too large (limit: 256 KB).");
      return;
    }
    const generation = accountGenerationRef.current;
    setImporting(true);
    try {
      const parsed = parseQuestionBankJson(await file.text()) as Bank;
      if (generation !== accountGenerationRef.current) return;
      resetEditor(parsed);
      setSourceDraftId(null);
      setActiveId(parsed.questions[0]?.id ?? null);
      setMode("edit");
      setMessage("Question-bank draft imported. Review its content before exporting.");
    } catch (error) {
      if (generation === accountGenerationRef.current)
        setMessage(error instanceof Error ? error.message : "Question-bank import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link to="/education" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to Education
        </Link>
        <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 sm:p-9">
          <div className="flex items-center gap-3 text-primary"><BookOpen aria-hidden="true" className="h-7 w-7" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">ETERNYX Education · Authoring</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Local Question Bank Studio</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Prepare real assessment questions, check answer keys, preview what learners would see,
            and export portable JSON. All editing stays in this browser tab and nothing is automatically saved.
            Uploading a private draft is optional and available only to approved instructors in a configured environment.
          </p>
        </header>

        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertDescription className="text-sm leading-6">
            This local studio does not grant an instructor role or publish examinations. Keep exported
            answer-key files private. The connected instructor dashboard requires separately verified
            server authorization before activation.
          </AlertDescription>
        </Alert>

        {instructorRpcEnabled && (
          <section aria-label="Verified instructor private drafts" className="space-y-3 rounded-2xl border border-primary/25 bg-card p-5">
            <h2 className="text-lg font-semibold">Verified instructor workspace</h2>
            {accessQuery.isPending && <p role="status" className="text-sm text-muted-foreground">Checking instructor approval…</p>}
            {accessQuery.error && <div className="flex flex-wrap items-center gap-3 text-sm">
              <p role="alert">Instructor verification could not be completed. No draft was uploaded.</p>
              <Button variant="outline" onClick={() => void accessQuery.refetch()}>Retry verification</Button>
            </div>}
            {accessQuery.data?.approved === false && (
              <p className="text-sm text-muted-foreground">Your account is not approved for server-side instructor authoring. You can still use local JSON files.</p>
            )}
            {accessQuery.data?.approved === true && <>
              <p className="text-sm text-muted-foreground">
                Approved instructor access verified. You may explicitly save a validated bank as an inactive, unpublished server draft.
                Loading a private draft is allowed only for its owner. Saving edits creates a new revision copy, leaving the earlier draft unchanged.
                Answer-key files must not be shared with students.
              </p>
              <Button disabled={!readiness.valid || serverSaving || !!loadingDraftId} onClick={() => void handlePrivateDraftSave()}>
                {serverSaving ? "Saving private draft…" : "Save as new private draft"}
              </Button>
              {draftsQuery.isPending && <p role="status" className="text-sm">Loading your private drafts…</p>}
              {draftsQuery.error && <div className="flex flex-wrap items-center gap-3 text-sm">
                <p role="alert">Could not load your private draft list.</p>
                <Button variant="outline" onClick={() => void draftsQuery.refetch()}>Retry drafts</Button>
              </div>}
              {sourceDraftId && <p role="status" className="text-xs text-muted-foreground">
                Source draft: {sourceDraftId.slice(0, 8)}… Revisions are saved as new drafts, never in place.
              </p>}
              {draftsQuery.data && <div className="space-y-2">
                <h3 className="text-sm font-semibold">Your private drafts ({draftsQuery.data.length})</h3>
                {draftsQuery.data.length === 0 && <p className="text-sm text-muted-foreground">No server drafts have been returned for this account.</p>}
                <ul className="space-y-2">
                  {draftsQuery.data.map(draft => <li key={draft.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                    <span className="font-medium">{draft.title}</span>
                    <span className="ml-2 text-muted-foreground">{draft.duration_minutes} min · Unpublished</span>
                    <Button size="sm" variant="outline" className="mt-2 min-h-10 w-full sm:ml-3 sm:mt-0 sm:w-auto"
                      disabled={!!loadingDraftId || serverSaving}
                      onClick={() => void handleLoadPrivateDraft(draft.id)}>
                      {loadingDraftId === draft.id ? "Loading draft…" : "Load for revision"}
                    </Button>
                    {publicationRpcEnabled && <Button size="sm" variant="outline"
                      className="mt-2 min-h-10 w-full sm:ml-2 sm:mt-0 sm:w-auto"
                      disabled={!!reviewRequestId || !!loadingDraftId || serverSaving}
                      onClick={() => void handleRequestPublication(draft.id)}>
                      {reviewRequestId === draft.id ? "Requesting review…" : "Request publication review"}
                    </Button>}
                  </li>)}
                </ul>
              </div>}
            </>}
          </section>
        )}

        {instructorRpcEnabled && accessQuery.data?.approved === true && user?.id && (
          <EducationWrittenReviewPanel key={user.id} userId={user.id} />
        )}

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Local question bank editing history">
          <Button variant="outline" onClick={() => travelHistory("undo")}
            disabled={historyCounts.undo === 0 || serverSaving || importing || !!loadingDraftId}
            aria-label="Undo local question bank edit"><Undo2 aria-hidden="true" className="mr-2 h-4 w-4" />Undo</Button>
          <Button variant="outline" onClick={() => travelHistory("redo")}
            disabled={historyCounts.redo === 0 || serverSaving || importing || !!loadingDraftId}
            aria-label="Redo local question bank edit"><Redo2 aria-hidden="true" className="mr-2 h-4 w-4" />Redo</Button>
          <span className="text-xs text-muted-foreground">Up to 30 in-memory undo steps · Not saved online</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importing}>
            <FileUp aria-hidden="true" className="mr-2 h-4 w-4" />{importing ? "Importing…" : "Import JSON"}
          </Button>
          <input aria-label="Import question-bank JSON file" ref={importRef} type="file"
            accept=".json,application/json" className="sr-only"
            onChange={event => void handleImport(event.target.files?.[0])} />
          <Button variant="outline" onClick={() => handleExport(false)} disabled={!draftCheck.valid}>
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />Save draft JSON
          </Button>
          <Button onClick={() => handleExport(true)} disabled={!readiness.valid}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />Export validated bank
          </Button>
          <Button variant="ghost" onClick={() => {
            if (!window.confirm("Clear this unsaved local question bank? Download a draft first if needed.")) return;
            resetEditor(emptyQuestionBank() as Bank); setActiveId(null); setSourceDraftId(null); setMode("edit"); setMessage("");
          }}>New bank</Button>
        </div>

        {message && <p role="status" aria-live="polite" className="rounded-lg border border-border bg-card p-3 text-sm">{message}</p>}

        <section aria-labelledby="bank-details" className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <h2 id="bank-details" className="text-lg font-semibold sm:col-span-2">Bank details</h2>
          <div className="sm:col-span-2">
            <label htmlFor="question-bank-title" className="mb-1 block text-sm font-medium">Bank title</label>
            <input id="question-bank-title" value={bank.title} maxLength={QUESTION_BANK_LIMITS.title}
              onChange={event => changeBank({ title: event.target.value })}
              placeholder="e.g. Corrosion Theory — Chapter 1"
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" />
          </div>
          <div>
            <label htmlFor="question-bank-description" className="mb-1 block text-sm font-medium">Description</label>
            <textarea id="question-bank-description" value={bank.description} maxLength={QUESTION_BANK_LIMITS.description} rows={3}
              onChange={event => changeBank({ description: event.target.value })}
              className="w-full rounded-lg border border-input bg-background p-3 text-foreground" />
          </div>
          <div>
            <label htmlFor="question-bank-duration" className="mb-1 block text-sm font-medium">Suggested duration (minutes)</label>
            <input id="question-bank-duration" type="number" min={1} max={1440} step={1}
              value={bank.duration_minutes} onChange={event => changeBank({ duration_minutes: Number(event.target.value) })}
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">This is a draft setting, not an active exam timer.</p>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Questions</p><p className="mt-1 text-2xl font-bold">{summary.count}</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Maximum points</p><p className="mt-1 text-2xl font-bold">{summary.maxPoints}</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Question types</p><p className="mt-1 text-sm">{summary.types.multiple_choice} MCQ · {summary.types.true_false} True/False · {summary.types.short_answer} Written</p></div>
        </div>

        <section aria-labelledby="readiness-title" className="rounded-xl border border-border bg-card p-4">
          <h2 id="readiness-title" className="font-semibold">Validation</h2>
          {readiness.valid ? <p role="status" className="mt-2 text-sm text-primary">Ready for validated local JSON export.</p> : (
            <div role="status" className="mt-2">
              <p className="text-sm text-muted-foreground">{readiness.issues.length} issue(s) to resolve before validated export.</p>
              {issueTargets.length > 0 && <Button size="sm" variant="outline" className="mt-3"
                onClick={() => { setActiveId(issueTargets[0].id); setQuestionSearch(""); setQuestionTypeFilter("all"); setMode("edit"); }}>
                Jump to first question issue
              </Button>}
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {readiness.issues.slice(0, 12).map((issue, index) => <li key={index}>{issue}</li>)}
                {readiness.issues.length > 12 && <li>Additional issues remain.</li>}
              </ul>
            </div>
          )}

        </section>
        {duplicateWarnings.length > 0 && <section aria-label="Potential duplicate question prompts"
          className="rounded-xl border border-amber-500/30 bg-card p-4">
          <h2 className="font-semibold">Repeated question wording</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {duplicateWarnings.length} possible duplicate prompt(s) found. These are editorial warnings, not automatic grading decisions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {duplicateWarnings.slice(0, 10).map(warning => (
              <Button key={warning.questionId} variant="outline" size="sm"
                onClick={() => { setActiveId(warning.questionId); setQuestionSearch(""); setQuestionTypeFilter("all"); setMode("edit"); }}>
                Question {warning.questionNumber} repeats {warning.firstNumber}
              </Button>
            ))}
          </div>
        </section>}

        <section aria-labelledby="question-authoring" className="grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <h2 id="question-authoring" className="text-lg font-semibold">Questions</h2>
            <div className="space-y-3 rounded-xl border border-border bg-card p-3">
              <label htmlFor="authoring-question-search" className="block text-sm font-medium">Find questions</label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/>
                <input id="authoring-question-search" type="search" maxLength={120}
                  value={questionSearch} onChange={event => setQuestionSearch(event.target.value)}
                  placeholder="Search question wording" className="min-h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm"/>
              </div>
              <label htmlFor="authoring-question-type" className="block text-sm font-medium">Question type</label>
              <select id="authoring-question-type" value={questionTypeFilter}
                onChange={event => setQuestionTypeFilter(event.target.value as "all" | QuestionType)}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
                <option value="all">All types</option>
                <option value="multiple_choice">Multiple choice</option>
                <option value="true_false">True / False</option>
                <option value="short_answer">Written</option>
              </select>
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {visibleQuestions.length} of {bank.questions.length} questions shown
              </p>
              {(questionSearch || questionTypeFilter !== "all") &&
                <Button variant="ghost" size="sm"
                  onClick={() => { setQuestionSearch(""); setQuestionTypeFilter("all"); }}>
                  Clear question filters
                </Button>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => addQuestion("multiple_choice")}><Plus aria-hidden="true" className="mr-1 h-4 w-4" />MCQ</Button>
              <Button variant="outline" onClick={() => addQuestion("true_false")}><Plus aria-hidden="true" className="mr-1 h-4 w-4" />True/False</Button>
              <Button variant="outline" onClick={() => addQuestion("short_answer")}><Plus aria-hidden="true" className="mr-1 h-4 w-4" />Written</Button>
            </div>
            {bank.questions.length === 0 ? <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              No questions yet. Add your first question above, or import an existing local bank.
            </p> : <div className="max-h-[540px] space-y-2 overflow-auto" aria-label="Question list">
              {visibleQuestions.length === 0 && <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                No questions match these filters. Clear filters to view the full bank.
              </p>}
              {visibleQuestions.map(({ id, index }) => {
                const q = bank.questions[index];
                return <button type="button" key={id} onClick={() => { setActiveId(q.id); setMode("edit"); }}
                  aria-current={q.id === activeId ? "true" : undefined}
                  className={"w-full rounded-xl border p-3 text-left transition-colors " +
                    (q.id === activeId ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/30")}>
                  <p className="text-xs text-muted-foreground">Question {index + 1} · {q.type.replaceAll("_", " ")} · {q.points} pt</p>
                  <p className="mt-1 break-words text-sm font-medium">{q.text.trim() || "Untitled question"}</p>
                </button>;
              })}
            </div>}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Question workspace display">
              <Button variant={mode === "edit" ? "default" : "outline"} onClick={() => setMode("edit")}>Edit questions</Button>
              <Button variant={mode === "learner" ? "default" : "outline"} onClick={() => setMode("learner")}>Learner preview</Button>
            </div>

            {mode === "learner" ? (
              <Card><CardHeader><CardTitle>Learner preview</CardTitle>
                <CardDescription>Displays questions and choices without showing correct answers. This does not deliver an exam.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  {!draftCheck.valid && <p role="alert" className="text-sm text-destructive">Fix malformed draft fields before previewing questions.</p>}
                  {!learnerView.length && <p className="text-sm text-muted-foreground">Add questions to preview them.</p>}
                  {learnerView.map((q, index) => (
                    <div key={q.id} className="space-y-2 rounded-xl border border-border p-4">
                      <p className="break-words font-medium">{index + 1}. {q.text || "Question not written"} ({q.points} pt)</p>
                      {q.options.length ? <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {q.options.map(o => <li key={o.id}>{o.text || "Choice not written"}</li>)}
                      </ul> : <p className="text-sm text-muted-foreground">Written response</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : !active ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                Select a question on the left to edit its contents and answer choices.
              </div>
            ) : (
              <Card>
                <CardHeader><CardTitle>Editing question {activeIndex + 1}</CardTitle>
                  <CardDescription>Changes stay in memory until you explicitly export a JSON file.</CardDescription></CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={activeIndex === 0} onClick={() => moveQuestion(-1)}>
                      <ArrowUp aria-hidden="true" className="mr-1 h-4 w-4" />Move up
                    </Button>
                    <Button variant="outline" size="sm" disabled={activeIndex === bank.questions.length - 1}
                      onClick={() => moveQuestion(1)}><ArrowDown aria-hidden="true" className="mr-1 h-4 w-4" />Move down</Button>
                    <Button variant="outline" size="sm" onClick={duplicateActiveQuestion}
                      disabled={!draftCheck.valid || bank.questions.length >= QUESTION_BANK_LIMITS.questions}>
                      <Copy aria-hidden="true" className="mr-1 h-4 w-4" />Duplicate
                    </Button>
                    <Button variant="destructive" size="sm" onClick={deleteQuestion}><Trash2 aria-hidden="true" className="mr-1 h-4 w-4" />Delete</Button>
                  </div>
                  <div>
                    <label htmlFor="question-bank-type" className="mb-1 block text-sm font-medium">Question type</label>
                    <select id="question-bank-type" value={active.type} onChange={e => changeType(e.target.value as QuestionType)}
                      className="min-h-11 w-full rounded-lg border border-input bg-background px-3">
                      <option value="multiple_choice">Single-answer multiple choice</option>
                      <option value="true_false">True / False</option>
                      <option value="short_answer">Written short answer</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="question-bank-text" className="mb-1 block text-sm font-medium">Question text</label>
                    <textarea id="question-bank-text" value={active.text} rows={4} maxLength={QUESTION_BANK_LIMITS.question}
                      onChange={e => updateQuestion(active.id, q => ({ ...q, text: e.target.value }))}
                      className="w-full rounded-lg border border-input bg-background p-3" />
                  </div>
                  <div>
                    <label htmlFor="question-bank-points" className="mb-1 block text-sm font-medium">Points</label>
                    <input id="question-bank-points" value={active.points} type="number" min={1}
                      max={QUESTION_BANK_LIMITS.points} step={1}
                      onChange={e => updateQuestion(active.id, q => ({ ...q, points: Number(e.target.value) }))}
                      className="min-h-11 w-full rounded-lg border border-input bg-background px-3" />
                  </div>
                  {active.type === "short_answer" ? (
                    <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                      Written answers require separate human review; this studio does not invent grading.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="font-semibold">Answer choices</h3>
                      {active.options.map((option, index) => (
                        <div key={option.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input type="radio" name={"correct-" + active.id} checked={option.correct}
                              aria-label={"Mark choice " + (index + 1) + " correct"}
                              onChange={() => chooseCorrect(option.id)} />
                            Correct
                          </label>
                          <input value={option.text} maxLength={QUESTION_BANK_LIMITS.option}
                            aria-label={"Choice " + (index + 1) + " text"} disabled={active.type === "true_false"}
                            onChange={e => changeOption(option.id, e.target.value)}
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
                          {active.type === "multiple_choice" && active.options.length > 2 &&
                            <Button variant="ghost" size="sm" aria-label={"Remove choice " + (index + 1)}
                              onClick={() => removeOption(option.id)}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
                        </div>
                      ))}
                      {active.type === "multiple_choice" && active.options.length < QUESTION_BANK_LIMITS.choices &&
                        <Button variant="outline" onClick={addOption}><Plus aria-hidden="true" className="mr-2 h-4 w-4" />Add choice</Button>}
                      <p className="text-xs text-muted-foreground">Select exactly one correct choice. This answer key appears only in the authoring view and instructor JSON export.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
        <p className="text-xs text-muted-foreground">
          Local authoring files are not synchronized or published. Closing this tab without downloading a draft will lose the edits. No paid services are used.
        </p>
      </div>
    </main>
  );
}
