import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import {
  PRACTICE_CASES, PRACTICE_TRACKS,
  gradePracticeAnswerAsync, summarizePracticeProgress,
} from "@/lib/eternyxLabsPractice.mjs";

const fieldClass="min-h-11 w-full rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const buttonClass="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/80 px-4 py-2.5 text-sm font-semibold transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const primaryClass="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function LabsPracticeChallenges(){
  const [activeId,setActiveId]=useState(PRACTICE_CASES[0].id);
  const [answer,setAnswer]=useState("");
  const [result,setResult]=useState<Awaited<ReturnType<typeof gradePracticeAnswerAsync>> | null>(null);
  const [checking,setChecking]=useState(false);
  const requestSeq=useRef(0);
  useEffect(()=>()=>{++requestSeq.current;},[]);
  const [hintOpen,setHintOpen]=useState(false);
  const [passed,setPassed]=useState<Set<string>>(()=>new Set());
  const [feedbackError,setFeedbackError]=useState<string | null>(null);

  const active=PRACTICE_CASES.find(c=>c.id===activeId)!;
  const track=PRACTICE_TRACKS.find(t=>t.id===active.track)!;
  const cases=PRACTICE_CASES.filter(c=>c.track===active.track);
  const progress=useMemo(()=>summarizePracticeProgress(passed),[passed]);

  const selectCase=(id:string)=>{
    if(!PRACTICE_CASES.some(c=>c.id===id))return;
    ++requestSeq.current;
    setChecking(false);
    setActiveId(id);
    setAnswer("");
    setResult(null);
    setHintOpen(false);
    setFeedbackError(null);
  };
  const grade=async()=>{
    const ticket=++requestSeq.current;
    const caseId=activeId;
    const submittedAnswer=answer;
    setChecking(true);
    setResult(null);
    setFeedbackError(null);
    try{
      const checked=await gradePracticeAnswerAsync(caseId,submittedAnswer);
      if(ticket!==requestSeq.current)return;
      setResult(checked);
      if(checked.correct)setPassed(old=>{
        if(old.has(caseId))return old;
        const next=new Set(old);
        next.add(caseId);
        return next;
      });
    }catch(error){
      if(ticket!==requestSeq.current)return;
      setResult(null);
      setFeedbackError(error instanceof Error?error.message:"Enter a valid answer to check locally.");
    }finally{
      if(ticket===requestSeq.current)setChecking(false);
    }
  };
  const editAnswer=(value:string)=>{
    ++requestSeq.current;
    setChecking(false);
    setAnswer(value);
    setResult(null);
    setFeedbackError(null);
  };
  const next=()=>{
    const index=PRACTICE_CASES.findIndex(c=>c.id===activeId);
    selectCase(PRACTICE_CASES[(index+1)%PRACTICE_CASES.length].id);
  };
  const reset=()=>{
    setPassed(new Set());
    selectCase(PRACTICE_CASES[0].id);
  };
  return (
    <section id="labs-practice" aria-labelledby="labs-practice-title"
      className="space-y-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-background p-5 sm:p-7">
      <div className="space-y-3">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-primary">
          <BookOpen className="h-4 w-4"/> Practice and check
        </p>
        <h2 id="labs-practice-title" className="text-2xl font-bold sm:text-3xl">Security and defensive operations challenge lab</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {PRACTICE_CASES.length} hands-on questions across {PRACTICE_TRACKS.length} tracks. Answers are checked against the
          actual offline Labs calculators and Web Crypto, with explanations and retries. This is open-book,
          client-side practice—not a trusted exam, credential, or account-linked achievement.
        </p>
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-lg border border-primary/25 bg-primary/[0.07] px-3 py-2 font-semibold">
            {progress.passed} / {progress.total} locally checked correct
          </span>
          <span className="text-xs text-muted-foreground">
            Current tab only · no account save · no backend grader
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Choose a practice track</h3>
        <div role="group" aria-label="Practice tracks" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PRACTICE_TRACKS.map(t=>{
            const complete=progress.byTrack.find(p=>p.id===t.id)!;
            const activeTrack=track.id===t.id;
            return (
              <button key={t.id} type="button" aria-pressed={activeTrack}
                onClick={()=>selectCase(PRACTICE_CASES.find(c=>c.track===t.id)!.id)}
                className={"min-h-20 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary "+
                  (activeTrack?"border-primary/50 bg-primary/[0.09]":"border-border/60 bg-background/50 hover:border-primary/35")}>
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{complete.passed} / {complete.total} checked correct</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{track.description}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <nav aria-label="Questions in selected track" className="space-y-2">
          {cases.map((c,index)=><button key={c.id} type="button"
            aria-pressed={c.id===activeId} onClick={()=>selectCase(c.id)}
            className={"flex min-h-12 w-full items-center gap-2 rounded-xl border p-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary "+
              (c.id===activeId?"border-primary/50 bg-primary/[0.09]":"border-border/60 bg-background/50 hover:border-primary/35")}>
            {passed.has(c.id)
              ?<CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-label="Checked correct"/>
              :<CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true"/>}
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">Case {index+1}</span><span className="block font-medium">{c.title}</span></span>
          </button>)}
        </nav>

        <div className="min-w-0 space-y-5 rounded-2xl border border-border/70 bg-background/60 p-4 sm:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{track.title} · {cases.findIndex(c=>c.id===activeId)+1} of 3</p>
            <h3 className="text-xl font-bold">{active.title}</h3>
            <p className="text-sm leading-6">{active.prompt}</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-card/75 p-4 font-mono text-xs leading-6">{active.scenario}</pre>
          </div>

          <form className="space-y-3" onSubmit={event=>{event.preventDefault();grade();}}>
            <label htmlFor="labs-practice-answer" className="block text-sm font-semibold">
              {active.kind==="ipv4"?"Your IPv4 address":active.kind==="ipv6"?"Your IPv6 address":
                active.kind==="bigint"?"Your exact decimal integer":active.kind==="octal"?"Your octal mode":
                active.kind==="boolean"?"Choose Yes or No":
                active.kind==="base64url"?"Your case-sensitive Base64url challenge":
                active.kind==="hex64"?"Your 64-character HMAC digest":"Your whole-number answer"}
            </label>
            {active.kind==="boolean"
              ?<select id="labs-practice-answer" required value={answer}
                  onChange={event=>editAnswer(event.target.value)}
                  className={fieldClass}>
                  <option value="">Choose Yes or No</option>
                  <option value="yes">Yes</option><option value="no">No</option>
                </select>
              :<input id="labs-practice-answer" required type="text" autoComplete="off"
                  spellCheck={false} maxLength={64}
                  placeholder={active.kind==="ipv4"?"e.g. 192.168.10.0":
                    active.kind==="ipv6"?"e.g. 2001:db8::":
                    active.kind==="bigint"?"e.g. 340282366920938463463374607431768211456":
                    active.kind==="octal"?"e.g. 750":
                    active.kind==="base64url"?"43 unpadded Base64url characters":
                    active.kind==="hex64"?"64 hexadecimal characters":"e.g. 4"}
                  value={answer}
                  onChange={event=>editAnswer(event.target.value)}
                  className={fieldClass}/>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={checking} className={primaryClass+" disabled:opacity-60"}>
                <ShieldCheck className="h-4 w-4"/> {checking?"Checking locally…":"Check answer locally"}
              </button>
              <button type="button" className={buttonClass} aria-expanded={hintOpen}
                onClick={()=>setHintOpen(v=>!v)}><CircleHelp className="h-4 w-4"/> {hintOpen?"Hide hint":"Show hint"}</button>
              <button type="button" className={buttonClass} onClick={next}>Next scenario <ArrowRight className="h-4 w-4"/></button>
            </div>
          </form>

          {hintOpen&&<p className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4 text-sm leading-6"><strong>Hint:</strong> {active.hint}</p>}
          {feedbackError&&<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-4 text-sm text-destructive">{feedbackError}</p>}
          {result&&(
            <div role="status" aria-live="polite"
              className={"space-y-3 rounded-xl border p-4 "+(result.correct?
                "border-primary/35 bg-primary/[0.06]":"border-destructive/30 bg-destructive/[0.05]")}>
              <div className="flex items-center gap-2 font-semibold">
                {result.correct?<CheckCircle2 className="h-5 w-5 text-primary"/>:
                  <XCircle className="h-5 w-5 text-destructive"/>}
                {result.correct?"Correct — checked locally":"Not quite — review the calculation and retry"}
              </div>
              <p className="break-all text-sm">Calculated answer: <strong className="font-mono">{result.expected}</strong></p>
              <p className="text-sm leading-6 text-muted-foreground">{result.explanation}</p>
              <p className="text-xs text-muted-foreground">Client-side answer check only. No trusted score, account progress, or certificate.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/70 pt-5">
        <p className="max-w-2xl text-xs leading-6 text-muted-foreground">
          Your correct-answer count exists only while this page remains mounted.
          Refreshing or leaving may reset it. Nothing is recorded on the server.
          Answer keys are visible in client code; this is deliberately not an exam.
        </p>
        <button type="button" onClick={reset} className={buttonClass}>
          <RotateCcw className="h-4 w-4"/> Reset local practice
        </button>
      </div>
    </section>
  );
}
