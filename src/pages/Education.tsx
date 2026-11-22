import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Clock3, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { filterEducationTests, normalizeEducationTest } from "@/lib/educationCatalog.mjs";
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

export default function Education() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");

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

  const visible = useMemo(() => filterEducationTests(tests, search, sort), [tests, search, sort]);
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

        {!authLoading && isAuthenticated && (
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
              <Button variant="outline" disabled={isFetching} onClick={() => void refetch()} className="min-h-11">
                <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />{isFetching ? "Refreshing…" : "Refresh tests"}
              </Button>
            </div>

            {tests.length > 0 && (
              <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto]">
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
                  </select>
                </div>
              </div>
            )}

            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {visible.length} {visible.length === 1 ? "assessment" : "assessments"} displayed
              {tests.length !== visible.length ? ` out of ${tests.length}` : ""}.
            </p>

            {visible.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map(test => (
                  <Card key={test.id} className="flex flex-col border-border bg-card transition-colors hover:border-primary/35">
                    <CardHeader className="flex-1">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <Badge variant="outline" className="border-primary/30 text-primary">Available</Badge>
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
                      <Button asChild className="min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                        <Link to={`/test/${test.id}`} aria-label={`Open assessment: ${test.title}`}>
                          Open assessment <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
                <BookOpen aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-primary" />
                <h3 className="text-lg font-semibold">{tests.length ? "No matching assessments" : "No active assessments available"}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tests.length ? "Try a different title or description." : "No active tests were returned for this account. Check again later."}
                </p>
                {tests.length > 0 && (
                  <Button variant="outline" className="mt-4" onClick={() => { setSearch(""); setSort("newest"); }}>Clear filters</Button>
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
