import {useState} from "react";
import {Button} from "@/components/ui/button";
import {discoverCorpus,formatDiscoveryCounts} from "@/lib/ai/document-corpus-discovery";
import type {CorpusDocument} from "@/lib/ai/document-corpus-tools";
type Props={documents:readonly CorpusDocument[];disabled:boolean;onSearch:(term:string)=>void;onCopy:(text:string)=>void};
export default function LocalCorpusDiscovery({documents,disabled,onSearch,onCopy}:Props){
  const [snapshot,setSnapshot]=useState<{documents:readonly CorpusDocument[];report:ReturnType<typeof discoverCorpus>}|null>(null);
  const [filter,setFilter]=useState("");
  const [error,setError]=useState("");
  const report=snapshot?.documents===documents?snapshot.report:null;
  const build=()=>{
    if(disabled||!documents.length)return;
    setSnapshot(null);setFilter("");setError("");
    try{setSnapshot({documents,report:discoverCorpus(documents)});}
    catch{setError("Discovery could not complete within local corpus limits.");}
  };
  const search=(term:string)=>{if(report&&!disabled)onSearch(term);};
  return <section aria-label="Local cross-document discovery" className="space-y-3 rounded-xl border border-cyan-400/25 bg-slate-950 p-4">
    <h4 className="font-semibold text-white">Cross-document discovery · local knowledge map</h4>
    <p className="text-xs text-slate-400">Profiles show declared source type, observed structure and literal key/value lines. Relationships use TF-IDF cosine similarity over normalized words, not embeddings or semantic agreement. A small English stop-word list is applied; other languages may include common words. Identical decoded text is not proof of independent sources or common authorship.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled||!documents.length} onClick={build}>Discover local source relationships</Button>
      <Button type="button" variant="outline" disabled={!snapshot} onClick={()=>{setSnapshot(null);setFilter("");setError("");}}>Discard discovery</Button></div>
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
    {report&&!disabled&&<>
      <p role="status" className="text-xs text-slate-300">{report.profiles.length} source profiles · {report.relationships.length} related pairs · {report.relationships.filter(r=>r.exact).length} exact decoded-text duplicate pairs.</p>
      <label className="block text-xs text-slate-300">Filter source profiles and relationships
        <select value={filter} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" onChange={e=>setFilter(e.target.value)}>
          <option value="">All sources</option>{report.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      <h5 className="text-sm font-semibold text-white">Shared vocabulary</h5>
      <div className="flex flex-wrap gap-2">{report.themes.map(t=><button type="button" key={t.term} className="rounded border border-slate-700 px-2 py-1 text-xs text-cyan-200 break-all" onClick={()=>search(t.term)}>{t.term} · {t.sourceCount} sources</button>)}</div>
      {!report.themes.length&&<p className="text-xs text-slate-400">No eligible shared words across sources.</p>}
      <p className="text-xs text-slate-400">Select a term to run a fresh indexed search across the entire corpus.</p>
      <h5 className="text-sm font-semibold text-white">Related source pairs</h5>
      {report.relationships.filter(r=>!filter||r.leftId===filter||r.rightId===filter).map(r=><article key={r.leftId+":"+r.rightId} className="space-y-2 rounded border border-slate-700 p-2 text-xs text-slate-300">
        <p className="break-all font-semibold">{r.leftName} ↔ {r.rightName}</p>
        <p>{r.exact?"Exact decoded-text duplicate · ":""}Cosine overlap {r.cosine.toFixed(3)} · {r.sharedCount} shared terms</p>
        <div className="h-1.5 rounded bg-slate-800" aria-hidden="true"><div className="h-full rounded bg-cyan-500" style={{width:(r.cosine*100)+"%"}}/></div>
        <div className="flex flex-wrap gap-2">{r.sharedTerms.map(term=><button type="button" key={term} onClick={()=>search(term)} className="text-cyan-300 underline break-all">{term}</button>)}</div>
      </article>)}
      {!report.relationships.some(r=>!filter||r.leftId===filter||r.rightId===filter)&&<p className="text-xs text-slate-400">No related pairs for this selection.</p>}
      <h5 className="text-sm font-semibold text-white">Source structure and fields</h5>
      {report.profiles.filter(p=>!filter||p.id===filter).map(p=><details key={p.id} className="rounded border border-slate-700 p-2 text-xs text-slate-300">
        <summary className="break-all">{p.name} · {p.kind.toUpperCase()} · {p.lines} decoded lines</summary>
        <p className="mt-2">{p.characters} characters · {p.distinctTerms} eligible distinct words · {p.headings} Markdown-style headings · {p.cellLines} cell-reference-like lines.</p>
        <p className="break-words">Frequent words: {p.topTerms.map(t=>t.term+" ("+t.count+")").join(", ")||"none"}</p>
        <p>{p.fields.length} of {p.fieldCount} literal key/value lines displayed. No inferred values.</p>
        {p.fields.map(f=><p key={f.line} className="break-all">Line {f.line} · {f.key}: {f.value}</p>)}
      </details>)}
      <Button type="button" variant="outline" onClick={()=>onCopy(formatDiscoveryCounts(report))}>Copy counts-only discovery report</Button>
    </>}
  </section>;
}
