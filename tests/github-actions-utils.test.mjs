import test from "node:test";
import assert from "node:assert/strict";
import { filterWorkflowRuns, normalizeWorkflowJobs, normalizeWorkflowRuns, summarizeWorkflowRun } from "../src/lib/githubActionsUtils.mjs";

const sample = [
  { id: 1, name: "CI", display_title: "Fix login", head_branch: "main", event: "push", status: "completed", conclusion: "success", actor: { login: "naim" }, html_url: "https://github.com/a/b/actions/runs/1", run_attempt: 2, run_started_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:02:30Z" },
  { id: 2, name: "Deploy", display_title: "Release API", head_branch: "release/v2", event: "workflow_dispatch", status: "in_progress", conclusion: null, html_url: "https://github.com/a/b/actions/runs/2" },
  { id: 3, name: "Tests", display_title: "Broken tests", head_branch: "feature/auth", event: "pull_request", status: "completed", conclusion: "failure", html_url: "https://github.com/a/b/actions/runs/3" },
];

test("normalizes only structurally valid workflow runs", () => {
  assert.deepEqual(normalizeWorkflowRuns({ workflow_runs: [...sample, { id: "bad", name: "x", status: "completed" }, { id: 4, name: "x", status: "unknown" }] }), sample);
  assert.deepEqual(normalizeWorkflowRuns({}), []);
});

test("filters runs by text, status and branch", () => {
  assert.deepEqual(filterWorkflowRuns(sample, { query: "login" }).map((run) => run.id), [1]);
  assert.deepEqual(filterWorkflowRuns(sample, { status: "success" }).map((run) => run.id), [1]);
  assert.deepEqual(filterWorkflowRuns(sample, { status: "failure" }).map((run) => run.id), [3]);
  assert.deepEqual(filterWorkflowRuns(sample, { branch: "release" }).map((run) => run.id), [2]);
});

test("summarizes run metadata and elapsed time", () => {
  assert.deepEqual(summarizeWorkflowRun(sample[0]), {
    id: 1, name: "CI", status: "completed", conclusion: "success", branch: "main",
    event: "push", actor: "naim", attempt: 2, durationMs: 150000,
  });
  assert.throws(() => summarizeWorkflowRun({ id: "bad", status: "completed" }), /Invalid/);
});

test("normalizes jobs and step summaries without trusting malformed entries", () => {
  const jobs = normalizeWorkflowJobs({ jobs: [
    { id: 7, name: "Build", status: "completed", conclusion: "success", steps: [{ name: "Install", status: "completed", conclusion: "success", number: 1 }] },
    { id: "bad", name: "Ignore" },
  ] });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].steps[0].name, "Install");
  assert.deepEqual(normalizeWorkflowJobs({}), []);
});
