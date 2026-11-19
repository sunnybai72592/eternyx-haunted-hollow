import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, ShieldCheck, Wallet } from "lucide-react";

interface SubscriptionTiersProps {
  onSubscribe: (planId: string) => Promise<void>;
  isLoading: boolean;
  testCheckoutEnabled?: boolean;
}

const tierPreviews = [
  {
    id: "free",
    name: "GHOST ACCESS",
    description: "Explore free/local ETERNYX workspaces. Actual feature availability varies.",
    status: "Local workspaces available",
    icon: ShieldCheck,
  },
  {
    id: "premium",
    name: "SHADOW OPERATIVE",
    description: "Future paid subscription tier. Final entitlements, costs and prices are not published.",
    status: "Paid features not activated",
    icon: Wallet,
  },
  {
    id: "elite",
    name: "CYBER OVERLORD",
    description: "Future advanced tier. No promise of 24/7 monitoring, AI generation, or managed services.",
    status: "Paid features not activated",
    icon: Crown,
  },
] as const;

const SubscriptionTiers = ({ onSubscribe, isLoading, testCheckoutEnabled = false }: SubscriptionTiersProps) => (
  <div className="space-y-5">
    <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
      Live subscriptions are not for sale. These are roadmap tiers without published prices or guaranteed entitlements.
      {testCheckoutEnabled
        ? " A sandbox test checkout may be used by authorized testers. No real card charges are supported."
        : " Checkout is currently disabled."}
    </div>
    <div className="grid gap-5 md:grid-cols-3">
      {tierPreviews.map(tier => {
        const Icon = tier.icon;
        return (
          <Card key={tier.id} className="flex flex-col border-slate-800 bg-slate-900/60 text-slate-100">
            <CardHeader>
              <Icon aria-hidden="true" className="h-7 w-7 text-cyan-300" />
              <CardTitle className="pt-3 text-white">{tier.name}</CardTitle>
              <CardDescription className="text-slate-400">{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <Badge variant="outline">{tier.status}</Badge>
              {tier.id === "free" ? (
                <p className="text-xs text-slate-400">No Stripe payment required for browser-only utilities.</p>
              ) : testCheckoutEnabled ? (
                <Button type="button" variant="outline" className="w-full"
                  disabled={isLoading}
                  onClick={() => void onSubscribe(tier.id)}>
                  {isLoading ? "Preparing sandbox checkout…" : "Open sandbox test checkout"}
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled className="w-full">
                  Checkout unavailable
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
);

export default SubscriptionTiers;
