import {useEffect,useMemo,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {supabase} from "@/integrations/supabase/client";
import type {Database} from "@/integrations/supabase/types";
import {workspacePortfolioDirectory,workspacePortfolioTeam,workspacePortfolioTotals,workspacePortfolioScope,workspacePortfolioReportRows,buildWorkspacePortfolioCsv} from "@/lib/workspaceTeamPortfolio.mjs";

type Space=Database["public"]["Tables"]["workspace_team_spaces"]["Row"];
type Summary={id:string;name:string;status:string;role:string;memberCount:number;total:number;done:number;open:number;overdue:number;urgent:number;mine:number;unassigned:number;state:"verified"};
type Result=Summary|{id:string;state:"unavailable"};
export default function WorkspaceTeamPortfolio({owner,spaces,today,onOpenTeam}:{owner:string;spaces:Space[];today:string;onOpenTeam:(id:string)=>void}){
  const [expanded,setExpanded]=useState(false);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(0);
  const [results,setResults]=useState<Result[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [reviewedAt,setReviewedAt]=useState("");
  const [reviewScope,setReviewScope]=useState("");
  const [sort,setSort]=useState("name");
  const [exporting,setExporting]=useState(false);
  const exportLock=useRef(false);
  const epoch=useRef(0);
  const lock=useRef(false);
  const directory=useMemo(()=>workspacePortfolioDirectory(spaces,{query,status,page}),[spaces,query,status,page]);
  const ids=directory.rows.map((space:Space)=>space.id);
  const signature=workspacePortfolioScope(owner,today,directory.rows);
  const scopeRef=useRef(signature);
  scopeRef.current=signature;
  const visibleResults=reviewScope===signature?results:[];
  const clear=()=>{
    epoch.current++;lock.current=false;exportLock.current=false;setExporting(false);setResults([]);setReviewedAt("");setReviewScope("");setLoading(false);setMessage("");
  };
  useEffect(()=>{
    clear();
    return ()=>{epoch.current++;lock.current=false;};
  },[owner,today,signature]);
  useEffect(()=>{
    const invalidate=()=>{if(document.visibilityState!=="visible")clear();};
    document.addEventListener("visibilitychange",invalidate);
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"||(session?.user?.id&&session.user.id!==owner))clear();
    });
    return ()=>{document.removeEventListener("visibilitychange",invalidate);subscription.unsubscribe();};
  },[owner]);
  const checkOwner=async()=>{
    const {data,error}=await supabase.auth.getUser();
    if(error||data.user?.id!==owner)throw Error("Account verification failed");
  };
  const recheckRows=async(rows:Result[],current:()=>boolean):Promise<Result[]>=>{
    const checked:Result[]=[];
    for(const row of rows){
      if(!current())throw Error("Portfolio scope changed");
      if(row.state!=="verified"){checked.push(row);continue;}
      const [space,self]=await Promise.all([
        supabase.from("workspace_team_spaces").select("id,name,status").eq("id",row.id).single(),
        supabase.from("workspace_team_members").select("user_id,space_id,role").eq("space_id",row.id).eq("user_id",owner).single(),
      ]);
      if(!current())throw Error("Portfolio scope changed");
      if(space.error||self.error||space.data?.id!==row.id||space.data.name!==row.name||
         space.data.status!==row.status||self.data?.user_id!==owner||
         self.data.space_id!==row.id||self.data.role!==row.role)
        checked.push({id:row.id,state:"unavailable"});
      else checked.push(row);
    }
    return checked;
  };
  const load=async()=>{
    if(lock.current||exportLock.current||!ids.length||document.visibilityState!=="visible")return;
    lock.current=true;
    const token=++epoch.current;
    const current=()=>epoch.current===token&&scopeRef.current===signature&&document.visibilityState==="visible";
    setLoading(true);setResults([]);setReviewedAt("");setReviewScope("");setMessage("");
    const output:Result[]=[];
    try{
      await checkOwner();
      for(const id of ids){
        if(!current())return;
        try{
          const [m,t]=await Promise.all([
            supabase.from("workspace_team_members").select("user_id,space_id,role",{count:"exact"}).eq("space_id",id).limit(20),
            supabase.from("workspace_team_tasks").select("id,space_id,status,priority,due_on,assignee_id",{count:"exact"}).eq("space_id",id).limit(500),
          ]);
          if(m.error||t.error)throw Error("Team snapshot unavailable");
          // Recheck membership and metadata after the task read, not just the cached directory.
          const [fresh,self]=await Promise.all([
            supabase.from("workspace_team_spaces").select("id,owner_id,name,status").eq("id",id).single(),
            supabase.from("workspace_team_members").select("user_id,space_id,role").eq("space_id",id).eq("user_id",owner).single(),
          ]);
          await checkOwner();
          if(!current())return;
          if(fresh.error||self.error||!fresh.data||fresh.data.id!==id||
            !self.data||self.data.user_id!==owner||self.data.space_id!==id||
            !m.data?.some(row=>row.user_id===owner&&row.role===self.data.role))
            throw Error("Membership no longer verified");
          const row=workspacePortfolioTeam({space:fresh.data,owner,members:m.data,memberCount:m.count,
            tasks:t.data,taskCount:t.count,today});
          output.push({...row,state:"verified"} as Summary);
        }catch{
          if(!current())return;
          await checkOwner(); // account-wide failure clears all summaries
          output.push({id,state:"unavailable"});
        }
      }
      // A team reviewed first may have lost access during later reads.
      const checked=await recheckRows(output,current);
      await checkOwner();
      if(current()){
        setResults(checked);setReviewScope(signature);setReviewedAt(new Date().toISOString());
        setMessage(checked.every(row=>row.state==="verified")?"Portfolio page verified.":"Review finished; complete page totals unavailable.");
      }
    }catch{
      if(current()){setResults([]);setMessage("Portfolio could not be verified. Refresh your team memberships.");}
    }finally{if(current()){lock.current=false;setLoading(false);}}
  };
  const totals=visibleResults.length===ids.length&&ids.length&&visibleResults.every(r=>ids.includes(r.id))?workspacePortfolioTotals(visibleResults,ids):null;
  const orderedRows=totals?workspacePortfolioReportRows(visibleResults,ids,sort):[];
  const displayRows=totals?orderedRows.map(row=>directory.rows.find((space:Space)=>space.id===row.id)!).filter(Boolean):directory.rows;
  const exportReport=async()=>{
    if(!totals||!reviewedAt||loading||exportLock.current||lock.current||
      reviewScope!==signature||document.visibilityState!=="visible")return;
    exportLock.current=true;setExporting(true);
    const token=epoch.current;
    const current=()=>epoch.current===token&&scopeRef.current===signature&&document.visibilityState==="visible";
    try{
      await checkOwner();
      const checked=await recheckRows(visibleResults,current);
      await checkOwner();
      if(!current())return;
      if(!workspacePortfolioTotals(checked,ids)){
        setResults(checked);setMessage("Access or team metadata changed. Review the page again before exporting.");return;
      }
      const csv=buildWorkspacePortfolioCsv(checked,ids,today,reviewedAt,sort);
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");
      link.href=url;link.download="eternyx-portfolio-page-"+(directory.page+1)+"-"+today+".csv";
      try{document.body.appendChild(link);link.click();}
      finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
      setMessage("Verified page report exported. Counts reflect the original review, not a fresh task query.");
    }catch{
      if(current()){setResults([]);setReviewedAt("");setReviewScope("");setMessage("Report could not be verified. Review the page again.");}
    }finally{if(current()){exportLock.current=false;setExporting(false);}}
  };
  return <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Cross-team project portfolio">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="text-sm font-semibold">Team portfolio</h4>
        <p className="text-xs text-muted-foreground">{spaces.length} verified team memberships · on-demand review</p></div>
      <Button type="button" variant="outline" size="sm" aria-expanded={expanded}
        onClick={()=>{clear();setExpanded(value=>!value);}}>{expanded?"Close portfolio":"Open portfolio"}</Button>
    </div>
    {expanded&&<>
      <p className="text-xs text-muted-foreground">Review up to five teams per page. Counts are current snapshots, not a continuous or complete organization-wide report. Membership refresh or leaving this view clears results.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs">Find a team
          <Input type="search" maxLength={120} value={query} onChange={e=>{clear();setQuery(e.target.value);setPage(0);}}/>
        </label>
        <label className="text-xs">Team status
          <select className="block rounded border border-border bg-background p-2" value={status}
            onChange={e=>{clear();setStatus(e.target.value);setPage(0);}}>
            <option value="all">All</option><option value="active">Active</option><option value="archived">Archived</option>
          </select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button size="sm" type="button" variant="outline" disabled={directory.page===0}
          onClick={()=>{clear();setPage(directory.page-1);}}>Previous</Button>
        <span>Page {directory.page+1} of {directory.pages} · {directory.total} matching teams</span>
        <Button size="sm" type="button" variant="outline" disabled={directory.page+1>=directory.pages}
          onClick={()=>{clear();setPage(directory.page+1);}}>Next</Button>
        <Button size="sm" type="button" disabled={loading||exporting||!ids.length} onClick={()=>void load()}>
          {loading?"Verifying…":"Review this page"}</Button>
      </div>
      {message&&<p role="status" className="text-xs">{message}</p>}
      {totals&&<div className="rounded border border-border p-2 text-xs">
        <strong>Verified page totals · {ids.length} teams</strong>
        <p>{totals.open} open · {totals.overdue} overdue · {totals.urgent} urgent · {totals.mine} assigned to me · {totals.done}/{totals.total} completed</p>
        <p className="text-muted-foreground">Review completed {reviewedAt?new Date(reviewedAt).toLocaleString():""} · local reference day {today}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label>Sort reviewed teams <select value={sort} onChange={e=>setSort(e.target.value)}
            className="rounded border border-border bg-background p-1">
            <option value="name">Name</option><option value="overdue">Most overdue</option>
            <option value="urgent">Most urgent</option><option value="mine">My open tasks</option>
          </select></label>
          <Button type="button" variant="outline" size="sm" disabled={exporting||loading}
            onClick={()=>void exportReport()}>{exporting?"Rechecking access…":"Export verified page CSV"}</Button>
        </div>
      </div>}
      {visibleResults.length>0&&!totals&&<p className="text-xs text-muted-foreground">Complete page totals unavailable because not every team was verified.</p>}
      <div className="space-y-2">
        {displayRows.map((space:Space)=>{
          const result=visibleResults.find(row=>row.id===space.id);
          return <div key={space.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-xs">
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">{result?.state==="verified"?result.name:space.name}</p>
              <p>{result?.state==="verified"?result.status+" · "+result.role:space.status}</p>
              {result?.state==="verified"?<p>{result.memberCount} members · {result.open} open · {result.overdue} overdue · {result.urgent} urgent · {result.mine} mine · {result.unassigned} unassigned · {result.done}/{result.total} completed</p>:
                <p className="text-muted-foreground">{result?.state==="unavailable"?"Unavailable — membership or complete data not verified":"Not reviewed"}</p>}
            </div>
            <Button type="button" size="sm" variant="outline" disabled={loading||exporting||result?.state==="unavailable"}
              onClick={()=>onOpenTeam(space.id)}>Open team</Button>
          </div>;
        })}
        {!ids.length&&<p className="text-xs text-muted-foreground">No teams match this directory filter.</p>}
      </div>
    </>}
  </section>;
}
