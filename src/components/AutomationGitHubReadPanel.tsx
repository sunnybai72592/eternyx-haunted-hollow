import { useEffect, useRef, useState } from "react";
import { Github, LockKeyhole, RefreshCcw, ShieldCheck, Search, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";

type PublicRepo = {
  name:string;fullName:string;description:string|null;
  stars:number;forks:number;openIssues:number;language:string|null;
  archived:boolean;defaultBranch:string|null;url:string;
};
type ProviderHistory = {
  id:string;repo_owner:string;repo_name:string;
  state:"reserved"|"succeeded"|"failed";http_status:number|null;
  error_code:string|null;result:PublicRepo|null;
  created_at:string;completed_at:string|null;
};
type ProviderStatus = {
  provider:"github_public";scope:"public_repository_metadata_read";
  enabled:boolean;dailyLimit:number;usedLast24h:number;
  externalWritesAllowed:false;source:"authenticated_server";
  history?:ProviderHistory[];
};
const date=(value:string)=> {
  const time=new Date(value);
  return Number.isFinite(time.getTime())?time.toLocaleString():"Unknown time";
};
const ownerPattern=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const repoPattern=/^[A-Za-z0-9_.-]{1,100}$/;
function validTarget(owner:string,repo:string){
  return ownerPattern.test(owner)&&repoPattern.test(repo)&&repo!=="."&&repo!=="..";
}
function validRepo(r:unknown):r is PublicRepo {
  if(!r||typeof r!=="object"||Array.isArray(r))return false;
  const p=r as Record<string,unknown>;
  return typeof p.name==="string"&&typeof p.fullName==="string"&&
    typeof p.stars==="number"&&Number.isFinite(p.stars)&&
    typeof p.forks==="number"&&Number.isFinite(p.forks)&&
    typeof p.openIssues==="number"&&Number.isFinite(p.openIssues)&&
    typeof p.archived==="boolean"&&
    typeof p.url==="string"&&p.url.startsWith("https://github.com/")&&
    (p.description===null||typeof p.description==="string")&&
    (p.language===null||typeof p.language==="string")&&
    (p.defaultBranch===null||typeof p.defaultBranch==="string");
}
async function invoke(action:string,args:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  const {data,error}=await supabase.functions.invoke("automation-github-public",{
    body:{action,...args},
  });
  if(error){
    let info="GitHub integration unavailable. Check the deployment and permissions.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const details=await response.json();
        if(typeof details?.error==="string"&&details.error.length<220)info=details.error;
      }
    }catch{/* keep safe fallback */}
    throw new Error(info);
  }
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Unverified provider response.");
  return data as Record<string,unknown>;
}
function checkStatus(raw:Record<string,unknown>):ProviderStatus{
  if(raw.source!=="authenticated_server"||raw.provider!=="github_public"||
      raw.scope!=="public_repository_metadata_read"||
      typeof raw.enabled!=="boolean"||raw.externalWritesAllowed!==false||
      !Number.isInteger(raw.dailyLimit)||!Number.isInteger(raw.usedLast24h)) {
    throw new Error("GitHub provider status is not verified.");
  }
  return raw as ProviderStatus;
}
export default function AutomationGitHubReadPanel(){
  const userId=useAuthStore(s=>s.user?.id);
  const signedIn=useAuthStore(s=>s.isAuthenticated);
  const [status,setStatus]=useState<ProviderStatus|null>(null);
  const [budget,setBudget]=useState(5);
  const [owner,setOwner]=useState("sunnybai72592");
  const [repo,setRepo]=useState("eternyx-haunted-hollow");
  const [result,setResult]=useState<PublicRepo|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const pending=useRef<{target:string;key:string}|null>(null);
  useEffect(()=>{
    setStatus(null);setBudget(5);setResult(null);
    setError("");setNotice("");pending.current=null;
  },[userId]);

  async function load(alsoHistory=false){
    const r=await invoke(alsoHistory?"history":"status");
    const next=checkStatus(r);
    if(alsoHistory){
      if(!Array.isArray(r.history)||r.history.length>20)throw new Error("Invalid provider history.");
      for(const record of r.history){
        if(!record||typeof record!=="object"||typeof record.id!=="string"||
            !["reserved","succeeded","failed"].includes(record.state)){
          throw new Error("Invalid provider history item.");
        }
      }
    }
    setStatus(next);setBudget(next.dailyLimit);
  }
  async function act(fn:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await fn();}
    catch(e){setError(e instanceof Error?e.message:"GitHub provider action failed.");}
    finally{setBusy(false);}
  }
  async function configure(enabled:boolean){
    if(!Number.isInteger(budget)||budget<1||budget>20){
      throw new Error("Set a whole-number limit between 1 and 20.");
    }
    const r=await invoke("configure",{enabled,dailyLimit:budget});
    if(r.source!=="authenticated_server"||
        !r.policy||typeof r.policy!=="object"||
        (r.policy as Record<string,unknown>).enabled!==enabled) {
      throw new Error("Integration policy was not accepted by the server.");
    }
    await load();
    setNotice(enabled
      ?"Read-only GitHub inspection enabled for your account."
      :"GitHub integration disabled. No new inspection calls are permitted.");
  }
  return <section aria-labelledby="github-provider-heading"
    className="space-y-4 rounded-xl border border-primary/20 bg-background/50 p-4 sm:p-5">
    <div className="flex items-center gap-2">
      <Github className="size-5 text-primary"/>
      <h4 id="github-provider-heading" className="text-lg font-semibold">GitHub public repository integration</h4>
    </div>
    <p className="text-sm leading-6 text-muted-foreground">
      A real, optional GitHub API connection. Inspect public repository metadata from
      the fixed GitHub endpoint with read-only permissions and a server-enforced 24-hour
      call budget. No OAuth token, commits, issue creation, arbitrary URLs or paid AI.
    </p>
    <p className="text-xs leading-5 text-muted-foreground">
      Hosting requests may have a cost, and GitHub may throttle anonymous API calls.
      This per-account limit is an API-call budget—not a guaranteed monetary spending cap.
      Disabled by default; this is independent of the signed webhook and scheduled text workflows.
    </p>
    {!signedIn||!userId?<p className="text-sm text-muted-foreground"><LockKeyhole className="mr-2 inline size-4"/>Sign in to inspect repositories.</p>:<>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="button" variant="outline" disabled={busy}
          onClick={()=>void act(async()=>{await load(true);setNotice("Loaded actual provider policy and recent call history.");})}>
          <RefreshCcw className="mr-2 size-4"/> Load provider status
        </Button>
        {status&&<span role="status" className="text-xs text-muted-foreground">
          {status.enabled?"Enabled":"Disabled"} · {status.usedLast24h}/{status.dailyLimit} requests used in 24h
        </span>}
      </div>
      {status&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
        <label htmlFor="github-provider-budget" className="text-sm">Maximum outgoing GitHub API calls per rolling 24h (1–20)</label>
        <Input id="github-provider-budget" type="number" min={1} max={20} step={1}
          value={budget} disabled={busy}
          onChange={(e)=>setBudget(Number(e.target.value))}/>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy||!Number.isInteger(budget)||budget<1||budget>20}
            onClick={()=>void act(async()=>{
              if(!status.enabled&&!window.confirm("Enable this external GitHub metadata reader? Each inspection sends one GET to GitHub."))return;
              await configure(!status.enabled);
            })}>
            <ShieldCheck className="mr-2 size-4"/>{status.enabled?"Disable integration":"Enable read-only integration"}
          </Button>
          <Button size="sm" variant="outline"
            disabled={busy||budget===status.dailyLimit||!Number.isInteger(budget)||budget<1||budget>20}
            onClick={()=>void act(async()=>configure(status.enabled))}>
            <Save className="mr-2 size-4"/> Save request limit
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Permission: public_repository_metadata_read. Results are cleared after 24h when
          housekeeping runs; private call metadata is retained up to seven days.
        </p>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs" htmlFor="github-owner-input">Public GitHub owner
          <Input id="github-owner-input" value={owner} disabled={busy}
            onChange={(e)=>{setOwner(e.target.value);pending.current=null;setResult(null);}}
            placeholder="Organization or account"/>
        </label>
        <label className="text-xs" htmlFor="github-repo-input">Repository name
          <Input id="github-repo-input" value={repo} disabled={busy}
            onChange={(e)=>{setRepo(e.target.value);pending.current=null;setResult(null);}}
            placeholder="Public repository"/>
        </label>
      </div>
      <Button type="button" disabled={busy||!status?.enabled||!validTarget(owner,repo)||
        status.usedLast24h>=status.dailyLimit}
        onClick={()=>void act(async()=>{
          const target=(owner+"/"+repo).toLowerCase();
          const key=pending.current?.target===target
            ?pending.current.key:crypto.randomUUID();
          pending.current={target,key};
          const r=await invoke("inspect",{owner,repo,requestKey:key});
          if(r.source!=="authenticated_server"||typeof r.callId!=="string"){
            throw new Error("GitHub inspection receipt is unverified.");
          }
          if(r.state!=="succeeded"||!validRepo(r.result)){
            pending.current=null;
            await load();
            throw new Error(r.state==="reserved"
              ?"A prior inspection is still processing. Check history before trying again."
              :"GitHub inspection did not produce public repository metadata.");
          }
          pending.current=null;setResult(r.result);
          await load();setNotice(r.replayed===true
            ?"Loaded the original saved inspection result without repeating the GitHub call."
            :"Repository metadata returned by GitHub and recorded on the server.");
        })}>
        <Search className="mr-2 size-4"/> Inspect public repository
      </Button>
      {status&&!status.enabled&&<p className="text-xs text-muted-foreground">
        Enable the integration above to authorize its first outbound read.
      </p>}
      {result&&<div className="space-y-2 rounded-lg border border-primary/20 p-3">
        <p className="font-semibold">{result.fullName}</p>
        <p className="text-sm text-muted-foreground">{result.description??"No public description"}</p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Stars: {result.stars.toLocaleString()}</span>
          <span>Forks: {result.forks.toLocaleString()}</span>
          <span>Open issues: {result.openIssues.toLocaleString()}</span>
          <span>Language: {result.language??"Unspecified"}</span>
          <span>Archived: {result.archived?"Yes":"No"}</span>
        </div>
        <p className="text-sm">
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
            Open public GitHub repository
          </a>
        </p>
      </div>}
      {status?.history&&<div className="space-y-2">
        <h5 className="text-sm font-semibold">Actual recent inspection history</h5>
        {status.history.length===0
          ?<p className="text-xs text-muted-foreground">No GitHub provider calls recorded.</p>
          :<ol className="space-y-2">
            {status.history.map(call=><li key={call.id}
              className="rounded-lg border border-border/70 p-2 text-xs text-muted-foreground">
              <strong>{call.repo_owner}/{call.repo_name}</strong> · {call.state}
              {call.error_code?" · "+call.error_code:""} · {date(call.created_at)}
            </li>)}
          </ol>}
      </div>}
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    </>}
  </section>;
}
