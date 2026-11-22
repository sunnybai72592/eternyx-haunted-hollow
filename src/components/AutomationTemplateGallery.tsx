import { useEffect, useRef, useState } from "react";
import { BookOpen, CopyCheck, RefreshCcw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type Template = {
  id:string;version:1;name:string;
  category:"engineering"|"security"|"developer"|"operations";
  description:string;stepCount:number;sampleInput:string;
  sampleOutput:string;operations:string[];source:"server_curated_catalog";
};
type Usage = {ok:true;used:number;limit:20;window:"rolling_24_hours"};
function verifyCatalog(raw:unknown):Template[] {
  if(!Array.isArray(raw)||raw.length>16)throw Error("Invalid server-curated template catalog.");
  const ids=new Set<string>();
  return raw.map((item:unknown)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))throw Error("Invalid template item.");
    const t=item as Record<string,unknown>;
    if(typeof t.id!=="string"||! /^[a-z][a-z0-9-]{2,40}$/.test(t.id)||
       ids.has(t.id)||t.version!==1||typeof t.name!=="string"||
       typeof t.description!=="string"||typeof t.sampleInput!=="string"||
       typeof t.sampleOutput!=="string"||
       !["engineering","security","developer","operations"].includes(String(t.category))||
       !Number.isInteger(t.stepCount)||Number(t.stepCount)<1||Number(t.stepCount)>12||
       !Array.isArray(t.operations)||t.operations.length!==t.stepCount||
       !t.operations.every((v:unknown)=>typeof v==="string")||
       t.source!=="server_curated_catalog"){
      throw Error("Unverified template catalog data.");
    }
    ids.add(t.id);
    return item as Template;
  });
}
export default function AutomationTemplateGallery({
  disabled,onInstalled,
}:{
  disabled:boolean;
  onInstalled:(workflowId:string)=>Promise<void>;
}){
  const [templates,setTemplates]=useState<Template[]>([]);
  const [usage,setUsage]=useState<Usage|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  // Same-key transport retry protects against an accidental duplicate workflow
  // when GitHub/Edge returns an ambiguous response.
  const pending=useRef<{id:string;key:string}|null>(null);
  useEffect(()=>{setSelected(null);setTemplates([]);setUsage(null);pending.current=null;},[]);
  const card=templates.find(t=>t.id===selected)??null;
  async function load(){
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.functions.invoke("automation-control",{
        body:{action:"templates"},
      });
      if(error||!data||data.source!=="authenticated_server"||
         data.automaticExecution!==false||data.externalWritesEnabled!==false){
        throw Error("Template catalog is not available from the verified backend.");
      }
      const verified=verifyCatalog(data.templates);
      const quota=data.previewUsage;
      if(!quota||quota.ok!==true||!Number.isInteger(quota.used)||
         quota.used<0||quota.limit!==20||quota.window!=="rolling_24_hours"){
        throw Error("Invalid preview quota metadata.");
      }
      setTemplates(verified);setUsage(quota);
      setNotice(verified.length+" real templates loaded from the database.");
    }catch(e){setError(e instanceof Error?e.message:"Failed to load templates.");}
    finally{setBusy(false);}
  }
  async function install(templateId:string){
    setBusy(true);setError("");setNotice("");
    try{
      const key=pending.current?.id===templateId
        ?pending.current.key:crypto.randomUUID();
      pending.current={id:templateId,key};
      const {data,error}=await supabase.functions.invoke("automation-control",{
        body:{action:"installTemplate",templateId,requestKey:key},
      });
      if(error||data?.ok!==true||typeof data.workflow_id!=="string"||
         data.template_id!==templateId){
        throw Error("Template copy was not confirmed. A transport retry will reuse the same request ID.");
      }
      pending.current=null;
      await onInstalled(data.workflow_id);
      setNotice(data.replayed===true
        ?"Existing template copy loaded; no duplicate created."
        :"New active workflow saved in your account. Existing external triggers remain unchanged.");
    }catch(e){setError(e instanceof Error?e.message:"Template installation failed.");}
    finally{setBusy(false);}
  }
  return <section aria-labelledby="automation-gallery-title"
    className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.025] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 id="automation-gallery-title" className="flex items-center gap-2 text-base font-semibold">
        <BookOpen className="size-4 text-primary"/> Ready-to-use workflow templates
      </h4>
      <Button type="button" size="sm" variant="outline" disabled={busy||disabled}
        onClick={()=>void load()}><RefreshCcw className="mr-2 size-4"/> Load curated gallery</Button>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Choose a server-curated text recipe, inspect its real computed sample output,
      then save a copy to your own account. Each installation uses exactly one of your
      20 workflow slots and creates no webhook, schedule, AI call or GitHub issue.
      A copied workflow can be edited, previewed and explicitly run later.
    </p>
    {usage&&<p className="text-xs text-muted-foreground">
      Separate read-only previews used: {usage.used} / {usage.limit} in rolling 24 hours.
      This is a compute request quota, not a guarantee of zero hosting cost.
    </p>}
    {templates.length>0&&<>
      <div className="grid gap-2 sm:grid-cols-2">
        {templates.map(t=><button type="button" key={t.id}
          className={"rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary "+
            (selected===t.id?"border-primary bg-primary/[0.07]":"border-border/70 bg-background hover:bg-muted/60")}
          disabled={busy||disabled} onClick={()=>setSelected(t.id)}>
          <span className="text-sm font-semibold">{t.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">{t.category} · {t.stepCount} steps</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t.description}</span>
        </button>)}
      </div>
      {card&&<div className="space-y-3 rounded-lg border border-primary/20 bg-background p-3">
        <p className="text-xs font-medium">Real sample execution · {card.operations.join(" → ")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs">Verified sample input
            <Textarea className="mt-1 font-mono text-xs" readOnly rows={5} value={card.sampleInput}/>
          </label>
          <label className="text-xs">Server-computed output
            <Textarea className="mt-1 font-mono text-xs" readOnly rows={5} value={card.sampleOutput}/>
          </label>
        </div>
        <Button type="button" size="sm" disabled={busy||disabled}
          onClick={()=>void install(card.id)}>
          <CopyCheck className="mr-2 size-4"/> Save this template as my workflow
        </Button>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Shield className="mt-0.5 size-4 shrink-0"/> This only copies deterministic,
          curated steps. External execution permissions are not granted.
        </p>
      </div>}
    </>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
