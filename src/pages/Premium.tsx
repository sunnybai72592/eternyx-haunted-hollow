import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Crown, ShieldCheck, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Legacy premium marketing route. Prices and purchase actions are intentionally unavailable. */
const Premium = () => (
  <div className="min-h-screen bg-background text-white">
    <div className="mx-auto max-w-5xl space-y-7 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" className="text-slate-300">
        <Link to="/explore"><ArrowLeft className="mr-2 h-4 w-4" />Explore ETERNYX</Link>
      </Button>
      <section className="rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-950/40 via-slate-950 to-violet-950/30 p-7 sm:p-10">
        <div className="flex items-center gap-3 text-amber-200"><Crown className="h-7 w-7" />FUTURE SUBSCRIPTIONS</div>
        <h1 className="mt-4 text-3xl font-bold sm:text-5xl">Premium features roadmap</h1>
        <p className="mt-4 text-slate-300">
          We are preparing controlled subscription and usage features. Plans, prices and premium service entitlements
          have not been approved for public purchase.
        </p>
        <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Pricing not published · purchases not available here</Badge>
      </section>
      <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          The older pricing page showed sample prices and nonfunctional purchase buttons. Those are removed.
          This page cannot create a checkout, charge a card, grant entitlements or reserve credits.
          Planned AI and premium features should not be mistaken for active services.
        </AlertDescription>
      </Alert>
      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <Wallet className="h-7 w-7 text-cyan-300" />
            <CardTitle className="text-white">Controlled launch first</CardTitle>
            <CardDescription className="text-slate-400">
              Billing requires verified provider costs, clear entitlements, refund and reconciliation behavior,
              production configuration and explicit launch approval.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <ShieldCheck className="h-7 w-7 text-amber-300" />
            <CardTitle className="text-white">Explore available tools</CardTitle>
            <CardDescription className="text-slate-400">
              Use currently implemented local developer and security utilities while we validate premium features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full justify-between border-cyan-400/30 text-cyan-200">
              <Link to="/explore">Explore verified workspaces <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  </div>
);

export default Premium;
