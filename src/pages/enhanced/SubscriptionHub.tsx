import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import SubscriptionTiers from '@/components/enhanced/SubscriptionTiers';
import { SubscriptionManager } from '@/components/SubscriptionManager';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { Activity, CreditCard, Crown, RefreshCw, Shield } from 'lucide-react';

interface CreditSnapshot {
  planId: 'free' | 'premium' | 'elite';
  balance: number;
  features: Array<{ featureKey: string; creditsPerUse: number }>;
}

type SnapshotState = 'idle' | 'loading' | 'ready' | 'error';

export default function SubscriptionHub() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('plans');
  const [isLoading, setIsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<CreditSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>('idle');

  const loadCreditSnapshot = async () => {
    if (!user) {
      setSnapshot(null);
      setSnapshotState('error');
      return;
    }

    setSnapshotState('loading');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

      const { data, error } = await supabase.functions.invoke('credit-snapshot', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) throw error;
      if (!data ||
          !['free', 'premium', 'elite'].includes(data.planId) ||
          !Number.isInteger(data.balance) ||
          data.balance < 0 ||
          !Array.isArray(data.features) ||
          data.features.some((feature: unknown) =>
            !feature ||
            typeof feature !== 'object' ||
            typeof (feature as { featureKey?: unknown }).featureKey !== 'string' ||
            !Number.isInteger((feature as { creditsPerUse?: unknown }).creditsPerUse) ||
            (feature as { creditsPerUse: number }).creditsPerUse < 0
          )) {
        throw new Error('The credit service returned an invalid response.');
      }

      setSnapshot(data as CreditSnapshot);
      setSnapshotState('ready');
    } catch (error) {
      console.error('Credit snapshot could not be verified:', error);
      setSnapshot(null);
      setSnapshotState('error');
    }
  };

  useEffect(() => {
    if (activeTab === 'usage') void loadCreditSnapshot();
  }, [activeTab, user]);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      toast.error('Please log in to choose a subscription');
      return;
    }

    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { planId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) throw error;
      if (!data?.url || typeof data.url !== 'string') {
        throw new Error('Checkout is not available right now.');
      }

      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Subscription checkout could not be started:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to start checkout');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-primary/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold text-primary glitch mb-2" data-text="SUBSCRIPTION HUB">
            SUBSCRIPTION HUB
          </h1>
          <p className="text-muted-foreground">
            Manage your ETERNYX plan and explore subscription options
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-primary/20">
            <TabsTrigger value="plans">
              <Crown className="h-4 w-4 mr-2" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="current">
              <Shield className="h-4 w-4 mr-2" />
              Current
            </TabsTrigger>
            <TabsTrigger value="usage">
              <Activity className="h-4 w-4 mr-2" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="billing">
              <CreditCard className="h-4 w-4 mr-2" />
              Billing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans">
            <SubscriptionTiers onSubscribe={handleSubscribe} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="current">
            <SubscriptionManager />
          </TabsContent>

          <TabsContent value="usage" className="space-y-6">
            {snapshotState === 'loading' && (
              <Card className="p-6 bg-card/50 border-primary/20" aria-live="polite">
                <p className="text-muted-foreground">Verifying your plan and credit balance…</p>
              </Card>
            )}

            {snapshotState === 'error' && (
              <Card className="p-6 bg-card/50 border-primary/20 space-y-4">
                <h2 className="text-xl font-semibold">Usage and credits</h2>
                <p className="text-muted-foreground">
                  Credit information is not available for verification yet. The ledger
                  migration and snapshot service must be installed before balances or
                  feature access can be displayed. No plan, balance, or usage is assumed.
                </p>
                <Button variant="outline" onClick={() => void loadCreditSnapshot()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </Card>
            )}

            {snapshotState === 'ready' && snapshot && (
              <>
                <Card className="p-6 bg-card/50 border-primary/20 space-y-3">
                  <h2 className="text-xl font-semibold">Verified credit balance</h2>
                  <p className="text-3xl font-bold tabular-nums">{snapshot.balance.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">
                    Plan: {snapshot.planId === 'free' ? 'Ghost Access' : snapshot.planId === 'premium' ? 'Shadow Operative' : 'Cyber Overlord'}
                  </p>
                </Card>
                <Card className="p-6 bg-card/50 border-primary/20 space-y-3">
                  <h2 className="text-xl font-semibold">Enabled features</h2>
                  {snapshot.features.length === 0 ? (
                    <p className="text-muted-foreground">
                      No feature entitlements have been configured for this plan yet.
                      Tool access and credit costs remain unconfigured.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {snapshot.features.map((feature) => (
                        <li key={feature.featureKey} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>{feature.featureKey}</span>
                          <span className="text-muted-foreground">
                            {feature.creditsPerUse === 0 ? 'No credit cost configured' : `${feature.creditsPerUse} credits per use`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card className="p-6 bg-card/50 border-primary/20">
              <h2 className="text-xl font-semibold mb-2">Billing history and payment methods</h2>
              <p className="text-muted-foreground">
                Billing history and saved payment-method details are not connected yet.
                If you already have a billing account, use the customer-portal action in
                the Current tab when it is available. No sample transactions or card
                details are shown here.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
