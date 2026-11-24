import {useEffect,useMemo,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {supabase} from "@/integrations/supabase/client";
import type {Database} from "@/integrations/supabase/types";
import {workspacePortfolioDirectory,workspacePortfolioTeam,workspacePortfolioTotals} from "@/lib/workspaceTeamPortfolio.mjs";

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
  const epoch=useRef(0);
  const lock=useRef(false);
  const directory=useMemo(()=>workspacePortfolioDirectory(spaces,{query,status,page}),[spaces,query,status,page]);
  const ids=directory.rows.map((space:Space)=>space.id);
  const signature=JSON.stringify(ids);
  const clear=()=>{
    epoch.current++;lock.current=false;setResults([]);setLoading(false);setMessage("");
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
  const load=async()=>{
    if(lock.current||!ids.length||document.visibilityState!=="visible")return;
    lock.current=true;
    const token=++epoch.current;
    const current=()=>epoch.current===token&&document.visibilityState==="visible";
    setLoading(true);setResults([]);setMessage("");
    const output:Result[]=[];
    try{
      await checkOwner();
      for(const id of ids){
        if(!current())return;
        try{
          const [m,t]=await Promise.all([
            supabase.from("workspace_team_members").select("*",{count:"exact"}).eq("space_id",id).limit(20),
            supabase.from("workspace_team_tasks").select("*",{count:"exact"}).eq("space_id",id).limit(500),
          ]);
          if(m.error||t.error)throw Error("Team snapshot unavailable");
          // Recheck membership and metadata after the task read, not just the cached directory.
          const [fresh,self]=await Promise.all([
            supabase.from("workspace_team_spaces").select("*").eq("id",id).single(),
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
      await checkOwner();
      if(current()){
        setResults(output);
        setMessage("Portfolio review finished. Unavailable teams are excluded from totals.");
      }
    }catch{
      if(current()){setResults([]);setMessage("Portfolio could not be verified. Refresh your team memberships.");}
    }finally{if(current()){lock.current=false;setLoading(false);}}
  };
  const totals=results.length===ids.length&&ids.length&&results.every(r=>ids.includes(r.id))?workspacePortfolioTotals(results,ids):null;
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
        <Button size="sm" type="button" disabled={loading||!ids.length} onClick={()=>void load()}>
          {loading?"Verifying…":"Review this page"}</Button>
      </div>
      {message&&<p role="status" className="text-xs">{message}</p>}
      {totals&&<div className="rounded border border-border p-2 text-xs">
        <strong>Verified page totals · {ids.length} teams</strong>
        <p>{totals.open} open · {totals.overdue} overdue · {totals.urgent} urgent · {totals.mine} assigned to me · {totals.done}/{totals.total} completed</p>
      </div>}
      {results.length>0&&!totals&&<p className="text-xs text-muted-foreground">Complete page totals unavailable because not every team was verified.</p>}
      <div className="space-y-2">
        {directory.rows.map((space:Space)=>{
          const result=results.find(row=>row.id===space.id);
          return <div key={space.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-xs">
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">{result?.state==="verified"?result.name:space.name}</p>
              <p>{result?.state==="verified"?result.status+" · "+result.role:space.status}</p>
              {result?.state==="verified"?<p>{result.memberCount} members · {result.open} open · {result.overdue} overdue · {result.urgent} urgent · {result.mine} mine · {result.unassigned} unassigned · {result.done}/{result.total} completed</p>:
                <p className="text-muted-foreground">{result?.state==="unavailable"?"Unavailable — membership or complete data not verified":"Not reviewed"}</p>}
            </div>
            <Button type="button" size="sm" variant="outline" disabled={loading||result?.state==="unavailable"}
              onClick={()=>onOpenTeam(space.id)}>Open team</Button>
          </div>;
        })}
        {!ids.length&&<p className="text-xs text-muted-foreground">No teams match this directory filter.</p>}
      </div>
    </>}
  </section>;
}
