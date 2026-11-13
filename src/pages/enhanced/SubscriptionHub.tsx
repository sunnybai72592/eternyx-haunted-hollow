import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SubscriptionTiers from '@/components/enhanced/SubscriptionTiers';
import { SubscriptionManager } from '@/components/SubscriptionManager';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { Activity, CreditCard, Crown, Shield } from 'lucide-react';

export default function SubscriptionHub() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('plans');
  const [isLoading, setIsLoading] = useState(false);

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
            <Card className="p-6 bg-card/50 border-primary/20">
              <h2 className="text-xl font-semibold mb-2">Usage and credits</h2>
              <p className="text-muted-foreground">
                Usage reporting is not available yet. ETERNYX is preparing its shared
                entitlement and credit ledger; no usage totals or limits are displayed
                until they can be read from the authoritative backend.
              </p>
            </Card>
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
