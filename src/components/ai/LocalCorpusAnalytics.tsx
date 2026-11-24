import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {analyzeCorpusFields,formatAnalyticsCounts,formatAnalyticsEvidence,type AnalyticsReport,type ReconciliationStatus} from "@/lib/ai/document-corpus-analytics";
import type {CorpusDocument} from "@/lib/ai/document-corpus-tools";
type Props={documents:readonly CorpusDocument[];disabled:boolean;onCopy:(text:string)=>void};
const labels:Record<ReconciliationStatus,string>={single_source:"Single source",literal_match:"Same literal value",converted_match:"Equivalent after unit conversion",different_values:"Different recorded values",mixed_or_incompatible:"Mixed or incompatible units"};
export default function LocalCorpusAnalytics({documents,disabled,onCopy}:Props){
  const [snapshot,setSnapshot]=useState<{documents:readonly CorpusDocument[];report:AnalyticsReport}|null>(null);
  const [status,setStatus]=useState<ReconciliationStatus|"">("");
  const [filter,setFilter]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState("");
  const report=snapshot?.documents===documents?snapshot.report:null;
  const clear=()=>{setSnapshot(null);setStatus("");setFilter("");setSelected([]);setError("");};
  useEffect(()=>{clear();},[documents]);
  const build=()=>{
    if(disabled||!documents.length)return;
    clear();
    try{setSnapshot({documents,report:analyzeCorpusFields(documents)});}
    catch{setError("Field analysis exceeded local limits (200 distinct fields or 2,000 observations), or source validation failed. No partial report was retained.");}
  };
  const visible=report?.fields.filter(f=>(!status||f.status===status)&&(!filter||f.label.toLowerCase().includes(filter.toLowerCase())))??[];
  const changeFilter=(value:string)=>{setFilter(value);setSelected([]);};
  const changeStatus=(value:ReconciliationStatus|"")=>{setStatus(value);setSelected([]);};
  const exportEvidence=()=>{
    if(!report||disabled||!selected.length)return;
    if(!window.confirm("Copy selected evidence as JSON? It includes source names, original lines, field values and source locations. Review confidential information before sharing."))return;
    try{onCopy(formatAnalyticsEvidence(report,selected));}catch{setError("The selection is no longer valid. Select current fields again.");}
  };
  return <section aria-label="Local cross-document field analytics" className="space-y-3 rounded-xl border border-cyan-400/25 bg-slate-950 p-4">
    <h4 className="font-semibold text-white">Knowledge analytics · field evidence matrix</h4>
    <p className="text-xs text-slate-400">Extract explicit key: value or key = value lines and compare matching field labels across documents. Supported standalone measurements convert into common units; dates, ranges, compound values and unknown units are not interpreted. Same field names may describe different equipment, times or conditions. Differences are review signals, not errors or compliance judgments.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled||!documents.length} onClick={build}>Analyze local fields</Button><Button type="button" variant="outline" disabled={!snapshot} onClick={clear}>Discard analytics</Button></div>
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
    {report&&!disabled&&<>
      <p role="status" className="text-xs text-slate-300">{report.sources.length} sources · {report.fields.length} fields · {report.total} observations · {report.excludedLongFields} matching lines excluded by length limits.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Filter field name<input value={filter} maxLength={60} onChange={e=>changeFilter(e.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2"/></label>
        <label className="text-xs text-slate-300">Comparison status<select value={status} onChange={e=>changeStatus(e.target.value as ReconciliationStatus|"")} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2"><option value="">All statuses</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <p className="text-xs text-slate-400">Showing {visible.length} fields. Each cell shows the number of observations; open a field below for original evidence, units and exact source coordinates. Missing is not zero.</p>
      <div className="max-h-80 overflow-auto rounded border border-slate-700"><table className="w-full text-left text-xs text-slate-300">
        <thead className="sticky top-0 bg-slate-900"><tr><th scope="col" className="p-2">Field / status</th>{report.sources.map(s=><th key={s.id} scope="col" className="max-w-40 break-all p-2">{s.name}</th>)}</tr></thead>
        <tbody>{visible.map(f=><tr key={f.key} className="border-t border-slate-800"><th scope="row" className="p-2 font-normal"><span className="break-words text-white">{f.label}</span><span className="block text-slate-400">{labels[f.status]}</span></th>{report.sources.map(s=>{const count=f.observations.filter(o=>o.sourceId===s.id).length;return <td key={s.id} className="p-2">{count||"Missing"}</td>;})}</tr>)}</tbody>
      </table></div>
      {!visible.length&&<p className="text-xs text-slate-400">No fields match the current filters.</p>}
      <div className="max-h-96 space-y-2 overflow-auto">{visible.map(f=><details key={f.key} className="rounded border border-slate-700 p-2 text-xs text-slate-300">
        <summary className="break-words">{f.label} · {labels[f.status]} · {f.sourceCount} sources · {f.observations.length} observations</summary>
        {f.repeatedSources>0&&<p className="mt-2 text-amber-200">{f.repeatedSources} sources contain repeated observations. Review every occurrence rather than choosing one automatically.</p>}
        <label className="my-2 flex items-center gap-2"><input type="checkbox" checked={selected.includes(f.key)} onChange={e=>{const checked=e.target.checked;setSelected(old=>checked?[...old.filter(k=>k!==f.key),f.key]:old.filter(k=>k!==f.key));}}/>Include field in evidence export</label>
        {f.observations.map(o=><article key={o.sourceId+":"+o.startOffset} className="mt-2 space-y-1 border-t border-slate-800 pt-2">
          <p className="break-all text-cyan-200">{o.sourceName} · line {o.line} · decoded offsets [{o.startOffset}, {o.endOffset})</p>
          <pre className="whitespace-pre-wrap break-all">{o.rawLine}</pre>
          {o.measurement&&<p>Normalized: {Number(o.measurement.canonicalValue.toPrecision(10))} {o.measurement.canonicalUnit} ({o.measurement.dimension})</p>}
        </article>)}
      </details>)}</div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>onCopy(formatAnalyticsCounts(report))}>Copy counts-only analytics</Button><Button type="button" variant="outline" disabled={!selected.length} onClick={exportEvidence}>Copy selected evidence JSON ({selected.length})</Button></div>
    </>}
  </section>;
}
