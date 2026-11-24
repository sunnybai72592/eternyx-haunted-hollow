import {useRef,useState,useEffect} from "react";
import {Button} from "@/components/ui/button";
import {extractOfficeDocument,planOfficeImport,type OfficeExtract} from "@/lib/ai/document-corpus-office";
import {MAX_OFFICE_BYTES} from "@/lib/ai/document-corpus-office-zip";
import type {CorpusDocument} from "@/lib/ai/document-corpus-tools";
type Props={existing:readonly CorpusDocument[];disabled:boolean;onImport:(next:CorpusDocument[])=>void};
export default function LocalOfficeCorpusImport({existing,disabled,onImport}:Props){
  const [report,setReport]=useState<OfficeExtract|null>(null);
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const version=useRef(0);
  useEffect(()=>()=>{version.current++;},[]);
  const discard=()=>{version.current++;setReport(null);setSelected([]);setBusy(false);setError("");};
  const read=async(file:File)=>{
    discard();const n=version.current;setBusy(true);
    try{
      if(!file.size||file.size>MAX_OFFICE_BYTES||! /\.(docx|xlsx)$/i.test(file.name))throw new Error("invalid_office_file");
      const result=await extractOfficeDocument(file.name,new Uint8Array(await file.arrayBuffer()));
      if(version.current===n)setReport(result);
    }catch(reason){if(version.current===n)setError(reason instanceof Error&&reason.message==="office_browser_unsupported"?"This browser cannot decompress Office ZIP parts. Try a current browser or export plain text/CSV.":"Office extraction rejected: unsupported, invalid, encrypted, oversized, or no readable text. No sources added.");}
    finally{if(version.current===n)setBusy(false);}
  };
  const free=Math.max(0,8-existing.length);
  const importSelected=()=>{
    if(!report||!selected.length||busy||disabled)return;
    try{
      const plan=planOfficeImport(existing,report,selected,selected.map(()=>crypto.randomUUID()));
      if(!window.confirm("Add selected extracted Office sections to the local knowledge workspace? Original binary files and formatting are not retained."))return;
      onImport(plan);discard();
    }catch{setError("Import blocked by duplicate names or corpus limits. No sources added.");}
  };
  return <section aria-label="Local Office document ingestion" className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-950 p-4">
    <h3 className="font-semibold text-white">Local Word and Excel ingestion</h3>
    <p className="text-xs text-slate-400">Read DOCX main-body paragraphs and XLSX worksheet cell values in this browser. No uploads, macros, formula execution or external links. Dates and numbers are raw values, not formatted displays. Hidden worksheets are labeled; headers, footnotes, images, charts, comments and legacy DOC/XLS are not extracted. Maximum 8 MiB archive, 100,000 extracted characters, 30 sheets and 20,000 cells.</p>
    <label className="block text-sm text-slate-300">Choose DOCX or XLSX<input type="file" accept=".docx,.xlsx" disabled={disabled||busy} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs" onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value="";if(file)void read(file);}}/></label>
    {busy&&<p role="status" className="text-xs text-slate-300">Extracting local Office text…</p>}
    {report&&<div className="space-y-2">
      <p className="break-all text-xs text-slate-300">{report.name} · {report.sections.length} nonempty sections · {report.characters.toLocaleString()} decoded characters · {report.formulaCells} formula cells ({report.missingFormulaCache} missing cached values).</p>
      <p className="text-xs text-amber-200">Cached formula values may be stale. Review extracted text before relying on it. Preview shows the first 1,000 characters per section; import retains the full extracted section.</p>
      <div className="max-h-80 space-y-2 overflow-auto">{report.sections.map((section,i)=><label key={i} className="flex gap-2 rounded border border-slate-800 p-2 text-xs text-slate-300">
        <input type="checkbox" checked={selected.includes(i)} disabled={disabled||(!selected.includes(i)&&selected.length>=free)} onChange={e=>{const checked=e.target.checked;setSelected(old=>checked?[...old,i]:old.filter(x=>x!==i));}}/>
        <span className="min-w-0"><strong>{section.label} · {section.text.length.toLocaleString()} characters</strong><span className="mt-1 block whitespace-pre-wrap break-all">{section.text.slice(0,1000)}{section.text.length>1000?"\n[preview truncated]":""}</span></span>
      </label>)}</div>
      <p className="text-xs text-slate-300">{selected.length} selected · {free} local source slots available.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={disabled||busy||!selected.length||selected.length>free} onClick={importSelected}>Import selected Office sections locally</Button><Button type="button" variant="outline" onClick={discard}>Discard Office preview</Button></div>
    </div>}
    {busy&&<Button type="button" variant="outline" onClick={discard}>Discard pending extraction result</Button>}
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
  </section>;
}
