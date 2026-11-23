import {useLayoutEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {ArrowLeft,ArrowRight,BookOpen,Clock3,Download,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuthStore} from "@/store/authStore";
import {formatAssessmentDate,assessmentDuration} from "@/lib/educationResults.mjs";
import {
 buildEducationHistoryPageCsv,educationHistoryDisplayedSummary,
 educationHistoryResumeFocus,educationHistorySafeAction,
 organizeEducationHistoryPage,validateEducationHistoryDates,
} from "@/lib/educationHistoryWorkbench.mjs";
import {
 EDUCATION_HISTORY_PAGE_SIZE,
 educationHistoryAction,educationHistoryFilter,educationHistoryHasNext,
 educationHistoryPageSummary,educationHistoryRange,educationHistoryStatus,
 normalizeOwnedEducationAttempt,
} from "@/lib/educationAttemptHistory.mjs";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Alert,AlertDescription} from "@/components/ui/alert";
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";

type HistoryAttempt={
 id:string;test_id:string;user_id:string;status:string;
 start_time:string|null;end_time:string|null;
};
type HistoryPage={items:HistoryAttempt[];count:number|null};

function downloadHistoryCsv(csv:string,page:number){
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download="eternyx-private-history-page-"+(page+1)+".csv";
 anchor.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function EducationHistory(){
 const {user,isAuthenticated,isLoading:authLoading}=useAuthStore();
 const [page,setPage]=useState(0);
 const [status,setStatus]=useState<"all"|"in_progress"|"completed">("all");
 const [search,setSearch]=useState("");
 const [fromDate,setFromDate]=useState("");
 const [toDate,setToDate]=useState("");
 const [sort,setSort]=useState<"newest"|"oldest"|"title">("newest");
 const [focus,setFocus]=useState<"all"|"resume"|"submitted">("all");
 const [exportError,setExportError]=useState("");
 const [accountScope,setAccountScope]=useState(user?.id??null);
 const active= !authLoading&&isAuthenticated&&!!user?.id;
 useLayoutEffect(()=>{
  if(accountScope!==(user?.id??null)){
   setAccountScope(user?.id??null);setPage(0);setStatus("all");setSearch("");
   setFromDate("");setToDate("");setSort("newest");setFocus("all");setExportError("");
  }
 },[accountScope,user?.id]);
 const history=useQuery<HistoryPage>({
  queryKey:["education-private-history",user?.id,page,status],
  enabled:active&&accountScope===user?.id,
  retry:1,refetchOnWindowFocus:false,
  queryFn:async()=>{
   if(!user?.id)throw new Error("Authenticated account required");
   const {start,end}=educationHistoryRange(page);
   let request=supabase.from("user_attempts")
    .select("id,test_id,user_id,status,start_time,end_time",{count:"exact"})
    .eq("user_id",user.id);
   const allowedStatuses=educationHistoryFilter(status);
   if(allowedStatuses)request=request.in("status",allowedStatuses);
   const {data,error,count}=await request
    .order("start_time",{ascending:false})
    .order("id",{ascending:false})
    .range(start,end);
   if(error)throw error;
   const rows=data??[];
   const valid=rows.map(row=>normalizeOwnedEducationAttempt(row,user.id));
   // Never silently include any attempt with an unexpected account, field,
   // state, or malformed key. Browser filtering is extra defense, NOT RLS.
   if(valid.some(row=>row===null))throw new Error("History record validation failed");
   return {items:valid as HistoryAttempt[],count:typeof count==="number"?count:null};
  },
 });
 const ids=useMemo(()=>[...new Set((history.data?.items??[]).map(x=>x.test_id))],
  [history.data?.items]);
 const titles=useQuery<Record<string,string>>({
  queryKey:["education-private-history-titles",user?.id,ids],
  enabled:active&&history.isSuccess&&ids.length>0,
  retry:1,
  queryFn:async()=>{
   const {data,error}=await supabase.from("tests").select("id,title").in("id",ids);
   if(error)throw error;
   const result:Record<string,string>=Object.create(null);
   for(const row of data??[]){
    if(ids.includes(row.id)&&typeof row.title==="string"&&row.title.trim()){
     result[row.id]=row.title;
    }
   }
   return result;
  },
 });
 const dateRangeValid=useMemo(()=>{
  try{validateEducationHistoryDates(fromDate,toDate);return true;}
  catch{return false;}
 },[fromDate,toDate]);
 const shown=useMemo(()=>!dateRangeValid?[]:organizeEducationHistoryPage(
  history.data?.items??[],titles.data,{
   search,from:fromDate,to:toDate,sort,focus,
  },user?.id),
  [history.data?.items,titles.data,search,fromDate,toDate,sort,focus,user?.id,dateRangeValid]);
 const visibleSummary=useMemo(()=>educationHistoryDisplayedSummary(shown,user?.id),
  [shown,user?.id]);
 const resumeItems=useMemo(()=>educationHistoryResumeFocus(
  history.data?.items??[],user?.id),[history.data?.items,user?.id]);
 const summary=useMemo(()=>educationHistoryPageSummary(history.data?.items??[]),
  [history.data?.items]);
 const hasNext=educationHistoryHasNext(page,history.data?.count??null,history.data?.items.length??0);
 const reload=()=>{
  void history.refetch();
  if(ids.length)void titles.refetch();
 };
 const clearLocal=()=>{
  setSearch("");setFromDate("");setToDate("");setSort("newest");setFocus("all");
  setExportError("");
 };
 const downloadCurrentPage=()=>{
  if(!active||accountScope!==user?.id||!history.isSuccess||
     (ids.length>0&&titles.isPending)||!shown.length)return;
  try{
   const csv=buildEducationHistoryPageCsv(shown,titles.data,user!.id,{
    page,filters:"Only currently displayed page "+(page+1)+"; server status "+status+
      "; local focus "+focus,
   });
   downloadHistoryCsv(csv,page);
   setExportError("");
  }catch{
   setExportError("Could not safely export this page. Refresh your history and try again.");
  }
 };
 return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
  <div className="mx-auto max-w-5xl space-y-6">
   <Link to="/education" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">
    <ArrowLeft aria-hidden="true" className="h-4 w-4"/>Back to Education
   </Link>
   <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 sm:p-9">
    <div className="flex items-center gap-2 text-primary">
     <BookOpen aria-hidden="true" className="h-6 w-6"/>
     <p className="text-xs font-semibold uppercase tracking-[0.18em]">ETERNYX Education · Private learner history</p>
    </div>
    <h1 className="mt-3 text-3xl font-bold sm:text-4xl">My assessments</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
     Browse your recorded exam attempts, continue an unfinished assessment, or reopen a submitted result.
     Only server-returned attempts for your signed-in account appear. This page never displays unverified scores.
     Search, dates and sorting apply to the loaded page only—not your entire history.
    </p>
   </header>
   {!authLoading&&!isAuthenticated&&<Alert>
    <ShieldCheck aria-hidden="true" className="h-4 w-4"/>
    <AlertDescription>Sign in to see your own assessment history. <Link to="/auth" className="text-primary underline">Sign in</Link></AlertDescription>
   </Alert>}
   {(authLoading||(active&&history.isPending))&&
    <p role="status" className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
     {authLoading?"Checking your account…":"Loading your saved assessments…"}
    </p>}
   {active&&history.error&&<Alert variant="destructive">
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
     <span>Assessment history is unavailable. Check your access or retry; no attempts have been invented.</span>
     <Button variant="outline" onClick={()=>void history.refetch()}>Retry history</Button>
    </AlertDescription>
   </Alert>}
   {active&&history.data&&<>
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Assessment history controls">
     <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
       <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Your recorded activity</p>
       <h2 className="mt-1 text-lg font-semibold">
        {history.data.count===null?"Your attempts":history.data.count+" "+(history.data.count===1?"attempt":"attempts")+" in this filter"}
       </h2>
       <p className="mt-1 text-xs text-muted-foreground">
        This page: {summary.inProgress} in progress · {summary.submitted} submitted · {summary.flagged} flagged
       </p>
       <p className="mt-1 text-xs text-muted-foreground">
        Displayed after local filters: {visibleSummary.inProgress} in progress ·
        {visibleSummary.submitted} submitted · {visibleSummary.flagged} flagged
       </p>
      </div>
      <Button variant="outline" onClick={reload} disabled={history.isFetching||titles.isFetching}>
       <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4"/>
       {history.isFetching?"Refreshing…":"Refresh history"}
      </Button>
     </div>
     <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div>
       <label htmlFor="education-history-status" className="mb-2 block text-sm font-medium">Attempt status</label>
       <select id="education-history-status" value={status}
        onChange={e=>{setStatus(e.target.value as typeof status);setPage(0);setSearch("");}}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground">
        <option value="all">All attempts</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Submitted or flagged</option>
       </select>
      </div>
      <div>
       <label htmlFor="education-history-search" className="mb-2 block text-sm font-medium">Find a title on this page</label>
       <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/>
        <input id="education-history-search" type="search" value={search} maxLength={120}
         onChange={e=>setSearch(e.target.value)} placeholder="Search visible assessment titles"
         className="min-h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground"/>
       </div>
      </div>
     </div>
     <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
       <label htmlFor="history-from-utc" className="mb-2 block text-sm font-medium">Started on or after (UTC)</label>
       <input id="history-from-utc" type="date" value={fromDate}
        max={toDate||undefined}
        onChange={event=>{
         const value=event.target.value;
         if(toDate&&value>toDate)setToDate("");
         setFromDate(value);
        }}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"/>
      </div>
      <div>
       <label htmlFor="history-to-utc" className="mb-2 block text-sm font-medium">Started on or before (UTC)</label>
       <input id="history-to-utc" type="date" value={toDate}
        min={fromDate||undefined}
        onChange={event=>{
         const value=event.target.value;
         if(fromDate&&value<fromDate)setFromDate("");
         setToDate(value);
        }}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"/>
      </div>
      <div>
       <label htmlFor="history-local-sort" className="mb-2 block text-sm font-medium">Sort this page</label>
       <select id="history-local-sort" value={sort}
        onChange={event=>setSort(event.target.value as typeof sort)}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title">Assessment title A–Z</option>
       </select>
      </div>
      <div>
       <label htmlFor="history-local-focus" className="mb-2 block text-sm font-medium">Focus on this page</label>
       <select id="history-local-focus" value={focus}
        onChange={event=>setFocus(event.target.value as typeof focus)}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="all">All loaded attempts</option>
        <option value="resume">Ready to resume</option>
        <option value="submitted">Submitted attempts</option>
       </select>
      </div>
     </div>
     {!dateRangeValid&&<p role="alert" className="mt-2 text-xs text-destructive">
      This UTC date range is invalid. Adjust the dates before reviewing or exporting.
     </p>}
     <p className="mt-3 text-xs text-muted-foreground">
      Date, title search, focus and sorting operate only on the {history.data.items.length} attempt records loaded on page {page+1}.
      Dates use UTC. The server-wide status selector above is separate.
     </p>
     {(search||fromDate||toDate||sort!=="newest"||focus!=="all")&&
      <Button variant="ghost" size="sm" className="mt-3" onClick={clearLocal}>Clear page filters</Button>}
     {titles.error&&<p role="note" className="mt-3 text-xs text-muted-foreground">
      Some assessment titles are restricted or unavailable. Your attempt history is still accessible.
     </p>}
    </section>
    {resumeItems.length>0&&<section aria-label="Resume your loaded assessments"
      className="rounded-xl border border-primary/20 bg-card p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Continue an unfinished assessment</h2>
      <Button size="sm" variant="outline" onClick={()=>{setFocus("resume");setSearch("");setFromDate("");setToDate("");}}>
       Show unfinished on this page
      </Button>
     </div>
     <div className="mt-3 flex flex-wrap gap-2">
      {resumeItems.map(item=><Button key={item.attemptId} asChild variant="outline" className="min-h-11">
       <Link to={item.path}>{titles.data?.[item.testId]??"Assessment title unavailable"}
        <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4"/></Link>
      </Button>)}
     </div>
     <p className="mt-2 text-xs text-muted-foreground">
      Only unique unfinished tests found on this loaded page are linked here.
      The assessment service rechecks ownership and deadlines when opening an exam.
     </p>
    </section>}
    <section aria-label="Your assessment attempts" className="space-y-3">
     <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {shown.length} {shown.length===1?"attempt":"attempts"} displayed on page {page+1}
      {history.data.count!==null?" · "+history.data.count+" total for selected status":""}.
     </p>
     {history.data.items.length===0&&<div className="rounded-xl border border-border bg-card p-8 text-center">
      <BookOpen className="mx-auto mb-3 h-9 w-9 text-primary" aria-hidden="true"/>
      <p className="font-semibold">{page===0?"No recorded attempts yet":"No attempts on this page"}</p>
      <p className="mt-2 text-sm text-muted-foreground">New exams appear here once the server records an attempt.</p>
      <Button asChild variant="outline" className="mt-4"><Link to="/education">Browse assessments</Link></Button>
     </div>}
     {history.data.items.length>0&&shown.length===0&&<p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
      No titles on this page match your search or other page filters. Try clearing the search or changing page.
     </p>}
     {shown.map(attempt=>{
      const action=educationHistorySafeAction(attempt,history.data.items,user!.id);
      const title=titles.data?.[attempt.test_id]??"Assessment title unavailable";
      return <Card key={attempt.id} className="border-border bg-card">
       <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
         <CardTitle className="break-words text-lg">{title}</CardTitle>
         <Badge variant="outline" className="border-primary/30 text-primary">{educationHistoryStatus(attempt.status)}</Badge>
        </div>
        <CardDescription>Recorded attempt · {formatAssessmentDate(attempt.start_time)}</CardDescription>
       </CardHeader>
       <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
         <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true"/>
          {attempt.end_time?"Completed "+formatAssessmentDate(attempt.end_time):"Not submitted"}
         </span>
         <span>Duration: {assessmentDuration(attempt.start_time,attempt.end_time)}</span>
        </div>
        {action.path?<Button asChild variant="outline" className="min-h-11">
         <Link to={action.path}>{action.label}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4"/></Link>
        </Button>:<Button disabled variant="outline">Attempt unavailable</Button>}
       </CardContent>
      </Card>;
     })}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
     <div>
      <p className="text-sm font-semibold">Download this page</p>
      <p className="mt-1 text-xs text-muted-foreground">
       CSV contains only the {shown.length} displayed, owner-checked attempt records.
       No answers, scores, grades or certificates are included.
      </p>
     </div>
     <Button variant="outline" disabled={!shown.length||history.isFetching||
       (ids.length>0&&titles.isPending)} onClick={downloadCurrentPage}>
      <Download aria-hidden="true" className="mr-2 h-4 w-4"/>Download displayed (.csv)
     </Button>
     {exportError&&<p role="alert" className="w-full text-sm text-destructive">{exportError}</p>}
    </div>
    <nav aria-label="Assessment history pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
     <Button variant="outline" disabled={page===0||history.isFetching}
      onClick={()=>{setPage(p=>Math.max(0,p-1));setSearch("");}}>Previous page</Button>
     <span className="text-sm text-muted-foreground">Page {page+1} · Up to {EDUCATION_HISTORY_PAGE_SIZE} attempts per page</span>
     <Button variant="outline" disabled={!hasNext||history.isFetching||page>=10000}
      onClick={()=>{setPage(p=>p+1);setSearch("");}}>Next page</Button>
    </nav>
    <p className="text-xs text-muted-foreground">
     CSV exports are private personal records, not official certificates. Official grades are shown only on the individual result page
     and require the configured verified-results service. Access and exam deadlines are enforced by the server.
    </p>
   </>}
  </div>
 </main>;
}
