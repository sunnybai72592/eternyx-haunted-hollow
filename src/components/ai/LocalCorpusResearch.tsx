import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {MAX_RESEARCH_QUESTIONS,MAX_RESEARCH_PLAN_CHARS,encodeResearchPlan,decodeResearchPlan,runResearchPlan,formatResearchCounts,formatResearchEvidence,type ResearchPlan,type ResearchReport,type ResearchSelection} from "@/lib/ai/document-corpus-research";
import type {CorpusDocument} from "@/lib/ai/document-corpus-tools";
type Props={documents:readonly CorpusDocument[];disabled:boolean;onCopy:(text:string)=>void};
export default function LocalCorpusResearch({documents,disabled,onCopy}:Props){
  const [plan,setPlan]=useState<ResearchPlan>({title:"",questions:[]});
  const [sourceIds,setSourceIds]=useState<string[]>([]);
  const [importText,setImportText]=useState("");
  const [snapshot,setSnapshot]=useState<{documents:readonly CorpusDocument[];plan:ResearchPlan;sourceIds:string[];report:ResearchReport}|null>(null);
  const [selection,setSelection]=useState<ResearchSelection[]>([]);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [timeline,setTimeline]=useState(false);
  const [error,setError]=useState("");
  const report=snapshot?.documents===documents&&snapshot.plan===plan&&snapshot.sourceIds===sourceIds?snapshot.report:null;
  const invalidate=()=>{setSnapshot(null);setSelection([]);setNotes({});setTimeline(false);setError("");};
  useEffect(()=>{setSourceIds([]);invalidate();},[documents]);
  const edit=(next:ResearchPlan)=>{setPlan(next);invalidate();};
  const editQuestion=(id:string,patch:Partial<ResearchPlan["questions"][number]>)=>edit({...plan,questions:plan.questions.map(q=>q.id===id?{...q,...patch}:q)});
  const run=()=>{
    if(disabled||!sourceIds.length)return;
    invalidate();
    try{setSnapshot({documents,plan,sourceIds,report:runResearchPlan(documents,plan,sourceIds)});}
    catch{setError("Research blocked by invalid plan, source selection, query or corpus limits.");}
  };
  const copyPlan=()=>{
    try{const raw=encodeResearchPlan(plan);if(window.confirm("Copy the research plan, including its questions and search terms?"))onCopy(raw);}
    catch{setError("Complete all research questions and valid search terms first.");}
  };
  const loadPlan=()=>{
    try{const next=decodeResearchPlan(importText);if(window.confirm("Replace current research questions with this imported plan? No search is run.")){edit(next);setImportText("");}}
    catch{setError("Invalid or unsupported research plan JSON.");}
  };
  const exportEvidence=()=>{
    if(!report||disabled||(!selection.length&&!timeline))return;
    if(!window.confirm("Copy this report with selected source extracts, filenames, questions, human-authored notes and any enabled date mentions? Review confidential content before sharing."))return;
    try{onCopy(formatResearchEvidence(report,selection,notes,timeline));}catch{setError("Report selection or notes are invalid.");}
  };
  const input="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-slate-100";
  return <section aria-label="Local research and evidence reports" className="space-y-3 rounded-xl border border-cyan-400/25 bg-slate-950 p-4">
    <h4 className="font-semibold text-white">Research workspace · comparative evidence reports</h4>
    <p className="text-xs text-slate-400">Run up to six explicit research questions over selected local documents. Each source is searched independently with BM25 lexical ranking; the question is a label and the search terms control retrieval. Two ranked passages per question/source pair are previewed. No matches do not prove absence. Dates are literal standalone YYYY-MM-DD mentions, not verified events or timestamps. Notes are authored by you, not AI.</p>
    <label className="block text-xs text-slate-300">Research title<input value={plan.title} maxLength={100} disabled={disabled} className={input} onChange={e=>edit({...plan,title:e.target.value})}/></label>
    {plan.questions.map((q,i)=><fieldset key={q.id} disabled={disabled} className="space-y-2 rounded border border-slate-700 p-3 text-xs text-slate-300">
      <legend>Question {i+1}</legend>
      <label className="block">Research question<input value={q.question} maxLength={250} className={input} onChange={e=>editQuestion(q.id,{question:e.target.value})}/></label>
      <label className="block">Literal search terms (up to eight distinct words)<input value={q.query} maxLength={120} className={input} onChange={e=>editQuestion(q.id,{query:e.target.value})}/></label>
      <label className="block">Match mode<select value={q.mode} className={input} onChange={e=>editQuestion(q.id,{mode:e.target.value as "all"|"any"})}><option value="all">All terms</option><option value="any">Any term</option></select></label>
      <Button type="button" size="sm" variant="outline" onClick={()=>edit({...plan,questions:plan.questions.filter(x=>x.id!==q.id)})}>Remove question</Button>
    </fieldset>)}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={disabled||plan.questions.length>=MAX_RESEARCH_QUESTIONS} onClick={()=>edit({...plan,questions:[...plan.questions,{id:crypto.randomUUID(),question:"",query:"",mode:"all"}]})}>Add question ({plan.questions.length}/{MAX_RESEARCH_QUESTIONS})</Button>
      <Button type="button" variant="outline" disabled={disabled||!plan.questions.length} onClick={copyPlan}>Copy reusable research plan</Button>
    </div>
    <details className="rounded border border-slate-700 p-2 text-xs text-slate-300"><summary>Import a research plan</summary>
      <label className="block">Plan JSON<textarea rows={3} maxLength={MAX_RESEARCH_PLAN_CHARS} disabled={disabled} value={importText} className={input} onChange={e=>setImportText(e.target.value)}/></label>
      <Button type="button" size="sm" variant="outline" disabled={disabled||!importText.trim()} onClick={loadPlan}>Validate and replace research plan</Button>
    </details>
    <fieldset disabled={disabled} className="space-y-2 rounded border border-slate-700 p-2 text-xs text-slate-300">
      <legend>Research sources</legend>
      {documents.map(d=><label key={d.id} className="flex gap-2 break-all"><input type="checkbox" checked={sourceIds.includes(d.id)} onChange={e=>{const checked=e.target.checked;setSourceIds(old=>checked?[...old.filter(x=>x!==d.id),d.id]:old.filter(x=>x!==d.id));invalidate();}}/>{d.name}</label>)}
      {!documents.length&&<p>No local sources loaded.</p>}
      <Button type="button" variant="outline" size="sm" disabled={!documents.length} onClick={()=>{setSourceIds(documents.map(d=>d.id));invalidate();}}>Select all current sources</Button>
    </fieldset>
    <Button type="button" disabled={disabled||!sourceIds.length||!plan.questions.length} onClick={run}>Run comparative research</Button>
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
    {report&&!disabled&&<div className="space-y-3">
      <p role="status" className="text-xs text-slate-300">{report.sections.length} questions · {report.sourceIds.length} sources · {selection.length}/24 selected passages.</p>
      {report.sections.map(section=><details key={section.question.id} className="rounded border border-slate-700 p-3 text-xs text-slate-300">
        <summary className="break-words font-semibold">{section.question.question} · {section.sources.filter(s=>s.totalMatches>0).length}/{section.sources.length} sources with matches</summary>
        {section.sources.map(src=><article key={src.id} className="mt-3 space-y-2 border-t border-slate-800 pt-2">
          <p className="break-all text-cyan-200">{src.name} · {src.totalMatches} ranked matches · {src.passages.length} previewed</p>
          {src.passages.map(p=>{const checked=selection.some(s=>s.questionId===section.question.id&&s.passageId===p.id);return <label key={p.id} className="flex items-start gap-2 rounded border border-slate-800 p-2">
            <input type="checkbox" checked={checked} disabled={!checked&&selection.length>=24} onChange={e=>{const selected=e.target.checked;setSelection(old=>selected?[...old,{questionId:section.question.id,passageId:p.id}]:old.filter(s=>s.questionId!==section.question.id||s.passageId!==p.id));}}/>
            <span className="min-w-0"><strong>Lines {p.startLine}–{p.endLine} · decoded offsets [{p.startOffset}, {p.endOffset})</strong><span className="mt-1 block whitespace-pre-wrap break-all">{p.text}</span></span>
          </label>;})}
        </article>)}
        <label className="mt-3 block">Your research notes (not verified by the engine)<textarea rows={3} maxLength={1000} value={Object.prototype.hasOwnProperty.call(notes,section.question.id)?notes[section.question.id]:""} className={input} onChange={e=>setNotes(old=>({...old,[section.question.id]:e.target.value}))}/></label>
      </details>)}
      <details className="rounded border border-slate-700 p-3 text-xs text-slate-300"><summary>Date mentions timeline · {report.timeline.total} valid · {report.timeline.invalid} invalid candidates</summary>
        <p className="mt-2 text-amber-200">Showing {report.timeline.events.length} earliest valid mentions. A date in a document is not proof that an event occurred on that date.</p>
        <div className="max-h-80 space-y-2 overflow-auto">{report.timeline.events.map(event=><article key={event.sourceId+":"+event.startOffset} className="border-t border-slate-800 pt-2">
          <p className="break-all text-cyan-200">{event.date} · {event.sourceName} · line {event.line} · decoded offsets [{event.startOffset}, {event.endOffset})</p>
          <pre className="whitespace-pre-wrap break-all">{event.excerpt}</pre>{event.lineTruncated&&<p>Partial line excerpt</p>}
        </article>)}</div>
        <label className="mt-2 flex gap-2"><input type="checkbox" checked={timeline} onChange={e=>setTimeline(e.target.checked)}/>Include displayed date mentions in evidence export</label>
      </details>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>onCopy(formatResearchCounts(report))}>Copy counts-only research report</Button><Button type="button" variant="outline" disabled={!selection.length&&!timeline} onClick={exportEvidence}>Copy reviewed evidence report JSON</Button><Button type="button" variant="outline" onClick={invalidate}>Discard research results</Button></div>
    </div>}
  </section>;
}
