import { useEffect, useState } from "react";
import { GitBranch, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export type WorkflowOption={id:string;name:string;revision:number};

export default function AutomationGitHubIssueWorkflowPanel({
  enabled,workflows,busy,onSaved,
}:{
  enabled:boolean;workflows:WorkflowOption[];busy:boolean;
  onSaved:()=>Promise<void>;
}){
  const [selected,setSelected]=useState("");
  const [title,setTitle]=useState("");
  const [input,setInput]=useState("");
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!workflows.some(w=>w.id===selected))setSelected(workflows[0]?.id??"");
  },[selected,workflows]);
  const bytes=new TextEncoder().encode(input).byteLength;
  async function prepare(){
    setError("");setNotice("");setPending(true);
    try{
      if(!enabled||!selected||bytes>2000||!title.trim()||
         title.trim().length>120||/[\x00-\x1f\x7f]/.test(title)){
        throw Error("Choose an active saved workflow and a valid title; input must be at most 2,000 bytes.");
      }
      const {data,error:remote}=await supabase.functions.invoke("automation-github-issues",{
        body:{action:"prepareWorkflow",workflowId:selected,
          title:title.trim(),input,requestKey:crypto.randomUUID()},
      });
      if(remote||data?.source!=="authenticated_server"||
         data?.derivedFromWorkflow!==true||data?.executed!==false||
         data?.status!=="pending"||typeof data?.draftId!=="string"){
        let reason="Failed to save workflow-derived draft. Check limits, active workflow and server permissions.";
        try{
          if(remote?.context&&typeof (remote.context as Response).json==="function"){
            const detail=await (remote.context as Response).json();
            if(typeof detail?.code==="string"&&detail.code.length<60)reason+=" ("+detail.code+")";
          }
        }catch{/* keep safe fallback */}
        throw Error(reason);
      }
      setInput("");setTitle("");
      await onSaved();
      setNotice("Saved encrypted issue draft from a REAL workflow result. No GitHub write occurred. Preview it below to review and approve.");
    }catch(e){
      setError(e instanceof Error?e.message:"Workflow draft failed.");
    }finally{setPending(false);}
  }
  return <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
    <div className="flex items-center gap-2">
      <GitBranch className="size-4 text-primary"/>
      <strong className="text-sm">Create issue draft from a saved ETERNYX workflow</strong>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      This runs the selected active, saved text workflow on the backend, then
      encrypts its exact result as an issue body. Input and output text are not
      retained in the normal run history. The issue still requires a separate
      owner preview and explicit approval. No external POST happens here.
    </p>
    {workflows.length===0?<p className="text-xs text-muted-foreground">
      No active saved workflows. Save and activate a deterministic text workflow in
      this Automation workspace first.
    </p>:<>
      <label htmlFor="automation-issue-workflow" className="block text-xs">
        Saved workflow (current server revision)
        <select id="automation-issue-workflow"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          disabled={busy||pending||!enabled} value={selected}
          onChange={e=>setSelected(e.target.value)}>
          {workflows.map(w=><option key={w.id} value={w.id}>
            {w.name} · revision {w.revision}
          </option>)}
        </select>
      </label>
      <label htmlFor="automation-issue-workflow-title" className="block text-xs">
        Issue title (1–120 characters)
        <Input id="automation-issue-workflow-title" maxLength={120} value={title}
          disabled={busy||pending||!enabled}
          onChange={e=>setTitle(e.target.value)}
          placeholder="Report from my workflow"/>
      </label>
      <label htmlFor="automation-issue-workflow-input" className="block text-xs">
        Text input for the actual saved workflow (up to 2,000 UTF-8 bytes)
        <Textarea id="automation-issue-workflow-input" rows={4}
          disabled={busy||pending||!enabled} maxLength={2000} value={input}
          onChange={e=>setInput(e.target.value)}
          placeholder="Input lines to transform into an issue body"/>
      </label>
      <p className="text-xs text-muted-foreground">
        Input size: {bytes.toLocaleString()} / 2,000 bytes.
        The generated result must fit GitHub issue draft limits (1,000 bytes).
        Do not include credentials, secrets or private customer information.
      </p>
      <Button type="button" size="sm"
        disabled={busy||pending||!enabled||!selected||!title.trim()||
          bytes>2000||title.trim().length>120}
        onClick={()=>{void prepare();}}>
        <FileCheck2 className="mr-2 size-4"/> Run saved workflow & save encrypted draft
      </Button>
    </>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </div>;
}
