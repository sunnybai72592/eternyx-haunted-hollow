import { useEffect, useRef, useState } from "react";
import VideoStoryboard from "@/components/VideoStoryboard";
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
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusTone: Record<string, string> = {
  queued: "border-slate-500/40 text-slate-300",
  reserved: "border-blue-400/40 text-blue-200",
  submitted: "border-cyan-400/40 text-cyan-200",
  processing: "border-violet-400/40 text-primary",
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
  const requestVersion = useRef(0);
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const validJobId = JOB_ID_PATTERN.test(jobId.trim());
  const [job, setJob] = useState<AIJobStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lookupJob = async () => {
    const requestedId = jobId.trim();
    if (!JOB_ID_PATTERN.test(requestedId)) {
      setErrorMessage("Enter a valid job ID (UUID).");
      return;
    }
    const version = ++requestVersion.current;
    setErrorMessage(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const result = await getAIJobStatus(requestedId);
      if (version !== requestVersion.current) return;
      setJob(result);
      setJobId(result.id);
      toast.success("AI job status refreshed.");
    } catch (error) {
      if (version !== requestVersion.current) return;
      setJob(null);
      setErrorMessage(describeApiError(error));
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  };

  const cancelJob = async () => {
    if (!job || isCancelling || isLoading) return;
    const requestedJobId = job.id;
    const version = ++requestVersion.current;
    setErrorMessage(null);
    setNotice(null);
    setIsCancelling(true);
    try {
      const result = await requestAIJobCancellation(requestedJobId);
      if (version !== requestVersion.current) return;
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
        const refreshed = await getAIJobStatus(requestedJobId);
        if (version === requestVersion.current) setJob(refreshed);
      } catch {
        // Keep the acknowledged cancellation notice visible if status refresh is unavailable.
      }
    } catch (error) {
      if (version === requestVersion.current) setErrorMessage(describeApiError(error));
    } finally {
      if (version === requestVersion.current) setIsCancelling(false);
    }
  };

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  // A changed input must never leave a previous job selectable for cancellation.
  const updateJobId = (value: string) => {
    requestVersion.current++;
    setJobId(value);
    setJob(null);
    setNotice(null);
    setErrorMessage(null);
    setIsLoading(false);
    setIsCancelling(false);
  };

  useEffect(() => {
    if (!pageVisible || isLoading || isCancelling || !job || isTerminalAIJobStatus(job.status) || job.status === "reconciliation_required") {
      return;
    }

    let isActive = true;
    const version = requestVersion.current;
    let timeoutId: number | undefined;

    const refreshStatus = async () => {
      try {
        const latest = await getAIJobStatus(job.id);
        if (isActive && version === requestVersion.current) setJob(latest);
      } catch {
        // Keep the last confirmed state visible; the next scheduled poll can retry.
      }

      if (isActive && version === requestVersion.current && !document.hidden) {
        timeoutId = window.setTimeout(refreshStatus, 15_000);
      }
    };

    timeoutId = window.setTimeout(refreshStatus, 15_000);
    return () => {
      isActive = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [job?.id, job?.status, pageVisible, isLoading, isCancelling]);

  const canCancel = !!job && !isTerminalAIJobStatus(job.status) && job.status !== "cancel_requested" && job.status !== "reconciliation_required";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" className="text-slate-300 hover:bg-slate-800 hover:text-foreground">
            <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
          </Button>
          <Badge variant="outline" className="border-amber-400/30 text-amber-200">
            Provider not configured
          </Badge>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-background to-accent/[0.08] p-7 sm:p-10">
          <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="flex items-center gap-3 text-primary">
              <Clapperboard className="h-8 w-8" />
              <span className="text-xs font-semibold uppercase tracking-[0.22em]">Flagship creative workspace</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">AI Video Studio</h1>
            <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
              A dedicated workspace for text-to-video, image-to-video, video transformation and presenter-style generation.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Async job architecture prepared</Badge>
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">Multi-provider ready</Badge>
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

        <VideoStoryboard />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {videoFeatures.map((feature, index) => {
            const Icon = [Video, ImagePlus, RefreshCw, Sparkles][index] ?? Film;
            return (
              <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
                <CardHeader className="pb-3">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base text-foreground">{feature.title}</CardTitle>
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
              <CardTitle className="flex items-center gap-2 text-foreground"><Clock3 className="h-5 w-5 text-primary" />Job lifecycle console</CardTitle>
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
                  onChange={(event) => updateJobId(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                  inputMode="text"
                  aria-invalid={Boolean(jobId.trim()) && !validJobId}
                  aria-describedby="ai-video-job-help"
                  maxLength={36}
                  className="border-slate-700 bg-slate-950 text-foreground placeholder:text-slate-500"
                />
                <Button onClick={lookupJob} disabled={isLoading || isCancelling || !validJobId} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Check status
                </Button>
              </div>

              <p id="ai-video-job-help" className="text-xs text-muted-foreground">Enter a 36-character job UUID. Status requests are sent only for valid IDs; background polling pauses when this tab is hidden.</p>
              {errorMessage && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              {notice && (
                <Alert className="border-primary/30 bg-primary/10 text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              )}

              {job && (
                <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">Job status</span>
                    <Badge variant="outline" className={statusTone[job.status] ?? "border-slate-600 text-slate-300"}>{job.status.replace(/_/g, " ")}</Badge>
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
                    <Button variant="outline" onClick={lookupJob} disabled={isLoading || isCancelling || !validJobId} className="border-slate-700 text-slate-200 hover:bg-slate-800">
                      <RefreshCw className="mr-2 h-4 w-4" />Refresh
                    </Button>
                    <Button variant="destructive" onClick={cancelJob} disabled={!canCancel || isLoading || isCancelling} >
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
              <CardTitle className="text-foreground">Built for safe generation</CardTitle>
              <CardDescription className="text-slate-400">The interface reflects the platform's current implementation boundary.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-300">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p>Job access is delegated to authenticated, user-scoped server endpoints.</p></div>
              <div className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Long-running generation uses durable asynchronous job states rather than a browser request held open.</p></div>
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
