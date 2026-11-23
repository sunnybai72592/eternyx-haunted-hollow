import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock3, ListChecks, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { filterEducationTests, normalizeEducationTest } from "@/lib/educationCatalog.mjs";
import {
  continueEducationCatalogItems, countEducationCatalogProgress,
  filterEducationCatalogProgress, indexEducationOwnedAttempts,
  prioritizeEducationCatalog,
} from "@/lib/educationCatalogProgress.mjs";
import { educationAttemptNavigation } from "@/lib/educationAttemptNavigation.mjs";
import { atomicCbtEnabled } from "@/lib/educationCbtRpc";
import { publicationRpcEnabled, listEnrolledEducationTests } from "@/lib/educationPublicationRpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type EducationTest = {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  created_at: string;
  is_active: true;
};
type OwnedExamAttempt = {
  id: string;
  test_id: string;
  user_id: string;
  status: string;
};

export default function Education() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [progressFilter, setProgressFilter] = useState<"all" | "in_progress" | "available" | "submitted" | "unavailable">("all");
  const previousUserRef = useRef(user?.id);
  useLayoutEffect(() => {
    if (previousUserRef.current === user?.id) return;
    previousUserRef.current = user?.id;
    setSearch("");
    setSort("newest");
    setProgressFilter("all");
  }, [user?.id]);

  // Never return a different account's catalog from the React Query cache.
  const { data: tests = [], isPending, isFetching, error, refetch } = useQuery<EducationTest[]>({
    queryKey: ["education-active-tests", user?.id],
    enabled: !authLoading && isAuthenticated && !!user?.id,
    retry: 1,
    queryFn: async () => {
      if (publicationRpcEnabled) return await listEnrolledEducationTests();
      const activeTests = supabase
        .from("tests")
        .select("id,title,description,duration_minutes,created_at,is_active")
        .eq("is_active", true);
      // Only list published assessments when staged server admission is live.
      // Protected tests require a separate verified password/enrollment flow.
      const catalog = atomicCbtEnabled ? activeTests.eq("is_published", true) : activeTests;
      const { data, error: loadError } = await catalog.order("created_at", { ascending: false });
      if (loadError) throw loadError;
      return (data ?? []).map(normalizeEducationTest).filter((row): row is EducationTest => row !== null);
    },
  });

  // An already-submitted exam must route to its results, never silently
  // trigger start_cbt_attempt again. Fail closed when the attempt lookup is
  // unavailable rather than showing a misleading "start" action.
  const attemptsQuery = useQuery<OwnedExamAttempt[]>({
    queryKey: ["education-owned-attempt-list", user?.id],
    enabled: atomicCbtEnabled && !authLoading && isAuthenticated &&
      !!user?.id && tests.length > 0,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_attempts")
        .select("id,test_id,user_id,status").eq("user_id", user!.id);
      if (error) throw error;
      const rows = (data ?? []) as OwnedExamAttempt[];
      // A mixed-owner, malformed or ambiguous server record must never be
      // silently converted into permission to open a new assessment.
      indexEducationOwnedAttempts(rows, user!.id);
      return rows.filter(row => row.user_id === user!.id);
    },
  });
  const indexedAttempts = useMemo(() => attemptsQuery.isSuccess && user?.id
    ? indexEducationOwnedAttempts(attemptsQuery.data ?? [], user.id)
    : { byTest: new Map<string, OwnedExamAttempt>(), conflictTests: [] as string[] },
    [attemptsQuery.isSuccess, attemptsQuery.data, user?.id]);
  const ownedAttemptByTest = indexedAttempts.byTest;
  const attemptCheckReady = !atomicCbtEnabled || tests.length === 0 || attemptsQuery.isSuccess;
  const progress = useMemo(() =>
    countEducationCatalogProgress(tests, ownedAttemptByTest, attemptCheckReady, user?.id),
    [tests, ownedAttemptByTest, attemptCheckReady, user?.id]);
  const resumable = useMemo(() =>
    atomicCbtEnabled && attemptCheckReady
      ? continueEducationCatalogItems(tests, ownedAttemptByTest, true, user?.id)
      : [], [tests, ownedAttemptByTest, attemptCheckReady, user?.id]);
  const visible = useMemo(() => {
    const searched = filterEducationTests(tests, search, sort);
    const narrowed = atomicCbtEnabled
      ? filterEducationCatalogProgress(searched, ownedAttemptByTest,
          attemptCheckReady, user?.id, progressFilter)
      : searched;
    return sort === "next_action"
      ? prioritizeEducationCatalog(narrowed, ownedAttemptByTest, attemptCheckReady, user?.id)
      : narrowed;
  }, [tests, search, sort, ownedAttemptByTest, attemptCheckReady, user?.id, progressFilter]);
  const busy = authLoading || (isAuthenticated && isPending);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 sm:p-10">
          <div className="flex items-center gap-3 text-primary">
            <BookOpen aria-hidden="true" className="h-8 w-8" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">ETERNYX Learning</span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Education Hub</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Find available computer-based assessments, review their duration, and open the test workspace.
            Only tests returned by the Education service are listed here.
          </p>
        </header>

        <section aria-label="Structured study paths" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-card p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-foreground">Build and follow real study paths</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Author lessons with objectives, reading, hands-on activities and reflection prompts,
              or import a shared study path. Track completed lessons and resume from an explicit local file.
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11 shrink-0">
            <Link to="/education/study-paths">Open Study Paths
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>

        <section aria-label="Local learner practice" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-card p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-foreground">Practice with a real learner worksheet</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Import an instructor-exported, answer-key-free JSON worksheet, respond at your own pace,
              flag questions for review and save a resume file locally. No sign-in or fake score required.
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11 shrink-0">
            <Link to="/education/practice">Open Practice Workspace
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>

        {!authLoading && isAuthenticated && (
          <>
          <section aria-label="Local question-bank authoring" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-card p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-foreground">Create your own question bank</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Write, validate, and export MCQ, True/False and written questions locally.
                This does not publish assessments or grant an instructor role.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11 shrink-0">
              <Link to="/education/question-bank">Open Question Bank Studio
                <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>

          <section aria-label="Your assessment history" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-card p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-foreground">My assessments</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                View your recorded attempts, resume unfinished exams and reopen submitted results.
                Only your own attempts are shown, with no unverified scores.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11 shrink-0">
              <Link to="/education/history">Open my assessments
                <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>
          </>
        )}

        {!authLoading && !isAuthenticated && (
          <Alert className="border-primary/25 bg-card">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            <AlertDescription className="flex flex-col items-start gap-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Sign in to view available assessments and access your own test attempts.</span>
              <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Link to="/auth?redirect=%2Feducation">Sign in to Education <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {busy && (
          <div role="status" className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {authLoading ? "Checking your session…" : "Loading available assessments…"}
          </div>
        )}

        {isAuthenticated && !authLoading && !isPending && error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Assessments could not be loaded. The database or your account permissions may be unavailable.</span>
              <Button variant="outline" onClick={() => void refetch()}><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Retry loading</Button>
            </AlertDescription>
          </Alert>
        )}

        {isAuthenticated && !authLoading && !isPending && !error && (
          <section aria-labelledby="available-assessments" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Assessment catalog</p>
                <h2 id="available-assessments" className="mt-1 text-2xl font-bold">Available tests</h2>
                <p className="mt-1 text-sm text-muted-foreground">{publicationRpcEnabled ? "Only assessments you are enrolled in are shown." : "Live database listings, not sample exams."}</p>
              </div>
              <Button variant="outline" disabled={isFetching || attemptsQuery.isFetching}
                onClick={() => {
                  void refetch();
                  if (atomicCbtEnabled && tests.length > 0) void attemptsQuery.refetch();
                }} className="min-h-11">
                <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />{isFetching ? "Refreshing…" : "Refresh tests"}
              </Button>
            </div>

            {atomicCbtEnabled && tests.length > 0 && attemptsQuery.isPending && (
              <p role="status" className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Checking your existing exam attempts before enabling any new starts…
              </p>
            )}
            {atomicCbtEnabled && tests.length > 0 && attemptsQuery.error && (
              <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>Existing attempts could not be verified. Starting another exam is temporarily disabled to protect your previous submission.</span>
                <Button variant="outline" onClick={() => void attemptsQuery.refetch()}>Retry attempt check</Button>
              </AlertDescription></Alert>
            )}
            {atomicCbtEnabled && attemptCheckReady && indexedAttempts.conflictTests.length > 0 && (
              <Alert variant="destructive"><AlertDescription>
                {indexedAttempts.conflictTests.length} assessment {indexedAttempts.conflictTests.length === 1 ? "has" : "have"}
                conflicting attempt records. Its start/resume action is disabled until an authorized server review resolves the conflict.
                No attempt was selected arbitrarily.
              </AlertDescription></Alert>
            )}
            {atomicCbtEnabled && attemptCheckReady && tests.length > 0 && (
              <section aria-label="Your assessment progress" className="space-y-3">
                <h3 className="flex items-center gap-2 font-semibold">
                  <ListChecks className="h-4 w-4 text-primary" aria-hidden="true"/>Your assessment progress
                </h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {([
                    ["In progress", progress.in_progress],
                    ["Available", progress.available],
                    ["Submitted", progress.submitted],
                    ["Needs verification", progress.unavailable],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Counts describe only the {progress.total} assessment listings returned for your account.
                  No grades or certificates are inferred from attempt status.
                </p>
                {resumable.length > 0 && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold">Continue where you left off</h4>
                    <Button variant="outline" size="sm" onClick={() => setProgressFilter("in_progress")}>
                      Show all in-progress assessments
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {resumable.map(item => <Button key={item.id} asChild variant="outline" className="min-h-11">
                      <Link to={item.path}>{item.title} · {item.duration_minutes} min
                        <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4"/>
                      </Link>
                    </Button>)}
                  </div>
                </div>}
              </section>
            )}
            {tests.length > 0 && (
              <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="education-search" className="mb-2 block text-sm font-medium">Find an assessment</label>
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <input id="education-search" type="search" value={search} maxLength={120}
                      onChange={e => setSearch(e.target.value)} placeholder="Search titles or descriptions"
                      className="min-h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  </div>
                </div>
                <div>
                  <label htmlFor="education-sort" className="mb-2 block text-sm font-medium">Sort tests</label>
                  <select id="education-sort" value={sort} onChange={e => setSort(e.target.value)}
                    className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="newest">Newest first</option>
                    <option value="title">Title A–Z</option>
                    <option value="shortest">Shortest duration</option>
                    {atomicCbtEnabled && <option value="next_action">Resume first</option>}
                  </select>
                </div>
                {atomicCbtEnabled && <div>
                  <label htmlFor="education-progress-filter" className="mb-2 block text-sm font-medium">
                    My assessment status
                  </label>
                  <select id="education-progress-filter" value={progressFilter}
                    disabled={!attemptCheckReady}
                    onChange={e => setProgressFilter(e.target.value as typeof progressFilter)}
                    className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground">
                    <option value="all">All statuses</option>
                    <option value="in_progress">In progress</option>
                    <option value="available">Available to start</option>
                    <option value="submitted">Submitted</option>
                    <option value="unavailable">Needs verification</option>
                  </select>
                </div>}
              </div>
            )}

            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {visible.length} {visible.length === 1 ? "assessment" : "assessments"} displayed
              {tests.length !== visible.length ? ` out of ${tests.length}` : ""}.
              {atomicCbtEnabled && !attemptCheckReady ? " Attempt status verification is pending." : ""}
            </p>

            {visible.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map(test => {
                  const previous = ownedAttemptByTest.get(test.id);
                  const action = educationAttemptNavigation(test.id, previous, attemptCheckReady, user?.id);
                  const label = action.status === "submitted" ? "Submitted" :
                    action.status === "in_progress" ? "In progress" :
                    action.status === "available" ? "Available" : "Checking access";
                  return (
                  <Card key={test.id} className="flex flex-col border-border bg-card transition-colors hover:border-primary/35">
                    <CardHeader className="flex-1">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <Badge variant="outline" className="border-primary/30 text-primary">{attemptCheckReady ? label : "Checking attempt"}</Badge>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock3 aria-hidden="true" className="h-4 w-4" />{test.duration_minutes} min
                        </span>
                      </div>
                      <CardTitle className="break-words text-lg">{test.title}</CardTitle>
                      <CardDescription className="break-words leading-6">
                        {test.description || "No description was provided for this assessment."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {action.path ? (
                        <Button asChild className="min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                          <Link to={action.path} aria-label={`${action.label}: ${test.title}`}>
                            {action.label}
                            <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      ) : (
                        <Button disabled className="min-h-11 w-full">Attempt status unavailable</Button>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
                <BookOpen aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-primary" />
                <h3 className="text-lg font-semibold">{tests.length ? "No matching assessments" : "No active assessments available"}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tests.length ? "No returned assessments match the current title, status and sorting filters." :
                    "No active tests were returned for this account. Check again later."}
                </p>
                {tests.length > 0 && (
                  <Button variant="outline" className="mt-4"
                    onClick={() => { setSearch(""); setSort("newest"); setProgressFilter("all"); }}>
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        <section aria-label="Assessment information" className="grid gap-4 md:grid-cols-3">
          {[
            ["Your account", "Sign in is required. Your access to test attempts is controlled by server permissions."],
            ["Assessment time", "Each listing shows its configured duration. Confirm the rules and timer inside the test before starting."],
            ["Results and grading", "Scores and completion depend on the configured grading service. A test listing is not proof of automatic grading."]
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
