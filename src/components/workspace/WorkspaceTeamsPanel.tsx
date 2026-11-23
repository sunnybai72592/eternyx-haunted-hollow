import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, ClipboardCopy, FolderKanban, MailPlus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import WorkspaceTeamTaskDiscussion from "@/components/workspace/WorkspaceTeamTaskDiscussion";
import WorkspaceTeamLiveFeed from "@/components/workspace/WorkspaceTeamLiveFeed";
import { workspaceTeamTaskMatchesFilter } from "@/lib/workspaceTeamDiscussion.mjs";
import { chooseWorkspaceTeam,verifyWorkspaceTeamDetails } from "@/lib/workspaceTeamAccess.mjs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  normalizeTeamTaskDraft, teamCanEdit, teamCanInvite, teamMemberLabel,
  validateTeamInviteToken,
  WORKSPACE_TEAM_PRIORITIES, WORKSPACE_TEAM_STATUSES,
} from "@/lib/workspaceTeamUtils.mjs";

type Space=Database["public"]["Tables"]["workspace_team_spaces"]["Row"];
type Member=Database["public"]["Tables"]["workspace_team_members"]["Row"];
type Task=Database["public"]["Tables"]["workspace_team_tasks"]["Row"];
type Event=Database["public"]["Tables"]["workspace_team_events"]["Row"];
type Invite=Database["public"]["Tables"]["workspace_team_invites"]["Row"];
type Draft={id:string|null;updatedAt:string|null;title:string;details:string;status:string;
  priority:string;due:string;assignee:string};
const freshDraft=():Draft=>({
  id:null,updatedAt:null,title:"",details:"",status:"todo",
  priority:"normal",due:"",assignee:"",
});
const errorMessage=(failure:unknown)=>failure instanceof Error?failure.message:"Team operation could not be completed";

export default function WorkspaceTeamsPanel({owner,disabled}:{
  owner:string;disabled:boolean;
}) {
  const [spaces,setSpaces]=useState<Space[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [events,setEvents]=useState<Event[]>([]);
  const [invites,setInvites]=useState<Invite[]>([]);
  const [teamName,setTeamName]=useState("");
  const [teamDescription,setTeamDescription]=useState("");
  const [joinToken,setJoinToken]=useState("");
  const [inviteRole,setInviteRole]=useState("editor");
  const [revealedToken,setRevealedToken]=useState<{token:string;role:string;expires:string}|null>(null);
  const [draft,setDraft]=useState<Draft>(freshDraft);
  const [taskFilter,setTaskFilter]=useState("all");
  const [discussionTaskId,setDiscussionTaskId]=useState<string|null>(null);
  const [liveRevision,setLiveRevision]=useState(0);
  const [verifiedSpaceId,setVerifiedSpaceId]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const ownerRef=useRef(owner);
  const epoch=useRef(0);
  const resumeInFlight=useRef(false);
  ownerRef.current=owner;
  const selected=spaces.find(s=>s.id===selectedId)??null;
  // Cached data from a former team/owner must never authorize rendering.
  const currentRole=verifiedSpaceId===selectedId && !disabled
    ? members.find(m=>m.user_id===owner&&m.space_id===selectedId)?.role??null
    : null;
  const editor=teamCanEdit(currentRole,selected?.status);
  const canInvite=teamCanInvite(currentRole,selected?.status);
  const memberIds=useMemo(()=>members.map(m=>m.user_id),[members]);
  const visibleTasks=useMemo(
    ()=>tasks.filter(task=>workspaceTeamTaskMatchesFilter(task,taskFilter,owner)),
    [tasks,taskFilter,owner]);
  const discussionTask=tasks.find(task=>task.id===discussionTaskId)??null;

  const assureOwner=async(expectedOwner:string)=>{
    const {data,error:authError}=await supabase.auth.getUser();
    if(authError || data.user?.id!==expectedOwner ||
        ownerRef.current!==expectedOwner) {
      throw new Error("Your signed-in Workspace account changed. Refresh before changing team data.");
    }
  };
  const quarantineTeam=()=>{
    setVerifiedSpaceId(null);
    setMembers([]);setTasks([]);setEvents([]);setInvites([]);
    setRevealedToken(null);setDiscussionTaskId(null);
    setDraft(freshDraft());setLiveRevision(0);
  };
  const loadSpaces=async(expectedOwner:string,token:number,prefer?:string|null)=>{
    const {data,error:queryError}=await supabase.from("workspace_team_spaces")
      .select("*").order("created_at",{ascending:false}).limit(150);
    if(queryError)throw new Error(queryError.message);
    if(ownerRef.current!==expectedOwner || epoch.current!==token)return;
    const rows=(data??[]) as Space[];
    const chosen=chooseWorkspaceTeam(rows,selectedId,prefer);
    if(!rows.some(space=>space.id===selectedId)) {
      // Revocation or leave: drop all cached personal/team detail immediately.
      quarantineTeam();
      if(selectedId)setNotice("This team is no longer available to your account. Local team details were cleared.");
    }
    setSpaces(rows);
    setSelectedId(chosen);
    return chosen;
  };
  const loadDetails=async(id:string,expectedOwner:string,token:number,available:Space[]=spaces)=>{
    const target=available.find(space=>space.id===id);
    if(!target) {
      if(epoch.current===token){quarantineTeam();setSelectedId(null);}
      return;
    }
    const isOwner=target?.owner_id===expectedOwner;
    const [m,t,e,i]=await Promise.all([
      supabase.from("workspace_team_members").select("*")
        .eq("space_id",id).order("joined_at",{ascending:true}).limit(20),
      supabase.from("workspace_team_tasks").select("*")
        .eq("space_id",id).order("updated_at",{ascending:false}).limit(500),
      supabase.from("workspace_team_events").select("*")
        .eq("space_id",id).order("created_at",{ascending:false}).limit(30),
      isOwner ? supabase.from("workspace_team_invites")
        .select("id,space_id,created_by,role,expires_at,created_at,revoked_at,consumed_by,consumed_at")
        .eq("space_id",id).order("created_at",{ascending:false}).limit(30) : Promise.resolve({data:[],error:null}),
    ]);
    if(m.error||t.error||e.error||i.error)throw new Error(
      m.error?.message??t.error?.message??e.error?.message??i.error?.message??"Team query failed");
    // Protect against a user switch while the four queries were in flight.
    await assureOwner(expectedOwner);
    if(ownerRef.current!==expectedOwner || epoch.current!==token)return;
    try {
      verifyWorkspaceTeamDetails({
        space:target,owner:expectedOwner,spaceId:id,
        members:m.data??[],tasks:t.data??[],events:e.data??[],
        invites:i.data??[],
      });
    }catch{
      // A revoked membership is not an empty team. Quarantine old data.
      quarantineTeam();
      setSpaces(previous=>previous.filter(space=>space.id!==id));
      setSelectedId(current=>current===id?null:current);
      setNotice("Access to this team could not be verified; cached details were cleared.");
      return;
    }
    setMembers((m.data??[]) as Member[]);
    setTasks((t.data??[]) as Task[]);
    setEvents((e.data??[]) as Event[]);
    setInvites((i.data??[]) as Invite[]);
    setVerifiedSpaceId(id);
  };
  useEffect(()=>{
    const token=++epoch.current;
    setSpaces([]);setSelectedId(null);setMembers([]);setTasks([]);
    setEvents([]);setInvites([]);setRevealedToken(null);
    setVerifiedSpaceId(null);
    setTaskFilter("all");setDiscussionTaskId(null);setLiveRevision(0);
    setJoinToken("");setNotice("");setError("");setDraft(freshDraft());
    setLoading(true);
    void (async()=>{
      try {
        await assureOwner(owner);
        await loadSpaces(owner,token);
      }catch(failure){
        if(epoch.current===token && ownerRef.current===owner)setError(errorMessage(failure));
      }finally{
        if(epoch.current===token && ownerRef.current===owner)setLoading(false);
      }
    })();
    return ()=>{epoch.current++;};
  },[owner]);
  useEffect(()=>{
    const token=++epoch.current;
    setMembers([]);setTasks([]);setEvents([]);setInvites([]);
    setVerifiedSpaceId(null);
    setRevealedToken(null);setDraft(freshDraft());
    setTaskFilter("all");setDiscussionTaskId(null);setLiveRevision(0);
    if(!selectedId)return;
    setLoading(true);
    void (async()=>{
      try {
        await assureOwner(owner);
        await loadDetails(selectedId,owner,token);
      }catch(failure){
        if(epoch.current===token && ownerRef.current===owner){
          quarantineTeam();
          setError(errorMessage(failure));
        }
      }finally{
        if(epoch.current===token && ownerRef.current===owner)setLoading(false);
      }
    })();
    return ()=>{epoch.current++;};
  },[owner,selectedId]);

  const refresh=async(target?:string|null)=>{
    // Every refresh is its own generation. Slower stale responses cannot
    // repopulate data after a newer refresh or account/selection change.
    const token=++epoch.current;
    await assureOwner(owner);
    const chosen=await loadSpaces(owner,token,target??selectedId);
    if(chosen && chosen===selectedId) {
      // A new selection gets its own guarded detail effect.
      await loadDetails(chosen,owner,token);
    }
  };
  useEffect(()=>{
    let alive=true;
    let debounce:ReturnType<typeof setTimeout>|null=null;
    const resume=()=>{
      if(!alive||disabled)return;
      if(document.visibilityState==="hidden"){
        epoch.current++;
        quarantineTeam();
        return;
      }
      if(document.visibilityState!=="visible"||resumeInFlight.current)return;
      if(debounce)clearTimeout(debounce);
      debounce=setTimeout(()=>{
        if(!alive||resumeInFlight.current)return;
        resumeInFlight.current=true;
        // Hide previously cached team data until current membership is checked.
        quarantineTeam();
        void refresh().catch(failure=>{
          quarantineTeam();
          setError(errorMessage(failure));
        }).finally(()=>{resumeInFlight.current=false;});
      },250);
    };
    document.addEventListener("visibilitychange",resume);
    window.addEventListener("focus",resume);
    const poll=window.setInterval(resume,60000);
    return ()=>{
      alive=false;
      if(debounce)clearTimeout(debounce);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange",resume);
      window.removeEventListener("focus",resume);
    };
  },[owner,selectedId,disabled]);
  const run=async(action:()=>Promise<void>,success:string)=>{
    if(disabled||busy)return;
    setBusy(true);setError("");setNotice("");
    const initialOwner=owner;
    try {
      await assureOwner(initialOwner);
      await action();
      if(ownerRef.current!==initialOwner)return;
      setNotice(success);
      await refresh();
    } catch(failure) {
      if(ownerRef.current===initialOwner)setError(errorMessage(failure));
    } finally {
      if(ownerRef.current===initialOwner)setBusy(false);
    }
  };
  const createTeam=(event:FormEvent)=>{
    event.preventDefault();
    if(!teamName.trim())return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_create",{
        p_name:teamName.trim(),p_description:teamDescription,
      });
      if(queryError||!data)throw new Error(queryError?.message??"Team creation was not confirmed");
      setTeamName("");setTeamDescription("");
      await refresh(data);
    },"Team space created. Only explicitly invited members can access its tasks.");
  };
  const acceptInvite=(event:FormEvent)=>{
    event.preventDefault();
    void run(async()=>{
      const code=validateTeamInviteToken(joinToken);
      const {data,error:queryError}=await supabase.rpc("workspace_team_accept_invite",{
        p_token:code,
      });
      if(queryError||!data)throw new Error(queryError?.message??"Invitation was not accepted");
      setJoinToken("");
      await refresh(data);
    },"Team invitation accepted. Your new membership is private to this account.");
  };
  const invite=()=>{
    if(!selected||!canInvite)return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_invite",{
        p_space_id:selected.id,p_role:inviteRole,
      });
      if(queryError||!data)throw new Error(queryError?.message??"Invitation could not be created");
      const receipt=data as {token?:string;role?:string;expires_at?:string};
      if(!receipt.token||!receipt.role||!receipt.expires_at)
        throw new Error("Server did not return a one-time invitation code");
      setRevealedToken({token:receipt.token,role:receipt.role,expires:receipt.expires_at});
    },"One-time invitation created. Share the code securely; it will not be shown again after leaving this team.");
  };
  const saveTask=(event:FormEvent)=>{
    event.preventDefault();
    if(!selected||!editor)return;
    void run(async()=>{
      const validated=normalizeTeamTaskDraft(draft,memberIds);
      const {data,error:queryError}=await supabase.rpc("workspace_team_save_task",{
        p_space_id:selected.id,p_task_id:draft.id,
        ...validated,p_expected_updated_at:draft.updatedAt,
      });
      if(queryError||!data)throw new Error(queryError?.message??"Task save was not confirmed");
      setDraft(freshDraft());
    },"Assigned task saved to your private team space.");
  };
  const editTask=(task:Task)=>{
    setDraft({id:task.id,updatedAt:task.updated_at,title:task.title,
      details:task.details,status:task.status,priority:task.priority,
      due:task.due_on??"",assignee:task.assignee_id??""});
  };
  const removeTask=(task:Task)=>{
    if(!selected||!editor||!window.confirm("Delete this shared task? The audit event will remain."))return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_delete_task",{
        p_space_id:selected.id,p_task_id:task.id,
      });
      if(queryError||data!==true)throw new Error(queryError?.message??"Task deletion not confirmed");
      if(discussionTaskId===task.id)setDiscussionTaskId(null);
    },"Shared task deleted. Team activity retained.");
  };
  const changeRole=(member:Member,role:string|null)=>{
    if(!selected || currentRole!=="owner" || member.role==="owner")return;
    if(!window.confirm(role===null?"Remove this member and clear their assignments?":
        "Change this member's role to "+role+"?"))return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_member_change",{
        p_space_id:selected.id,p_user_id:member.user_id,p_role:role,
      });
      if(queryError||data!==true)throw new Error(queryError?.message??"Membership update failed");
    },role===null?"Member removed. Their tasks remain but are unassigned.":"Member role changed.");
  };
  const setArchive=()=>{
    if(!selected||currentRole!=="owner")return;
    const next=selected.status==="active"?"archived":"active";
    if(!window.confirm(next==="archived"?"Archive this team? Tasks become read-only until reopened.":"Reopen this team for editing?"))return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_set_status",{
        p_space_id:selected.id,p_status:next,
      });
      if(queryError||data!==true)throw new Error(queryError?.message??"Team status not confirmed");
    },"Team status updated.");
  };
  const leave=()=>{
    if(!selected||currentRole==="owner"||!window.confirm(
      "Leave this team? Your membership will be removed and your assignments cleared."))return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_leave",{
        p_space_id:selected.id,
      });
      if(queryError||data!==true)throw new Error(queryError?.message??"Leave was not confirmed");
      setSelectedId(null);
    },"You left this team. Previously shared tasks were not deleted.");
  };

  return <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6"
    aria-label="Team collaboration workspace">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Users className="h-5 w-5 text-cyan-400" aria-hidden="true"/> Team collaboration
      </h2>
      <Button size="sm" variant="outline" type="button" disabled={busy||disabled||loading}
        onClick={()=>void run(async()=>{await refresh();},"Team records refreshed.")}>
        <RefreshCw className="mr-1 h-4 w-4"/> Refresh
      </Button>
    </div>
    <p className="text-sm text-muted-foreground">
      Team spaces are separate from your personal Workspace. Only invited members
      can see team tasks. Existing private projects, notes, files and backups stay owner-only.
      Team activity can update through a scoped Realtime subscription after deployment;
      manual refresh stays available when a connection is offline.
    </p>
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="space-y-2 rounded-xl border border-border p-3" onSubmit={createTeam}>
        <h3 className="font-medium text-sm">Create a private team space</h3>
        <label htmlFor="team17-name" className="text-xs">Team name</label>
        <Input id="team17-name" value={teamName} maxLength={120} required
          onChange={event=>setTeamName(event.target.value)}
          placeholder="Coating inspection crew"/>
        <label htmlFor="team17-description" className="text-xs">Description (optional)</label>
        <Textarea id="team17-description" rows={2} value={teamDescription} maxLength={2000}
          onChange={event=>setTeamDescription(event.target.value)}/>
        <Button type="submit" size="sm" disabled={disabled||busy||!teamName.trim()}>
          Create team space
        </Button>
      </form>
      <form className="space-y-2 rounded-xl border border-border p-3" onSubmit={acceptInvite}>
        <h3 className="font-medium text-sm">Join using a private invitation</h3>
        <p className="text-xs text-muted-foreground">
          Ask the team owner for a one-time 64-character invitation code. It
          expires after seven days and cannot be reused by another account.
        </p>
        <label htmlFor="team17-join" className="text-xs">Invitation code</label>
        <Input id="team17-join" value={joinToken} maxLength={64} autoComplete="off"
          spellCheck={false} onChange={event=>setJoinToken(event.target.value)}
          placeholder="Paste invitation code"/>
        <Button type="submit" variant="outline" size="sm"
          disabled={disabled||busy||joinToken.trim().length!==64}>
          Join team
        </Button>
      </form>
    </div>
    {error&&<p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="break-words text-sm text-cyan-300">{notice}</p>}
    {loading&&<p role="status" className="text-sm text-muted-foreground">Loading owner-scoped team data…</p>}
    <div className="flex flex-wrap items-center gap-2" aria-label="Select team space">
      {spaces.map(space=><Button type="button" key={space.id} size="sm"
        variant={space.id===selectedId?"default":"outline"} disabled={busy||disabled}
        onClick={()=>{quarantineTeam();setSelectedId(space.id);}}>
        <FolderKanban className="mr-1 h-3.5 w-3.5"/>
        {space.name}{space.status==="archived"?" (archived)":""}
      </Button>)}
      {!spaces.length&&!loading&&<p className="text-sm text-muted-foreground">
        No team memberships yet. Create a team or accept an invitation.
      </p>}
    </div>
    {selected&&currentRole&&<div className="space-y-4 rounded-xl border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{selected.name}</h3>
          <p className="text-xs text-muted-foreground">
            {selected.description||"No description"} · Your role: {currentRole} · {selected.status}
          </p>
        </div>
        {currentRole==="owner" && <Button size="sm" variant="outline" type="button"
          disabled={busy||disabled} onClick={setArchive}>
          <Archive className="mr-1 h-4 w-4"/>
          {selected.status==="active"?"Archive team":"Reopen team"}
        </Button>}
        {currentRole!=="owner" && <Button size="sm" variant="outline" type="button"
          disabled={busy||disabled} onClick={leave}>Leave team</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border p-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4"/>
            Members ({members.length}/20)</h4>
          {members.map(member=><div key={member.user_id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 text-xs">
            <span title={member.user_id} className="break-all">
              {teamMemberLabel(member.user_id,owner)} · {member.role}
            </span>
            {currentRole==="owner"&&member.role!=="owner"&&<div className="flex gap-1">
              <Button type="button" size="sm" variant="outline"
                disabled={busy||disabled||member.role==="editor"}
                onClick={()=>changeRole(member,"editor")}>Editor</Button>
              <Button type="button" size="sm" variant="outline"
                disabled={busy||disabled||member.role==="viewer"}
                onClick={()=>changeRole(member,"viewer")}>Viewer</Button>
              <Button type="button" size="sm" variant="ghost"
                disabled={busy||disabled} onClick={()=>changeRole(member,null)}>Remove</Button>
            </div>}
          </div>)}
        </div>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <MailPlus className="h-4 w-4"/> Secure invitations
          </h4>
          {canInvite&&<div className="flex flex-wrap items-center gap-2">
            <label htmlFor="team17-invite-role" className="text-xs">Invite as</label>
            <select id="team17-invite-role" value={inviteRole}
              onChange={event=>setInviteRole(event.target.value)}
              className="min-h-9 rounded-md border border-border bg-background px-2 text-xs">
              <option value="editor">Editor</option><option value="viewer">Viewer</option>
            </select>
            <Button size="sm" variant="outline" type="button"
              disabled={busy||disabled} onClick={invite}>Create one-time code</Button>
          </div>}
          {revealedToken && canInvite&&<div className="space-y-2 rounded-md border border-amber-600/50 p-2">
            <p className="text-xs text-amber-400">
              Share securely. This code is displayed once; anyone holding it can use it
              while valid, so do not post it publicly.
            </p>
            <code className="block break-all text-xs select-all">{revealedToken.token}</code>
            <p className="text-xs text-muted-foreground">
              {revealedToken.role} · expires {new Date(revealedToken.expires).toLocaleString()}
            </p>
            <Button size="sm" type="button" variant="outline"
              onClick={()=>void navigator.clipboard.writeText(revealedToken.token).catch(
                ()=>setError("Clipboard copy failed. Select the visible code manually."))}>
              <ClipboardCopy className="mr-1 h-4 w-4"/> Copy invitation code
            </Button>
          </div>}
          {currentRole==="owner"&&invites.filter(i=>!i.consumed_by && !i.revoked_at)
            .map(i=><div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 py-2 text-xs">
            <span>{i.role} · expires {new Date(i.expires_at).toLocaleString()}</span>
            <Button size="sm" variant="ghost" type="button" disabled={busy||disabled}
              onClick={()=>{
                if(!window.confirm("Revoke this invitation code?"))return;
                void run(async()=>{
                  const {data,error:queryError}=await supabase.rpc("workspace_team_revoke_invite",{
                    p_invite_id:i.id,
                  });
                  if(queryError||data!==true)throw new Error(queryError?.message??"Revoke not confirmed");
                  setRevealedToken(null);
                },"Invitation revoked.");
              }}>Revoke</Button>
          </div>)}
          {!canInvite&&<p className="text-xs text-muted-foreground">
            Only the team owner can create invitations while active.
          </p>}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <h4 className="text-sm font-semibold">Shared team tasks ({tasks.length}/500)</h4>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Team task filters">
          {([
            ["all","All"],
            ["mine","Assigned to me"],
            ["unassigned","Unassigned"],
            ["outstanding","Outstanding"],
          ] as const).map(([value,label])=><Button key={value} size="sm" type="button"
            variant={taskFilter===value?"default":"outline"}
            onClick={()=>setTaskFilter(value)}>
            {label}{value==="mine"?" ("+tasks.filter(t=>t.assignee_id===owner).length+")":""}
          </Button>)}
        </div>
        {editor&&<form className="grid gap-2 sm:grid-cols-2" onSubmit={saveTask}>
          <div className="sm:col-span-2">
            <label htmlFor="team17-task-title" className="text-xs">Task title</label>
            <Input id="team17-task-title" value={draft.title} required maxLength={200}
              onChange={event=>setDraft(d=>({...d,title:event.target.value}))}/>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="team17-task-details" className="text-xs">Details</label>
            <Textarea id="team17-task-details" value={draft.details} maxLength={4000}
              rows={2} onChange={event=>setDraft(d=>({...d,details:event.target.value}))}/>
          </div>
          <label className="space-y-1 text-xs">Status
            <select value={draft.status}
              onChange={event=>setDraft(d=>({...d,status:event.target.value}))}
              className="min-h-10 w-full rounded-md border border-border bg-background px-2">
              {WORKSPACE_TEAM_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Priority
            <select value={draft.priority}
              onChange={event=>setDraft(d=>({...d,priority:event.target.value}))}
              className="min-h-10 w-full rounded-md border border-border bg-background px-2">
              {WORKSPACE_TEAM_PRIORITIES.map(priority=><option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Assign to member
            <select value={draft.assignee}
              onChange={event=>setDraft(d=>({...d,assignee:event.target.value}))}
              className="min-h-10 w-full rounded-md border border-border bg-background px-2">
              <option value="">Unassigned</option>
              {members.map(member=><option key={member.user_id} value={member.user_id}>
                {teamMemberLabel(member.user_id,owner)} ({member.role})
              </option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Due date
            <Input type="date" value={draft.due}
              onChange={event=>setDraft(d=>({...d,due:event.target.value}))}/>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy||disabled||!draft.title.trim()}>
              <CheckCircle2 className="mr-1 h-4 w-4"/>
              {draft.id?"Save reviewed task":"Create shared task"}
            </Button>
            {draft.id&&<Button type="button" size="sm" variant="outline"
              disabled={busy||disabled} onClick={()=>setDraft(freshDraft())}>Cancel edit</Button>}
          </div>
        </form>}
        <div className="max-h-[24rem] divide-y divide-border overflow-y-auto">
          {visibleTasks.map(task=><div key={task.id} className="flex flex-wrap items-center gap-3 py-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{task.title}</p>
              <p className="text-muted-foreground break-words">{task.details.slice(0,300)}</p>
              <p className="text-muted-foreground">
                {task.status} · {task.priority} ·
                {" "+(task.assignee_id?teamMemberLabel(task.assignee_id,owner):"Unassigned")} ·
                {task.due_on?" due "+task.due_on:" no due date"}
              </p>
            </div>
            <Button size="sm" type="button"
              variant={discussionTaskId===task.id?"default":"outline"}
              disabled={disabled||busy}
              onClick={()=>setDiscussionTaskId(value=>value===task.id?null:task.id)}>
              {discussionTaskId===task.id?"Close discussion":"Discussion & checklist"}
            </Button>
            {editor&&<div className="flex gap-1">
              <Button size="sm" type="button" variant="outline"
                disabled={busy||disabled} onClick={()=>editTask(task)}>Edit</Button>
              <Button size="sm" type="button" variant="ghost"
                disabled={busy||disabled} onClick={()=>removeTask(task)}>Delete</Button>
            </div>}
          </div>)}
          {!visibleTasks.length&&<p className="py-3 text-xs text-muted-foreground">
            {tasks.length?"No tasks match this filter.":"No shared tasks yet."}
          </p>}
        </div>
        {discussionTask&&<WorkspaceTeamTaskDiscussion
          key={owner+":"+selected.id+":"+discussionTask.id}
          owner={owner} spaceId={selected.id} taskId={discussionTask.id}
          role={currentRole} active={selected.status==="active"}
          disabled={busy||disabled||loading} refreshKey={liveRevision}
          onChanged={()=>{void refresh().catch(failure=>setError(errorMessage(failure)));}} />}
      </div>

      <WorkspaceTeamLiveFeed key={owner+":"+selected.id}
        owner={owner} spaceId={selected.id}
        joinedAt={members.find(m=>m.user_id===owner)?.joined_at??selected.created_at}
        events={events} tasks={tasks}
        onRemoteChange={()=>{
          setLiveRevision(value=>value+1);
          void refresh().catch(failure=>setError(errorMessage(failure)));
        }}
        onOpenTask={(taskId)=>{
          if(!tasks.some(task=>task.id===taskId))return;
          setTaskFilter("all");setDiscussionTaskId(taskId);
          window.setTimeout(()=>document.querySelector('[aria-label="Shared task discussion and checklist"]')
            ?.scrollIntoView({behavior:"smooth",block:"start"}),30);
        }} />
    </div>}
  </section>;
}
