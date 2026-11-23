import {useEffect,useRef,useState} from "react";
import {PackageCheck,Download,RefreshCcw,ShieldAlert,ClipboardCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {supabase} from "@/integrations/supabase/client";
import {verifiedAuditPackageInbox,auditPackageSafeExport,auditPackageCsv}
  from "@/lib/automationAuditPackages.mjs";
type Inbox=ReturnType<typeof verifiedAuditPackageInbox>;
type Case={id:string;title:string;status:string;revision:number;severity:string};
type Choice="needs_attention"|"reviewed_for_manual_release_checklist";
async function invoke(action:string,params:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke("automation-control",{
    body:{action,...params},
  });
  if(error){
    let message="Audit package service unavailable; check the migration and Edge deployment.";
    try{
      const response=error.context as Response;
      if(response&&typeof response.json==="function"){
        const body=await response.json();
        if(typeof body?.code==="string"&&body.code.length<=70)message+=" ("+body.code+")";
      }
    }catch{/* do not expose credentials or raw server errors */}
    throw Error(message);
  }
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw Error("Unexpected audit package server response.");
  }
  return data as Record<string,unknown>;
}
function savedFile(name:string,content:string,type:string){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
function readableDate(v:string){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"Unknown":d.toLocaleString();
}
const stages=[
  "Required database migration applied and verified in the target environment",
  "Authenticated automation-control Edge Function redeployed in the target environment",
  "Updated frontend deployed and authenticated owner scenario tested",
  "All required GitHub CI checks personally confirmed green for the release commit",
  "Staging cross-account isolation and no-execution acceptance personally verified",
] as const;
export default function AutomationAuditPackagePanel({disabled}:{disabled:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [cases,setCases]=useState<Case[]>([]);
  const [selected,setSelected]=useState("");
  const [inbox,setInbox]=useState<Inbox|null>(null);
  const [raw,setRaw]=useState<Record<string,unknown>|null>(null);
  const [evidenceId,setEvidenceId]=useState("");
  const [packageId,setPackageId]=useState("");
  const [decision,setDecision]=useState<Choice>("needs_attention");
  const [reviewNote,setReviewNote]=useState("");
  const [ackSource,setAckSource]=useState(false);
  const [ackDeploy,setAckDeploy]=useState(false);
  const [ackCrypto,setAckCrypto]=useState(false);
  const [manualChecks,setManualChecks]=useState<boolean[]>(stages.map(()=>false));
  const createPending=useRef<{signature:string;key:string}|null>(null);
  const reviewPending=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{
    setInbox(null);setRaw(null);setEvidenceId("");setPackageId("");
    setReviewNote("");setManualChecks(stages.map(()=>false));
    setAckSource(false);setAckDeploy(false);setAckCrypto(false);
    createPending.current=null;reviewPending.current=null;
  },[selected]);
  async function perform(job:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await job();}
    catch(e){setError(e instanceof Error?e.message:"Audit review request failed.");}
    finally{setBusy(false);}
  }
  async function loadCases(){
    const r=await invoke("incidentInbox",{limit:30});
    if(r.ok!==true||r.source!=="authenticated_server"||
       r.allFailuresMeasured!==false||!Array.isArray(r.rows)||
       r.rows.length>30){
      throw Error("Owner incident discovery is unverified.");
    }
    const list=r.rows as Case[];
    if(list.some(c=>typeof c.id!=="string"||typeof c.title!=="string"||
      !["open","investigating","resolved"].includes(c.status)||
      !Number.isInteger(c.revision))){
      throw Error("Incorrect case metadata from the owner inbox.");
    }
    setCases(list);
    if(selected&&!list.some(c=>c.id===selected))setSelected("");
    setNotice("Loaded only stored owner cases, not synthetic incident alerts.");
  }
  async function loadInbox(id=selected){
    if(!id)throw Error("Select a real case first.");
    const r=await invoke("incidentAuditPackageInbox",{incidentId:id});
    if(r.ok!==true||r.source!=="authenticated_server"||r.incidentId!==id||
       r.releaseVerified!==false||r.externalExecutionTriggered!==false){
      throw Error("Audit package source is not authenticated.");
    }
    const checked=verifiedAuditPackageInbox(r);
    setRaw(r);setInbox(checked);
    setEvidenceId(e=>checked.evidence.some(x=>x.id===e)?e:(checked.evidence[0]?.id??""));
    setPackageId(p=>checked.packages.some(x=>x.id===p)?p:(checked.packages[0]?.id??""));
    setNotice("Loaded real owner evidence, immutable metadata snapshots and manual review history.");
  }
  async function createPackage(){
    if(!inbox||!selected||inbox.incidentId!==selected||
       !inbox.caseConsistent||
       !inbox.evidence.some(x=>x.id===evidenceId)){
      throw Error("Select an evidence-backed case with consistent stored ledgers.");
    }
    if(inbox.packageCount>=8)throw Error("This case reached the eight-package safety limit.");
    if(!window.confirm("Capture a PRIVATE metadata-only audit package from the current case and selected evidence? No job or deployment will run."))return;
    const signature=JSON.stringify(["create",selected,inbox.incidentRevision,evidenceId]);
    const requestKey=createPending.current?.signature===signature
      ?createPending.current.key:crypto.randomUUID();
    createPending.current={signature,key:requestKey};
    const r=await invoke("incidentAuditPackageCreate",{
      incidentId:selected,incidentRevision:inbox.incidentRevision,
      evidenceId,requestKey,
    });
    if(r.ok!==true||r.source!=="authenticated_server"||
       r.incidentId!==selected||typeof r.packageId!=="string"||
       r.automaticRelease!==false||r.externalExecutionTriggered!==false){
      throw Error("Could not verify audit package creation; retries retain the original request UUID.");
    }
    createPending.current=null;
    await loadInbox();
    setNotice("Immutable source-backed audit snapshot captured. This does NOT certify a release.");
  }
  async function recordReview(){
    const item=inbox?.packages.find(p=>p.id===packageId);
    if(!item)throw Error("Choose a stored audit package.");
    if(reviewNote.trim().length<12||reviewNote.trim().length>500){
      throw Error("Enter a 12–500-character nonsecret review note.");
    }
    if(decision==="reviewed_for_manual_release_checklist"&&
       (!item.current||!inbox?.caseConsistent||
        !ackSource||!ackDeploy||!ackCrypto)){
      throw Error("A current consistent package and all three limitation acknowledgments are required.");
    }
    if(item.reviewCount>=8)throw Error("This package reached its review limit.");
    if(!window.confirm("Record YOUR manual "+decision.replaceAll("_"," ")+" attestation? This will not promote a release, run jobs or change the incident."))return;
    const note=reviewNote.trim();
    const signature=JSON.stringify(["review",item.id,decision,note,ackSource,ackDeploy,ackCrypto]);
    const requestKey=reviewPending.current?.signature===signature
      ?reviewPending.current.key:crypto.randomUUID();
    reviewPending.current={signature,key:requestKey};
    const r=await invoke("incidentAuditPackageReview",{
      packageId:item.id,decision,note,
      acknowledgedSource:ackSource,acknowledgedNoDeployment:ackDeploy,
      acknowledgedNoCryptoProof:ackCrypto,requestKey,
    });
    if(r.ok!==true||r.source!=="authenticated_server"||
       r.decision!==decision||typeof r.reviewId!=="string"||
       r.manualAttestationOnly!==true||r.automaticRelease!==false||
       r.externalExecutionTriggered!==false){
      throw Error("Manual review receipt was not verified; retry will preserve its UUID.");
    }
    reviewPending.current=null;setReviewNote("");
    setAckSource(false);setAckDeploy(false);setAckCrypto(false);
    await loadInbox();
    setNotice("Immutable human review recorded. No deployment, restoration or execution occurred.");
  }
  const active=inbox?.packages.find(p=>p.id===packageId);
  return <section aria-labelledby="eternyx-phase-2t-title"
    className="space-y-4 rounded-xl border border-primary/20 p-4">
    <h4 id="eternyx-phase-2t-title" className="flex items-center gap-2 font-semibold">
      <PackageCheck className="size-4 text-primary"/> Evidence-backed audit packages & manual release review
    </h4>
    <p className="text-xs leading-5 text-muted-foreground">
      Capture bounded factual metadata from persisted incident/evidence records,
      inspect a private immutable package, and record a human review decision.
      No package is cryptographically signed or proof of operational health,
      successful deployment or release approval.
    </p>
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Select a real incident and its evidence</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
          onClick={()=>void perform(loadCases)}>
          <RefreshCcw className="mr-2 size-4"/> Load owner incidents
        </Button>
        <label className="text-xs">Incident
          <select value={selected} disabled={disabled||busy}
            onChange={e=>setSelected(e.target.value)}
            className="ml-2 max-w-56 rounded border border-input bg-background p-2">
            <option value="">Select stored case</option>
            {cases.map(c=><option key={c.id} value={c.id}>
              {c.title.slice(0,52)} · {c.status}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline"
          disabled={disabled||busy||!selected}
          onClick={()=>void perform(()=>loadInbox())}>Load case packages</Button>
      </div>
      {inbox&&<>
        <p className="text-xs text-muted-foreground">
          Incident: <strong>{inbox.incidentStatus}</strong> · revision
          {" "}{inbox.incidentRevision} · source-ledger consistency:
          {" "}{inbox.caseConsistent?"pass":"needs review"} ·
          {inbox.evidence.length} actual evidence receipts ·
          {inbox.packageCount} immutable packages.
        </p>
        <label className="block text-xs">Source evidence receipt
          <select value={evidenceId} disabled={disabled||busy}
            onChange={e=>setEvidenceId(e.target.value)}
            className="mt-1 w-full rounded border border-input bg-background p-2">
            {inbox.evidence.length===0&&<option value="">No captured evidence</option>}
            {inbox.evidence.map(e=><option key={e.id} value={e.id}>
              {e.kind.replaceAll("_"," ")} · {readableDate(e.capturedAt)}
              {" · "}{e.id.slice(0,8)}
            </option>)}
          </select>
        </label>
        <Button type="button" size="sm" disabled={disabled||busy||
          !inbox.caseConsistent||!evidenceId||inbox.packageCount>=8}
          onClick={()=>void perform(createPackage)}>
          Capture private metadata-only package
        </Button>
      </>}
    </div>
    {inbox&&<div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Stored audit packages and historical reviews</p>
      {inbox.packages.length===0&&<p className="text-xs text-muted-foreground">
        No audit package has been captured for this case.</p>}
      {inbox.packages.length>0&&<>
        <label className="block text-xs">Stored package
          <select className="mt-1 w-full rounded border border-input bg-background p-2"
            disabled={disabled||busy} value={packageId}
            onChange={e=>{setPackageId(e.target.value);setReviewNote("");
              setAckSource(false);setAckDeploy(false);setAckCrypto(false);}}>
            {inbox.packages.map(p=><option key={p.id} value={p.id}>
              {p.id.slice(0,8)} · case revision {p.incidentRevision}
              {" · "}{p.current?"current":"outdated"} ·
              {" "}{readableDate(p.capturedAt)}
            </option>)}
          </select>
        </label>
        {active&&<div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">
            {active.current?"Package matches current stored source metadata.":
              "Package is historical: captured source metadata changed."}
          </p>
          <p>Case at capture: {active.snapshot.incidentStatus} ·
            revision {active.snapshot.incidentRevision} ·
            evidence count {active.snapshot.capturedEvidenceCount} ·
            audit rows {active.snapshot.auditLedgerCount}/
            {active.snapshot.auditProjectionCount}.</p>
          <p>Plan at capture: {active.snapshot.hasPlan?
            active.snapshot.planStage:"No investigation plan"} ·
            selected steps {active.snapshot.plannedSteps} ·
            recorded review acknowledgments {active.snapshot.acknowledgedSteps}.</p>
          {!active.current&&<p className="flex gap-2 items-center">
            <ShieldAlert className="size-4 shrink-0"/>
            To attest reviewed, capture a new package from current source
            records. You can still record needs attention on an older package.
          </p>}
          <p>Historical review receipts: {active.reviewCount} (maximum eight).</p>
          <ol className="max-h-48 space-y-2 overflow-y-auto">
            {active.reviews.map(r=><li key={r.id}
              className="rounded border border-border/60 p-2">
              <p className="font-medium">{r.decision.replaceAll("_"," ")}
                {" · "}{readableDate(r.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap">{r.note}</p>
            </li>)}
          </ol>
        </div>}
        {active&&active.reviewCount<8&&<div className="space-y-3">
          <label className="block text-xs">Owner review decision
            <select className="mt-1 w-full rounded border border-input bg-background p-2"
              disabled={disabled||busy} value={decision}
              onChange={e=>setDecision(e.target.value as Choice)}>
              <option value="needs_attention">Needs attention — block human sign-off</option>
              <option value="reviewed_for_manual_release_checklist">
                Reviewed for a separate MANUAL deployment checklist
              </option>
            </select>
          </label>
          {decision==="reviewed_for_manual_release_checklist"&&
            <div className="space-y-2 text-xs text-muted-foreground">
              <label className="flex gap-2 items-center">
                <Checkbox disabled={disabled||busy} checked={ackSource}
                  onCheckedChange={v=>setAckSource(v===true)}/>
                I personally inspected the stored metadata/evidence references.
              </label>
              <label className="flex gap-2 items-center">
                <Checkbox disabled={disabled||busy} checked={ackDeploy}
                  onCheckedChange={v=>setAckDeploy(v===true)}/>
                This review does not deploy, approve or enable anything.
              </label>
              <label className="flex gap-2 items-center">
                <Checkbox disabled={disabled||busy} checked={ackCrypto}
                  onCheckedChange={v=>setAckCrypto(v===true)}/>
                Database consistency is not cryptographic integrity, uptime or CI proof.
              </label>
            </div>}
          <label className="block text-xs">Private review note (12–500 characters)
            <Textarea rows={3} maxLength={500} value={reviewNote}
              disabled={disabled||busy}
              className="mt-1" onChange={e=>setReviewNote(e.target.value)}/>
          </label>
          <Button type="button" size="sm" variant="outline" disabled={disabled||busy||
             reviewNote.trim().length<12||
             (decision==="reviewed_for_manual_release_checklist"&&
               (!active.current||!inbox.caseConsistent||
                !ackSource||!ackDeploy||!ackCrypto))}
             onClick={()=>void perform(recordReview)}>
            <ClipboardCheck className="mr-2 size-4"/> Record human audit review
          </Button>
        </div>}
      </>}
      {raw&&inbox.packages.length>0&&<div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
          onClick={()=>savedFile("eternyx-owner-audit-packages.json",
            JSON.stringify(auditPackageSafeExport(raw),null,2),
            "application/json;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Safe JSON (no notes)
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled||busy}
          onClick={()=>savedFile("eternyx-owner-audit-packages.csv",
            auditPackageCsv(raw),"text/csv;charset=utf-8")}>
          <Download className="mr-2 size-4"/> Safe CSV
        </Button>
      </div>}
    </div>}
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Manual release-readiness checklist (local only)</p>
      <p className="text-xs text-muted-foreground">
        These are personal tick-box confirmations, not live integrations
        with Supabase, GitHub Actions or the deployment environment.
        They are never sent to the backend and do not grant release permission.
      </p>
      <div className="space-y-2">
        {stages.map((name,i)=><label key={i}
          className="flex items-center gap-2 rounded border border-border/60 p-2 text-xs">
          <Checkbox disabled={disabled||busy} checked={manualChecks[i]}
            onCheckedChange={v=>setManualChecks(old=>old.map((x,j)=>j===i?v===true:x))}/>
          <span>{name}</span>
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">
        {manualChecks.filter(Boolean).length}/{stages.length} manually checked.
        {" "}{manualChecks.every(Boolean)?
          "You marked each release step complete; this is NOT a server-verified deployment or release approval.":
          "Deployment readiness is not verified. Complete and independently confirm the required release steps."}
      </p>
      <Button type="button" size="sm" variant="outline"
        disabled={disabled||busy}
        onClick={()=>setManualChecks(stages.map(()=>false))}>
        Reset local checklist
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      Packages and reviews are private owner metadata and human attestations.
      They do not produce signed attestations, raw evidence files, external
      verification, CI results, automatic fixes, or executable deployment permits.
    </p>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
