import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {ArrowLeft,ArrowRight,BookOpen,Clock3,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAuthStore} from "@/store/authStore";
import {formatAssessmentDate,assessmentDuration} from "@/lib/educationResults.mjs";
import {
 EDUCATION_HISTORY_PAGE_SIZE,
 educationHistoryAction,educationHistoryFilter,educationHistoryHasNext,
 educationHistoryPageSummary,educationHistoryRange,educationHistoryStatus,
 filterEducationHistoryPage,normalizeOwnedEducationAttempt,
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

export default function EducationHistory(){
 const {user,isAuthenticated,isLoading:authLoading}=useAuthStore();
 const [page,setPage]=useState(0);
 const [status,setStatus]=useState<"all"|"in_progress"|"completed">("all");
 const [search,setSearch]=useState("");
 const [accountScope,setAccountScope]=useState(user?.id??null);
 const active= !authLoading&&isAuthenticated&&!!user?.id;
 useEffect(()=>{
  if(accountScope!==(user?.id??null)){
   setAccountScope(user?.id??null);setPage(0);setStatus("all");setSearch("");
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
 const shown=useMemo(()=>filterEducationHistoryPage(
  history.data?.items??[],titles.data,search),
  [history.data?.items,titles.data,search]);
 const summary=useMemo(()=>educationHistoryPageSummary(history.data?.items??[]),
  [history.data?.items]);
 const hasNext=educationHistoryHasNext(page,history.data?.count??null,history.data?.items.length??0);
 const reload=()=>{
  void history.refetch();
  if(ids.length)void titles.refetch();
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
     {titles.error&&<p role="note" className="mt-3 text-xs text-muted-foreground">
      Some assessment titles are restricted or unavailable. Your attempt history is still accessible.
     </p>}
    </section>
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
      No titles on this page match your search. Try clearing the search or changing page.
     </p>}
     {shown.map(attempt=>{
      const action=educationHistoryAction(attempt,user!.id);
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
    <nav aria-label="Assessment history pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
     <Button variant="outline" disabled={page===0||history.isFetching}
      onClick={()=>{setPage(p=>Math.max(0,p-1));setSearch("");}}>Previous page</Button>
     <span className="text-sm text-muted-foreground">Page {page+1} · Up to {EDUCATION_HISTORY_PAGE_SIZE} attempts per page</span>
     <Button variant="outline" disabled={!hasNext||history.isFetching||page>=10000}
      onClick={()=>{setPage(p=>p+1);setSearch("");}}>Next page</Button>
    </nav>
    <p className="text-xs text-muted-foreground">
     History entries are not certificates. Official grades are shown only on the individual result page
     and require the configured verified-results service. Access and exam deadlines are enforced by the server.
    </p>
   </>}
  </div>
 </main>;
}
