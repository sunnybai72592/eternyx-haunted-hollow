import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import {
  Crown,
  Shield,
  Star,
  CheckCircle,
  CreditCard,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface SubscriptionData {
  subscribed: boolean;
  subscription_tier?: string | null;
  subscription_end?: string | null;
  subscription_status?: string;
  cancel_at_period_end?: boolean;
}

type LookupState = 'loading' | 'ready' | 'error';

export function SubscriptionManager() {
  const { user } = useAuthStore();
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>('loading');
  const [isLoading, setIsLoading] = useState(false);

  const checkSubscription = async () => {
    if (!user) {
      setSubscriptionData(null);
      setLookupState('error');
      return;
    }

    setLookupState('loading');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) throw error;
      if (!data || typeof data.subscribed !== 'boolean') {
        throw new Error('The subscription service returned an invalid response.');
      }

      setSubscriptionData(data as SubscriptionData);
      setLookupState('ready');
    } catch (error) {
      console.error('Error checking subscription:', error);
      setSubscriptionData(null);
      setLookupState('error');
      toast.error(error instanceof Error ? error.message : 'Failed to check subscription status');
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      toast.error('Please log in to subscribe');
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
      console.error('Error creating checkout:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create checkout session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) throw error;
      if (!data?.url || typeof data.url !== 'string') {
        throw new Error('The billing portal is not available right now.');
      }

      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open customer portal');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void checkSubscription();
  }, [user]);

  const getPlanDetails = (tier?: string | null) => {
    switch (tier) {
      case 'premium':
        return {
          name: 'Shadow Operative',
          price: '$29.99',
          icon: <Shield className="h-6 w-6 text-purple-400" />,
          color: 'border-purple-400/50 bg-purple-500/10',
        };
      case 'elite':
        return {
          name: 'Cyber Overlord',
          price: '$99.99',
          icon: <Crown className="h-6 w-6 text-orange-400" />,
          color: 'border-orange-400/50 bg-orange-500/10',
        };
      default:
        return {
          name: 'Ghost Access',
          price: 'Free',
          icon: <Star className="h-6 w-6 text-blue-400" />,
          color: 'border-blue-400/50 bg-blue-500/10',
        };
    }
  };

  if (!user) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20">
        <p className="text-muted-foreground text-center">
          Please log in to manage your subscription
        </p>
      </Card>
    );
  }

  if (lookupState === 'loading') {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20" aria-live="polite">
        <p className="text-muted-foreground text-center">Checking your subscription status…</p>
      </Card>
    );
  }

  if (lookupState === 'error' || !subscriptionData) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 space-y-4">
        <p className="text-muted-foreground text-center">
          Your subscription status could not be verified. No plan or access level is being assumed.
        </p>
        <div className="text-center">
          <Button variant="outline" onClick={checkSubscription} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  const isSubscribed = subscriptionData.subscribed;
  const hasKnownTier = !isSubscribed ||
    subscriptionData.subscription_tier === 'premium' ||
    subscriptionData.subscription_tier === 'elite';

  if (!hasKnownTier) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 space-y-4">
        <p className="text-muted-foreground text-center">
          An active subscription was found, but its plan could not be identified. Access details are withheld until the plan is verified.
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={checkSubscription} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
          <Button onClick={handleManageSubscription} disabled={isLoading}>
            <CreditCard className="h-4 w-4 mr-2" />
            Manage Billing
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </Card>
    );
  }

  const planDetails = getPlanDetails(subscriptionData.subscription_tier);

  return (
    <div className="space-y-6">
      <Card className={`p-6 border ${planDetails.color} neon-border`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {planDetails.icon}
            <div>
              <h3 className="text-xl font-bold text-primary">{planDetails.name}</h3>
              <p className="text-muted-foreground">{planDetails.price}/month</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={isSubscribed ? 'text-green-400 border-green-400/50' : 'text-gray-400 border-gray-400/50'}
          >
            {isSubscribed ? 'ACTIVE' : 'NO PAID PLAN'}
          </Badge>
        </div>

        {subscriptionData.subscription_end && (
          <p className="text-sm text-muted-foreground mb-4">
            {subscriptionData.cancel_at_period_end ? 'Access ends:' : 'Current period ends:'}{' '}
            {new Date(subscriptionData.subscription_end).toLocaleDateString()}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {isSubscribed ? (
            <Button onClick={handleManageSubscription} disabled={isLoading} className="bg-primary hover:bg-primary/90">
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Subscription
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <>
              <Button onClick={() => handleSubscribe('premium')} disabled={isLoading} className="bg-purple-500 hover:bg-purple-600">
                <Shield className="h-4 w-4 mr-2" />
                Upgrade to Premium
              </Button>
              <Button onClick={() => handleSubscribe('elite')} disabled={isLoading} className="bg-orange-500 hover:bg-orange-600">
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Elite
              </Button>
            </>
          )}
        </div>
      </Card>

      <div className="text-center">
        <Button variant="outline" onClick={checkSubscription} disabled={isLoading} size="sm">
          <CheckCircle className="h-4 w-4 mr-2" />
          Refresh Status
        </Button>
      </div>
    </div>
  );
}
