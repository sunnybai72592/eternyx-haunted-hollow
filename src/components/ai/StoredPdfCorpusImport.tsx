import {useEffect,useRef,useState} from "react";
import {Link} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {supabase} from "@/integrations/supabase/client";
import {useAuthStore} from "@/store/authStore";
import {inspectStoredPdfChunks,planStoredPdfImport,validateReadyPdf,MAX_STORED_PDF_CHUNKS,type StoredPdfDocument,type StoredPdfChunk} from "@/lib/ai/document-corpus-pdf-import";
import type {CorpusDocument} from "@/lib/ai/document-corpus-tools";

type Props={ownerId:string;existing:readonly CorpusDocument[];disabled:boolean;onImport:(next:CorpusDocument[])=>void};
const StoredPdfCorpusImport=({ownerId,existing,disabled,onImport}:Props)=>{
  const [docs,setDocs]=useState<StoredPdfDocument[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [truncated,setTruncated]=useState(false);
  const [chosen,setChosen]=useState("");
  const [snapshot,setSnapshot]=useState<{doc:StoredPdfDocument;rows:StoredPdfChunk[]}|null>(null);
  const [selected,setSelected]=useState<number[]>([]);
  const [page,setPage]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const generation=useRef(0);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  const currentOwner=()=>useAuthStore.getState().user?.id===ownerId;
  const active=(n:number)=>alive.current&&generation.current===n&&currentOwner();
  const resetSnapshot=()=>{setSnapshot(null);setSelected([]);setPage("");};
  const verifyOwner=async()=>{
    const {data,error}=await supabase.auth.getUser();
    if(error||data.user?.id!==ownerId||!currentOwner())throw new Error("auth");
  };
  const list=async()=>{
    if(busy||disabled||!currentOwner())return;
    const n=++generation.current;
    setBusy(true);setError("");setLoaded(false);setDocs([]);setChosen("");resetSnapshot();
    try{
      await verifyOwner();
      if(!active(n))return;
      const {data,error,count}=await supabase.from("ai_documents").select("id,file_name,user_id,file_type,status,mime_type",{count:"exact"}).eq("user_id",ownerId).eq("file_type","pdf").eq("status","ready").eq("mime_type","application/pdf").order("created_at",{ascending:false}).order("id",{ascending:true}).limit(50);
      if(error||!data)throw new Error("list");
      const result=data.map(doc=>validateReadyPdf(doc,ownerId));
      if(active(n)){setDocs(result);setLoaded(true);setTruncated(count===null||count>result.length);}
    }catch{if(active(n))setError("Could not load owned ready PDFs. Check your session and document processing status.");}
    finally{if(active(n))setBusy(false);}
  };
  const read=async()=>{
    if(busy||disabled||!chosen||!currentOwner())return;
    const n=++generation.current;
    setBusy(true);setError("");resetSnapshot();
    try{
      await verifyOwner();
      if(!active(n))return;
      const {data:doc,error:docError}=await supabase.from("ai_documents").select("id,file_name,user_id,file_type,status,mime_type").eq("id",chosen).eq("user_id",ownerId).eq("status","ready").maybeSingle();
      if(docError||!doc)throw new Error("document");
      validateReadyPdf(doc,ownerId);
      if(!active(n))return;
      const {data:rows,error:rowError,count}=await supabase.from("document_chunks").select("document_id,chunk_index,content",{count:"exact"}).eq("document_id",doc.id).order("chunk_index",{ascending:true}).limit(MAX_STORED_PDF_CHUNKS+1);
      if(rowError||!rows||count!==rows.length)throw new Error("chunks");
      inspectStoredPdfChunks(doc,ownerId,rows);
      // Recheck readiness/ownership after reading the bounded snapshot.
      const {data:after,error:afterError}=await supabase.from("ai_documents").select("id,file_name,user_id,file_type,status,mime_type").eq("id",doc.id).eq("user_id",ownerId).eq("status","ready").maybeSingle();
      if(afterError||!after||JSON.stringify(validateReadyPdf(after,ownerId))!==JSON.stringify(doc))throw new Error("stale");
      if(active(n))setSnapshot({doc,rows});
    }catch{if(active(n))setError("PDF evidence is unavailable, incomplete, unsupported, or no longer owned by this account. No segments imported.");}
    finally{if(active(n))setBusy(false);}
  };
  const chunks=snapshot?inspectStoredPdfChunks(snapshot.doc,ownerId,snapshot.rows):[];
  const free=Math.max(0,8-existing.length);
  const pages=[...new Set(chunks.map(c=>c.page).filter((p):p is number=>p!==null))].sort((a,b)=>a-b);
  const filtered=chunks.filter(c=>!page||(page==="unknown"?c.page===null:String(c.page)===page));
  let planned:CorpusDocument[]|null=null;
  if(snapshot&&selected.length){try{planned=planStoredPdfImport(existing,snapshot.doc,ownerId,snapshot.rows,selected);}catch{/* Show blocked preview below. */}}
  const importSelected=()=>{
    if(!snapshot||!planned||disabled||busy||!currentOwner())return;
    if(!window.confirm("Copy the selected stored PDF text segments into this temporary local knowledge workspace? The original cloud PDF and its extracted text remain stored in your account."))return;
    try{
      if(!currentOwner())throw new Error("auth");
      onImport(planStoredPdfImport(existing,snapshot.doc,ownerId,snapshot.rows,selected));
      resetSnapshot();setError("");
    }catch{setError("Could not import the selection atomically. Check duplicate sources and workspace capacity.");}
  };
  return <section aria-label="Import processed account PDF evidence" className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-950 p-4">
    <h3 className="font-semibold text-white">PDF knowledge ingestion · account documents</h3>
    <p className="text-xs text-amber-200">PDF extraction uses the existing account document processor in AI Chat. Uploading there stores the file and extracted text in your account; this panel only reads already processed PDFs on request. Scanned PDFs without a text layer require OCR, which is not supported here. Page labels are reported stored markers, not independently verified page metadata. Each imported segment is a separate local text source; overlap may duplicate content.</p>
    <div className="flex flex-wrap gap-2"><Link to="/eternyx-ai" className="text-sm text-cyan-300 underline underline-offset-2">Open AI Chat PDF upload</Link><Button type="button" size="sm" variant="outline" disabled={busy||disabled} onClick={()=>void list()}>Load my ready PDFs</Button></div>
    {loaded&&<><p role="status" className="text-xs text-slate-300">{docs.length} ready PDFs{truncated?" shown (up to 50; newer first)":""}.</p>
      {docs.length>0&&<><label className="block text-sm text-slate-300">Choose processed PDF<select value={chosen} disabled={busy||disabled} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" onChange={e=>{setChosen(e.target.value);resetSnapshot();setError("");}}><option value="">Select PDF</option>{docs.map(doc=><option key={doc.id} value={doc.id}>{doc.file_name}</option>)}</select></label>
      <Button type="button" size="sm" variant="outline" disabled={!chosen||busy||disabled} onClick={()=>void read()}>Read stored PDF evidence</Button></>}
    </>}
    {busy&&<p role="status" className="text-xs text-slate-300">Reading account documents…</p>}
    {snapshot&&<div className="space-y-2">
      <p className="text-xs text-slate-300">{chunks.length} stored segments · {pages.length} reported pages · {chunks.filter(c=>c.page===null).length} segments with unknown page. Select up to {free} more sources; existing corpus limits apply.</p>
      <label className="block text-xs text-slate-300">Filter by reported page<select value={page} className="ml-2 rounded border border-slate-700 bg-slate-950 p-1" onChange={e=>setPage(e.target.value)}><option value="">All segments</option>{pages.map(p=><option key={p} value={p}>Page {p}</option>)}<option value="unknown">Unknown page</option></select></label>
      <div className="max-h-80 space-y-2 overflow-auto">{filtered.map(c=><label key={c.chunk_index} className="flex gap-2 rounded border border-slate-800 p-2 text-xs text-slate-300"><input type="checkbox" checked={selected.includes(c.chunk_index)} disabled={disabled||(!selected.includes(c.chunk_index)&&selected.length>=free)} onChange={e=>{const checked=e.target.checked;setSelected(old=>checked?[...old,c.chunk_index]:old.filter(x=>x!==c.chunk_index));}}/><span className="min-w-0 break-words"><strong>Segment {c.chunk_index+1} · {c.page===null?"page unknown":"reported page "+c.page}</strong><span className="mt-1 block whitespace-pre-wrap break-all">{c.content}</span></span></label>)}</div>
      <p role="status" className="text-xs text-slate-300">{selected.length} selected · {planned?"ready to import":selected.length?"selection blocked by duplicate source or capacity":"nothing selected"}.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!planned||disabled||busy} onClick={importSelected}>Import selected PDF evidence locally</Button><Button type="button" variant="outline" onClick={resetSnapshot}>Discard preview</Button></div>
    </div>}
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
  </section>;
};
export default StoredPdfCorpusImport;
