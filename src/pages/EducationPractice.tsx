import {useMemo,useRef,useState} from "react";
import type {ChangeEvent} from "react";
import {Link} from "react-router-dom";
import {ArrowLeft,BookOpen,CheckCircle2,Download,FileUp,Flag,RotateCcw,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Alert,AlertDescription} from "@/components/ui/alert";
import {
  PRACTICE_FILE_MAX_BYTES,PRACTICE_ANSWER_MAX,
  parseEducationPracticeFile,updatePracticeResponse,togglePracticeFlag,
  summarizePractice,buildPracticeSessionJson,buildPracticeAnswerCsv,
} from "@/lib/educationPracticeWorkspace.mjs";

type PracticeWorksheet={
  format:string;version:number;title:string;description:string;
  suggested_duration_minutes:number;notice:string;
  questions:Array<{number:number;type:"multiple_choice"|"true_false"|"short_answer";
    text:string;points:number;choices:string[]}>;
};
type PracticeResponse={number:number;choice_index:number|null;written_text:string};
type ViewFilter="all"|"unanswered"|"flagged";

function downloadLocal(content:string,name:string,type:string){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement("a");
  link.href=url;link.download=name;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function EducationPractice(){
  const fileInput=useRef<HTMLInputElement>(null);
  const [worksheet,setWorksheet]=useState<PracticeWorksheet|null>(null);
  const [responses,setResponses]=useState<PracticeResponse[]>([]);
  const [flags,setFlags]=useState<number[]>([]);
  const [current,setCurrent]=useState(1);
  const [filter,setFilter]=useState<ViewFilter>("all");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const progress=useMemo(()=>worksheet?summarizePractice(worksheet,responses,flags):null,
    [worksheet,responses,flags]);
  const question=worksheet?.questions[current-1]??null;
  const answer=responses[current-1]??null;
  const visibleNumbers=useMemo(()=>{
    if(!worksheet)return [];
    return worksheet.questions.filter(q=>{
      const r=responses[q.number-1];
      if(filter==="flagged")return flags.includes(q.number);
      if(filter==="unanswered")return q.type==="short_answer"
        ? !r?.written_text.trim():r?.choice_index===null;
      return true;
    }).map(q=>q.number);
  },[worksheet,responses,flags,filter]);

  const importFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    try{
      if(worksheet&&!window.confirm(
        "Replace your current practice? Download a resume JSON first if you want to keep your answers."))return;
      setBusy(true);setError("");setMessage("");
      if(file.size>PRACTICE_FILE_MAX_BYTES || file.size===0)
        throw new Error("Choose a JSON worksheet or saved session under the local file limit.");
      const data=parseEducationPracticeFile(await file.text());
      setWorksheet(data.worksheet as PracticeWorksheet);
      setResponses(data.responses as PracticeResponse[]);
      setFlags([...data.flags]);
      setCurrent(1);setFilter("all");
      setMessage("Practice loaded locally. No answers, grade or worksheet was uploaded.");
    }catch{
      setError("Import blocked. Use an ETERNYX learner worksheet JSON or a saved learner session JSON. Instructor answer-key files are not accepted.");
    }finally{
      setBusy(false);
      if(fileInput.current)fileInput.current.value="";
    }
  };
  const setChoice=(choice_index:number|null)=>{
    if(!worksheet||!question||!answer||busy)return;
    try{
      setResponses(updatePracticeResponse(worksheet,responses,current,choice_index,""));
      setError("");
    }catch{setError("Your answer could not be updated. Import the worksheet again.");}
  };
  const setWritten=(text:string)=>{
    if(!worksheet||!question||!answer||busy)return;
    try{
      setResponses(updatePracticeResponse(worksheet,responses,current,null,text));
      setError("");
    }catch{setError("Your answer could not be updated. Import the worksheet again.");}
  };
  const flipFlag=()=>{
    if(!worksheet)return;
    try{setFlags([...togglePracticeFlag(worksheet,flags,current)]);}
    catch{setError("Could not update your review flag.");}
  };
  const exportFile=(which:"session"|"csv")=>{
    if(!worksheet)return;
    try{
      const text=which==="session"
        ? buildPracticeSessionJson(worksheet,responses,flags)
        : buildPracticeAnswerCsv(worksheet,responses);
      downloadLocal(text,which==="session"?"eternyx-practice-resume.json":"eternyx-practice-answers.csv",
        which==="session"?"application/json;charset=utf-8":"text/csv;charset=utf-8");
      setMessage(which==="session"?
        "Resume file saved. Import it later to restore your worksheet, answers and review flags.":
        "Your ungraded responses were exported as a CSV. Treat this as a private file.");
    }catch{setError("Export was blocked because practice data could not be validated.");}
  };
  const clear=()=>{
    if(!worksheet||!window.confirm(
      "Clear the worksheet and all local responses? Download a resume JSON first if you need it."))return;
    setWorksheet(null);setResponses([]);setFlags([]);setCurrent(1);
    setFilter("all");setMessage("Practice cleared from this tab.");setError("");
  };
  const unanswered=progress?.next_unanswered??null;
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/education" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="h-4 w-4"/>Education Hub
      </Link>
      <header className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <BookOpen aria-hidden="true" className="h-5 w-5"/>ETERNYX Education
        </div>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Learner Practice Workspace</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Complete an instructor-exported learner worksheet in your browser. Practice at your
          own pace, revisit questions and save an explicit resume file when you choose.
          This is not a graded exam, score, certificate or server-submitted assessment.
        </p>
      </header>
      <section aria-label="Load local practice" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Import a learner worksheet or saved practice session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              JSON exported from Question Bank Studio, or your own resume JSON. Instructor banks containing answer keys are rejected.
            </p>
          </div>
          <Button variant="outline" disabled={busy} onClick={()=>fileInput.current?.click()}>
            <FileUp aria-hidden="true" className="mr-2 h-4 w-4"/>{busy?"Reading file…":worksheet?"Replace practice JSON":"Choose practice JSON"}
          </Button>
          <input ref={fileInput} type="file" className="sr-only"
            aria-label="Choose learner worksheet or resume JSON"
            accept=".json,application/json" onChange={e=>void importFile(e)}/>
        </div>
        <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-primary"/>
          No account required. Your worksheet and answers are never uploaded, autosaved or sent for grading.
          Your practice is kept in this tab's memory only; export a resume file before refreshing or leaving.
        </p>
      </section>
      {error&&<Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
      {message&&<p role="status" className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">{message}</p>}
      {!worksheet&&<section className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
        <BookOpen aria-hidden="true" className="mx-auto h-9 w-9 text-primary"/>
        <h2 className="mt-3 text-lg font-semibold">Your practice starts with a real worksheet</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Ask an instructor for a key-free learner worksheet JSON, or prepare your own in
          the local Question Bank Studio. No demo questions or scores are fabricated.
        </p>
        <Button asChild variant="outline" className="mt-4"><Link to="/education/question-bank">
          Open Question Bank Studio</Link></Button>
      </section>}
      {worksheet&&progress&&question&&answer&&<>
        <section aria-label="Practice progress" className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold break-words">{worksheet.title}</h2>
              {worksheet.description&&<p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{worksheet.description}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                Suggested duration: {worksheet.suggested_duration_minutes} minutes (not a timer).
                No score is calculated.
              </p>
            </div>
            <Button variant="ghost" onClick={clear}><RotateCcw aria-hidden="true" className="mr-2 h-4 w-4"/>Clear practice</Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="text-xs text-muted-foreground">Answered</p><p className="text-2xl font-bold">{progress.answered}/{progress.total}</p></div>
            <div><p className="text-xs text-muted-foreground">Unanswered</p><p className="text-2xl font-bold">{progress.unanswered}</p></div>
            <div><p className="text-xs text-muted-foreground">Flagged</p><p className="text-2xl font-bold">{progress.flagged}</p></div>
          </div>
          <div role="progressbar" aria-label="Questions with a response"
            aria-valuenow={progress.answered} aria-valuemin={0} aria-valuemax={progress.total}
            className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{width:progress.percentage+"%"}}/>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={()=>exportFile("session")}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4"/>Save resume (.json)</Button>
            <Button variant="outline" onClick={()=>exportFile("csv")}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4"/>Export my answers (.csv)</Button>
            {unanswered!==null&&<Button variant="ghost" onClick={()=>{setCurrent(unanswered);setFilter("all");}}>
              Next unanswered question</Button>}
          </div>
          {progress.unanswered===0&&<p role="status" className="flex items-center gap-2 text-sm">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-primary"/>
            Every question has a response. Review or export your work; this is not a graded result.</p>}
        </section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Question {question.number} of {worksheet.questions.length}
                </span>
                <Button variant="outline" size="sm" aria-pressed={flags.includes(current)} onClick={flipFlag}>
                  <Flag aria-hidden="true" className="mr-2 h-4 w-4"/>
                  {flags.includes(current)?"Remove review flag":"Flag for review"}
                </Button>
              </div>
              <CardTitle className="whitespace-pre-wrap break-words text-lg">{question.text}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {question.type.replaceAll("_"," ")} · {question.points} suggested points (not scored)
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {question.type==="short_answer"
                ? <div className="space-y-2">
                  <label htmlFor="practice-written" className="block text-sm font-medium">Your written response</label>
                  <textarea id="practice-written" value={answer.written_text}
                    onChange={e=>setWritten(e.target.value)}
                    maxLength={PRACTICE_ANSWER_MAX} rows={7}
                    placeholder="Write your answer privately…"
                    className="w-full resize-y rounded-lg border border-input bg-background p-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
                  <p className="text-xs text-muted-foreground">{answer.written_text.length}/{PRACTICE_ANSWER_MAX} characters</p>
                </div>
                : <fieldset className="space-y-3">
                  <legend className="mb-2 font-medium">Choose one answer</legend>
                  {question.choices.map((choice,i)=><label key={i}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
                    <input type="radio" name={"practice-question-"+current}
                      checked={answer.choice_index===i} onChange={()=>setChoice(i)}
                      className="mt-1 h-4 w-4 accent-primary"/>
                    <span className="min-w-0 break-words">{choice}</span>
                  </label>)}
                  {answer.choice_index!==null&&<Button variant="ghost" size="sm" onClick={()=>setChoice(null)}>
                    Clear my choice</Button>}
                </fieldset>}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="outline" disabled={current===1} onClick={()=>setCurrent(i=>Math.max(1,i-1))}>Previous</Button>
                <span className="text-xs text-muted-foreground">No grading or automatic submission</span>
                <Button disabled={current===worksheet.questions.length}
                  onClick={()=>setCurrent(i=>Math.min(worksheet.questions.length,i+1))}>Next</Button>
              </div>
            </CardContent>
          </Card>
          <aside aria-label="Practice question navigator" className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-semibold">Question navigator</h2>
            <label htmlFor="practice-question-filter" className="block text-sm text-muted-foreground">Show questions</label>
            <select id="practice-question-filter" value={filter}
              onChange={e=>setFilter(e.target.value as ViewFilter)}
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="all">All questions</option>
              <option value="unanswered">Unanswered only</option>
              <option value="flagged">Flagged for review</option>
            </select>
            {visibleNumbers.length===0?<div className="space-y-2 text-sm text-muted-foreground">
              No questions match this filter.
              <Button variant="outline" size="sm" onClick={()=>setFilter("all")}>Show all</Button>
            </div>:<div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-4">
              {visibleNumbers.map(number=>{
                const item=worksheet.questions[number-1],value=responses[number-1];
                const answered=item.type==="short_answer"
                  ? !!value.written_text.trim():value.choice_index!==null;
                return <button type="button" key={number}
                  aria-label={"Question "+number+(answered?", answered":", unanswered")+(flags.includes(number)?", flagged":"")}
                  aria-current={current===number?"step":undefined}
                  onClick={()=>setCurrent(number)}
                  className={"min-h-11 rounded-lg border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring "+
                    (current===number?"border-primary bg-primary/10 text-primary":"border-border hover:bg-muted/60")}>
                  {number}{flags.includes(number)?"*":answered?"✓":""}
                </button>;
              })}
            </div>}
            <p className="text-xs leading-6 text-muted-foreground">
              A check means answered, an asterisk means flagged. Neither indicates a correct answer.
              Your responses disappear when the tab closes unless you save a resume JSON.
            </p>
          </aside>
        </div>
      </>}
    </div>
  </main>;
}
