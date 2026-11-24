import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Archive, CalendarDays, CheckCircle2, ClipboardCopy, Columns3, Download, FolderKanban, List, MailPlus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import WorkspaceTeamTaskDiscussion from "@/components/workspace/WorkspaceTeamTaskDiscussion";
import WorkspaceTeamLiveFeed from "@/components/workspace/WorkspaceTeamLiveFeed";
import {
  workspaceTeamScheduleGroups,workspaceTeamTaskDueDatePatch,
  buildWorkspaceTeamScheduleIcs,workspaceTeamMonthPlan,workspaceTeamShiftMonth,
} from "@/lib/workspaceTeamSchedule.mjs";
import {
  workspaceTeamBoardColumns,workspaceTeamNextTaskStatus,
  workspaceTeamNextTaskLabel,workspaceTeamTaskStatusPayload,
  workspaceTeamTaskMovePayload,workspaceTeamTaskQuickPatch,workspaceTeamBoardDragReceipt,
  workspaceTeamBoardResolveDrag,WORKSPACE_TEAM_BOARD_DRAG_MIME,
} from "@/lib/workspaceTeamTaskBoard.mjs";
import {
  workspaceTeamLocalDay,workspaceTeamTaskSummary,workspaceTeamTaskDueBucket,
  selectWorkspaceTeamTasks,buildWorkspaceTeamTasksCsv,
  resolveWorkspaceAssigneeFilter,workspaceTeamWorkload,workspaceTeamWorkloadView,
} from "@/lib/workspaceTeamTaskOperations.mjs";
import { chooseWorkspaceTeam,verifyWorkspaceTeamDetails,
  retainWorkspaceTeamDraft,shouldQuarantineWorkspaceAuth,workspaceResumeAction,
  assertWorkspaceTeamState,requireWorkspacePreferredTeam,
  verifyWorkspaceTeamCompletePage,isWorkspaceActionCurrent,
  verifyWorkspaceTeamSpacePage,
} from "@/lib/workspaceTeamAccess.mjs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  normalizeTeamTaskDraft, teamCanEdit, teamCanInvite, teamMemberLabel,
  validateTeamInviteToken,workspaceTeamMemberImpact,workspaceTeamInviteState,workspaceTeamInviteReceipt,
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
  const [revealedToken,setRevealedToken]=useState<{id:string;token:string;role:string;expires:string}|null>(null);
  const [inviteView,setInviteView]=useState("pending");
  const [memberView,setMemberView]=useState("all");
  const [inviteClock,setInviteClock]=useState(()=>Date.now());
  useEffect(()=>{
    const tick=()=>setInviteClock(Date.now());
    const timer=window.setInterval(tick,30000);
    window.addEventListener("focus",tick);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};
  },[]);
  useEffect(()=>{
    if(revealedToken&&Date.parse(revealedToken.expires)<=inviteClock)setRevealedToken(null);
  },[inviteClock,revealedToken]);
  const [draft,setDraft]=useState<Draft>(freshDraft);
  const [taskFilter,setTaskFilter]=useState("all");
  const [taskQuery,setTaskQuery]=useState("");
  const [taskSort,setTaskSort]=useState("updated");
  const [taskPriorityFilter,setTaskPriorityFilter]=useState("all");
  const [taskAssigneeFilter,setTaskAssigneeFilter]=useState("all");
  const [taskLayout,setTaskLayout]=useState<"list"|"board"|"schedule">("list");
  const [calendarDay,setCalendarDay]=useState<string|null>(null);
  const [dragOverColumn,setDragOverColumn]=useState<string|null>(null);
  const [discussionTaskId,setDiscussionTaskId]=useState<string|null>(null);
  const [liveRevision,setLiveRevision]=useState(0);
  const [verifiedSpaceId,setVerifiedSpaceId]=useState<string|null>(null);
  const [spaceListVerified,setSpaceListVerified]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const ownerRef=useRef(owner);
  const spacesEpoch=useRef(0);
  const detailsEpoch=useRef(0);
  const resumeInFlight=useRef(false);
  const resumePending=useRef(false);
  const actionBusyRef=useRef(false);
  const actionEpoch=useRef(0);
  ownerRef.current=owner;
  const selected=spaceListVerified ? spaces.find(s=>s.id===selectedId)??null : null;
  // Cached data from a former team/owner must never authorize rendering.
  const currentRole=verifiedSpaceId===selectedId && !disabled
    ? members.find(m=>m.user_id===owner&&m.space_id===selectedId)?.role??null
    : null;
  const editor=teamCanEdit(currentRole,selected?.status);
  const canInvite=teamCanInvite(currentRole,selected?.status);
  const canManage=Boolean(selected&&currentRole==="owner"&&spaceListVerified&&
    verifiedSpaceId===selected.id&&!disabled&&!busy&&!loading);
  const invitationRows=useMemo(()=>currentRole==="owner"&&selected?
    invites.map(invite=>({invite,state:workspaceTeamInviteState(invite,inviteClock)})):[],
    [invites,currentRole,selected,inviteClock]);
  const visibleInvitations=invitationRows.filter(row=>inviteView==="all"||row.state===inviteView);
  const visibleMembers=members.filter(member=>memberView==="all"||member.role===memberView);
  const memberIds=useMemo(()=>members.map(m=>m.user_id),[members]);
  const [today,setToday]=useState(()=>workspaceTeamLocalDay(new Date()));
  useEffect(()=>{
    const refreshDay=()=>setToday(workspaceTeamLocalDay(new Date()));
    const timer=window.setInterval(refreshDay,30000);
    window.addEventListener("focus",refreshDay);
    document.addEventListener("visibilitychange",refreshDay);
    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener("focus",refreshDay);
      document.removeEventListener("visibilitychange",refreshDay);
    };
  },[]);
  const plannerDay=calendarDay??today;
  const plannerMonth=plannerDay.slice(0,7);
  const effectiveAssigneeFilter=resolveWorkspaceAssigneeFilter(taskAssigneeFilter,memberIds);
  const taskSummary=useMemo(()=>workspaceTeamTaskSummary(tasks,today),[tasks,today]);
  const visibleTasks=useMemo(
    ()=>selectWorkspaceTeamTasks(tasks,{
      filter:taskFilter,search:taskQuery,sort:taskSort,owner,today,
      priority:taskPriorityFilter,assignee:effectiveAssigneeFilter,memberIds,
    }),[tasks,taskFilter,taskQuery,taskSort,owner,today,
      taskPriorityFilter,effectiveAssigneeFilter,memberIds]);
  const boardColumns=useMemo(
    ()=>selected&&currentRole?workspaceTeamBoardColumns(visibleTasks,selected.id):[],
    [visibleTasks,selected,currentRole]);
  const scheduleGroups=useMemo(
    ()=>selected&&currentRole?workspaceTeamScheduleGroups(visibleTasks,selected.id,today):[],
    [visibleTasks,selected,currentRole,today]);
  const monthCells=useMemo(
    ()=>selected&&currentRole&&taskLayout==="schedule"
      ?workspaceTeamMonthPlan(visibleTasks,selected.id,plannerMonth):[],
    [visibleTasks,selected,currentRole,taskLayout,plannerMonth]);
  const selectedDayCell=monthCells.find(cell=>cell?.date===plannerDay);
  const previousMonth=workspaceTeamShiftMonth(plannerMonth,-1);
  const nextMonth=workspaceTeamShiftMonth(plannerMonth,1);
  const scheduledCount=visibleTasks.filter(task=>task.due_on&&task.status!=="done").length;
  const workload=useMemo(
    ()=>selected&&currentRole?workspaceTeamWorkload(tasks,members,owner,selected.id,today):[],
    [tasks,members,owner,selected,currentRole,today]);
  const [showWorkload,setShowWorkload]=useState(false);
  const discussionTask=tasks.find(task=>task.id===discussionTaskId)??null;

  const assureOwner=async(expectedOwner:string)=>{
    const {data,error:authError}=await supabase.auth.getUser();
    if(authError || data.user?.id!==expectedOwner ||
        ownerRef.current!==expectedOwner) {
      throw new Error("Your signed-in Workspace account changed. Refresh before changing team data.");
    }
  };
  const maskTeam=()=>{
    // During membership revalidation, hide cached rows but preserve an
    // unfinished task edit until the signed-in member is checked again.
    setSpaceListVerified(false);setVerifiedSpaceId(null);
    setRevealedToken(null); // one-time invite secrets should not reappear
  };
  const quarantineTeam=()=>{
    maskTeam();
    setMembers([]);setTasks([]);setEvents([]);setInvites([]);
    setDiscussionTaskId(null);setDraft(freshDraft());setLiveRevision(0);
  };
  const loadSpaces=async(expectedOwner:string,token:number,prefer?:string|null)=>{
    const {data,count,error:queryError}=await supabase.from("workspace_team_spaces")
      .select("*",{count:"exact"}).order("created_at",{ascending:false}).limit(150);
    if(queryError)throw new Error(queryError.message);
    // Data API results cannot be reused after a mid-request Auth change.
    await assureOwner(expectedOwner);
    if(ownerRef.current!==expectedOwner || spacesEpoch.current!==token)return null;
    const rows=verifyWorkspaceTeamSpacePage(data,count) as Space[];
    // Treat this as one verified server snapshot. It MUST be passed through
    // to details, not silently replaced by a stale React render closure.
    rows.forEach(assertWorkspaceTeamState);
    requireWorkspacePreferredTeam(rows,prefer);
    const chosen=chooseWorkspaceTeam(rows,selectedId,prefer);
    if(selectedId && !rows.some(space=>space.id===selectedId)) {
      // Revocation or leave: drop all cached personal/team detail immediately.
      quarantineTeam();
      if(selectedId)setNotice("This team is no longer available to your account. Local team details were cleared.");
    }
    setSpaces(rows);
    setSpaceListVerified(true);
    setSelectedId(chosen);
    return {chosen,rows};
  };
  const loadDetails=async(id:string,expectedOwner:string,token:number,available:Space[]=spaces)=>{
    const target=available.find(space=>space.id===id);
    if(!target) {
      if(detailsEpoch.current===token){quarantineTeam();setSelectedId(null);}
      return false;
    }
    assertWorkspaceTeamState(target);
    const isOwner=target.owner_id===expectedOwner;
    const [m,t,e,i]=await Promise.all([
      supabase.from("workspace_team_members").select("*",{count:"exact"})
        .eq("space_id",id).order("joined_at",{ascending:true}).limit(20),
      supabase.from("workspace_team_tasks").select("*",{count:"exact"})
        .eq("space_id",id).order("updated_at",{ascending:false}).limit(500),
      supabase.from("workspace_team_events").select("*")
        .eq("space_id",id).order("created_at",{ascending:false}).limit(30),
      isOwner ? supabase.from("workspace_team_invites")
        .select("id,space_id,created_by,role,expires_at,created_at,revoked_at,consumed_by,consumed_at")
        .eq("space_id",id).order("created_at",{ascending:false}).limit(30) : Promise.resolve({data:[],error:null}),
    ]);
    if(m.error||t.error||e.error||i.error)throw new Error(
      m.error?.message??t.error?.message??e.error?.message??i.error?.message??"Team query failed");
    const verifiedMembers=verifyWorkspaceTeamCompletePage(
      "members",m.data,m.count,20,"user_id");
    const verifiedTasks=verifyWorkspaceTeamCompletePage(
      "tasks",t.data,t.count,500,"id");
    if(!Array.isArray(e.data)||!Array.isArray(i.data))
      throw Error("Workspace activity or invitations could not be verified");
    // Protect against a user switch while the four queries were in flight.
    await assureOwner(expectedOwner);
    if(ownerRef.current!==expectedOwner || detailsEpoch.current!==token)return false;
    let verifiedRole:string;
    try {
      verifiedRole=verifyWorkspaceTeamDetails({
        space:target,owner:expectedOwner,spaceId:id,
        members:verifiedMembers,tasks:verifiedTasks,events:e.data,
        invites:i.data,
      });
    }catch{
      // A revoked membership is not an empty team. Quarantine old data.
      quarantineTeam();
      setSpaces(previous=>previous.filter(space=>space.id!==id));
      setSelectedId(current=>current===id?null:current);
      setNotice("Access to this team could not be verified; cached details were cleared.");
      return false;
    }
    setDraft(previous=>retainWorkspaceTeamDraft(
      previous,verifiedRole,target.status,verifiedTasks)?previous:freshDraft());
    setMembers(verifiedMembers as Member[]);
    setTasks(verifiedTasks);
    setEvents((e.data??[]) as Event[]);
    setInvites((i.data??[]) as Invite[]);
    setVerifiedSpaceId(id);
    return true;
  };
  useEffect(()=>{
    const token=++spacesEpoch.current;
    detailsEpoch.current++; // invalidate a previous owner's detail queries
    setSpaces([]);setSelectedId(null);setMembers([]);setTasks([]);
    setSpaceListVerified(false);
    setEvents([]);setInvites([]);setRevealedToken(null);
    setVerifiedSpaceId(null);
    setTaskFilter("all");setTaskQuery("");setTaskSort("updated");
    setTaskPriorityFilter("all");setTaskAssigneeFilter("all");
    setTaskLayout("list");setDiscussionTaskId(null);setLiveRevision(0);
    setCalendarDay(null);setShowWorkload(false);
    setDragOverColumn(null);
    setJoinToken("");setInviteRole("editor");setInviteView("pending");setMemberView("all");setNotice("");setError("");setDraft(freshDraft());
    actionEpoch.current++;actionBusyRef.current=false;setBusy(false);
    setLoading(true);
    void (async()=>{
      try {
        await assureOwner(owner);
        await loadSpaces(owner,token);
      }catch(failure){
        if(spacesEpoch.current===token && ownerRef.current===owner)setError(errorMessage(failure));
      }finally{
        if(spacesEpoch.current===token && ownerRef.current===owner)setLoading(false);
      }
    })();
    return ()=>{spacesEpoch.current++;detailsEpoch.current++;};
  },[owner]);
  useEffect(()=>{
    const token=++detailsEpoch.current;
    setMembers([]);setTasks([]);setEvents([]);setInvites([]);
    setVerifiedSpaceId(null);
    setRevealedToken(null);setDraft(freshDraft());
    setInviteRole("editor");setInviteView("pending");setMemberView("all");
    setTaskFilter("all");setTaskQuery("");setTaskSort("updated");
    setTaskPriorityFilter("all");setTaskAssigneeFilter("all");
    setTaskLayout("list");setDiscussionTaskId(null);setLiveRevision(0);
    setCalendarDay(null);setShowWorkload(false);
    setDragOverColumn(null);
    if(!selectedId)return;
    setLoading(true);
    void (async()=>{
      try {
        await assureOwner(owner);
        await loadDetails(selectedId,owner,token);
      }catch(failure){
        if(detailsEpoch.current===token && ownerRef.current===owner){
          quarantineTeam();
          setError(errorMessage(failure));
        }
      }finally{
        if(detailsEpoch.current===token && ownerRef.current===owner)setLoading(false);
      }
    })();
    return ()=>{detailsEpoch.current++;};
  },[owner,selectedId]);

  const refresh=async(target?:string|null)=>{
    // Independent request generations: list refresh must NOT be cancelled
    // just because the selected-team detail effect initialized.
    const spaceToken=++spacesEpoch.current;
    const detailToken=++detailsEpoch.current;
    maskTeam(); // cached membership can never authorize a pending request
    try {
      await assureOwner(owner);
      // Only an explicit create/join target is required; a revoked previous
      // selection must be allowed to fall back to another authorized team.
      const snapshot=await loadSpaces(owner,spaceToken,target);
      if(!snapshot)throw Error("Team verification was superseded by another refresh");
      const {chosen,rows}=snapshot;
      if(chosen && chosen===selectedId) {
        // Read status and owner from these freshly fetched rows: stale closure
        // data must never preserve a draft after the team was archived.
        const verified=await loadDetails(chosen,owner,detailToken,rows);
        if(!verified)throw Error("Workspace team verification did not finish.");
      }
    }catch(failure){
      if(spacesEpoch.current===spaceToken && ownerRef.current===owner)
        quarantineTeam(); // Network failure is not revocation, but stale UI must be hidden.
      throw failure;
    }
  };
  useEffect(()=>{
    let alive=true;
    let debounce:ReturnType<typeof setTimeout>|null=null;
    const resume=()=>{
      if(!alive)return;
      const action=workspaceResumeAction(document.visibilityState,
        resumeInFlight.current,disabled);
      if(action==="ignore")return;
      if(action==="mask"){
        // Invalidate outstanding requests; do not discard an authorized draft.
        spacesEpoch.current++;detailsEpoch.current++;
        maskTeam();resumePending.current=true;
        return;
      }
      if(action==="queue"){
        // Never lose the latest focus event behind an older network request.
        resumePending.current=true;
        return;
      }
      if(debounce)clearTimeout(debounce);
      debounce=setTimeout(()=>{
        if(!alive)return;
        if(resumeInFlight.current){resumePending.current=true;return;}
        resumeInFlight.current=true;resumePending.current=false;
        maskTeam();
        const pending=refresh();
        const attempt=spacesEpoch.current;
        void pending.catch(failure=>{
          if(!alive||ownerRef.current!==owner||spacesEpoch.current!==attempt)return;
          quarantineTeam();setError(errorMessage(failure));
        }).finally(()=>{
          resumeInFlight.current=false;
          if(alive&&resumePending.current&&document.visibilityState==="visible"){
            resumePending.current=false;
            resume(); // queued tab return must trigger a new membership check
          }
        });
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

  useEffect(()=>{
    // Supabase warns against async calls inside Auth's synchronous callback.
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!shouldQuarantineWorkspaceAuth(event,session,owner))return;
      spacesEpoch.current++;detailsEpoch.current++;
      actionEpoch.current++;actionBusyRef.current=false;setBusy(false);
      resumePending.current=false;
      quarantineTeam();setSpaces([]);setSelectedId(null);
      setJoinToken("");setTeamName("");setTeamDescription("");
      setError("Workspace account changed. Sign in and reload your teams.");
    });
    return ()=>subscription.unsubscribe();
  },[owner]);

  const run=async(
    action:()=>Promise<unknown>,success:string,refreshAfter=true,
    onConfirmed?:(result:unknown)=>void,
  )=>{
    // React state alone does not serialize clicks or protect older owner RPCs.
    if(disabled||actionBusyRef.current)return;
    actionBusyRef.current=true;
    const epoch=++actionEpoch.current;
    const initialOwner=owner;
    const current=()=>isWorkspaceActionCurrent(
      initialOwner,ownerRef.current,epoch,actionEpoch.current);
    setBusy(true);setError("");setNotice("");
    try {
      await assureOwner(initialOwner);
      if(!current())return;
      const result=await action();
      await assureOwner(initialOwner);
      if(!current())return;
      if(refreshAfter)await refresh();
      if(!current())return;
      // Publish one-time secrets and clear form drafts only for the account
      // that initiated the action after the server confirmed it.
      onConfirmed?.(result);
      setNotice(success);
    }catch(failure){
      if(current())setError(errorMessage(failure));
    }finally{
      if(current()){actionBusyRef.current=false;setBusy(false);}
    }
  };
  const openWorkloadTasks=(assignee:string,metric:string)=>{
    if(!selected||!currentRole||disabled||busy||loading||!spaceListVerified||
       verifiedSpaceId!==selected.id)return;
    try {
      const view=workspaceTeamWorkloadView(workload,assignee,metric);
      setTaskQuery(view.search);setTaskPriorityFilter(view.priority);setTaskSort(view.sort);
      setTaskAssigneeFilter(view.assignee);setTaskFilter(view.filter);
      setTaskLayout("list");
    }catch(failure){setError(errorMessage(failure));}
  };
  const clearTaskFilters=()=>{
    setTaskFilter("all");setTaskQuery("");setTaskSort("updated");
    setTaskPriorityFilter("all");setTaskAssigneeFilter("all");
  };
  const exportTaskView=()=>{
    if(!selected||!currentRole||verifiedSpaceId!==selected.id||
      disabled||busy||loading||!spaceListVerified||!visibleTasks.length)return;
    try {
      // Export only the currently authorized team's visible, filtered rows.
      const csv=buildWorkspaceTeamTasksCsv(visibleTasks,owner,selected.id);
      const objectUrl=URL.createObjectURL(new Blob([csv],{
        type:"text/csv;charset=utf-8",
      }));
      const link=document.createElement("a");
      link.href=objectUrl;
      link.download="eternyx-team-tasks-"+today+".csv";
      try {
        document.body.appendChild(link);
        link.click();
      }finally{
        link.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
      }
      setNotice("Exported "+visibleTasks.length+" visible team tasks to CSV.");
      setError("");
    }catch(failure){
      setError(errorMessage(failure));
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
      await refresh(data);
    },"Team space created. Only explicitly invited members can access its tasks.",false,
    ()=>{setTeamName("");setTeamDescription("");});
  };
  const acceptInvite=(event:FormEvent)=>{
    event.preventDefault();
    void run(async()=>{
      const code=validateTeamInviteToken(joinToken);
      const {data,error:queryError}=await supabase.rpc("workspace_team_accept_invite",{
        p_token:code,
      });
      if(queryError||!data)throw new Error(queryError?.message??"Invitation was not accepted");
      await refresh(data);
    },"Team invitation accepted. Your new membership is private to this account.",false,
    ()=>setJoinToken(""));
  };
  const invite=()=>{
    if(!selected||!canInvite||!canManage||!["editor","viewer"].includes(inviteRole))return;
    setRevealedToken(null);
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_invite",{
        p_space_id:selected.id,p_role:inviteRole,
      });
      if(queryError||!data)throw new Error(queryError?.message??"Invitation could not be created");
      return workspaceTeamInviteReceipt(data,inviteRole,Date.now());
    },"One-time invitation created. Share the code securely; it will not be shown again after leaving this team.",false,
    result=>{
      const receipt=result as {id:string;token:string;role:string;expires:string};
      if(Date.parse(receipt.expires)>Date.now())setRevealedToken(receipt);
    });
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
    },"Assigned task saved to your private team space.",true,
    ()=>setDraft(freshDraft()));
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
    },"Shared task deleted. Team activity retained.",true,
    ()=>{if(discussionTaskId===task.id)setDiscussionTaskId(null);});
  };
  const changeRole=(member:Member,role:string|null)=>{
    if(!selected||!canManage||member.space_id!==selected.id||member.role==="owner"||
      !members.some(row=>row.user_id===member.user_id&&row.role===member.role)||
      (role!==null&&(!["editor","viewer"].includes(role)||role===member.role)))return;
    const impact=workspaceTeamMemberImpact(tasks,selected.id,member.user_id);
    if(!window.confirm(role===null?"Remove this member? "+impact.total+
        " assigned tasks ("+impact.open+" outstanding, "+impact.completed+" completed) will become unassigned. Tasks remain in the team.":
        "Change this member's role to "+role+"? Existing assignments remain."))return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_member_change",{
        p_space_id:selected.id,p_user_id:member.user_id,p_role:role,
      });
      if(queryError||data!==true)throw new Error(queryError?.message??"Membership update failed");
    },role===null?"Member removed. Their tasks remain but are unassigned.":"Member role changed.");
  };
  const setArchive=()=>{
    if(!selected||!canManage)return;
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
    if(!selected||!["editor","viewer"].includes(currentRole??"")||disabled||busy||loading||
      !spaceListVerified||verifiedSpaceId!==selected.id)return;
    const impact=workspaceTeamMemberImpact(tasks,selected.id,owner);
    if(!window.confirm("Leave this team? Your "+impact.total+
      " assigned tasks will become unassigned. Shared tasks remain in the team."))return;
    void run(async()=>{
      const {data,error:queryError}=await supabase.rpc("workspace_team_leave",{
        p_space_id:selected.id,
      });
      if(queryError||data!==true)throw new Error(queryError?.message??"Leave was not confirmed");
    },"You left this team. Previously shared tasks were not deleted.");
  };

  const quickMoveTask=(task:Task)=>{
    if(!selected||!editor||disabled||busy||!spaceListVerified||
       verifiedSpaceId!==selected.id)return;
    const next=workspaceTeamNextTaskStatus(task);
    void run(async()=>{
      const params=workspaceTeamTaskStatusPayload(task,next,selected.id,memberIds);
      const {data,error:queryError}=await supabase.rpc("workspace_team_save_task",params);
      if(queryError||!data)throw new Error(
        queryError?.message??"Task status change was not confirmed");
    },"Task moved to "+(next==="done"?"done":next==="todo"?"to do":"in progress")+".",true,
    ()=>{if(draft.id===task.id)setDraft(freshDraft());});
  };
  const moveTaskToStatus=(task:Task,toStatus:string)=>{
    if(!selected||!editor||disabled||busy||loading||!spaceListVerified||
       verifiedSpaceId!==selected.id||task.status===toStatus)return;
    // Use only the current RLS-loaded team row, not an external drag payload.
    void run(async()=>{
      const params=workspaceTeamTaskMovePayload(task,toStatus,selected.id,memberIds);
      const {data,error:queryError}=await supabase.rpc("workspace_team_save_task",params);
      if(queryError||!data)throw new Error(
        queryError?.message??"Task move was not confirmed by the team backend");
    },"Task moved to "+(toStatus==="todo"?"To do":toStatus==="done"?
      "Done":"In progress")+".",true,
    ()=>{if(draft.id===task.id)setDraft(freshDraft());});
  };
  const quickUpdateTask=(task:Task,change:{priority:string}|{assignee_id:string|null})=>{
    if(!selected||!editor||disabled||busy||loading||!spaceListVerified||
       verifiedSpaceId!==selected.id)return;
    void run(async()=>{
      const params=workspaceTeamTaskQuickPatch(task,change,selected.id,memberIds);
      const {data,error:queryError}=await supabase.rpc("workspace_team_save_task",params);
      if(queryError||!data)throw new Error(
        queryError?.message??"Quick task update was not confirmed by the team backend");
    },"Task assignment or priority updated.",true,
    ()=>{if(draft.id===task.id)setDraft(freshDraft());});
  };
  const changeTaskDueDate=(task:Task,due:string)=>{
    if(!selected||!editor||disabled||busy||loading||!spaceListVerified||
       verifiedSpaceId!==selected.id||(task.due_on??"")===due)return;
    void run(async()=>{
      const params=workspaceTeamTaskDueDatePatch(task,due,selected.id,memberIds);
      const {data,error:queryError}=await supabase.rpc("workspace_team_save_task",params);
      if(queryError||!data)throw new Error(
        queryError?.message??"Team task due date was not confirmed");
    },"Team task due date updated.",true,
    ()=>{if(draft.id===task.id)setDraft(freshDraft());});
  };
  const exportCalendarView=()=>{
    if(!selected||!currentRole||verifiedSpaceId!==selected.id||
       disabled||busy||loading||!spaceListVerified||!scheduledCount)return;
    try {
      const calendar=buildWorkspaceTeamScheduleIcs(visibleTasks,owner,selected.id);
      const url=URL.createObjectURL(new Blob([calendar],{
        type:"text/calendar;charset=utf-8",
      }));
      const link=document.createElement("a");
      link.href=url;
      link.download="eternyx-team-schedule-"+today+".ics";
      try {
        document.body.appendChild(link);
        link.click();
      }finally{
        link.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      setError("");
      setNotice("Exported "+scheduledCount+" outstanding scheduled tasks to calendar.");
    }catch(failure){setError(errorMessage(failure));}
  };
  const startBoardDrag=(event:DragEvent<HTMLElement>,task:Task)=>{
    if(!selected||!editor||disabled||busy||loading||!spaceListVerified||
       verifiedSpaceId!==selected.id){event.preventDefault();return;}
    try {
      const receipt=workspaceTeamBoardDragReceipt(task,selected.id);
      event.dataTransfer.setData(WORKSPACE_TEAM_BOARD_DRAG_MIME,receipt);
      event.dataTransfer.effectAllowed="move";
    }catch(failure){
      event.preventDefault();
      setError(errorMessage(failure));
    }
  };
  const dropBoardTask=(event:DragEvent<HTMLElement>,toStatus:string)=>{
    event.preventDefault();setDragOverColumn(null);
    if(!selected||!editor||disabled||busy||loading||!spaceListVerified||
       verifiedSpaceId!==selected.id)return;
    try {
      const receipt=event.dataTransfer.getData(WORKSPACE_TEAM_BOARD_DRAG_MIME);
      const task=workspaceTeamBoardResolveDrag(receipt,selected.id,visibleTasks);
      if(task.status!==toStatus)moveTaskToStatus(task,toStatus);
    }catch(failure){setError(errorMessage(failure));}
  };
  const renderTeamTask=(task:Task,board=false)=><div key={task.id}
    className={board?"space-y-2 rounded-lg border border-border bg-background/60 p-3 text-xs":
      "flex flex-wrap items-center gap-3 py-3 text-xs"}>
    <div className="min-w-0 flex-1">
      {board&&taskLayout==="board"&&editor&&
        <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Move between columns</span>
        <span draggable={!busy&&!disabled&&!loading}
          onDragStart={event=>startBoardDrag(event,task)}
          onDragEnd={()=>setDragOverColumn(null)}
          className="cursor-grab rounded-md border border-border bg-muted px-2 py-1 text-xs active:cursor-grabbing"
          title="Drag to another column. On touch or keyboard, use the Move to status menu.">
          Drag card
        </span>
      </div>}
      <p className="font-medium break-words">{task.title}</p>
      <p className="text-muted-foreground break-words">{task.details.slice(0,300)}</p>
      <p className="text-muted-foreground">
        {task.status} · {task.priority} ·
        {" "+(task.assignee_id?teamMemberLabel(task.assignee_id,owner):"Unassigned")} ·
        {task.due_on?" due "+task.due_on:" no due date"}
      </p>
      {workspaceTeamTaskDueBucket(task,today)==="overdue"&&
        <p className="text-xs text-amber-400">Overdue</p>}
    </div>
    <div className="flex flex-wrap gap-1">
      <Button size="sm" type="button"
        variant={discussionTaskId===task.id?"default":"outline"}
        disabled={disabled||busy||loading}
        aria-label={(discussionTaskId===task.id?"Close":"Open")+" discussion for "+task.title}
        onClick={()=>setDiscussionTaskId(value=>value===task.id?null:task.id)}>
        {discussionTaskId===task.id?"Close discussion":"Discussion & checklist"}
      </Button>
      {editor&&<>
        <Button size="sm" type="button" variant="outline"
          disabled={busy||disabled||loading}
          aria-label={"Edit "+task.title} onClick={()=>editTask(task)}>Edit</Button>
        <Button size="sm" type="button" variant="outline"
          disabled={busy||disabled||loading}
          aria-label={workspaceTeamNextTaskLabel(task)+" — "+task.title}
          onClick={()=>quickMoveTask(task)}>
          {workspaceTeamNextTaskLabel(task)}
        </Button>
        <label className="flex items-center gap-1 text-xs">
          Move to
          <select aria-label={"Move "+task.title+" to status"}
            value={task.status} disabled={busy||disabled||loading}
            onChange={event=>moveTaskToStatus(task,event.target.value)}
            className="min-h-9 rounded-md border border-border bg-background px-2 text-xs">
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs">
          Priority
          <select aria-label={"Change priority for "+task.title}
            value={task.priority} disabled={busy||disabled||loading}
            onChange={event=>quickUpdateTask(task,{priority:event.target.value})}
            className="min-h-9 rounded-md border border-border bg-background px-2 text-xs">
            {WORKSPACE_TEAM_PRIORITIES.map(priority=>
              <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </label>
        {(task.assignee_id===null||task.assignee_id===owner)&&
          <Button size="sm" type="button" variant="outline"
            disabled={busy||disabled||loading}
            aria-label={(task.assignee_id===null?"Claim ":"Release ")+task.title}
            onClick={()=>quickUpdateTask(task,{
              assignee_id:task.assignee_id===owner?null:owner,
            })}>
            {task.assignee_id===null?"Claim":"Release"}
          </Button>}
        <label className="flex items-center gap-1 text-xs">
          Due
          <Input type="date" aria-label={"Change due date for "+task.title}
            value={task.due_on??""} disabled={busy||disabled||loading}
            onChange={event=>changeTaskDueDate(task,event.target.value)}
            className="min-h-9 w-[9.5rem] text-xs"/>
        </label>
        <Button size="sm" type="button" variant="ghost"
          disabled={busy||disabled||loading}
          aria-label={"Delete "+task.title} onClick={()=>removeTask(task)}>Delete</Button>
      </>}
    </div>
  </div>;

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
      {!spaceListVerified&&<p role="status" className="text-xs text-muted-foreground">
        Rechecking team membership before showing shared details…
      </p>}
      {spaceListVerified&&spaces.map(space=><Button type="button" key={space.id} size="sm"
        variant={space.id===selectedId?"default":"outline"} disabled={busy||disabled}
        onClick={()=>{quarantineTeam();setSelectedId(space.id);}}>
        <FolderKanban className="mr-1 h-3.5 w-3.5"/>
        {space.name}{space.status==="archived"?" (archived)":""}
      </Button>)}
      {spaceListVerified&&!spaces.length&&!loading&&<p className="text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">Owners manage access; editors can modify active-team tasks; viewers read. Archived tasks are read-only, but owners can still manage membership.</p>
          <p className="text-xs">{["owner","editor","viewer"].map(role=>role+": "+members.filter(member=>member.role===role).length).join(" · ")}</p>
          <label className="text-xs">Member role <select value={memberView} onChange={event=>setMemberView(event.target.value)}
            className="rounded border border-border bg-background p-1">
            <option value="all">All</option><option value="owner">Owners</option>
            <option value="editor">Editors</option><option value="viewer">Viewers</option>
          </select></label>
          {!visibleMembers.length&&<p className="text-xs text-muted-foreground">No members match this role.</p>}
          {visibleMembers.map(member=><div key={member.user_id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 text-xs">
            <div className="min-w-0">
              <span className="break-words">{teamMemberLabel(member.user_id,owner)} · {member.role}</span>
              <p className="text-muted-foreground">{tasks.filter(task=>task.assignee_id===member.user_id&&task.status!=="done").length} outstanding assigned · {tasks.filter(task=>task.assignee_id===member.user_id&&task.status==="done").length} completed assigned</p>
            </div>
            {currentRole==="owner"&&member.role!=="owner"&&<div className="flex gap-1">
              <Button type="button" size="sm" variant="outline"
                disabled={!canManage||member.role==="editor"}
                onClick={()=>changeRole(member,"editor")}>Editor</Button>
              <Button type="button" size="sm" variant="outline"
                disabled={!canManage||member.role==="viewer"}
                onClick={()=>changeRole(member,"viewer")}>Viewer</Button>
              <Button type="button" size="sm" variant="ghost"
                disabled={!canManage} onClick={()=>changeRole(member,null)}>Remove</Button>
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
              disabled={!canManage} onClick={invite}>Create one-time code</Button>
          </div>}
          {revealedToken && canInvite&&Date.parse(revealedToken.expires)>inviteClock&&<div className="space-y-2 rounded-md border border-amber-600/50 p-2">
            <p className="text-xs text-amber-400">
              Share securely. This code is displayed once; anyone holding it can use it
              while valid, so do not post it publicly.
            </p>
            <code className="block break-all text-xs select-all">{revealedToken.token}</code>
            <p className="text-xs text-muted-foreground">
              {revealedToken.role} · expires {new Date(revealedToken.expires).toLocaleString()}
            </p>
            <Button size="sm" type="button" variant="outline"
              disabled={!canManage}
              onClick={()=>{
                if(!canManage||Date.parse(revealedToken.expires)<=Date.now()){setRevealedToken(null);return;}
                void navigator.clipboard.writeText(revealedToken.token).catch(
                  ()=>setError("Clipboard copy failed. Select the visible code manually."));
              }}>
              <ClipboardCopy className="mr-1 h-4 w-4"/> Copy invitation code
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={()=>setRevealedToken(null)}>Hide code permanently</Button>
          </div>}
          {currentRole==="owner"&&<>
            <p className="text-xs text-muted-foreground">Latest {invitationRows.length} loaded invitation records (up to 30); refresh after creating a code. These are not complete historical totals.</p>
            <label className="text-xs">Invitation status <select value={inviteView} onChange={event=>setInviteView(event.target.value)}
              className="rounded border border-border bg-background p-1">
              <option value="pending">Pending</option><option value="accepted">Accepted</option>
              <option value="expired">Expired</option><option value="revoked">Revoked</option><option value="all">All loaded</option>
            </select></label>
            {!visibleInvitations.length&&<p className="text-xs text-muted-foreground">No loaded invitations match this status.</p>}
          </>}
          {currentRole==="owner"&&visibleInvitations
            .map(({invite:i,state})=><div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 py-2 text-xs">
            <span>{i.role} · {state} · expires {new Date(i.expires_at).toLocaleString()}</span>
            {(state==="pending"||state==="expired")&&<Button size="sm" variant="ghost" type="button" disabled={!canManage}
              onClick={()=>{
                if(!canManage||i.space_id!==selected.id||!window.confirm("Revoke this invitation code?"))return;
                void run(async()=>{
                  const {data,error:queryError}=await supabase.rpc("workspace_team_revoke_invite",{
                    p_invite_id:i.id,
                  });
                  if(queryError||data!==true)throw new Error(queryError?.message??"Revoke not confirmed");
                },"Invitation revoked.",true,()=>setRevealedToken(null));
              }}>Revoke</Button>}
          </div>)}
          {!canInvite&&<p className="text-xs text-muted-foreground">
            Only the team owner can create invitations while active.
          </p>}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Shared team tasks ({taskSummary.total}/500)</h4>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" variant="outline"
              disabled={disabled||busy||loading||!currentRole||!visibleTasks.length}
              onClick={exportTaskView}>
              <Download className="mr-1 h-3.5 w-3.5"/> Export visible CSV
            </Button>
            <Button size="sm" type="button" variant="outline"
              disabled={disabled||busy||loading||!currentRole||!scheduledCount}
              onClick={exportCalendarView}>
              <CalendarDays className="mr-1 h-3.5 w-3.5"/> Export visible calendar
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"
          aria-label="Live team task summary">
          <p className="rounded-md border border-border p-2">Outstanding <strong>{taskSummary.outstanding}</strong></p>
          <p className="rounded-md border border-border p-2">Overdue <strong>{taskSummary.overdue}</strong></p>
          <p className="rounded-md border border-border p-2">Next 7 days <strong>{taskSummary.upcoming}</strong></p>
          <p className="rounded-md border border-border p-2">Completed <strong>{taskSummary.done}</strong></p>
        </div>
        <section className="space-y-2 rounded-lg border border-border p-3"
          aria-label="Team workload overview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-sm font-semibold">Team workload</h5>
            <Button type="button" size="sm" variant="outline"
              aria-expanded={showWorkload} onClick={()=>setShowWorkload(value=>!value)}>
              {showWorkload?"Hide workload":"Show workload"}
            </Button>
          </div>
          {showWorkload&&<>
            <p className="text-xs text-muted-foreground">
              All {tasks.length} authorized team tasks, before task filters.
              Counts measure task volume, not hours, capacity or member performance.
              Select a count to replace task filters with that assignment and status.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-border">
                  {["Assignment","Outstanding","In progress","Overdue","Due within 7 days","Urgent open","Completed"].map(label=>
                    <th key={label} scope="col" className="p-2 font-medium">{label}</th>)}
                </tr></thead>
                <tbody>{workload.map(row=><tr key={row.key} className="border-b border-border/50">
                  <th scope="row" className="p-2 font-medium whitespace-nowrap">{row.label}</th>
                  {([
                    ["outstanding","outstanding"],["inProgress","in progress"],
                    ["overdue","overdue"],["upcoming","due within 7 days"],
                    ["urgent","urgent open"],["done","completed"],
                  ] as const).map(([metric,label])=><td key={metric} className="p-2">
                    {row.filter!==null&&row[metric]>0?
                      <Button type="button" size="sm" variant="outline"
                        disabled={disabled||busy||loading}
                        aria-label={"Show "+label+" tasks for "+row.label}
                        onClick={()=>openWorkloadTasks(row.filter,metric)}>{row[metric]}</Button>:row[metric]}
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>
            {workload.some(row=>row.key==="unknown")&&<p className="text-xs text-muted-foreground">
              Assignments outside the current roster are counted together without revealing member identities.
            </p>}
          </>}
        </section>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs">Search team tasks
            <Input type="search" value={taskQuery} maxLength={120}
              placeholder="Search title or details" aria-label="Search shared team tasks"
              onChange={event=>setTaskQuery(event.target.value)}/>
          </label>
          <label className="space-y-1 text-xs">Sort tasks
            <select value={taskSort} aria-label="Sort shared team tasks"
              onChange={event=>setTaskSort(event.target.value)}
              className="min-h-10 w-full rounded-md border border-border bg-background px-2">
              <option value="updated">Recently updated</option>
              <option value="due">Earliest due first</option>
              <option value="priority">Highest priority first</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs">Filter by priority
            <select aria-label="Filter team tasks by priority"
              value={taskPriorityFilter}
              onChange={event=>setTaskPriorityFilter(event.target.value)}
              className="min-h-10 w-full rounded-md border border-border bg-background px-2">
              <option value="all">All priorities</option>
              {WORKSPACE_TEAM_PRIORITIES.map(priority=>
                <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Filter by assignee
            <select aria-label="Filter team tasks by assignee"
              value={effectiveAssigneeFilter}
              onChange={event=>setTaskAssigneeFilter(event.target.value)}
              className="min-h-10 w-full rounded-md border border-border bg-background px-2">
              <option value="all">All assignees</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {members.filter(member=>member.user_id!==owner).map(member=>
                <option key={member.user_id} value={member.user_id}>
                  {teamMemberLabel(member.user_id,owner)}
                </option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Team task filters">
          {([
            ["all","All"],
            ["mine","Assigned to me"],
            ["unassigned","Unassigned"],
            ["outstanding","Outstanding"],
            ["overdue","Overdue"],
            ["today","Due today"],
            ["upcoming","Next 7 days"],
            ["unscheduled","No due date"],
            ["in_progress","In progress"],
            ["done","Completed"],
          ] as const).map(([value,label])=><Button key={value} size="sm" type="button"
            variant={taskFilter===value?"default":"outline"}
            aria-pressed={taskFilter===value}
            onClick={()=>setTaskFilter(value)}>
            {label}{value==="mine"?" ("+tasks.filter(t=>t.assignee_id===owner).length+")":""}
          </Button>)}
        </div>
        {(taskFilter!=="all"||taskQuery!==""||taskSort!=="updated"||
          taskPriorityFilter!=="all"||effectiveAssigneeFilter!=="all")&&
          <Button size="sm" type="button" variant="outline" onClick={clearTaskFilters}>
            Reset task filters and sort
          </Button>}
        <p className="text-xs text-muted-foreground" role="status">
          Showing {visibleTasks.length} of {tasks.length} authorized team tasks.
          Exports include only these visible, filtered records.
        </p>
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
        <div className="flex flex-wrap items-center gap-2" role="group"
          aria-label="Team task layout">
          <Button size="sm" type="button"
            variant={taskLayout==="list"?"default":"outline"}
            aria-pressed={taskLayout==="list"}
            onClick={()=>setTaskLayout("list")}>
            <List className="mr-1 h-3.5 w-3.5"/> List
          </Button>
          <Button size="sm" type="button"
            variant={taskLayout==="board"?"default":"outline"}
            aria-pressed={taskLayout==="board"}
            onClick={()=>setTaskLayout("board")}>
            <Columns3 className="mr-1 h-3.5 w-3.5"/> Board
          </Button>
          <Button size="sm" type="button"
            variant={taskLayout==="schedule"?"default":"outline"}
            aria-pressed={taskLayout==="schedule"}
            onClick={()=>setTaskLayout("schedule")}>
            <CalendarDays className="mr-1 h-3.5 w-3.5"/> Schedule
          </Button>
          <span className="text-xs text-muted-foreground">
            {taskLayout==="board"?"Filtered tasks grouped by real status":
              taskLayout==="schedule"?"Filtered tasks grouped by due date":"Filtered task list"}
          </span>
        </div>
        {taskLayout==="schedule"?
          <div className="space-y-3" aria-label="Shared team task schedule">
            <p className="text-xs text-muted-foreground">
              A read-only calendar grouping of currently visible tasks. Dates
              are local calendar days; completed tasks are separated.
            </p>
            <section className="space-y-3 rounded-lg border border-border p-3"
               aria-label="Monthly team task planner">
               <div className="flex flex-wrap items-center justify-between gap-2">
                 <h5 className="text-sm font-semibold" aria-live="polite">
                   {new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric",timeZone:"UTC"})
                     .format(new Date(plannerMonth+"-01T00:00:00.000Z"))}
                 </h5>
                 <div className="flex flex-wrap gap-1">
                   <Button type="button" size="sm" variant="outline"
                     aria-label="Previous month" disabled={!previousMonth}
                     onClick={()=>previousMonth&&setCalendarDay(previousMonth+"-01")}>Previous</Button>
                   <Button type="button" size="sm" variant="outline"
                     onClick={()=>setCalendarDay(null)}>Today</Button>
                   <Button type="button" size="sm" variant="outline"
                     aria-label="Next month" disabled={!nextMonth}
                     onClick={()=>nextMonth&&setCalendarDay(nextMonth+"-01")}>Next</Button>
                 </div>
               </div>
               <p className="text-xs text-muted-foreground">
                 Counts reflect visible filtered tasks. Select a date to review its work.
                 Undated tasks remain in the groups below.
               </p>
               <div className="grid grid-cols-7 gap-1 text-center" aria-label="Calendar dates">
                 {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=>
                   <span key={day} className="text-[10px] text-muted-foreground">{day}</span>)}
                 {monthCells.map((cell,index)=>cell?
                   <button key={cell.date} type="button"
                     aria-label={cell.date+": "+cell.outstanding+" outstanding, "+cell.done+" completed"}
                     aria-pressed={plannerDay===cell.date}
                     aria-current={cell.date===today?"date":undefined}
                     onClick={()=>setCalendarDay(cell.date)}
                     className={"min-w-0 min-h-12 rounded-md border p-1 text-xs focus-visible:outline focus-visible:outline-2 "+
                       (plannerDay===cell.date?"border-primary bg-primary/10":"border-border hover:bg-muted")}>
                     <span className="block font-medium">{cell.day}</span>
                     {cell.tasks.length>0&&<span className="block text-[10px]">{cell.tasks.length} task{cell.tasks.length===1?"":"s"}</span>}
                   </button>:<span key={"blank-"+index} aria-hidden="true"/>)}
               </div>
               <div className="space-y-2" aria-label="Selected day tasks">
                 <h6 className="text-xs font-semibold" aria-live="polite">
                   {plannerDay} · {selectedDayCell?.tasks.length??0} matching tasks
                 </h6>
                 {selectedDayCell&&selectedDayCell.tasks.length>0?
                   <div className="max-h-[24rem] space-y-2 overflow-y-auto">
                     {selectedDayCell.tasks.map(task=><div key={task.id} className="rounded-md border border-border p-2 text-xs"><p className="break-words font-medium">{task.title}</p><p className="text-muted-foreground">{task.status} · {task.priority}</p></div>)}
                   </div>:<p className="text-xs text-muted-foreground">No matching tasks due on this date.</p>}
               </div>
             </section>
             <div className="grid gap-3 md:grid-cols-2">
              {scheduleGroups.map(group=><section key={group.key}
                className="min-w-0 rounded-lg border border-border p-3"
                aria-label={group.label+" schedule group"}>
                <h5 className="mb-2 text-sm font-semibold">
                  {group.label} ({group.tasks.length})
                </h5>
                <div className="max-h-[24rem] space-y-2 overflow-y-auto">
                  {group.tasks.map(task=>renderTeamTask(task,true))}
                  {!group.tasks.length&&<p className="py-2 text-xs text-muted-foreground">
                    No matching tasks in this group.
                  </p>}
                </div>
              </section>)}
            </div>
          </div>
        :taskLayout==="list"?
          <div className="max-h-[24rem] divide-y divide-border overflow-y-auto"
            aria-label="Shared team task list">
            {visibleTasks.map(task=>renderTeamTask(task))}
          </div>
        :
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {editor?"Drag a card handle to another column, or use Move to for touch and keyboard navigation.":
                "This team board is read-only for your current role."}
              Changes are saved by the team backend before the board updates.
            </p>
            <div className="grid gap-3 lg:grid-cols-3" aria-label="Shared team task board">
            {boardColumns.map(column=><section key={column.status}
              aria-label={column.label+" tasks"}
              onDragOver={event=>{
                if(!editor||disabled||busy||loading||
                   !event.dataTransfer.types.includes(WORKSPACE_TEAM_BOARD_DRAG_MIME))return;
                event.preventDefault();event.dataTransfer.dropEffect="move";
                setDragOverColumn(previous=>previous===column.status?previous:column.status);
              }}
              onDragLeave={event=>{
                if(event.currentTarget.contains(event.relatedTarget as Node))return;
                setDragOverColumn(previous=>previous===column.status?null:previous);
              }}
              onDrop={event=>dropBoardTask(event,column.status)}
              className={"min-w-0 rounded-lg border p-3 "+
                (dragOverColumn===column.status&&editor?
                  "border-cyan-500 bg-cyan-500/10":"border-border")}>
              <h5 className="mb-3 text-sm font-semibold">
                {column.label} ({column.tasks.length})
              </h5>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {column.tasks.map(task=>renderTeamTask(task,true))}
                {!column.tasks.length&&
                  <p className="py-3 text-xs text-muted-foreground">No matching tasks in this column.</p>}
              </div>
            </section>)}
            </div>
          </div>
        }
        {!visibleTasks.length&&<p className="py-3 text-xs text-muted-foreground">
          {tasks.length?"No tasks match this filter.":"No shared tasks yet."}
        </p>}
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
