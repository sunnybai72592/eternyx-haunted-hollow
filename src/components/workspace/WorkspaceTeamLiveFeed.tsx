import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, History, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { teamMemberLabel, WORKSPACE_TEAM_EVENT_LABELS } from "@/lib/workspaceTeamUtils.mjs";
import { workspaceTeamEventUnread, workspaceTeamVisibleEvents } from "@/lib/workspaceTeamLive.mjs";

type Event=Database["public"]["Tables"]["workspace_team_events"]["Row"];
type Task=Database["public"]["Tables"]["workspace_team_tasks"]["Row"];
type Connection="connecting"|"connected"|"disconnected";
export default function WorkspaceTeamLiveFeed({owner,spaceId,joinedAt,events,tasks,onRemoteChange}:{
  owner:string;spaceId:string;joinedAt:string;events:Event[];tasks:Task[];
  onRemoteChange:()=>void;
}) {
  const [connection,setConnection]=useState<Connection>("connecting");
  const [unread,setUnread]=useState<number|null>(null);
  const [lastSeen,setLastSeen]=useState(0);
  const [group,setGroup]=useState("all");
  const [actor,setActor]=useState("all");
  const [pulse,setPulse]=useState(0);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const revision=useRef(0);
  const onRemoteRef=useRef(onRemoteChange);
  onRemoteRef.current=onRemoteChange;

  useEffect(()=>{
    const version=++revision.current;
    setUnread(null);setLastSeen(0);setError("");setMessage("");
    return ()=>{revision.current++;};
  },[owner,spaceId]);

  useEffect(()=>{
    const version=revision.current;
    let alive=true;
    void (async()=>{
      try {
        const auth=await supabase.auth.getUser();
        if(auth.error||auth.data.user?.id!==owner)
          throw new Error("Your Workspace account changed. Sign in again to see team notifications.");
        const marker=await supabase.from("workspace_team_read_cursors")
          .select("last_seen_event_id").eq("space_id",spaceId).eq("user_id",owner)
          .maybeSingle();
        if(marker.error)throw new Error(marker.error.message);
        const seen=marker.data?.last_seen_event_id??0;
        if(!Number.isSafeInteger(seen)||seen<0)
          throw new Error("Invalid server notification receipt");
        const count=await supabase.from("workspace_team_events")
          .select("id",{head:true,count:"exact"})
          .eq("space_id",spaceId).neq("actor_id",owner)
          .gte("created_at",joinedAt).gt("id",seen);
        if(count.error||!Number.isSafeInteger(count.count))
          throw new Error(count.error?.message??"Exact unread event count unavailable");
        if(alive&&version===revision.current) {
          setLastSeen(seen);setUnread(count.count as number);setError("");
        }
      }catch(failure) {
        if(alive&&version===revision.current) {
          setUnread(null);
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
    if(working||unread===null||unread===0)return;
    const version=revision.current;
    setWorking(true);setError("");setMessage("");
    try {
      const auth=await supabase.auth.getUser();
      if(auth.error||auth.data.user?.id!==owner)
        throw new Error("Workspace identity changed; refresh before acknowledging events");
      const newest=await supabase.from("workspace_team_events")
        .select("id").eq("space_id",spaceId)
        .order("id",{ascending:false}).limit(1).maybeSingle();
      if(newest.error||!newest.data)
        throw new Error(newest.error?.message??"No server event available to acknowledge");
      const saved=await supabase.rpc("workspace_team_mark_events_seen",{
        p_space_id:spaceId,p_event_id:newest.data.id,
      });
      if(saved.error||!Number.isSafeInteger(saved.data))
        throw new Error(saved.error?.message??"Event acknowledgement was not verified");
      if(version===revision.current){
        setLastSeen(saved.data as number);
        setMessage("Server saved your read position.");
        setPulse(n=>n+1);
      }
    }catch(failure){
      if(version===revision.current)
        setError(failure instanceof Error?failure.message:"Could not mark activity as read");
    }finally{
      if(version===revision.current)setWorking(false);
    }
  };
  const visible=workspaceTeamVisibleEvents(events,group,actor,owner);
  return <div className="space-y-3 rounded-lg border border-border p-3"
    aria-label="Team notifications and server-recorded activity">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4"/> Team activity and notifications
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Radio className="h-3.5 w-3.5"/>
          {connection==="connected"?"Realtime subscribed":
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
        <CheckCheck className="mr-1 h-3.5 w-3.5"/> Mark all seen
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
          <option value="space">Team lifecycle</option>
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
    <div className="max-h-[18rem] space-y-2 overflow-y-auto">
      {visible.map(event=>{
        const task=tasks.find(t=>t.id===event.entity_id);
        const isNew=workspaceTeamEventUnread(event,owner,joinedAt,lastSeen);
        return <div key={event.id} className="border-b border-border/60 pb-2 text-xs">
          <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
          {" · "}<strong>{WORKSPACE_TEAM_EVENT_LABELS[
            event.event_type as keyof typeof WORKSPACE_TEAM_EVENT_LABELS]??event.event_type}</strong>
          {" · "}{teamMemberLabel(event.actor_id,owner)}
          {task&&<span className="block break-words text-muted-foreground">Task: {task.title.slice(0,120)}</span>}
          {isNew&&<span className="text-cyan-400">Unread</span>}
        </div>;
      })}
      {!visible.length&&<p className="text-xs text-muted-foreground">No events in this filter.</p>}
    </div>
    <p className="text-xs text-muted-foreground">
      Latest 30 actual server events are shown; unread totals are exact across the
      team since your current membership began. Browser notifications, email,
      presence and full-history export are not enabled.
    </p>
  </div>;
}
