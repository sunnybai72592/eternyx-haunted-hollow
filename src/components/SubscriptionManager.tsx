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
  ExternalLink
} from 'lucide-react';

interface SubscriptionData {
  subscribed: boolean;
  subscription_tier?: string;
  subscription_end?: string;
}

export function SubscriptionManager() {
  const { user } = useAuthStore();
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkSubscription = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      setSubscriptionData(data);
    } catch (error) {
      console.error('Error checking subscription:', error);
      toast.error('Failed to check subscription status');
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      toast.error('Please login to subscribe');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { planId },
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      
      if (data.url) {
        // Open Stripe checkout in a new tab
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Failed to create checkout session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      
      if (data.url) {
        // Open Stripe customer portal in a new tab
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error('Failed to open customer portal');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      checkSubscription();
    }
  }, [user]);

  const getPlanDetails = (tier?: string) => {
    switch (tier) {
      case 'premium':
        return {
          name: 'Shadow Operative',
          price: '$29.99',
          icon: <Shield className="h-6 w-6 text-purple-400" />,
          color: 'border-purple-400/50 bg-purple-500/10'
        };
      case 'elite':
        return {
          name: 'Cyber Overlord',
          price: '$99.99',
          icon: <Crown className="h-6 w-6 text-orange-400" />,
          color: 'border-orange-400/50 bg-orange-500/10'
        };
      default:
        return {
          name: 'Ghost Access',
          price: 'Free',
          icon: <Star className="h-6 w-6 text-blue-400" />,
          color: 'border-blue-400/50 bg-blue-500/10'
        };
    }
  };

  if (!user) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20">
        <p className="text-muted-foreground text-center">
          Please login to manage your subscription
        </p>
      </Card>
    );
  }

  const planDetails = getPlanDetails(subscriptionData?.subscription_tier);

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      <Card className={`p-6 border ${planDetails.color} neon-border`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {planDetails.icon}
            <div>
              <h3 className="text-xl font-bold text-primary">{planDetails.name}</h3>
              <p className="text-muted-foreground">{planDetails.price}/month</p>
            </div>
          </div>
          <Badge variant="outline" className={subscriptionData?.subscribed ? 'text-green-400 border-green-400/50' : 'text-gray-400 border-gray-400/50'}>
            {subscriptionData?.subscribed ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        </div>

        {subscriptionData?.subscription_end && (
          <p className="text-sm text-muted-foreground mb-4">
            Renews on: {new Date(subscriptionData.subscription_end).toLocaleDateString()}
          </p>
        )}

        <div className="flex gap-3">
          {subscriptionData?.subscribed ? (
            <Button
              onClick={handleManageSubscription}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Subscription
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <>
              <Button
                onClick={() => handleSubscribe('premium')}
                disabled={isLoading}
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Shield className="h-4 w-4 mr-2" />
                Upgrade to Premium
              </Button>
              <Button
                onClick={() => handleSubscribe('elite')}
                disabled={isLoading}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Elite
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Refresh Subscription Status */}
      <div className="text-center">
        <Button
          variant="outline"
          onClick={checkSubscription}
          disabled={isLoading}
          size="sm"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Refresh Status
        </Button>
      </div>
    </div>
  );
}