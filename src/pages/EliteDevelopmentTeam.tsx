import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Code2, Mail, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Legacy "elite development team" landing route.
 * Staff biographies, photos, external profiles and fake submission confirmations retired.
 */
const EliteDevelopmentTeam = () => (
  <div className="min-h-screen bg-background text-white">
    <div className="mx-auto max-w-5xl space-y-7 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" className="text-slate-300">
        <Link to="/explore"><ArrowLeft className="mr-2 h-4 w-4" />Explore ETERNYX</Link>
      </Button>
      <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/40 via-slate-950 to-violet-950/30 p-7 sm:p-10">
        <div className="flex items-center gap-3 text-cyan-200"><Code2 className="h-7 w-7" />PROJECT INQUIRIES</div>
        <h1 className="mt-4 text-3xl font-bold sm:text-5xl">Development inquiry</h1>
        <p className="mt-4 text-slate-300">
          Explore engineering workbenches or send a project inquiry for review. Submission does not guarantee
          a contract, dedicated team, delivery date, or staffing availability.
        </p>
        <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Staff and service availability not verified</Badge>
      </section>
      <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          The previous page contained fictional employee identities and a form that only displayed a success alert
          without sending an inquiry. Both have been removed. Use the actual ETERNYX contact form below.
          The contact form reports a success only when its backend accepts the submission.
        </AlertDescription>
      </Alert>
      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <Mail className="h-7 w-7 text-cyan-300" />
            <CardTitle className="text-white">Submit a project inquiry</CardTitle>
            <CardDescription className="text-slate-400">
              The contact route uses the existing backend submission flow and reports failures when the service is unavailable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 text-cyan-200">
              <Link to="/contact">Open contact form <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <Code2 className="h-7 w-7 text-violet-300" />
            <CardTitle className="text-white">Developer Studio</CardTitle>
            <CardDescription className="text-slate-400">
              Explore browser-based engineering utilities and available workbenches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 text-cyan-200">
              <Link to="/developer-studio">Open developer tools <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  </div>
);

export default EliteDevelopmentTeam;
