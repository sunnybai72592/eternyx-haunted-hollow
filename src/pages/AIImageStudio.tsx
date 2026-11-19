import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Image, LoaderCircle, RefreshCw, ShieldCheck, Upload, XCircle, FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AIJobApiError, getAIJobStatus, requestAIJobCancellation, type AIJobStatusResponse } from "@/lib/ai/job-api";
import { AIImageUploadError, uploadAIImageAsset, type VerifiedAIImageUpload } from "@/lib/ai/image-upload-api";
import {
  AIImageRequestDraftError,
  buildAIImageEditRequest,
  buildAIImageGenerationRequest,
  buildAIImageUpscaleRequest,
  type AIImageGenerationRequestDraft,
  type AIImageEditRequestDraft,
  type AIImageUpscaleRequestDraft,
  type AIImageRequestAspectRatio,
  type AIImageRequestOutputFormat,
} from "@/lib/ai/image-request-builder";
import { isTerminalAIJobStatus } from "@/lib/ai/jobs";
import { getFeaturesForStudio } from "@/lib/ai/registry";

const features = getFeaturesForStudio("image");

const AIImageStudio = () => {
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<AIJobStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedAsset, setUploadedAsset] = useState<VerifiedAIImageUpload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [operation, setOperation] = useState<"generate" | "edit" | "upscale">("generate");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AIImageRequestAspectRatio>("1:1");
  const [outputFormat, setOutputFormat] = useState<AIImageRequestOutputFormat>("png");
  const [requestDraft, setRequestDraft] = useState<AIImageGenerationRequestDraft | AIImageEditRequestDraft | AIImageUpscaleRequestDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const invalidateDraft = () => {
    setRequestDraft(null);
    setDraftError(null);
  };

  const describe = (e: unknown) => e instanceof AIJobApiError
    ? ({
        invalid_job_id: "Enter a valid job ID (UUID).",
        unauthenticated: "Sign in again to access this job.",
        not_found: "No accessible job was found.",
        conflict: "This job cannot be cancelled in its current state.",
        unavailable: "The AI job service is unavailable or not deployed.",
      }[e.code])
    : "The request could not be completed.";

  const lookup = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const value = await getAIJobStatus(jobId.trim());
      if (!value.featureKey.startsWith("ai.image.")) {
        setJob(null);
        setError("That job does not belong to AI Image Studio.");
        return;
      }
      setJob(value);
      setJobId(value.id);
    } catch (e) {
      setJob(null);
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  };

  const upload = async () => {
    if (!imageFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadedAsset(null);
    setRequestDraft(null);
    setDraftError(null);
    try {
      const result = await uploadAIImageAsset(imageFile);
      setUploadedAsset(result);
    } catch (e) {
      setUploadError(e instanceof AIImageUploadError
        ? ({
            invalid_file: "Choose a JPEG, PNG, or WebP image no larger than 10 MiB.",
            upload_unavailable: "Secure upload is unavailable. The required backend may not be deployed yet.",
            upload_failed: "The image could not be uploaded. Please try again.",
            verification_failed: "The upload completed, but the server could not verify the image. Do not use it yet.",
          }[e.code])
        : "The image upload could not be completed.");
    } finally {
      setUploading(false);
    }
  };

  const prepareDraft = () => {
    if (operation !== "generate" && !uploadedAsset) return;
    setDraftError(null);
    try {
      const options = { aspectRatio, outputFormat };
      const draft = operation === "generate"
        ? buildAIImageGenerationRequest(prompt, { ...options, negativePrompt })
        : operation === "edit"
          ? buildAIImageEditRequest(uploadedAsset!, prompt, { ...options, negativePrompt })
          : buildAIImageUpscaleRequest(uploadedAsset!, options);
      setRequestDraft(draft);
    } catch (e) {
      setRequestDraft(null);
      setDraftError(e instanceof AIImageRequestDraftError
        ? (e.code === "invalid_asset" ? "Upload and verify an image before preparing a request." : "Enter an edit prompt between 1 and 4,000 characters; the optional negative prompt must be 2,000 characters or fewer.")
        : "The request draft could not be prepared.");
    }
  };

  const cancel = async () => {
    if (!job) return;
    setCancelling(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestAIJobCancellation(job.id);
      setNotice(result.provider_reconciliation_required
        ? "Cancellation recorded; provider reconciliation is still required."
        : result.cancellation_requested
          ? "Cancellation requested; wait for confirmed completion."
          : result.already_terminal
            ? "This job is already terminal."
            : "Cancellation request accepted.");
      try {
        const latest = await getAIJobStatus(job.id);
        if (latest.featureKey.startsWith("ai.image.")) setJob(latest);
      } catch {
        // Keep the acknowledged cancellation notice visible.
      }
    } catch (e) {
      setError(describe(e));
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!job || !job.featureKey.startsWith("ai.image.") || isTerminalAIJobStatus(job.status)) return;
    if (job.status==="reconciliation_required") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const latest = await getAIJobStatus(job.id);
        if (active && latest.featureKey.startsWith("ai.image.")) setJob(latest);
      } catch {
        // Retry on the next poll.
      }
      if (active) timer = window.setTimeout(poll,15000);
    };
    timer = window.setTimeout(poll,15000);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [job?.id, job?.status, job?.featureKey]);

  const canCancel = !!job && !isTerminalAIJobStatus(job.status) && job.status !== "cancel_requested" && job.status !== "reconciliation_required";

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>

        <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-slate-950 to-violet-950/30 p-8">
          <div className="flex items-center gap-3 text-cyan-200"><Image className="h-8 w-8" />CREATIVE IMAGE WORKSPACE</div>
          <h1 className="mt-5 text-3xl font-bold sm:text-5xl">AI Image Studio</h1>
          <p className="mt-4 max-w-3xl text-slate-300">A dedicated foundation for image generation, editing and upscaling, using ETERNYX's shared secure job architecture.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge variant="outline">Secure job integration prepared</Badge>
            <Badge variant="outline">Generation disabled</Badge>
          </div>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>Generation remains unavailable while provider selection, credentials, safety policy, backend deployment and cost approval are pending. This page does not submit prompts or make paid provider calls; it also does not enqueue jobs or reserve credits.</AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-3">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader><CardTitle className="text-white">{feature.title}</CardTitle><CardDescription className="text-slate-400">{feature.description}</CardDescription></CardHeader>
              <CardContent><Badge variant="outline">Planned · not enabled</Badge></CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Secure image input</CardTitle>
            <CardDescription className="text-slate-400">Prepare a private image asset for a future editing or upscaling request. The server verifies the uploaded file before marking it ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={e => {
                setImageFile(e.target.files?.[0] ?? null);
                setUploadedAsset(null);
                setUploadError(null);
                invalidateDraft();
              }}
              className="border-slate-700 bg-slate-950 text-white file:text-slate-200"
            />
            <p className="text-xs text-slate-500">JPEG, PNG or WebP · maximum 10 MiB. Upload requires the secure Supabase functions to be deployed.</p>
            <Button onClick={upload} disabled={!imageFile || uploading}>
              {uploading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? "Uploading and verifying…" : "Upload and verify image"}
            </Button>
            {uploadError && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{uploadError}</AlertDescription></Alert>}
            {uploadedAsset && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>Image verified and stored privately. Asset ID: <span className="break-all font-mono">{uploadedAsset.assetId}</span>.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Image request workspace</CardTitle>
            <CardDescription className="text-slate-400">Build and review provider-neutral generation, editing, and upscaling request drafts. Editing and upscaling require a verified private image; all draft preparation is local only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Image operation">
              <Button type="button" variant={operation === "generate" ? "default" : "outline"} onClick={() => { setOperation("generate"); invalidateDraft(); }}>Generate image</Button>
              <Button type="button" variant={operation === "edit" ? "default" : "outline"} onClick={() => { setOperation("edit"); invalidateDraft(); }}>Edit image</Button>
              <Button type="button" variant={operation === "upscale" ? "default" : "outline"} onClick={() => { setOperation("upscale"); invalidateDraft(); }}>Upscale image</Button>
            </div>

            {operation !== "upscale" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>{operation === "generate" ? "Image prompt" : "Editing instructions"} <span className="text-slate-500">(required · max 4,000 characters)</span></span>
                  <textarea value={prompt} onChange={e => { setPrompt(e.target.value); invalidateDraft(); }} maxLength={4000} rows={4} placeholder={operation === "generate" ? "Describe the image you want to create…" : "Describe the changes you want…"} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  <span className="text-xs text-slate-500">{prompt.length}/4000</span>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Negative prompt <span className="text-slate-500">(optional · max 2,000 characters)</span></span>
                  <textarea value={negativePrompt} onChange={e => { setNegativePrompt(e.target.value); invalidateDraft(); }} maxLength={2000} rows={4} placeholder="Describe what to avoid…" className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                  <span className="text-xs text-slate-500">{negativePrompt.length}/2000</span>
                </label>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span>Aspect ratio</span>
                <select value={aspectRatio} onChange={e => { setAspectRatio(e.target.value as AIImageRequestAspectRatio); invalidateDraft(); }} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                  {(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"] as const).map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span>Output format</span>
                <select value={outputFormat} onChange={e => { setOutputFormat(e.target.value as AIImageRequestOutputFormat); invalidateDraft(); }} className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                  {(["png", "jpeg", "webp"] as const).map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}
                </select>
              </label>
            </div>

            <Button onClick={prepareDraft} disabled={(operation !== "generate" && !uploadedAsset) || (operation !== "upscale" && !prompt.trim())}>
              <FileCheck2 className="mr-2 h-4 w-4" />Prepare request draft
            </Button>
            {operation !== "generate" && !uploadedAsset && <p className="text-xs text-slate-500">Upload and verify an image first to unlock local edit or upscale draft preparation.</p>}
            {draftError && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{draftError}</AlertDescription></Alert>}
            {requestDraft && (
              <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-white">Request draft prepared</b>
                  <Badge variant="outline">Local only · not submitted</Badge>
                </div>
                <p className="text-sm text-slate-300">Operation: {requestDraft.featureKey === "ai.image.generate" ? "Text-to-image generation" : requestDraft.featureKey === "ai.image.edit" ? "Image editing" : "Image upscaling"}</p>
                {requestDraft.featureKey !== "ai.image.generate" && <p className="break-all text-xs text-slate-400">Verified asset: {requestDraft.imageAssetId}</p>}
                {requestDraft.featureKey !== "ai.image.upscale" && <p className="whitespace-pre-wrap text-sm text-slate-300">{requestDraft.featureKey === "ai.image.generate" ? "Prompt:" : "Instructions:"} {requestDraft.prompt}</p>}
                {requestDraft.featureKey !== "ai.image.upscale" && requestDraft.negativePrompt && <p className="whitespace-pre-wrap text-sm text-slate-400">Avoid: {requestDraft.negativePrompt}</p>}
                <p className="text-sm text-slate-400">Aspect ratio: {requestDraft.aspectRatio} · Format: {requestDraft.outputFormat}</p>
                <p className="text-xs text-amber-200">This is a preview only. No job was created and no credits were reserved.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">Image job lifecycle console</CardTitle><CardDescription className="text-slate-400">Retrieve an existing AI Image job belonging to your account.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="ai-image-job-id" className="text-sm">AI Image job ID</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="ai-image-job-id" value={jobId} onChange={e => setJobId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" className="border-slate-700 bg-slate-950 text-white" />
              <Button onClick={lookup} disabled={loading || !jobId.trim()}>{loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Check status</Button>
            </div>
            {error && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
            {job && (
              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex justify-between gap-2"><b>Job status</b><Badge variant="outline">{job.status.replaceAll("_", " ")}</Badge></div>
                <p className="text-sm text-slate-300">Feature: {job.featureKey}</p>
                <p className="text-sm text-slate-400">Attempts: {job.attemptCount} / {job.maxAttempts}</p>
                <p className="text-sm text-slate-400">Updated: {new Date(job.updatedAt).toLocaleString()}</p>
                {job.failureCode && <p className="text-sm text-rose-200">Failure code: {job.failureCode}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={lookup} disabled={loading || cancelling}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                  <Button variant="destructive" onClick={cancel} disabled={!canCancel || cancelling}>{cancelling ? "Requesting…" : "Request cancellation"}</Button>
                </div>
              </div>
            )}
            {!job && !error && <p className="text-sm text-slate-500">No job selected. Only jobs confirmed by the authenticated status endpoint are displayed.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AIImageStudio;
