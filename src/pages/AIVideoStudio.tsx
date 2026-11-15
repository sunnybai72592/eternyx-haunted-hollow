import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Clapperboard,
  Clock3,
  Film,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  AIJobApiError,
  getAIJobStatus,
  requestAIJobCancellation,
  type AIJobStatusResponse,
} from "@/lib/ai/job-api";
import { isTerminalAIJobStatus } from "@/lib/ai/jobs";
import { getFeaturesForStudio } from "@/lib/ai/registry";

const videoFeatures = getFeaturesForStudio("video");

const statusTone: Record<string, string> = {
  queued: "border-slate-500/40 text-slate-300",
  reserved: "border-blue-400/40 text-blue-200",
  submitted: "border-cyan-400/40 text-cyan-200",
  processing: "border-violet-400/40 text-violet-200",
  cancel_requested: "border-amber-400/40 text-amber-200",
  succeeded: "border-emerald-400/40 text-emerald-200",
  failed: "border-rose-400/40 text-rose-200",
  cancelled: "border-slate-500/40 text-slate-300",
  reconciliation_required: "border-amber-400/40 text-amber-200",
};

function describeApiError(error: unknown): string {
  if (error instanceof AIJobApiError) {
    switch (error.code) {
      case "invalid_job_id":
        return "Enter a valid job ID (UUID).";
      case "unauthenticated":
        return "Your session could not be authenticated. Sign in again and retry.";
      case "not_found":
        return "No accessible AI job was found for that ID.";
      case "conflict":
        return "This job cannot be cancelled in its current state.";
      default:
        return "The AI job service is unavailable. Its backend may not be deployed yet.";
    }
  }
  return "The request could not be completed. Please try again.";
}

const AIVideoStudio = () => {
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<AIJobStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lookupJob = async () => {
    setErrorMessage(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const result = await getAIJobStatus(jobId.trim());
      setJob(result);
      toast.success("AI job status refreshed.");
    } catch (error) {
      setJob(null);
      setErrorMessage(describeApiError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    setErrorMessage(null);
    setNotice(null);
    setIsCancelling(true);
    try {
      const result = await requestAIJobCancellation(job.id);
      if (result.provider_reconciliation_required) {
        setNotice("Cancellation was recorded, but provider reconciliation is required. The system has not assumed that external processing stopped.");
      } else if (result.cancellation_requested) {
        setNotice("Cancellation was requested. The job may take time to reach a confirmed terminal state.");
      } else if (result.already_terminal) {
        setNotice("This job was already in a terminal state; no further cancellation was needed.");
      } else {
        setNotice("The cancellation request was accepted.");
      }

      try {
        setJob(await getAIJobStatus(job.id));
      } catch {
        // Keep the acknowledged cancellation notice visible if status refresh is unavailable.
      }
    } catch (error) {
      setErrorMessage(describeApiError(error));
    } finally {
      setIsCancelling(false);
    }
  };

  const canCancel = !!job && !isTerminalAIJobStatus(job.status) && job.status !== "cancel_requested";

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" className="text-slate-300 hover:bg-slate-800 hover:text-white">
            <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
          </Button>
          <Badge variant="outline" className="border-amber-400/30 text-amber-200">
            Provider not configured
          </Badge>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/50 via-slate-950 to-cyan-950/30 p-7 sm:p-10">
          <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-violet-400/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="flex items-center gap-3 text-violet-200">
              <Clapperboard className="h-8 w-8" />
              <span className="text-xs font-semibold uppercase tracking-[0.22em]">Flagship creative workspace</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">AI Video Studio</h1>
            <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
              A dedicated workspace for text-to-video, image-to-video, video transformation and presenter-style generation.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-violet-300/30 bg-violet-300/10 text-violet-100">Async job architecture prepared</Badge>
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">Multi-provider ready</Badge>
              <Badge variant="outline" className="border-slate-600 text-slate-300">Generation disabled</Badge>
            </div>
          </div>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Generation is intentionally unavailable while provider selection, credentials, backend deployment and cost approval are pending. This page does not submit prompts or make paid provider calls.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {videoFeatures.map((feature, index) => {
            const Icon = [Video, ImagePlus, RefreshCw, Sparkles][index] ?? Film;
            return (
              <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
                <CardHeader className="pb-3">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base text-white">{feature.title}</CardTitle>
                  <CardDescription className="leading-5 text-slate-400">{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="border-slate-600 text-slate-300">Planned</Badge>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Clock3 className="h-5 w-5 text-cyan-300" />Job lifecycle console</CardTitle>
              <CardDescription className="text-slate-400">
                Retrieve a job you already own by its ID, inspect its safe lifecycle state, or request cancellation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label htmlFor="ai-video-job-id" className="text-sm font-medium text-slate-200">AI job ID</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="ai-video-job-id"
                  value={jobId}
                  onChange={(event) => setJobId(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                  className="border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                />
                <Button onClick={lookupJob} disabled={isLoading || !jobId.trim()} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                  {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Check status
                </Button>
              </div>

              {errorMessage && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              {notice && (
                <Alert className="border-cyan-400/30 bg-cyan-950/20 text-cyan-100">
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              )}

              {job && (
                <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-white">Job status</span>
                    <Badge variant="outline" className={statusTone[job.status] ?? "border-slate-600 text-slate-300"}>{job.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-slate-500">Feature</dt><dd className="mt-1 break-all text-slate-200">{job.featureKey}</dd></div>
                    <div><dt className="text-slate-500">Attempts</dt><dd className="mt-1 text-slate-200">{job.attemptCount} / {job.maxAttempts}</dd></div>
                    <div><dt className="text-slate-500">Created</dt><dd className="mt-1 text-slate-200">{new Date(job.createdAt).toLocaleString()}</dd></div>
                    <div><dt className="text-slate-500">Updated</dt><dd className="mt-1 text-slate-200">{new Date(job.updatedAt).toLocaleString()}</dd></div>
                    {job.failureCode && <div className="sm:col-span-2"><dt className="text-slate-500">Failure code</dt><dd className="mt-1 text-rose-200">{job.failureCode}</dd></div>}
                  </dl>
                  {job.status === "cancel_requested" && (
                    <p className="text-sm text-amber-200">Cancellation is pending confirmation. A request does not prove the provider stopped processing.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={lookupJob} disabled={isLoading || isCancelling} className="border-slate-700 text-slate-200 hover:bg-slate-800">
                      <RefreshCw className="mr-2 h-4 w-4" />Refresh
                    </Button>
                    <Button variant="destructive" onClick={cancelJob} disabled={!canCancel || isCancelling} >
                      {isCancelling ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Request cancellation
                    </Button>
                  </div>
                </div>
              )}

              {!job && !errorMessage && (
                <p className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-500">
                  No job selected. The console only displays a job after the authenticated status endpoint returns it.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
            <CardHeader>
              <CardTitle className="text-white">Built for safe generation</CardTitle>
              <CardDescription className="text-slate-400">The interface reflects the platform's current implementation boundary.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-300">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p>Job access is delegated to authenticated, user-scoped server endpoints.</p></div>
              <div className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" /><p>Long-running generation uses durable asynchronous job states rather than a browser request held open.</p></div>
              <div className="flex gap-3"><Film className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><p>Provider task IDs, prompts, worker leases and private storage keys are not shown in this client view.</p></div>
              <div className="flex gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><p>Cancellation remains a request until the provider outcome is confirmed; uncertain outcomes are not treated as refunds or completed cancellations.</p></div>
              <Button asChild variant="outline" className="w-full border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800">
                <Link to="/ai-arsenal">Return to AI Arsenal</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default AIVideoStudio;
