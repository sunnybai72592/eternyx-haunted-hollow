import {useRef,useState,type ChangeEvent} from "react";
import {Download,FolderOpen,Search} from "lucide-react";
import {exportPracticeSession,importPracticeSession,MAX_PRACTICE_IMPORT_BYTES} from "@/lib/eternyxLabsPracticeSession.mjs";
const field="min-h-11 w-full rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";
const action="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-4 py-2 text-sm font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
type Status="all"|"todo"|"done";
type Props={
 query:string;onQuery:(v:string)=>void;status:Status;onStatus:(v:Status)=>void;
 bookmarksOnly:boolean;onBookmarksOnly:(v:boolean)=>void;
 passed:Set<string>;bookmarks:Set<string>;
 onImport:(passed:Set<string>,bookmarks:Set<string>)=>void;
};
export default function PracticeSessionToolbar({query,onQuery,status,onStatus,bookmarksOnly,onBookmarksOnly,passed,bookmarks,onImport}:Props){
  const input=useRef<HTMLInputElement>(null);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const download=()=>{
    try{
      const json=exportPracticeSession(passed,bookmarks);
      const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
      const a=document.createElement("a");
      a.href=url;a.download="eternyx-labs-local-practice.json";
      document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setError("");
      setMessage("Local JSON prepared. Its checked-case markers are editable, not verified proof.");
    }catch(e){
      setMessage("");setError(e instanceof Error?e.message:"Local export failed.");
    }
  };
  const importFile=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value="";
    if(!file)return;
    setBusy(true);setError("");setMessage("");
    try{
      if(file.size>MAX_PRACTICE_IMPORT_BYTES)throw Error("Select a JSON file no larger than 16 KiB.");
      const session=importPracticeSession(await file.text());
      onImport(session.passed,session.bookmarks);
      setMessage("Imported "+session.passed.size+" local checked-case markers and "+
        session.bookmarks.size+" bookmarks. This progress is unverified.");
    }catch(e){setError(e instanceof Error?e.message:"Invalid local practice session.");}
    finally{setBusy(false);}
  };
  return <section aria-label="Practice filters and local session tools" className="space-y-4 rounded-xl border border-border/70 bg-background/50 p-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label htmlFor="labs-practice-search" className="mb-1 block text-xs font-semibold">Search tracks and questions</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true"/>
          <input id="labs-practice-search" type="search" maxLength={80} value={query}
            onChange={e=>onQuery(e.target.value)} placeholder="e.g. subnet, AES, DNS" className={field+" pl-9"}/></div>
      </div>
      <div>
        <label htmlFor="labs-practice-status" className="mb-1 block text-xs font-semibold">Case status</label>
        <select id="labs-practice-status" value={status} onChange={e=>onStatus(e.target.value as Status)} className={field}>
          <option value="all">All cases</option><option value="todo">Unfinished cases</option><option value="done">Locally checked correct</option>
        </select>
      </div>
      <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-border/70 bg-background/80 p-3 text-sm">
        <input type="checkbox" checked={bookmarksOnly} onChange={e=>onBookmarksOnly(e.target.checked)}
          className="h-4 w-4 accent-primary"/> Bookmarked cases only
      </label>
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={download} className={action}><Download className="h-4 w-4" aria-hidden="true"/>Export local progress</button>
      <button type="button" disabled={busy} onClick={()=>input.current?.click()} className={action}>
        <FolderOpen className="h-4 w-4" aria-hidden="true"/>{busy?"Reading file…":"Import progress JSON"}</button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only"
        aria-label="Choose saved local practice session JSON" onChange={importFile}/>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Manual export/import stores only case IDs and bookmarks, never answers or account information.
      Import replaces this tab's session. JSON is editable and is not a certificate,
      server grade or verified achievement. No automatic storage or cloud sync.
    </p>
    {message&&<p role="status" aria-live="polite" className="text-sm text-primary">{message}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
