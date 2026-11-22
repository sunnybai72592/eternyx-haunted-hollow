import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, Code2, Eye, ShieldCheck, Terminal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Legacy /hacked route kept as a clearly fictional cyberpunk gateway.
 * No breach detection, access elevation, entitlement grant or promotion occurs.
 */
const destinations = [
  { title: "Cybersecurity Hub", description: "Authorized defensive workbenches and threat-modeling utilities.", href: "/cybersecurity", icon: ShieldCheck },
  { title: "Developer Studio", description: "Real browser utilities for development, formatting and inspection.", href: "/developer-studio", icon: Code2 },
  { title: "AI Arsenal", description: "Eight studios with clearly labeled local tools and inactive provider features.", href: "/ai-arsenal", icon: Bot },
] as const;

const Hacked = () => (
  <div className="min-h-screen bg-background text-white">
    <div className="mx-auto max-w-6xl space-y-7 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" className="text-slate-300">
        <Link to="/explore"><ArrowLeft className="mr-2 h-4 w-4" />Explore ETERNYX</Link>
      </Button>
      <section className="relative overflow-hidden rounded-3xl border border-rose-400/25 bg-gradient-to-br from-rose-950/40 via-slate-950 to-cyan-950/40 p-7 sm:p-12">
        <div className="mb-4 flex items-center gap-2 text-rose-200"><Terminal className="h-6 w-6" />CYBERPUNK EXPERIENCE</div>
        <h1 className="text-3xl font-extrabold tracking-wide text-white sm:text-6xl">ENTER THE ETERNYX UNIVERSE</h1>
        <p className="mt-5 max-w-3xl text-slate-300">
          A creative gateway to the platform's actual tools. The cinematic design is fictional, not a hacking event or verification of your system's security.
        </p>
        <Badge variant="outline" className="mt-6 border-amber-400/30 text-amber-200">Thematic experience · no security action performed</Badge>
      </section>
      <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
        <Eye className="h-4 w-4" />
        <AlertDescription>
          No network was scanned, no privileges were granted, no subscription was activated and no breach was detected.
          ETERNYX does not promise 24/7 threat monitoring or instant premium access on this page.
        </AlertDescription>
      </Alert>
      <section className="grid gap-4 md:grid-cols-3">
        {destinations.map(destination => {
          const Icon = destination.icon;
          return (
            <Card key={destination.href} className="flex flex-col border-slate-800 bg-slate-900/70 text-slate-100">
              <CardHeader>
                <Icon className="mb-2 h-7 w-7 text-cyan-300" aria-hidden="true" />
                <CardTitle className="text-white">{destination.title}</CardTitle>
                <CardDescription className="text-slate-400">{destination.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 text-cyan-200">
                  <Link to={destination.href}>Open workspace <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  </div>
);

export default Hacked;
