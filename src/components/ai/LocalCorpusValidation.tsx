import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {MAX_VALIDATION_RULES,MAX_TEMPLATE_CHARS,RULE_OPERATORS,validateTemplate,encodeValidationTemplate,decodeValidationTemplate,runValidationTemplate,formatValidationCounts,formatValidationExceptions,type ValidationRule,type ValidationTemplate,type ValidationReport,type ValidationStatus,type RuleOperator} from "@/lib/ai/document-corpus-validation";
import type {CorpusDocument} from "@/lib/ai/document-corpus-tools";
type Props={documents:readonly CorpusDocument[];disabled:boolean;onCopy:(text:string)=>void};
const blank=():ValidationRule=>({id:crypto.randomUUID(),field:"",operator:"present",expected:"",minimum:"",maximum:""});
const statusLabels:Record<ValidationStatus,string>={match:"Rule match",exception:"Rule exception",missing:"No extracted field",review:"Needs review"};
export default function LocalCorpusValidation({documents,disabled,onCopy}:Props){
  const [template,setTemplate]=useState<ValidationTemplate>({name:"",rules:[]});
  const [selected,setSelected]=useState<string[]>([]);
  const [importText,setImportText]=useState("");
  const [snapshot,setSnapshot]=useState<{documents:readonly CorpusDocument[];template:ValidationTemplate;selected:string[];report:ValidationReport}|null>(null);
  const [filter,setFilter]=useState<ValidationStatus|"">("");
  const [error,setError]=useState("");
  const report=snapshot?.documents===documents&&snapshot.template===template&&snapshot.selected===selected?snapshot.report:null;
  const invalidate=()=>{setSnapshot(null);setFilter("");setError("");};
  useEffect(()=>{setSelected([]);setSnapshot(null);setFilter("");setError("");},[documents]);
  const editTemplate=(next:ValidationTemplate)=>{setTemplate(next);invalidate();};
  const updateRule=(id:string,patch:Partial<ValidationRule>)=>editTemplate({...template,rules:template.rules.map(rule=>rule.id===id?{...rule,...patch}:rule)});
  const changeOperator=(id:string,operator:RuleOperator)=>updateRule(id,{operator,expected:"",minimum:"",maximum:""});
  const load=()=>{
    try{
      const next=decodeValidationTemplate(importText);
      if(!window.confirm("Replace the current local rule template with the imported rules? This does not evaluate any documents."))return;
      editTemplate(next);setImportText("");
    }catch{setError("Template rejected. Check the supported JSON format, field names, operators and compatible ordered range bounds.");}
  };
  const copyTemplate=()=>{
    try{
      const encoded=encodeValidationTemplate(template);
      if(window.confirm("Copy this reusable rule template? It includes field names and user-defined expected values or thresholds."))onCopy(encoded);
    }catch{setError("Complete and validate all rules before exporting the template.");}
  };
  const run=()=>{
    if(disabled||!selected.length)return;
    invalidate();
    try{
      const checked=validateTemplate(template);
      setSnapshot({documents,template,selected,report:runValidationTemplate(documents,checked,selected)});
    }catch{setError("Evaluation blocked: invalid template, selected sources, range bounds, or extraction limits. No partial report retained.");}
  };
  const toggleSource=(id:string,checked:boolean)=>{setSelected(old=>checked?[...old.filter(x=>x!==id),id]:old.filter(x=>x!==id));invalidate();};
  const copyExceptions=()=>{
    if(!report||disabled)return;
    if(window.confirm("Copy the exception report with source names, original evidence lines and rule thresholds? Review confidential content before sharing."))onCopy(formatValidationExceptions(report));
  };
  const inputClass="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-slate-100";
  return <section aria-label="Local reusable knowledge validation" className="space-y-3 rounded-xl border border-cyan-400/25 bg-slate-950 p-4">
    <h4 className="font-semibold text-white">Knowledge automation · reusable validation templates</h4>
    <p className="text-xs text-slate-400">Explicit local evaluation of literal extracted fields. No scheduling, AI inference or automatic compliance decision. Text comparisons are case-sensitive; range rules require standalone supported units and inclusive bounds. Every repeated value must match. A match is only against your rule, not a certification or a verified measurement.</p>
    <label className="block text-xs text-slate-300">Template name<input value={template.name} maxLength={80} disabled={disabled} onChange={e=>editTemplate({...template,name:e.target.value})} className={inputClass}/></label>
    <div className="space-y-2">{template.rules.map((rule,i)=><fieldset key={rule.id} disabled={disabled} className="space-y-2 rounded border border-slate-700 p-3 text-xs text-slate-300">
      <legend className="px-1">Rule {i+1}</legend>
      <label className="block">Literal field name<input value={rule.field} maxLength={60} onChange={e=>updateRule(rule.id,{field:e.target.value})} className={inputClass}/></label>
      <label className="block">Operator<select value={rule.operator} onChange={e=>changeOperator(rule.id,e.target.value as RuleOperator)} className={inputClass}>{RULE_OPERATORS.map(op=><option key={op} value={op}>{op==="present"?"Field exists":op==="equals"?"Exact text":op==="contains"?"Contains literal text":"Inclusive measurement range"}</option>)}</select></label>
      {(rule.operator==="equals"||rule.operator==="contains")&&<label className="block">Expected text<input value={rule.expected} maxLength={240} onChange={e=>updateRule(rule.id,{expected:e.target.value})} className={inputClass}/></label>}
      {rule.operator==="range"&&<div className="grid gap-2 sm:grid-cols-2">
        <label>Minimum with unit<input value={rule.minimum} maxLength={80} placeholder="e.g. 1 V" onChange={e=>updateRule(rule.id,{minimum:e.target.value})} className={inputClass}/></label>
        <label>Maximum with unit<input value={rule.maximum} maxLength={80} placeholder="e.g. 2 V" onChange={e=>updateRule(rule.id,{maximum:e.target.value})} className={inputClass}/></label>
      </div>}
      <Button type="button" size="sm" variant="outline" onClick={()=>editTemplate({...template,rules:template.rules.filter(r=>r.id!==rule.id)})}>Remove rule {i+1}</Button>
    </fieldset>)}</div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={disabled||template.rules.length>=MAX_VALIDATION_RULES} onClick={()=>editTemplate({...template,rules:[...template.rules,blank()]})}>Add rule ({template.rules.length}/{MAX_VALIDATION_RULES})</Button>
      <Button type="button" variant="outline" disabled={disabled||!template.rules.length} onClick={copyTemplate}>Copy reusable template JSON</Button>
    </div>
    <details className="rounded border border-slate-700 p-2 text-xs text-slate-300">
      <summary>Import a previously exported rule template</summary>
      <label className="mt-2 block">Template JSON<textarea rows={4} value={importText} maxLength={MAX_TEMPLATE_CHARS} disabled={disabled} onChange={e=>setImportText(e.target.value)} className={inputClass}/></label>
      <Button type="button" size="sm" variant="outline" disabled={disabled||!importText.trim()} onClick={load}>Validate and replace template</Button>
    </details>
    <fieldset disabled={disabled} className="space-y-2 rounded border border-slate-700 p-3 text-xs text-slate-300">
      <legend className="px-1">Select documents for batch evaluation</legend>
      {documents.map(d=><label key={d.id} className="flex items-start gap-2 break-all"><input type="checkbox" checked={selected.includes(d.id)} onChange={e=>toggleSource(d.id,e.target.checked)}/>{d.name}</label>)}
      {!documents.length&&<p>No local sources loaded.</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!documents.length} onClick={()=>{setSelected(documents.map(d=>d.id));invalidate();}}>Select all current sources</Button><Button type="button" size="sm" variant="outline" disabled={!selected.length} onClick={()=>{setSelected([]);invalidate();}}>Clear selection</Button></div>
    </fieldset>
    <Button type="button" disabled={disabled||!selected.length||!template.rules.length} onClick={run}>Run local validation batch</Button>
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
    {report&&!disabled&&<div className="space-y-2">
      <p role="status" className="text-xs text-slate-300">{report.rows.length} evaluations · {report.counts.match} matches · {report.counts.exception} exceptions · {report.counts.missing} missing · {report.counts.review} need review.</p>
      <label className="block text-xs text-slate-300">Filter evaluation status<select value={filter} onChange={e=>setFilter(e.target.value as ValidationStatus|"")} className={inputClass}><option value="">All statuses</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <div className="max-h-96 space-y-2 overflow-auto">{report.rows.filter(row=>!filter||row.status===filter).map(row=><details key={row.sourceId+":"+row.ruleId} className="rounded border border-slate-700 p-2 text-xs text-slate-300">
        <summary className="break-all">{row.sourceName} · {row.field} · {statusLabels[row.status]}</summary>
        <p className="mt-2">{row.reason}</p>
        {row.observations.map(o=><div key={o.startOffset} className="mt-2 border-t border-slate-800 pt-2"><p>Line {o.line} · decoded offsets [{o.startOffset}, {o.endOffset})</p><pre className="whitespace-pre-wrap break-all">{o.rawLine}</pre></div>)}
      </details>)}</div>
      {!report.rows.some(row=>!filter||row.status===filter)&&<p className="text-xs text-slate-400">No evaluations with this status.</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>onCopy(formatValidationCounts(report))}>Copy counts-only validation report</Button><Button type="button" variant="outline" onClick={copyExceptions}>Copy exception evidence JSON</Button><Button type="button" variant="outline" onClick={invalidate}>Discard evaluation</Button></div>
    </div>}
  </section>;
}
