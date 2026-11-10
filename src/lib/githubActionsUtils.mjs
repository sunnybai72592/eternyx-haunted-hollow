const VALID_STATUSES = new Set(["queued", "in_progress", "completed", "requested", "waiting", "pending"]);

export function normalizeWorkflowRuns(payload) {
  const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
  return runs.filter((run) =>
    Number.isSafeInteger(run.id) &&
    typeof run.name === "string" &&
    typeof run.html_url === "string" &&
    typeof run.status === "string" &&
    VALID_STATUSES.has(run.status)
  );
}

export function filterWorkflowRuns(runs, { query = "", status = "all", branch = "" } = {}) {
  const needle = String(query).trim().toLowerCase();
  const branchNeedle = String(branch).trim().toLowerCase();
  return runs.filter((run) => {
    const searchable = [run.name, run.display_title, run.head_branch, run.event, run.actor?.login]
      .filter(Boolean).join(" ").toLowerCase();
    return (!needle || searchable.includes(needle)) &&
      (status === "all" || run.status === status || (status === "success" && run.conclusion === "success") ||
        (status === "failure" && ["failure", "cancelled", "timed_out", "action_required"].includes(run.conclusion))) &&
      (!branchNeedle || String(run.head_branch || "").toLowerCase().includes(branchNeedle));
  });
}

export function summarizeWorkflowRun(run) {
  if (!run || !Number.isSafeInteger(run.id) || typeof run.status !== "string") {
    throw new Error("Invalid GitHub Actions run.");
  }
  const started = run.run_started_at || run.created_at;
  const completed = run.updated_at;
  const startMs = started ? Date.parse(started) : NaN;
  const endMs = completed ? Date.parse(completed) : NaN;
  return {
    id: run.id,
    name: typeof run.name === "string" ? run.name : "Unnamed workflow",
    status: run.status,
    conclusion: run.conclusion || null,
    branch: run.head_branch || "Unknown branch",
    event: run.event || "Unknown event",
    actor: run.actor?.login || "Unknown actor",
    attempt: Number.isSafeInteger(run.run_attempt) ? run.run_attempt : 1,
    durationMs: Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? endMs - startMs : null,
  };
}

export function normalizeWorkflowJobs(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.filter((job) => Number.isSafeInteger(job.id) && typeof job.name === "string")
    .map((job) => ({
      id: job.id,
      name: job.name,
      status: typeof job.status === "string" ? job.status : "unknown",
      conclusion: typeof job.conclusion === "string" ? job.conclusion : null,
      startedAt: typeof job.started_at === "string" ? job.started_at : null,
      completedAt: typeof job.completed_at === "string" ? job.completed_at : null,
      steps: Array.isArray(job.steps) ? job.steps.map((step) => ({
        name: typeof step.name === "string" ? step.name : "Unnamed step",
        status: typeof step.status === "string" ? step.status : "unknown",
        conclusion: typeof step.conclusion === "string" ? step.conclusion : null,
        number: Number.isSafeInteger(step.number) ? step.number : null,
      })) : [],
    }));
}
