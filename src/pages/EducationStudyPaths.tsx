import {useMemo,useRef,useState} from "react";
import type {ChangeEvent} from "react";
import {Link} from "react-router-dom";
import {
  ArrowLeft,ArrowDown,ArrowUp,BookOpen,CheckCircle2,Download,
  FileUp,Flag,Plus,RotateCcw,ShieldCheck,Trash2,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Alert,AlertDescription} from "@/components/ui/alert";
import {
  STUDY_MAX_LESSONS,STUDY_FILE_LIMIT,STUDY_ACTIVITY_LIMIT,STUDY_NOTE_LIMIT,
  emptyStudyDraft,emptyStudyLesson,authorStudyPath,buildStudyPathJson,
  parseStudyFile,emptyStudyRecords,changeStudyRecord,summarizeStudyPath,
  buildStudySessionJson,buildStudyProgressCsv,
} from "@/lib/educationStudyPaths.mjs";

type Lesson={
  number:number;title:string;objective:string;reading:string;
  activity_prompt:string;reflection_prompt:string;estimated_minutes:number;
};
type Draft={title:string;description:string;lessons:Lesson[]};
type Path={format:string;version:number;title:string;description:string;lessons:Lesson[]};
type Record={number:number;activity:string;reflection:string;note:string;flagged:boolean;completed:boolean};
type ViewMode="learn"|"author";
type LessonFilter="all"|"remaining"|"completed"|"flagged";

function saveFile(content:string,name:string,mime:string){
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement("a");
  a.href=url;a.download=name;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function EducationStudyPaths(){
  const inputRef=useRef<HTMLInputElement>(null);
  const [mode,setMode]=useState<ViewMode>("learn");
  const [draft,setDraft]=useState<Draft>(()=>emptyStudyDraft());
  const [draftIndex,setDraftIndex]=useState(0);
  const [path,setPath]=useState<Path|null>(null);
  const [records,setRecords]=useState<Record[]>([]);
  const [current,setCurrent]=useState(1);
  const [filter,setFilter]=useState<LessonFilter>("all");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const lesson=path?.lessons[current-1]??null;
  const record=records[current-1]??null;
  const authorLesson=draft.lessons[draftIndex]??null;
  const authorValid=useMemo(()=>{
    try{return !!authorStudyPath(draft);}catch{return false;}
  },[draft]);
  const progress=useMemo(()=>path?summarizeStudyPath(path,records):null,[path,records]);
  const shownLessons=useMemo(()=>{
    if(!path)return [];
    return path.lessons.filter(l=>{
      const r=records[l.number-1];
      if(!r)return false;
      return filter==="all" ||
        (filter==="remaining"&&!r.completed) ||
        (filter==="completed"&&r.completed) ||
        (filter==="flagged"&&r.flagged);
    });
  },[path,records,filter]);

  const importFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(path&&!window.confirm("Replace your current study session? Export its resume JSON first if needed."))return;
      setLoading(true);setError("");setMessage("");
      if(file.size===0||file.size>STUDY_FILE_LIMIT)
        throw new Error("Invalid local file size");
      const imported=parseStudyFile(await file.text());
      setPath(imported.path as Path);
      setRecords(imported.records as Record[]);
      setCurrent(1);setFilter("all");setMode("learn");
      setMessage("Study path imported. Your learning notes remain in this browser tab unless you export them.");
    }catch{
      setError("Import rejected. Choose a valid ETERNYX study path JSON or resume JSON. Unrecognized fields and oversized files are blocked.");
    }finally{
      setLoading(false);if(inputRef.current)inputRef.current.value="";
    }
  };
  const patchDraft=(key:"title"|"description",value:string)=>
    setDraft(previous=>({...previous,[key]:value}));
  const patchLesson=(key:keyof Lesson,value:string|number)=>{
    setDraft(previous=>({...previous,lessons:previous.lessons.map((l,i)=>
      i===draftIndex?{...l,[key]:value}:l)}));
  };
  const addLesson=()=>{
    if(draft.lessons.length>=STUDY_MAX_LESSONS)return;
    const next=draft.lessons.length+1;
    setDraft(old=>({...old,lessons:[...old.lessons,emptyStudyLesson(next)]}));
    setDraftIndex(next-1);setError("");
  };
  const moveLesson=(step:-1|1)=>{
    const to=draftIndex+step;
    if(to<0||to>=draft.lessons.length)return;
    setDraft(previous=>{
      const lessons=[...previous.lessons];
      [lessons[draftIndex],lessons[to]]=[lessons[to],lessons[draftIndex]];
      return {...previous,lessons:lessons.map((l,i)=>({...l,number:i+1}))};
    });
    setDraftIndex(to);
  };
  const deleteLesson=()=>{
    if(!authorLesson||!window.confirm("Delete this lesson from your unsaved authoring draft?"))return;
    setDraft(previous=>({...previous,lessons:previous.lessons
      .filter((_,i)=>i!==draftIndex).map((l,i)=>({...l,number:i+1}))}));
    setDraftIndex(i=>Math.max(0,Math.min(i,draft.lessons.length-2)));
  };
  const exportPath=()=>{
    try{
      saveFile(buildStudyPathJson(draft),"eternyx-study-path.json","application/json;charset=utf-8");
      setError("");setMessage("Validated study path downloaded. Share only content you own or may distribute.");
    }catch{setError("Finish all lesson fields and remove duplicate titles before exporting.");}
  };
  const startOwnPath=()=>{
    try{
      const valid=authorStudyPath(draft);
      setPath(valid as Path);
      setRecords(emptyStudyRecords(valid) as Record[]);
      setCurrent(1);setFilter("all");setMode("learn");
      setError("");setMessage("Your authored lessons are ready for local, ungraded study.");
    }catch{setError("Complete the path title and each lesson's objective, reading, activity and reflection before studying.");}
  };
  const updateRecord=(key:"activity"|"reflection"|"note"|"flagged"|"completed",value:string|boolean)=>{
    if(!path)return;
    try{
      setRecords(old=>changeStudyRecord(path,old,current,key,value) as Record[]);
      setError("");
    }catch{setError("That update was rejected. A lesson needs both activity and reflection responses before completion.");}
  };
  const exportSession=(kind:"resume"|"csv")=>{
    if(!path)return;
    try{
      const content=kind==="resume"?buildStudySessionJson(path,records):buildStudyProgressCsv(path,records);
      saveFile(content,kind==="resume"?"eternyx-study-resume.json":"eternyx-study-progress.csv",
        kind==="resume"?"application/json;charset=utf-8":"text/csv;charset=utf-8");
      setError("");setMessage(kind==="resume"?
        "Resume JSON saved. Reimport it to continue later; there is no background autosave.":
        "Your lesson notes and responses were exported as a private, ungraded CSV.");
    }catch{setError("Export failed because some study data was invalid.");}
  };
  const clearSession=()=>{
    if(!path||!window.confirm("Clear this local study session? Export your resume JSON before clearing."))return;
    setPath(null);setRecords([]);setCurrent(1);setFilter("all");
    setError("");setMessage("Study session cleared from this tab.");
  };
  const resetDraft=()=>{
    if(!window.confirm("Discard your unsaved authoring draft? Export a valid path first if needed."))return;
    setDraft(emptyStudyDraft());setDraftIndex(0);
    setError("");setMessage("Authoring draft cleared.");
  };
  const completeReady=!!record?.activity.trim()&&!!record?.reflection.trim();

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/education" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="h-4 w-4"/>Education Hub
      </Link>
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-9">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <BookOpen aria-hidden="true" className="h-5 w-5"/>ETERNYX Education
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Study Paths</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Create real lesson packs or follow lessons shared with you. Work through reading,
          practical activities and reflection prompts, with private notes and explicit progress.
          This workspace is local and ungraded; it is not an LMS enrollment or certificate.
        </p>
      </header>
      <section aria-label="Study Path controls" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Study Path mode">
          <Button variant={mode==="learn"?"default":"outline"} aria-pressed={mode==="learn"}
            onClick={()=>setMode("learn")}>Study lessons</Button>
          <Button variant={mode==="author"?"default":"outline"} aria-pressed={mode==="author"}
            onClick={()=>setMode("author")}>Create lesson pack</Button>
          <Button variant="outline" disabled={loading} onClick={()=>inputRef.current?.click()}>
            <FileUp aria-hidden="true" className="mr-2 h-4 w-4"/>
            {loading?"Importing…":"Import path or resume (.json)"}
          </Button>
          <input type="file" ref={inputRef} accept=".json,application/json"
            aria-label="Choose ETERNYX study path JSON or resume" className="sr-only"
            onChange={e=>void importFile(e)}/>
        </div>
        <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-primary"/>
          No fabricated lesson library, hidden scoring, uploads, automatic saving or account needed.
          Closing or refreshing this tab loses unsaved work. Only explicit downloads preserve it.
        </p>
      </section>
      {error&&<Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
      {message&&<p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{message}</p>}

      {mode==="author"&&<section aria-label="Local Study Path authoring" className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Author a real learning path</h2>
            <Button variant="ghost" onClick={resetDraft}><RotateCcw aria-hidden="true" className="mr-2 h-4 w-4"/>Clear draft</Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Supply your own lesson content. Paths contain a reading, learning objective,
            hands-on activity and reflection for every lesson.
          </p>
          <div className="mt-5 space-y-4">
            <div><label className="mb-1 block text-sm font-medium" htmlFor="study-author-title">Path title</label>
              <input id="study-author-title" maxLength={160} value={draft.title}
                onChange={e=>patchDraft("title",e.target.value)}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"/></div>
            <div><label className="mb-1 block text-sm font-medium" htmlFor="study-author-description">Path description</label>
              <textarea id="study-author-description" rows={2} maxLength={1500} value={draft.description}
                onChange={e=>patchDraft("description",e.target.value)}
                className="w-full rounded-lg border border-input bg-background p-3 text-base"/></div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={addLesson} disabled={draft.lessons.length>=STUDY_MAX_LESSONS}>
              <Plus aria-hidden="true" className="mr-2 h-4 w-4"/>Add lesson ({draft.lessons.length}/{STUDY_MAX_LESSONS})</Button>
            <Button variant="outline" disabled={!authorValid} onClick={exportPath}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4"/>Export validated path (.json)</Button>
            <Button disabled={!authorValid} onClick={startOwnPath}>Open this path for study</Button>
          </div>
          {!authorValid&&<p className="mt-3 text-xs text-muted-foreground">
            Complete the title and every lesson's objective, reading, activity and reflection,
            using unique lesson titles, to enable export or study.</p>}
        </div>
        {draft.lessons.length===0?<div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Add your first lesson to begin authoring. No examples are silently invented.
        </div>:<div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside aria-label="Author lesson outline" className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold">Lesson outline</h3>
            {draft.lessons.map((l,i)=><button type="button" key={i}
              aria-current={draftIndex===i?"step":undefined}
              onClick={()=>setDraftIndex(i)}
              className={"w-full min-h-11 rounded-lg border px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring "+
                (draftIndex===i?"border-primary bg-primary/10":"border-border hover:bg-muted/50")}>
              {i+1}. {l.title.trim()||"Untitled lesson"}
            </button>)}
          </aside>
          {authorLesson&&<Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">Edit lesson {draftIndex+1}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={draftIndex===0}
                    aria-label="Move lesson up" onClick={()=>moveLesson(-1)}><ArrowUp aria-hidden="true" className="h-4 w-4"/></Button>
                  <Button variant="outline" size="sm" disabled={draftIndex===draft.lessons.length-1}
                    aria-label="Move lesson down" onClick={()=>moveLesson(1)}><ArrowDown aria-hidden="true" className="h-4 w-4"/></Button>
                  <Button variant="outline" size="sm" aria-label="Delete lesson" onClick={deleteLesson}>
                    <Trash2 aria-hidden="true" className="h-4 w-4"/></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                ["title","Lesson title",160,1],
                ["objective","Learning objective",600,2],
                ["reading","Reading material",12000,9],
                ["activity_prompt","Practical activity instructions",2000,4],
                ["reflection_prompt","Reflection question",2000,3],
              ] as const).map(([key,label,max,rows])=><div key={key}>
                <label className="mb-1 block text-sm font-medium" htmlFor={"study-author-lesson-"+key}>{label}</label>
                {key==="title"
                  ?<input id={"study-author-lesson-"+key} value={authorLesson[key]}
                    onChange={e=>patchLesson(key,e.target.value)} maxLength={max}
                    className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"/>
                  :<textarea id={"study-author-lesson-"+key} value={authorLesson[key]}
                    onChange={e=>patchLesson(key,e.target.value)} maxLength={max} rows={rows}
                    className="w-full rounded-lg border border-input bg-background p-3 text-base whitespace-pre-wrap"/>}
              </div>)}
              <div className="max-w-xs">
                <label htmlFor="study-author-duration" className="mb-1 block text-sm font-medium">Estimated lesson minutes (1–240)</label>
                <input id="study-author-duration" type="number" min={1} max={240}
                  value={authorLesson.estimated_minutes} onChange={e=>patchLesson("estimated_minutes",Number(e.target.value))}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"/>
              </div>
            </CardContent>
          </Card>}
        </div>}
      </section>}

      {mode==="learn"&&(!path?<section className="rounded-2xl border border-dashed border-border bg-card/60 p-9 text-center">
        <BookOpen aria-hidden="true" className="mx-auto h-9 w-9 text-primary"/>
        <h2 className="mt-3 text-lg font-semibold">No study path loaded</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Import a real lesson pack or saved study session, or create your own in the authoring tab.
          No imaginary courses, study progress or scores will be displayed.
        </p>
        <Button variant="outline" className="mt-4" onClick={()=>setMode("author")}>Create your first lesson pack</Button>
      </section>:progress&&lesson&&record&&<section aria-label="Active study path" className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-semibold break-words">{path.title}</h2>
              {path.description&&<p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{path.description}</p>}
            </div>
            <Button variant="ghost" onClick={clearSession}><RotateCcw aria-hidden="true" className="mr-2 h-4 w-4"/>Clear session</Button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["Completed",progress.completed+"/"+progress.lessons],
              ["Remaining",progress.remaining],
              ["Started",progress.started],
              ["Flagged",progress.flagged],
            ] as const).map(([name,value])=><div key={name} className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>)}
          </div>
          <div role="progressbar" aria-label="Manually completed lessons"
            aria-valuemin={0} aria-valuemax={progress.lessons} aria-valuenow={progress.completed}
            className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{width:progress.percentage+"%"}}/>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {progress.percentage}% manually completed. This is learning progress, not exam performance.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={()=>exportSession("resume")}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4"/>Save study resume (.json)</Button>
            <Button variant="outline" onClick={()=>exportSession("csv")}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4"/>Export private notes (.csv)</Button>
            {progress.nextLesson!==null&&<Button variant="ghost" onClick={()=>{
              setCurrent(progress.nextLesson!);setFilter("all");
            }}>Continue next unfinished lesson</Button>}
          </div>
          {progress.remaining===0&&<p role="status" className="mt-4 flex items-center gap-2 text-sm">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-primary"/>
            All lessons marked complete. You can revisit them; no grade or certificate is issued.</p>}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Lesson {current} of {path.lessons.length} · {lesson.estimated_minutes} suggested min
                </span>
                <Button variant="outline" size="sm" aria-pressed={record.flagged}
                  onClick={()=>updateRecord("flagged",!record.flagged)}>
                  <Flag aria-hidden="true" className="mr-2 h-4 w-4"/>
                  {record.flagged?"Unflag":"Flag for review"}</Button>
              </div>
              <CardTitle className="break-words text-xl">{lesson.title}</CardTitle>
              <p className="text-sm text-muted-foreground"><strong>Objective:</strong> {lesson.objective}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <section aria-label="Lesson reading" className="rounded-xl border border-border bg-background p-4">
                <h3 className="font-semibold">Lesson reading</h3>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{lesson.reading}</p>
              </section>
              <section className="space-y-3">
                <h3 className="font-semibold">Practical activity</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{lesson.activity_prompt}</p>
                <label htmlFor="study-activity" className="block text-sm font-medium">My activity response</label>
                <textarea id="study-activity" rows={5} maxLength={STUDY_ACTIVITY_LIMIT}
                  value={record.activity} onChange={e=>updateRecord("activity",e.target.value)}
                  placeholder="Record what you did and observed…"
                  className="w-full rounded-lg border border-input bg-background p-3 text-base"/>
              </section>
              <section className="space-y-3">
                <h3 className="font-semibold">Reflect on your learning</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{lesson.reflection_prompt}</p>
                <label htmlFor="study-reflection" className="block text-sm font-medium">My reflection</label>
                <textarea id="study-reflection" rows={4} maxLength={STUDY_ACTIVITY_LIMIT}
                  value={record.reflection} onChange={e=>updateRecord("reflection",e.target.value)}
                  placeholder="Explain the takeaway in your own words…"
                  className="w-full rounded-lg border border-input bg-background p-3 text-base"/>
              </section>
              <div>
                <label htmlFor="study-private-note" className="mb-2 block text-sm font-medium">Private notes (optional)</label>
                <textarea id="study-private-note" rows={3} maxLength={STUDY_NOTE_LIMIT}
                  value={record.note} onChange={e=>updateRecord("note",e.target.value)}
                  className="w-full rounded-lg border border-input bg-background p-3 text-base"/>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant={record.completed?"outline":"default"}
                  disabled={!record.completed&&(!record.activity.trim()||!record.reflection.trim())}
                  onClick={()=>updateRecord("completed",!record.completed)}>
                  <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4"/>
                  {record.completed?"Reopen lesson":"Mark lesson complete"}</Button>
                {!completeReady&&<p className="text-xs text-muted-foreground">
                  Respond to both activity and reflection to mark complete.</p>}
              </div>
              <div className="flex justify-between gap-3">
                <Button variant="outline" disabled={current===1}
                  onClick={()=>setCurrent(x=>Math.max(1,x-1))}>Previous lesson</Button>
                <Button disabled={current===path.lessons.length}
                  onClick={()=>setCurrent(x=>Math.min(path.lessons.length,x+1))}>Next lesson</Button>
              </div>
            </CardContent>
          </Card>
          <aside aria-label="Study lesson outline" className="h-fit space-y-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-semibold">Lesson navigator</h2>
            <label htmlFor="study-lesson-filter" className="block text-sm text-muted-foreground">Show lessons</label>
            <select id="study-lesson-filter" value={filter}
              onChange={e=>setFilter(e.target.value as LessonFilter)}
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="all">All lessons</option>
              <option value="remaining">Not completed</option>
              <option value="completed">Completed</option>
              <option value="flagged">Flagged for review</option>
            </select>
            {shownLessons.length===0?<div className="space-y-2">
              <p className="text-sm text-muted-foreground">No lessons match this filter.</p>
              <Button size="sm" variant="outline" onClick={()=>setFilter("all")}>Show all lessons</Button>
            </div>:<div className="space-y-2">
              {shownLessons.map(l=>{
                const r=records[l.number-1];
                return <button key={l.number} type="button"
                  onClick={()=>setCurrent(l.number)} aria-current={current===l.number?"step":undefined}
                  aria-label={"Lesson "+l.number+", "+(r.completed?"complete":"not completed")+(r.flagged?", flagged":"")}
                  className={"min-h-11 w-full rounded-lg border p-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring "+
                    (current===l.number?"border-primary bg-primary/10":"border-border hover:bg-muted/50")}>
                  <span className="font-semibold">{l.number}. {l.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {r.completed?"Completed":"Not completed"}{r.flagged?" · Flagged":""}
                  </span>
                </button>;
              })}
            </div>}
            <p className="text-xs leading-6 text-muted-foreground">
              Only a manually marked lesson counts as complete.
              To preserve your notes, export a resume file before leaving.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/education/practice">Open worksheet practice</Link>
            </Button>
          </aside>
        </div>
      </section>)}
    </div>
  </main>;
}
