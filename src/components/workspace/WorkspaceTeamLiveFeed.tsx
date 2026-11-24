import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Download, History, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { teamMemberLabel, WORKSPACE_TEAM_EVENT_LABELS } from "@/lib/workspaceTeamUtils.mjs";
import { workspaceTeamEventUnread, workspaceTeamVisibleEvents } from "@/lib/workspaceTeamLive.mjs";
import {
  TEAM_ACTIVITY_PAGE_SIZE, TEAM_ACTIVITY_VIEW_CAP,
  mergeWorkspaceTeamHistory, normalizeWorkspaceTeamSnapshot,
  teamHistorySearch, buildWorkspaceTeamActivityCsv,
  workspaceTeamAcknowledgementTarget,workspaceTeamActivityDateMatches,workspaceTeamActivityDateRangeValid,
} from "@/lib/workspaceTeamActivityHistory.mjs";

type Event=Database["public"]["Tables"]["workspace_team_events"]["Row"];
type Task=Database["public"]["Tables"]["workspace_team_tasks"]["Row"];
type Connection="connecting"|"connected"|"disconnected";
export default function WorkspaceTeamLiveFeed({owner,spaceId,joinedAt,events,tasks,onRemoteChange,onOpenTask}:{
  owner:string;spaceId:string;joinedAt:string;events:Event[];tasks:Task[];
  onRemoteChange:()=>void;onOpenTask:(taskId:string)=>void;
}) {
  const [connection,setConnection]=useState<Connection>("connecting");
  const [unread,setUnread]=useState<number|null>(null);
  const [lastSeen,setLastSeen]=useState(0);
  const [latestEvent,setLatestEvent]=useState<number|null>(null);
  const [fromDay,setFromDay]=useState("");
  const [toDay,setToDay]=useState("");
  const markLock=useRef(false);
  const historyLock=useRef(false);
  const snapshotEpoch=useRef(0);
  const [group,setGroup]=useState("all");
  const [actor,setActor]=useState("all");
  const [onlyUnread,setOnlyUnread]=useState(false);
  const [search,setSearch]=useState("");
  const [older,setOlder]=useState<Event[]>([]);
  const [hasMore,setHasMore]=useState<boolean|null>(null);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const [historyNotice,setHistoryNotice]=useState("");
  const historyEpoch=useRef(0);
  const latestHead=useRef<number|null>(null);
  const [pulse,setPulse]=useState(0);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const revision=useRef(0);
  const onRemoteRef=useRef(onRemoteChange);
  onRemoteRef.current=onRemoteChange;

  useEffect(()=>{
    const version=++revision.current;
    setUnread(null);setLastSeen(0);setLatestEvent(null);setError("");setMessage("");
    setGroup("all");setActor("all");setOnlyUnread(false);setSearch("");setFromDay("");setToDay("");
    markLock.current=false;historyLock.current=false;snapshotEpoch.current++;
    setWorking(false);setHistoryLoading(false);
    setOlder([]);setHasMore(null);setHistoryError("");setHistoryNotice("");
    latestHead.current=null;historyEpoch.current++;
    return ()=>{revision.current++;historyEpoch.current++;snapshotEpoch.current++;};
  },[owner,spaceId]);

  useEffect(()=>{
    const current=events[0]?.id??null;
    const before=latestHead.current;
    latestHead.current=current;
    if(before!==current){
      historyEpoch.current++;historyLock.current=false;setHistoryLoading(false);
      setOlder([]);setHasMore(null);setHistoryError("");
      setHistoryNotice("New activity arrived. Older pages were reset to avoid missing events.");
    }
  },[events,owner,spaceId]);

  useEffect(()=>{
    const version=revision.current,read=++snapshotEpoch.current;
    let alive=true;
    const current=()=>alive&&version===revision.current&&read===snapshotEpoch.current;
    setUnread(null);setLatestEvent(null);
    void (async()=>{
      try {
        const auth=await supabase.auth.getUser();
        if(auth.error||auth.data.user?.id!==owner)
          throw new Error("Your Workspace account changed. Sign in again to see team notifications.");
        const snapshot=await supabase.rpc("workspace_team_notification_snapshot",{
          p_space_id:spaceId,
        });
        if(snapshot.error)throw new Error(snapshot.error.message);
        const parsed=normalizeWorkspaceTeamSnapshot(snapshot.data);
        const verified=await supabase.auth.getUser();
        if(verified.error||verified.data.user?.id!==owner)
          throw Error("Workspace account changed while loading notifications");
        if(current()) {
          setLastSeen(parsed.lastSeen);setUnread(parsed.unread);setLatestEvent(parsed.latest);setError("");
        }
      }catch(failure) {
        if(current()) {
          setUnread(null);setLatestEvent(null);
          setError(failure instanceof Error?failure.message:"Team notifications could not be loaded");
        }
      }
    })();
    return ()=>{alive=false;};
  },[owner,spaceId,joinedAt,events,pulse]);

  useEffect(()=>{
    setConnection("connecting");
    let alive=true;
    let debounce:ReturnType<typeof setTimeout>|null=null;
    const reconcile=()=>{
      if(!alive)return;
      if(debounce)clearTimeout(debounce);
      debounce=setTimeout(()=>{
        if(!alive)return;
        setPulse(n=>n+1);
        onRemoteRef.current();
      },250);
    };
    const channel=supabase.channel("workspace-team-live-"+owner+"-"+spaceId)
      .on("postgres_changes",{
        event:"INSERT",schema:"public",table:"workspace_team_events",
        filter:"space_id=eq."+spaceId,
      },()=>reconcile())
      .subscribe(status=>{
        if(!alive)return;
        if(status==="SUBSCRIBED"){setConnection("connected");setPulse(n=>n+1);}
        else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED")
          setConnection("disconnected");
      });
    const onVisibility=()=>{
      if(document.visibilityState==="visible")reconcile();
    };
    document.addEventListener("visibilitychange",onVisibility);
    const poll=window.setInterval(()=>{
      if(document.visibilityState==="visible")reconcile();
    },60000);
    return ()=>{
      alive=false;
      if(debounce)clearTimeout(debounce);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange",onVisibility);
      void supabase.removeChannel(channel);
    };
  },[owner,spaceId]);

  const markSeen=async()=>{
    if(markLock.current||working||unread===null||unread===0)return;
    let target:number;
    try{target=workspaceTeamAcknowledgementTarget({lastSeen,unread,latest:latestEvent});}
    catch(failure){setError(failure instanceof Error?failure.message:"Invalid read cursor");return;}
    const version=revision.current;
    markLock.current=true;
    setWorking(true);setError("");setMessage("");
    try {
      const auth=await supabase.auth.getUser();
      if(auth.error||auth.data.user?.id!==owner)
        throw new Error("Workspace identity changed; refresh before acknowledging events");
      if(version!==revision.current)return;
      const saved=await supabase.rpc("workspace_team_mark_events_seen",{
        p_space_id:spaceId,p_event_id:target,
      });
      if(saved.error||!Number.isSafeInteger(saved.data)||(saved.data as number)<target)
        throw new Error(saved.error?.message??"Event acknowledgement was not verified");
      const verified=await supabase.auth.getUser();
      if(verified.error||verified.data.user?.id!==owner)
        throw Error("Workspace account changed after acknowledgement");
      if(version===revision.current){
        snapshotEpoch.current++;
        setLastSeen(saved.data as number);
        setUnread(null);setLatestEvent(null);
        setMessage("Server saved your read position through the selected snapshot.");
        setPulse(n=>n+1);
      }
    }catch(failure){
      if(version===revision.current)
        setError(failure instanceof Error?failure.message:"Could not mark activity as read");
    }finally{
      if(version===revision.current){markLock.current=false;setWorking(false);}
    }
  };
  const history=mergeWorkspaceTeamHistory(events,older,spaceId);
  const titles=Object.fromEntries(tasks.filter(task=>task.space_id===spaceId).map(task=>[task.id,task.title]));
  const validRange=workspaceTeamActivityDateRangeValid(fromDay,toDay);
  const visible=workspaceTeamVisibleEvents(history,group,actor,owner).filter(event=>
    validRange&&workspaceTeamActivityDateMatches(event,fromDay,toDay)&&
    (!onlyUnread||(unread!==null && workspaceTeamEventUnread(event,owner,joinedAt,lastSeen))) &&
    teamHistorySearch(event,WORKSPACE_TEAM_EVENT_LABELS[
      event.event_type as keyof typeof WORKSPACE_TEAM_EVENT_LABELS]??event.event_type,
      titles[event.entity_id]??"",search));
  const canLoadMore=(hasMore??events.length>=30)&&history.length<TEAM_ACTIVITY_VIEW_CAP;
  const loadOlder=async()=>{
    if(historyLock.current||historyLoading||!canLoadMore||!history.length)return;
    historyLock.current=true;
    const version=revision.current,epoch=historyEpoch.current;
    const oldest=history.at(-1)!.id;
    const limit=Math.min(TEAM_ACTIVITY_PAGE_SIZE,TEAM_ACTIVITY_VIEW_CAP-history.length);
    setHistoryLoading(true);setHistoryError("");setHistoryNotice("");
    try {
      const auth=await supabase.auth.getUser();
      if(auth.error||auth.data.user?.id!==owner)
        throw new Error("Signed-in account changed; reload this team first");
      const page=await supabase.from("workspace_team_events")
        .select("*",{count:"exact"}).eq("space_id",spaceId)
        .lt("id",oldest).order("id",{ascending:false}).limit(limit);
      if(page.error)throw new Error(page.error.message);
      if(!Number.isSafeInteger(page.count)||page.count===null||
        (page.data?.length??-1)!==Math.min(page.count,limit)) {
        throw new Error("Incomplete event-history page; try again before exporting");
      }
      const rows=(page.data??[]) as Event[];
      if(rows.some(row=>row.id>=oldest))
        throw new Error("History cursor returned a repeated or out-of-order event");
      mergeWorkspaceTeamHistory([],rows,spaceId); // rejects malformed cross-space payloads
      const verified=await supabase.auth.getUser();
      if(verified.error||verified.data.user?.id!==owner)
        throw new Error("Signed-in account changed while loading history");
      if(version===revision.current&&epoch===historyEpoch.current) {
        setOlder(previous=>mergeWorkspaceTeamHistory(previous,rows,spaceId));
        setHasMore(page.count>rows.length);
      }
    }catch(failure){
      if(version===revision.current&&epoch===historyEpoch.current)
        setHistoryError(failure instanceof Error?failure.message:"Cannot load older activity");
    }finally{
      if(version===revision.current&&epoch===historyEpoch.current){historyLock.current=false;setHistoryLoading(false);}
    }
  };
  const exportVisible=()=>{
    try{
      const csv=buildWorkspaceTeamActivityCsv(visible,owner,titles,WORKSPACE_TEAM_EVENT_LABELS,spaceId);
      const blob=new Blob([String.fromCharCode(0xFEFF),csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download="eternyx-team-activity-"+spaceId.slice(0,8)+".csv";
      try{document.body.appendChild(link);link.click();}
      finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(failure){
      setHistoryError(failure instanceof Error?failure.message:"History CSV export failed");
    }
  };
  return <div className="space-y-3 rounded-lg border border-border p-3"
    aria-label="Team notifications and server-recorded activity">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4"/> Team activity and notifications
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Radio className="h-3.5 w-3.5"/>
          {connection==="connected"?"Realtime connected · delivery not yet verified":
            connection==="connecting"?"Connecting…":"Realtime unavailable · refresh manually"}
        </span>
        <Button size="sm" variant="outline" type="button"
          onClick={()=>{setPulse(n=>n+1);onRemoteRef.current();}}>
          <RefreshCw className="mr-1 h-3.5 w-3.5"/> Refresh
        </Button>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-1 text-xs" aria-live="polite">
        <Bell className="h-3.5 w-3.5"/>
        {unread===null?"Unread count unavailable":
          unread===0?"No unread teammate events":unread+" unread teammate event"+(unread===1?"":"s")}
      </p>
      <Button size="sm" variant="outline" disabled={working||unread===null||unread===0}
        onClick={()=>void markSeen()}>
        <CheckCheck className="mr-1 h-3.5 w-3.5"/> Mark snapshot seen
      </Button>
    </div>
    {error&&<p className="text-xs text-destructive" role="alert">{error}</p>}
    {message&&<p className="text-xs text-cyan-300" role="status">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <label className="text-xs">Category{" "}
        <select aria-label="Activity category" value={group}
          onChange={event=>setGroup(event.target.value)}
          className="min-h-9 rounded-md border border-border bg-background px-2">
          <option value="all">All</option><option value="tasks">Tasks</option>
          <option value="discussion">Discussions & checklists</option>
          <option value="people">Members & invitations</option>
          <option value="space">Team lifecycle</option><option value="other">Other</option>
        </select>
      </label>
      <label className="text-xs">Author{" "}
        <select aria-label="Activity author" value={actor}
          onChange={event=>setActor(event.target.value)}
          className="min-h-9 rounded-md border border-border bg-background px-2">
          <option value="all">Everyone</option><option value="others">Teammates</option>
          <option value="mine">Me</option>
        </select>
      </label>
    </div>
    <label className="block text-xs">Search loaded activity
      <input aria-label="Search loaded team activity" value={search} maxLength={120}
        onChange={event=>setSearch(event.target.value)}
        placeholder="Action or task title"
        className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-3"/>
    </label>
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label>From (UTC)<input type="date" className="block rounded border border-border bg-background p-1" value={fromDay}
        onChange={event=>setFromDay(event.target.value)}/></label>
      <label>Through (UTC)<input type="date" className="block rounded border border-border bg-background p-1" value={toDay}
        onChange={event=>setToDay(event.target.value)}/></label>
      <Button type="button" size="sm" variant="outline" onClick={()=>{
        setGroup("all");setActor("all");setOnlyUnread(false);setSearch("");setFromDay("");setToDay("");
      }}>Reset activity filters</Button>
    </div>
    {!validRange&&<p role="alert" className="text-xs text-destructive">Choose a valid chronological UTC date range.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={onlyUnread} disabled={unread===null}
          onChange={event=>setOnlyUnread(event.target.checked)}/>
        Show only unread teammate events
      </label>
      <Button variant="outline" size="sm" type="button" disabled={!visible.length}
        onClick={exportVisible}>
        <Download className="mr-1 h-3.5 w-3.5"/> Export visible CSV ({visible.length})
      </Button>
    </div>
    <div className="max-h-[18rem] space-y-2 overflow-y-auto">
      {visible.map(event=>{
        const task=tasks.find(t=>t.id===event.entity_id);
        const isNew=unread!==null&&workspaceTeamEventUnread(event,owner,joinedAt,lastSeen);
        return <div key={event.id} className="border-b border-border/60 pb-2 text-xs">
          <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
          {" · "}<strong>{WORKSPACE_TEAM_EVENT_LABELS[
            event.event_type as keyof typeof WORKSPACE_TEAM_EVENT_LABELS]??event.event_type}</strong>
          {" · "}{teamMemberLabel(event.actor_id,owner)}
          {task&&<div className="flex flex-wrap items-center gap-2">
            <span className="break-words text-muted-foreground">Task: {task.title.slice(0,120)}</span>
            <Button variant="ghost" size="sm" type="button"
              onClick={()=>onOpenTask(task.id)}>Open task</Button>
          </div>}
          {isNew&&<span className="text-cyan-400">Unread</span>}
        </div>;
      })}
      {!visible.length&&<p className="text-xs text-muted-foreground">No events in this filter.</p>}
    </div>
    {historyError&&<p role="alert" className="text-xs text-destructive">{historyError}</p>}
    {historyNotice&&<p role="status" className="text-xs text-muted-foreground">{historyNotice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Showing {visible.length} of {history.length} loaded events (up to {TEAM_ACTIVITY_VIEW_CAP} per session)</span>
      {canLoadMore&&<Button size="sm" variant="outline" type="button"
        disabled={historyLoading} onClick={()=>void loadOlder()}>
        {historyLoading?"Loading…":"Load older activity"}
      </Button>}
    </div>
    <p className="text-xs text-muted-foreground">
      Exact unread totals use a single server snapshot and include teammate events
      since your membership began. Search and CSV include only loaded rows;
      the CSV is not a full compliance archive. Realtime can be unavailable;
      refresh or tab resumption reconciles team state. No email or push delivery.
    </p>
  </div>;
}
