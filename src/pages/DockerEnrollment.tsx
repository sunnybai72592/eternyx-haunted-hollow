import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, ShieldCheck, ShieldAlert, Copy, CloudOff, Trash2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";

type Workspace = {id:string;name:string;created_at:string};
type Agent = {id:string;workspace_id:string;display_name:string;status:"pending"|"key_verified"|"revoked";created_at:string;key_verified_at:string|null;revoked_at:string|null};
type SignedReport = {agent_id:string;last_signed_at:string;last_received_at:string;engine_available:boolean;engine_version:string;container_count:number|null;accepted_count:number};
function signedReportState(agent:Agent,report:SignedReport|undefined){
  if(agent.status==="revoked")return "Enrollment revoked — signed reports disabled";
  if(agent.status!=="key_verified")return "No verified signing identity";
  if(!report)return "No signed reports received";
  const observed=Date.parse(report.last_received_at);
  if(!Number.isFinite(observed)||Date.now()-observed>180000 || Date.now()<observed-60000)
    return "Signed report is stale — not a live status";
  return report.engine_available
    ? "Recent signed report: Docker CLI answered on reporting machine"
    : "Recent signed report: Docker CLI did not answer";
}

type Challenge = {agentId:string;nonce:string;expiresAt:string;message:string};
async function call(action:string,fields:Record<string,string>={}):Promise<Record<string,unknown>>{
  const {data,error}=await supabase.functions.invoke("docker-enrollment",{body:{action,...fields}});
  if(error){
    let detail=error.message||"Docker enrollment backend unavailable.";
    try{ const response=error.context; if(response&&typeof response.json==="function"){const body=await response.json();if(typeof body.error==="string")detail=body.error;} }catch{}
    throw new Error(detail);
  }
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Unexpected enrollment response.");
  return data as Record<string,unknown>;
}
export default function DockerEnrollment(){
  const user=useAuthStore(s=>s.user);
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
  const [agents,setAgents]=useState<Agent[]>([]);
  const [reports,setReports]=useState<SignedReport[]>([]);
  const [workspaceId,setWorkspaceId]=useState("");
  const [workspaceName,setWorkspaceName]=useState("");
  const [agentName,setAgentName]=useState("");
  const [publicKey,setPublicKey]=useState("");
  const [signature,setSignature]=useState("");
  const [challenge,setChallenge]=useState<Challenge|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    const data=await call("list");
    const ws=Array.isArray(data.workspaces)?data.workspaces as Workspace[]:[];
    const list=Array.isArray(data.agents)?data.agents as Agent[]:[];
    setWorkspaces(ws);setAgents(list);
    setReports(Array.isArray(data.reports)?data.reports as SignedReport[]:[]);
    setWorkspaceId(old=>ws.some(w=>w.id===old)?old:(ws[0]?.id||""));
  },[]);
  useEffect(()=>{if(user?.id)load().catch(e=>setError(e instanceof Error?e.message:"Enrollment service unavailable"));},[user?.id,load]);
  const execute=async(fn:()=>Promise<void>)=>{
    setBusy(true);setError("");setNotice("");
    try{await fn();}catch(e){setError(e instanceof Error?e.message:"Request failed.");}
    finally{setBusy(false);}
  };
  const makeWorkspace=()=>execute(async()=>{
    await call("create_workspace",{name:workspaceName});
    setWorkspaceName("");await load();setNotice("Workspace created for your signed-in account.");
  });
  const begin=()=>execute(async()=>{
    const data=await call("begin",{workspaceId,name:agentName,publicKey:publicKey.trim()});
    if(typeof data.agentId!=="string"||typeof data.message!=="string"||
      typeof data.nonce!=="string"||typeof data.expiresAt!=="string")throw new Error("Invalid challenge response.");
    setChallenge({agentId:data.agentId,nonce:data.nonce,expiresAt:data.expiresAt,message:data.message});
    setSignature("");await load();
    setNotice("Enrollment challenge issued. The key is NOT verified yet.");
  });
  const verify=()=>execute(async()=>{
    if(!challenge)throw new Error("Request a challenge first.");
    const response=await call("verify",{agentId:challenge.agentId,nonce:challenge.nonce,signature:signature.trim()});
    if(response.status!=="key_verified")throw new Error("Key verification not confirmed.");
    setChallenge(null);setSignature("");await load();setNotice("Private-key possession verified. This does not mean the Docker server is online.");
  });
  const revoke=(id:string)=>execute(async()=>{
    if(!window.confirm("Revoke this agent identity? This does not stop a Docker container or close an SSH tunnel."))return;
    await call("revoke",{agentId:id});await load();setNotice("Agent enrollment revoked.");
  });
  return <div className="mx-auto max-w-6xl space-y-7 px-4 pb-20 pt-4 text-foreground sm:px-6">
    <Link to="/integrations" className="text-sm text-cyan-400 hover:underline">Cloud &amp; Integrations</Link>
    <section className="rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-slate-950 to-indigo-950 p-7 text-white sm:p-9">
      <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-cyan-300"><KeyRound className="h-5 w-5"/> Docker identity</div>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Workspaces &amp; Agent Enrollment</h1>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">Account-bound server identity enrollment with short-lived Ed25519 proof of possession. This is not remote Docker access, ownership attestation, or a live connection.</p>
    </section>
    {error&&<p role="alert" className="rounded-xl border border-red-500/40 p-4 text-sm text-red-400"><ShieldAlert className="mr-2 inline h-4 w-4"/>{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-emerald-500/40 p-4 text-sm">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">1. Your Docker workspaces</h2>
        <p className="mt-2 text-sm text-muted-foreground">Up to three workspaces per authenticated account. These records do not provision infrastructure.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Docker workspace name" value={workspaceName} maxLength={64} onChange={e=>setWorkspaceName(e.target.value)} placeholder="Workspace name" className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm"/>
          <button disabled={busy||!workspaceName.trim()} onClick={makeWorkspace} className="min-h-11 rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950 disabled:opacity-50">Create workspace</button>
        </div>
        <div className="mt-4 space-y-2">{workspaces.map(ws=><div key={ws.id} className="rounded-lg border border-border p-3 text-sm"><p className="font-medium">{ws.name}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(ws.created_at).toLocaleString()}</p></div>)}</div>
        {workspaces.length===0&&<p className="mt-4 text-sm text-muted-foreground">No workspaces returned by the enrollment service.</p>}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">2. Enroll an agent key</h2>
        <p className="mt-2 text-sm text-muted-foreground">Generate an Ed25519 keypair on a trusted machine. Keep the private key there and enter only its public key.</p>
        <code className="mt-4 block break-all rounded-lg bg-muted/50 p-3 text-xs">node scripts/docker-enrollment-key.mjs generate /ABSOLUTE/PRIVATE/docker-agent.pem</code>
        <label className="mt-4 block text-sm">Workspace</label>
        <select aria-label="Enrollment workspace" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Choose a workspace</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label className="mt-3 block text-sm">Agent display name</label>
        <input aria-label="Agent display name" maxLength={64} value={agentName} onChange={e=>setAgentName(e.target.value)} placeholder="Staging Docker host" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        <label className="mt-3 block text-sm">Ed25519 public key (base64url)</label>
        <textarea aria-label="Ed25519 public key" rows={2} maxLength={50} value={publicKey} onChange={e=>setPublicKey(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"/>
        <button disabled={busy||!workspaceId||!agentName.trim()||!publicKey.trim()} onClick={begin} className="mt-3 min-h-11 rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950 disabled:opacity-50">Request signed challenge</button>
      </section>
    </div>
    {challenge&&<section className="rounded-2xl border border-cyan-400/30 bg-card p-5">
      <h2 className="text-xl font-semibold">3. Sign and verify the challenge</h2>
      <p className="mt-2 text-sm text-muted-foreground">Expires {new Date(challenge.expiresAt).toLocaleString()}. Save this exact message to a file on the trusted machine and sign it locally.</p>
      <textarea aria-label="Canonical enrollment challenge" readOnly rows={7} value={challenge.message} className="mt-4 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"/>
      <button type="button" onClick={()=>navigator.clipboard.writeText(challenge.message).then(()=>setNotice("Challenge copied.")).catch(()=>setError("Clipboard unavailable."))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm"><Copy className="h-4 w-4"/> Copy challenge</button>
      <code className="mt-3 block break-all rounded-lg bg-muted/50 p-3 text-xs">node scripts/docker-enrollment-key.mjs sign /ABSOLUTE/PRIVATE/docker-agent.pem /ABSOLUTE/challenge.txt</code>
      <label className="mt-3 block text-sm">Signature (base64url)</label>
      <textarea aria-label="Agent challenge signature" rows={2} maxLength={100} value={signature} onChange={e=>setSignature(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"/>
      <button disabled={busy||!signature.trim()} onClick={verify} className="mt-3 min-h-11 rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950 disabled:opacity-50">Verify possession</button>
    </section>}
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Registered agent identities &amp; signed reports</h2>
        <button disabled={busy} onClick={()=>execute(async()=>{await load();setNotice("Enrollment records refreshed. No live Docker check performed.");})} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm"><RefreshCw className="h-4 w-4"/> Refresh</button>
      </div>
      <div className="mt-4 space-y-3">{agents.map(agent=><div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div><p className="font-medium">{agent.display_name}</p><p className="mt-1 text-xs text-muted-foreground">{agent.status==="key_verified"?"Ed25519 key possession verified":agent.status==="revoked"?"Enrollment revoked":"Challenge pending or expired"}</p><p className="mt-1 text-xs text-muted-foreground">{signedReportState(agent,reports.find(r=>r.agent_id===agent.id))}</p>
          {reports.some(r=>r.agent_id===agent.id)&&<p className="mt-1 text-xs text-muted-foreground">
            Latest signed report: {new Date(reports.find(r=>r.agent_id===agent.id)!.last_received_at).toLocaleString()}
            {" · "}Reports accepted: {reports.find(r=>r.agent_id===agent.id)!.accepted_count}
          </p>}</div>
        {agent.status!=="revoked"&&<button disabled={busy} onClick={()=>revoke(agent.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-400/40 px-3 text-sm text-rose-500"><Trash2 className="h-4 w-4"/> Revoke</button>}
      </div>)}</div>
      {agents.length===0&&<div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground"><CloudOff className="h-5 w-5"/> No enrolled agent identities yet.</div>}
      <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/> Key verification and signed reports do not grant Docker Engine access, prove physical machine ownership, or create an inbound server connection. A fresh report means a trusted enrolled key recently submitted an observation.</p>
    </section>
  </div>;
}
