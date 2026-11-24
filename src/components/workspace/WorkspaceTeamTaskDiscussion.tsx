import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckSquare2, MessageSquareText, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  validateTeamCommentBody, validateTeamStepTitle,
  workspaceTeamStepProgress, workspaceTeamCommentCanRedact,
  verifyWorkspaceDiscussionSnapshot,isWorkspaceDiscussionCurrent,
  selectWorkspaceDiscussionComments,selectWorkspaceDiscussionSteps,
} from "@/lib/workspaceTeamDiscussion.mjs";
import { teamMemberLabel } from "@/lib/workspaceTeamUtils.mjs";

type Comment=Database["public"]["Tables"]["workspace_team_task_comments"]["Row"];
type Step=Database["public"]["Tables"]["workspace_team_task_steps"]["Row"];

export default function WorkspaceTeamTaskDiscussion({
  owner, spaceId, taskId, role, active, disabled, onChanged, refreshKey,
}: {
  owner:string;spaceId:string;taskId:string;role:string;
  active:boolean;disabled:boolean;onChanged:()=>void;refreshKey:number;
}) {
  const [comments,setComments]=useState<Comment[]>([]);
  const [steps,setSteps]=useState<Step[]>([]);
  const [commentBody,setCommentBody]=useState("");
  const [stepTitle,setStepTitle]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const token=useRef(0);
  const request=useRef(0);
  const actionLock=useRef(false);
  const [verified,setVerified]=useState(false);
  const [commentQuery,setCommentQuery]=useState("");
  const [commentFilter,setCommentFilter]=useState("all");
  const [commentSort,setCommentSort]=useState("newest");
  const [stepFilter,setStepFilter]=useState("all");
  const previousRefresh=useRef(refreshKey);
  const identity=useRef({owner,spaceId,taskId});
  identity.current={owner,spaceId,taskId};
  const editor=(role==="owner"||role==="editor")&&active;
  const progress=workspaceTeamStepProgress(verified?steps:[]);
  const visibleSteps=verified?selectWorkspaceDiscussionSteps(steps,stepFilter):[];
  const visibleComments=verified?selectWorkspaceDiscussionComments(comments,{
    query:commentQuery,filter:commentFilter,sort:commentSort,owner,
  }):[];

  const checkIdentity=async(expected:{owner:string;spaceId:string;taskId:string})=>{
    const {data,error:authError}=await supabase.auth.getUser();
    if(authError||data.user?.id!==expected.owner ||
       identity.current.owner!==expected.owner ||
       identity.current.spaceId!==expected.spaceId ||
       identity.current.taskId!==expected.taskId) {
      throw new Error("Account or selected team task changed. Reopen the discussion.");
    }
  };
  const load=async(expected:{owner:string;spaceId:string;taskId:string},version:number)=>{
    if(version!==token.current)return;
    const read=++request.current;
    const current=()=>isWorkspaceDiscussionCurrent(version,read,token.current,request.current);
    setVerified(false);setLoading(true);setError("");
    try{
    await checkIdentity(expected);
    if(!current())return;
    const [c,s]=await Promise.all([
      supabase.from("workspace_team_task_comments")
        .select("*",{count:"exact"})
        .eq("space_id",expected.spaceId).eq("task_id",expected.taskId)
        .order("created_at",{ascending:false}).order("id",{ascending:false})
        .limit(200),
      supabase.from("workspace_team_task_steps")
        .select("*",{count:"exact"})
        .eq("space_id",expected.spaceId).eq("task_id",expected.taskId)
        .order("created_at",{ascending:true}).order("id",{ascending:true})
        .limit(30),
    ]);
    if(c.error||s.error || !Number.isSafeInteger(c.count) ||
      !Number.isSafeInteger(s.count) || (c.count??0)>200 || (s.count??0)>30 ||
      (c.data?.length??-1)!==c.count || (s.data?.length??-1)!==s.count) {
      throw new Error(c.error?.message??s.error?.message??
        "Team discussion returned an incomplete page. Refresh before editing.");
    }
    const snapshot=verifyWorkspaceDiscussionSnapshot({
      comments:c.data,steps:s.data,commentCount:c.count,stepCount:s.count,
      spaceId:expected.spaceId,taskId:expected.taskId,
    });
    await checkIdentity(expected);
    if(!current())return;
    setComments(snapshot.comments as Comment[]);
    setSteps(snapshot.steps as Step[]);
    setVerified(true);
    }catch(failure){
      if(!current())return;
      setComments([]);setSteps([]);setVerified(false);
      setError(failure instanceof Error?failure.message:"Team discussion unavailable");
    }finally{if(current())setLoading(false);}
  };
  useEffect(()=>{
    const expected={owner,spaceId,taskId};
    const version=++token.current;
    setComments([]);setSteps([]);setCommentBody("");setStepTitle("");
    setError("");setNotice("");setLoading(true);setBusy(false);setVerified(false);
    actionLock.current=false;
    setCommentQuery("");setCommentFilter("all");setCommentSort("newest");setStepFilter("all");
    const initialRequest=request.current;
    void (async()=>{
      try{
        await checkIdentity(expected);
        await load(expected,version);
      }catch(failure){
        if(version===token.current)
          setError(failure instanceof Error?failure.message:"Team discussion unavailable");
      }finally{
        if(version===token.current&&request.current===initialRequest)setLoading(false);
      }
    })();
    return ()=>{token.current++;request.current++;actionLock.current=false;};
  },[owner,spaceId,taskId]);

  useEffect(()=>{
    if(previousRefresh.current===refreshKey)return;
    previousRefresh.current=refreshKey;
    const expected={owner,spaceId,taskId};
    const version=token.current;
    void (async()=>{
      await load(expected,version);
    })();
  },[refreshKey,owner,spaceId,taskId]);

  const writeAllowed=useRef(false);
  writeAllowed.current=verified&&!disabled&&editor&&!loading;
  const run=async(action:()=>Promise<void>,message:string,onConfirmed?:()=>void)=>{
    if(!writeAllowed.current||actionLock.current||busy)return;
    const expected={owner,spaceId,taskId},version=token.current;
    actionLock.current=true;
    setBusy(true);setError("");setNotice("");
    try{
      await checkIdentity(expected);
      if(version!==token.current||!writeAllowed.current)return;
      await action();
      await checkIdentity(expected);
      if(version!==token.current)return;
      onConfirmed?.();
      await load(expected,version);
      if(version===token.current){
        setNotice(message);
        onChanged();
      }
    }catch(failure){
      if(version===token.current)
        setError(failure instanceof Error?failure.message:"Team action was rejected");
    }finally{
      if(version===token.current){actionLock.current=false;setBusy(false);}
    }
  };
  const post=(event:FormEvent)=>{
    event.preventDefault();
    void run(async()=>{
      const body=validateTeamCommentBody(commentBody);
      const {data,error:rpcError}=await supabase.rpc("workspace_team_post_comment",{
        p_space_id:spaceId,p_task_id:taskId,p_body:body,
      });
      if(rpcError||!data)throw new Error(rpcError?.message??"Comment was not saved");
    },"Comment posted and recorded in team activity.",()=>setCommentBody(""));
  };
  const add=(event:FormEvent)=>{
    event.preventDefault();
    void run(async()=>{
      const title=validateTeamStepTitle(stepTitle);
      const {data,error:rpcError}=await supabase.rpc("workspace_team_add_step",{
        p_space_id:spaceId,p_task_id:taskId,p_title:title,
      });
      if(rpcError||!data)throw new Error(rpcError?.message??"Step was not added");
    },"Team checklist step added.",()=>setStepTitle(""));
  };
  const check=(step:Step)=>{
    void run(async()=>{
      const {data,error:rpcError}=await supabase.rpc("workspace_team_check_step",{
        p_space_id:spaceId,p_step_id:step.id,p_done:!step.done,
        p_expected_updated_at:step.updated_at,
      });
      if(rpcError||data!==true)throw new Error(
        rpcError?.message??"Checklist change was not confirmed");
    },"Checklist state saved with the actual completion author.");
  };
  const removeStep=(step:Step)=>{
    if(!window.confirm("Remove this shared checklist step? A team activity event will remain."))return;
    void run(async()=>{
      const {data,error:rpcError}=await supabase.rpc("workspace_team_remove_step",{
        p_space_id:spaceId,p_step_id:step.id,
      });
      if(rpcError||data!==true)throw new Error(rpcError?.message??"Step was not removed");
    },"Checklist step removed.");
  };
  const redact=(comment:Comment)=>{
    if(!window.confirm("Redact this shared comment permanently? Its original text cannot be restored."))return;
    void run(async()=>{
      const {data,error:rpcError}=await supabase.rpc("workspace_team_redact_comment",{
        p_space_id:spaceId,p_comment_id:comment.id,
      });
      if(rpcError||data!==true)throw new Error(rpcError?.message??"Comment was not redacted");
    },"Comment text redacted; moderation event retained.");
  };
  const refresh=async()=>{
    if(busy||loading||disabled)return;
    const version=token.current;
    const expected={owner,spaceId,taskId};
    await load(expected,version);
  };

  return <section className="space-y-3 rounded-lg border border-cyan-600/30 bg-background/50 p-3"
    aria-label="Shared task discussion and checklist">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareText className="h-4 w-4 text-cyan-400"/>
        Task discussion and checklist
      </h4>
      <Button type="button" size="sm" variant="outline" disabled={busy||disabled||loading}
        onClick={()=>void refresh()}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Refresh</Button>
    </div>
    <p className="text-xs text-muted-foreground">
      Members can read. Only active-team owners and editors can post or update.
      Comments are append-only; authors or team owners can permanently redact text.
    </p>
    {loading&&<p role="status" className="text-xs text-muted-foreground">Loading real team discussion…</p>}
    {error&&<p role="alert" className="break-words text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="break-words text-xs text-cyan-300">{notice}</p>}
    {!verified&&!loading&&<p className="text-xs text-muted-foreground">
      Discussion unavailable until a complete authorized refresh succeeds. Drafts are retained locally in this open task.
    </p>}
    {verified&&<div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckSquare2 className="h-4 w-4"/> Checklist: {progress.done}/{progress.total}
        </p>
        <progress className="h-2 w-full" aria-label="Checklist completion" value={progress.done} max={progress.total||1}/>
        <label className="text-xs">Checklist view
          <select className="ml-2 rounded border border-border bg-background p-1" value={stepFilter}
            onChange={event=>setStepFilter(event.target.value)}>
            <option value="all">All steps</option><option value="open">Open steps</option><option value="done">Completed steps</option>
          </select>
        </label>
        {editor&&<form onSubmit={add} className="flex flex-wrap gap-2">
          <Input aria-label="New shared checklist step" className="min-w-0 flex-1"
            value={stepTitle} maxLength={180} disabled={busy||disabled||loading||steps.length>=30}
            placeholder="Describe the next check" onChange={event=>setStepTitle(event.target.value)}/>
          <Button type="submit" size="sm" disabled={!stepTitle.trim()||steps.length>=30||busy||disabled||loading}>
            Add step
          </Button>
        </form>}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {visibleSteps.map(step=><div key={step.id}
            className="flex items-start gap-2 rounded-md border border-border/50 p-2 text-xs">
            <input type="checkbox" checked={step.done} disabled={!editor||busy||disabled||loading}
              className="mt-0.5 accent-cyan-500" aria-label={"Complete step "+step.title}
              onChange={()=>check(step)}/>
            <div className="min-w-0 flex-1 break-words">
              <p className={step.done?"line-through text-muted-foreground":"font-medium"}>
                {step.title}
              </p>
              {step.done&&<p className="text-muted-foreground">
                Completed by {teamMemberLabel(step.done_by??"",owner)}
                {step.completed_at?" · "+new Date(step.completed_at).toLocaleString():""}
              </p>}
            </div>
            {editor&&<Button type="button" size="sm" variant="ghost"
              disabled={busy||disabled||loading} aria-label={"Remove step "+step.title}
              onClick={()=>removeStep(step)}><Trash2 className="h-3.5 w-3.5"/></Button>}
          </div>)}
          {!visibleSteps.length&&<p className="text-xs text-muted-foreground">{steps.length?"No steps match this view.":"No steps yet."}</p>}
        </div>
        {steps.length>=30&&<p className="text-xs text-amber-400">
          The 30-step limit is reached for this task.
        </p>}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Discussion ({comments.length}/200)</p>
        <Input type="search" aria-label="Search team task comments" value={commentQuery}
          maxLength={120} placeholder="Search visible comment text" onChange={event=>setCommentQuery(event.target.value)}/>
        <div className="flex flex-wrap gap-2 text-xs">
          <label>Comment view <select className="rounded border border-border bg-background p-1" value={commentFilter}
            onChange={event=>setCommentFilter(event.target.value)}>
            <option value="all">All comments</option><option value="mine">My comments</option><option value="redacted">Redacted</option>
          </select></label>
          <label>Order <select className="rounded border border-border bg-background p-1" value={commentSort}
            onChange={event=>setCommentSort(event.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          </select></label>
        </div>
        <p className="text-xs text-muted-foreground" role="status">Showing {visibleComments.length} of {comments.length} comments.</p>
        {editor&&<form onSubmit={post} className="space-y-2">
          <Textarea aria-label="Write a team task comment" rows={2}
            maxLength={2000} value={commentBody} disabled={busy||disabled||loading||comments.length>=200}
            placeholder="Share an update or a handover note…"
            onChange={event=>setCommentBody(event.target.value)}/>
          <Button type="submit" size="sm" disabled={!commentBody.trim()||busy||disabled||loading||
            comments.length>=200}>Post comment</Button>
        </form>}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {visibleComments.map(comment=><div key={comment.id}
            className="space-y-1 rounded-md border border-border/50 p-2 text-xs">
            <p className="break-words whitespace-pre-wrap">{comment.redacted_at?"[Comment redacted]":comment.body}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
              <span>{teamMemberLabel(comment.author_id,owner)} ·
                {" "+new Date(comment.created_at).toLocaleString()}
                {comment.redacted_at?" · redacted":""}
              </span>
              {workspaceTeamCommentCanRedact({
                role,owner,authorId:comment.author_id,
                redactedAt:comment.redacted_at,active,
              })&&<Button type="button" size="sm" variant="ghost"
                disabled={busy||disabled||loading} onClick={()=>redact(comment)}>
                <ShieldAlert className="mr-1 h-3.5 w-3.5"/> Redact
              </Button>}
            </div>
          </div>)}
          {!visibleComments.length&&<p className="text-xs text-muted-foreground">
            {comments.length?"No comments match this view.":"No comments yet."}
          </p>}
        </div>
      </div>
    </div>}
  </section>;
}
