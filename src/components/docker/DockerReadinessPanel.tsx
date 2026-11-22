import {ShieldAlert,ShieldCheck} from "lucide-react";
export type DockerReadiness={
 classification:string;
 checks:{id:string;passed:boolean;detail:string}[];
 checkedAt:string|null;
 executionAuthorized:boolean;
 note?:string;
};
type Props={readiness:DockerReadiness|null;observedAt:string|null};
export default function DockerReadinessPanel({readiness,observedAt}:Props){
 const checks=Array.isArray(readiness?.checks)?readiness.checks:[];
 return <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="docker-readiness-title">
  <h2 id="docker-readiness-title" className="text-xl font-semibold">Operational review checklist</h2>
  <p className="mt-2 text-sm text-muted-foreground">Read-only, source-derived checks from the last authenticated refresh. These do not authorize Docker execution or prove server ownership.</p>
  {!readiness&&<p role="status" className="mt-4 text-sm text-muted-foreground">Readiness records unavailable. No assumption of a healthy or connected Docker Engine.</p>}
  {readiness&&<>
    <p className="mt-4 text-sm font-semibold">{readiness.classification==="review_prerequisites_observed"
      ?"Review prerequisites observed — not execution authorization"
      :"Attention required before new review plans"}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {checks.map(c=><div key={c.id} className="flex gap-3 rounded-xl border border-border p-4">
       {c.passed?<ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"/>:
         <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"/>}
       <div><p className="text-sm font-medium">{c.id.replaceAll("_"," ")}</p>
       <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.detail}</p></div>
      </div>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Record sample: {observedAt?new Date(observedAt).toLocaleString():"Unavailable"}.
      Only recent owner records were checked. Execution authorized: No.</p>
  </>}
 </section>;
}
