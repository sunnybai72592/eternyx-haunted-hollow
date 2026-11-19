import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Image, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AIJobApiError, getAIJobStatus, requestAIJobCancellation, type AIJobStatusResponse } from "@/lib/ai/job-api";
import { isTerminalAIJobStatus } from "@/lib/ai/jobs";
import { getFeaturesForStudio } from "@/lib/ai/registry";

const features = getFeaturesForStudio("image");
const AIImageStudio = () => {
 const [jobId,setJobId]=useState("");
 const [job,setJob]=useState<AIJobStatusResponse|null>(null);
 const [loading,setLoading]=useState(false);
 const [cancelling,setCancelling]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const describe=(e:unknown)=>e instanceof AIJobApiError ? ({invalid_job_id:"Enter a valid job ID (UUID).",unauthenticated:"Sign in again to access this job.",not_found:"No accessible job was found.",conflict:"This job cannot be cancelled in its current state.",unavailable:"The AI job service is unavailable or not deployed."}[e.code]) : "The request could not be completed.";
 const lookup=async()=>{setLoading(true);setError(null);setNotice(null);try{const value=await getAIJobStatus(jobId.trim());if(!value.featureKey.startsWith("ai.image.")){setJob(null);setError("That job does not belong to AI Image Studio.");return;}setJob(value);setJobId(value.id);}catch(e){setJob(null);setError(describe(e));}finally{setLoading(false);}};
 const cancel=async()=>{if(!job)return;setCancelling(true);setError(null);setNotice(null);try{const result=await requestAIJobCancellation(job.id);setNotice(result.provider_reconciliation_required?"Cancellation recorded; provider reconciliation is still required.":result.cancellation_requested?"Cancellation requested; wait for confirmed completion.":result.already_terminal?"This job is already terminal.":"Cancellation request accepted.");try{const latest=await getAIJobStatus(job.id);if(latest.featureKey.startsWith("ai.image."))setJob(latest);}catch{/* retain acknowledged notice */}}catch(e){setError(describe(e));}finally{setCancelling(false);}};
 useEffect(()=>{if(!job||!job.featureKey.startsWith("ai.image.")||isTerminalAIJobStatus(job.status)||job.status==="reconciliation_required")return;let active=true;let timer:number|undefined;const poll=async()=>{try{const latest=await getAIJobStatus(job.id);if(active&&latest.featureKey.startsWith("ai.image."))setJob(latest);}catch{/* retry on next poll */}if(active)timer=window.setTimeout(poll,15000);};timer=window.setTimeout(poll,15000);return()=>{active=false;if(timer!==undefined)window.clearTimeout(timer);};},[job?.id,job?.status,job?.featureKey]);
 const canCancel=!!job&&!isTerminalAIJobStatus(job.status)&&job.status!=="cancel_requested"&&job.status!=="reconciliation_required";
 return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
 <Button asChild variant="ghost" className="text-slate-300"><Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4"/>AI Arsenal</Link></Button>
 <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-slate-950 to-violet-950/30 p-8"><div className="flex items-center gap-3 text-cyan-200"><Image className="h-8 w-8"/>CREATIVE IMAGE WORKSPACE</div><h1 className="mt-5 text-3xl font-bold sm:text-5xl">AI Image Studio</h1><p className="mt-4 max-w-3xl text-slate-300">A dedicated foundation for image generation, editing and upscaling, using ETERNYX's shared secure job architecture.</p><div className="mt-5 flex gap-2"><Badge variant="outline">Secure job integration prepared</Badge><Badge variant="outline">Generation disabled</Badge></div></section>
 <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100"><ShieldCheck className="h-4 w-4"/><AlertDescription>Generation remains unavailable while provider selection, credentials, safety policy, backend deployment and cost approval are pending. This page does not submit prompts or make paid provider calls.</AlertDescription></Alert>
 <section className="grid gap-4 md:grid-cols-3">{features.map(feature=><Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100"><CardHeader><CardTitle className="text-white">{feature.title}</CardTitle><CardDescription className="text-slate-400">{feature.description}</CardDescription></CardHeader><CardContent><Badge variant="outline">Planned · not enabled</Badge></CardContent></Card>)}</section>
 <Card className="border-slate-800 bg-slate-900/60 text-slate-100"><CardHeader><CardTitle className="text-white">Image job lifecycle console</CardTitle><CardDescription className="text-slate-400">Retrieve an existing AI Image job belonging to your account.</CardDescription></CardHeader><CardContent className="space-y-4"><label htmlFor="ai-image-job-id" className="text-sm">AI Image job ID</label><div className="flex flex-col gap-2 sm:flex-row"><Input id="ai-image-job-id" value={jobId} onChange={e=>setJobId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" className="border-slate-700 bg-slate-950 text-white"/><Button onClick={lookup} disabled={loading||!jobId.trim()}>{loading?<LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Check status</Button></div>
 {error&&<Alert variant="destructive"><XCircle className="h-4 w-4"/><AlertDescription>{error}</AlertDescription></Alert>}{notice&&<Alert><ShieldCheck className="h-4 w-4"/><AlertDescription>{notice}</AlertDescription></Alert>}
 {job&&<div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4"><div className="flex justify-between gap-2"><b>Job status</b><Badge variant="outline">{job.status.replaceAll("_"," ")}</Badge></div><p className="text-sm text-slate-300">Feature: {job.featureKey}</p><p className="text-sm text-slate-400">Attempts: {job.attemptCount} / {job.maxAttempts}</p><p className="text-sm text-slate-400">Updated: {new Date(job.updatedAt).toLocaleString()}</p>{job.failureCode&&<p className="text-sm text-rose-200">Failure code: {job.failureCode}</p>}<div className="flex gap-2"><Button variant="outline" onClick={lookup} disabled={loading||cancelling}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button><Button variant="destructive" onClick={cancel} disabled={!canCancel||cancelling}>{cancelling?"Requesting…":"Request cancellation"}</Button></div></div>}
 {!job&&!error&&<p className="text-sm text-slate-500">No job selected. Only jobs confirmed by the authenticated status endpoint are displayed.</p>}</CardContent></Card>
 </div></div>;
};
export default AIImageStudio;
