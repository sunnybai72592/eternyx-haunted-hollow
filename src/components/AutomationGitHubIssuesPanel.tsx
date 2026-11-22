import { useEffect, useState } from "react";
import { Github, LockKeyhole, Eye, ShieldCheck, RefreshCcw, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";

type Conn={
  owner:string;repo:string;verifiedLogin:string;version:number;
  verifiedAt:string;scope:"github_issue_create";
};
type Draft={
  id:string;repo_owner:string;repo_name:string;
  status:"pending"|"submitting"|"succeeded"|"failed"|"uncertain"|"rejected"|"expired";
  connection_version:number;
  created_at:string;expires_at:string;decided_at:string|null;
  issue_number:number|null;issue_url:string|null;error_code:string|null;
};
type Status={
  connected:boolean;enabled:boolean;connection:Conn|null;
  writeAttempts24h:number;writeLimit24h:number;openDraftLimit:number;
  draftLimit24h:number;permissionProvedByRead:boolean;
  drafts?:Draft[];
};
type Preview={id:string;owner:string;repo:string;title:string;body:string};
async function invoke(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-github-issues",{
    body:{action,...extra},
  });
  if(error){
    let message="Issue operations are unavailable. Check deployment, permissions and secrets.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const details=await response.json();
        if(typeof details?.error==="string"&&details.error.length<240)message=details.error;
      }
    }catch{/* keep safe fallback */}
    throw new Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Invalid GitHub issue backend reply.");
  return data as Record<string,unknown>;
}
function validateStatus(r:Record<string,unknown>,needDrafts:boolean):Status{
  if(r.source!=="authenticated_server"||typeof r.connected!=="boolean"||
     typeof r.enabled!=="boolean"||r.writeLimit24h!==3||
     !Number.isInteger(r.writeAttempts24h)||r.openDraftLimit!==3||
     r.draftLimit24h!==10||r.permissionProvedByRead!==false){
    throw new Error("Unverified issue connection or audit data.");
  }
  if(r.connection!==null &&
      (!r.connection||typeof r.connection!=="object"||Array.isArray(r.connection))) {
    throw new Error("Invalid connection metadata.");
  }
  if(needDrafts &&
      (!Array.isArray(r.drafts)||r.drafts.length>20||
       r.drafts.some((x:unknown)=>{
         if(!x||typeof x!=="object"||Array.isArray(x))return true;
         const d=x as Record<string,unknown>;
         return typeof d.id!=="string"||typeof d.repo_owner!=="string"||
           typeof d.repo_name!=="string"||typeof d.created_at!=="string"||
           !["pending","submitting","succeeded","failed","uncertain","rejected","expired"].includes(d.status as string);
       })))throw new Error("Invalid issue audit response.");
  return r as Status;
}
const date=(s:string)=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString():"Unknown date";};
export default function AutomationGitHubIssuesPanel(){
  const userId=useAuthStore(s=>s.user?.id);
  const isSignedIn=useAuthStore(s=>s.isAuthenticated);
  const [status,setStatus]=useState<Status|null>(null);
  const [owner,setOwner]=useState("sunnybai72592");
  const [repo,setRepo]=useState("eternyx-haunted-hollow");
  const [token,setToken]=useState("");
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [created,setCreated]=useState<{id:string;url:string;number:number}|null>(null);

  useEffect(()=>{
    setStatus(null);setToken("");setPreview(null);
    setCreated(null);setTitle("");setBody("");
    setMessage("");setError("");
  },[userId]);

  async function load(withDrafts=true){
    const result=await invoke(withDrafts?"list":"status");
    const checked=validateStatus(result,withDrafts);
    setStatus(checked);
    if(withDrafts && preview &&
      !checked.drafts?.some(x=>x.id===preview.id&&x.status==="pending"&&
        Date.parse(x.expires_at)>Date.now()))setPreview(null);
  }
  async function run(task:()=>Promise<void>){
    setBusy(true);setError("");setMessage("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:"GitHub issue action failed.");}
    finally{setBusy(false);}
  }
  const prepared=status?.drafts?.filter(d=>d.status==="pending"&&Date.parse(d.expires_at)>Date.now())??[];
  const canPrepare=!!status?.enabled&&title.trim().length>0&&title.trim().length<=120&&
    !/[\x00-\x1f\x7f]/.test(title)&&
    new TextEncoder().encode(body).byteLength<=1000&&prepared.length<3;
  return <section aria-labelledby="eternyx-gh-issues" className="space-y-4 rounded-xl border border-primary/20 p-4 sm:p-5">
    <div className="flex items-center gap-2">
      <Github className="size-5 text-primary"/>
      <h4 id="eternyx-gh-issues" className="text-lg font-semibold">GitHub issue creation — owner approved</h4>
    </div>
    <p className="text-sm leading-6 text-muted-foreground">
      Connect one GitHub repository using a <strong>fine-grained personal access token</strong>
      limited to that repository with <strong>Issues: write</strong>. Your token and draft text are
      AES-encrypted on the backend. Saving a draft does not write to GitHub: you must separately
      preview and approve it within 10 minutes. The server checks this preview before any write. All issue creation is disabled by default.
    </p>
    <p className="text-xs text-muted-foreground">
      Maximum 3 approved issue write attempts per rolling 24 hours, 3 pending drafts, 10 drafts
      per day. Failed/uncertain requests still consume write capacity. No automatic retries,
      pull request merges, code pushes or repository deletion. This is a GitHub Issue write,
      not a payment or paid AI operation.
    </p>
    {!isSignedIn||!userId?<p className="text-sm text-muted-foreground">
      <LockKeyhole className="mr-2 inline size-4"/>Sign in to manage your own GitHub issue connection.
    </p>:<>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>
        void run(async()=>{await load();setMessage("Loaded real connection status and issue audit.");})}>
        <RefreshCcw className="mr-2 size-4"/> Load GitHub issue status
      </Button>
      {status&&<div className="space-y-2 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-semibold">{status.connected
          ?status.enabled?"Issue writes enabled":"Connected · writes disabled"
          :"Not connected"}</p>
        {status.connection&&<p className="break-all text-xs text-muted-foreground">
          Bound repository: <strong>{status.connection.owner}/{status.connection.repo}</strong>
          {" · "}Token repository access verified {date(status.connection.verifiedAt)}
        </p>}
        <p className="text-xs text-muted-foreground">
          Write attempts used in the last 24h: {status.writeAttempts24h}/{status.writeLimit24h}.
          Token read verification cannot prove Issues: write permission; GitHub checks that
          separately when you approve a draft.
        </p>
        {status.connected&&<div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={()=>{
            if(!status.enabled&&!window.confirm("Enable issue creation for the connected repository? Drafts still require a separate explicit approval."))return;
            void run(async()=>{
              const r=await invoke("toggle",{enabled:!status.enabled});
              if(r.source!=="authenticated_server"||r.enabled!==!status.enabled){
                throw new Error("GitHub write policy was not updated.");
              }
              setPreview(null);await load();setMessage(status.enabled
                ?"GitHub issue writes disabled.":"GitHub issue writes enabled; approval is still required for every issue.");
            });
          }}>
            <ShieldCheck className="mr-2 size-4"/>{status.enabled?"Disable issue writes":"Enable issue writes"}
          </Button>
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={()=>{
            if(!window.confirm("Disconnect GitHub and delete the encrypted token? Pending drafts will no longer be executable."))return;
            void run(async()=>{
              const r=await invoke("disconnect");
              if(r.source!=="authenticated_server"||r.disconnected!==true){
                throw new Error("Connection was not deleted.");
              }
              setToken("");setPreview(null);await load();
              setMessage("Connection removed; the encrypted token was deleted.");
            });
          }}><Trash2 className="mr-2 size-4"/> Disconnect and erase token</Button>
        </div>}
      </div>}
      {status&&!status.connected&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-semibold">Connect a single authorized repository</p>
        <p className="text-xs text-muted-foreground">
          Create a fine-grained token in GitHub with access to only the desired repository,
          Metadata: read and Issues: read/write. Avoid classic tokens or broad permissions.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="github-issues-owner" className="text-xs">Repository owner
            <Input id="github-issues-owner" value={owner} onChange={e=>setOwner(e.target.value)}
              placeholder="GitHub owner" disabled={busy}/>
          </label>
          <label htmlFor="github-issues-repo" className="text-xs">Repository name
            <Input id="github-issues-repo" value={repo} onChange={e=>setRepo(e.target.value)}
              placeholder="Repository" disabled={busy}/>
          </label>
        </div>
        <label htmlFor="github-issues-token" className="text-xs">Fine-grained personal access token
          <Input id="github-issues-token" type="password" autoComplete="off" value={token}
            onChange={e=>setToken(e.target.value)} disabled={busy}
            placeholder="github_pat_..."/>
        </label>
        <Button type="button" size="sm" disabled={busy||!token.startsWith("github_pat_")}
          onClick={()=>void run(async()=>{
            if(!window.confirm("Verify the token against this repository, then store it encrypted and DISABLED?"))return;
            const r=await invoke("connect",{owner,repo,token});
            if(r.source!=="authenticated_server"||r.connected!==true||r.enabled!==false){
              throw new Error("Connection was not verified or stored securely.");
            }
            setToken("");await load();
            setMessage("Repository access verified; encrypted token stored and writes disabled.");
          })}><LockKeyhole className="mr-2 size-4"/> Verify and connect (disabled)</Button>
      </div>}
      {status?.enabled&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
        <p className="text-sm font-semibold">1. Save an encrypted issue draft — no GitHub write</p>
        <label htmlFor="github-issue-title" className="text-xs">Issue title (1–120 characters)
          <Input id="github-issue-title" maxLength={120} value={title} disabled={busy}
            onChange={e=>setTitle(e.target.value)} placeholder="Short issue title"/>
        </label>
        <label htmlFor="github-issue-body" className="text-xs">Issue body (up to 1,000 UTF-8 bytes)
          <Textarea id="github-issue-body" rows={5} maxLength={1000} value={body} disabled={busy}
            onChange={e=>setBody(e.target.value)} placeholder="Describe the issue without secrets or personal data"/>
        </label>
        <Button type="button" size="sm" disabled={busy||!canPrepare} onClick={()=>
          void run(async()=>{
            const r=await invoke("prepare",{title,body,requestKey:crypto.randomUUID()});
            if(r.source!=="authenticated_server"||r.executed!==false||typeof r.draftId!=="string"){
              throw new Error("Verified saved draft was not returned.");
            }
            setTitle("");setBody("");setPreview(null);await load();
            setMessage("Encrypted draft saved; no GitHub issue was created.");
          })}>Save draft without executing</Button>
      </div>}
      {status?.drafts&&<div className="space-y-3">
        <p className="text-sm font-semibold">2. Review or reject pending issues; approval submits a real issue</p>
        {status.drafts.length===0&&<p className="text-xs text-muted-foreground">No issue draft or submission history yet.</p>}
        {status.drafts.map(d=>{
          const canDecide=d.status==="pending"&&Date.parse(d.expires_at)>Date.now()&&!!status.enabled;
          const open=preview?.id===d.id;
          return <div key={d.id} className="space-y-2 rounded-lg border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>{d.status}</strong> · {d.repo_owner}/{d.repo_name} · {date(d.created_at)}
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">Request: {d.id}</p>
            {d.issue_url&&/^https:\/\/github\.com\//.test(d.issue_url)&&
              <a href={d.issue_url} target="_blank" rel="noopener noreferrer"
                className="text-sm underline">Open confirmed issue #{d.issue_number}</a>}
            {d.error_code&&<p className="text-xs text-muted-foreground">GitHub outcome: {d.error_code}</p>}
            {d.status==="uncertain"&&<p className="text-xs text-amber-600 dark:text-amber-300">
              GitHub may have created the issue despite losing the response. Check the repository
              manually. This draft will never be auto-submitted again.
            </p>}
            {canDecide&&<div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={()=>void run(async()=>{
                  const r=await invoke("preview",{draftId:d.id});
                  if(r.source!=="authenticated_owner_preview"||r.executed!==false||
                     r.draftId!==d.id||typeof r.title!=="string"||typeof r.body!=="string"){
                    throw new Error("Owner issue preview was not verified.");
                  }
                  setPreview({id:d.id,owner:String(r.owner),repo:String(r.repo),
                    title:r.title,body:r.body});
                  setMessage("Review both the repository and exact issue text before approving.");
                })}><Eye className="mr-2 size-4"/> Preview issue</Button>
              <Button type="button" size="sm" variant="destructive" disabled={busy}
                onClick={()=>void run(async()=>{
                  if(!window.confirm("Reject this pending issue draft without posting to GitHub?"))return;
                  const r=await invoke("reject",{draftId:d.id});
                  if(r.source!=="authenticated_server"||r.executed!==false){
                    throw new Error("Draft rejection was not confirmed.");
                  }
                  setPreview(null);await load();setMessage("Draft rejected; no external write occurred.");
                })}>Reject draft</Button>
              <Button type="button" size="sm" disabled={busy||!open||
                status.writeAttempts24h>=status.writeLimit24h}
                onClick={()=>{
                  if(!window.confirm("FINAL APPROVAL: Create this GitHub issue now in "+
                    d.repo_owner+"/"+d.repo_name+"? This is a real external write and cannot be auto-undone."))return;
                  void run(async()=>{
                    const r=await invoke("approve",{draftId:d.id});
                    setPreview(null);
                    await load();
                    if(r.status==="uncertain"){
                      setMessage("Issue creation outcome is uncertain. Check GitHub; do not blindly retry.");
                      return;
                    }
                    if(r.source!=="authenticated_server"||r.status!=="succeeded"||
                       typeof r.issueUrl!=="string"||
                       !r.issueUrl.startsWith("https://github.com/")){
                      throw new Error("GitHub did not confirm the issue. Check audit history.");
                    }
                    setCreated({id:d.id,url:r.issueUrl,number:Number(r.issueNumber)});
                    setMessage("Real GitHub issue created successfully.");
                  });
                }}><Send className="mr-2 size-4"/> Approve & create issue</Button>
            </div>}
            {open&&<div className="space-y-2 rounded-lg border border-primary/30 p-3">
              <p className="text-xs font-semibold">Verified owner review · {preview.owner}/{preview.repo}</p>
              <p className="text-sm font-medium">{preview.title}</p>
              <Textarea readOnly rows={5} className="font-mono text-xs" value={preview.body}/>
            </div>}
          </div>;
        })}
      </div>}
      {created&&<p role="status" className="text-sm">
        Created issue #{created.number}: <a className="underline" href={created.url}
          target="_blank" rel="noopener noreferrer">{created.url}</a>
      </p>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </>}
  </section>;
}
