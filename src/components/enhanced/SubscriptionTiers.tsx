import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  Crown, 
  Shield, 
  Zap, 
  Star,
  Infinity,
  Lock,
  Unlock,
  Diamond,
  Skull
} from 'lucide-react';

interface SubscriptionFeature {
  name: string;
  included: boolean;
  premium?: boolean;
}

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  bgGradient: string;
  features: SubscriptionFeature[];
  popular?: boolean;
  stripePriceId?: string;
}

export const SubscriptionTiers = () => {
  const [selectedTier, setSelectedTier] = useState<string>('premium');
  const [isProcessing, setIsProcessing] = useState(false);

  const tiers: SubscriptionTier[] = [
    {
      id: 'free',
      name: 'GHOST ACCESS',
      price: 0,
      period: 'forever',
      description: 'Basic security tools for individual hackers',
      icon: <Shield className="h-8 w-8" />,
      color: 'text-blue-400',
      borderColor: 'border-blue-400/50',
      bgGradient: 'from-blue-500/10 to-cyan-500/10',
      features: [
        { name: 'Basic vulnerability scanner', included: true },
        { name: 'Community threat intel', included: true },
        { name: 'Standard encryption tools', included: true },
        { name: 'Public forums access', included: true },
        { name: 'AI assistant (5 queries/day)', included: true },
        { name: 'Advanced penetration testing', included: false },
        { name: 'Real-time threat monitoring', included: false },
        { name: 'Quantum encryption', included: false },
        { name: 'Elite development team', included: false },
        { name: 'Blockchain verification', included: false }
      ]
    },
    {
      id: 'premium',
      name: 'SHADOW OPERATIVE',
      price: 29.99,
      period: 'month',
      description: 'Professional-grade security arsenal',
      icon: <Zap className="h-8 w-8" />,
      color: 'text-purple-400',
      borderColor: 'border-purple-400/50',
      bgGradient: 'from-purple-500/10 to-pink-500/10',
      popular: true,
      stripePriceId: 'price_premium_monthly',
      features: [
        { name: 'Advanced vulnerability scanner', included: true },
        { name: 'Premium threat intelligence', included: true },
        { name: 'Quantum-ready encryption', included: true },
        { name: 'Private community access', included: true },
        { name: 'AI assistant (unlimited)', included: true },
        { name: 'Real-time threat monitoring', included: true },
        { name: 'Penetration testing suite', included: true },
        { name: 'Custom security reports', included: true },
        { name: 'Elite development team', included: false },
        { name: 'Blockchain verification', included: false }
      ]
    },
    {
      id: 'elite',
      name: 'CYBER OVERLORD',
      price: 99.99,
      period: 'month',
      description: 'Ultimate cybersecurity dominance',
      icon: <Crown className="h-8 w-8" />,
      color: 'text-orange-400',
      borderColor: 'border-orange-400/50',
      bgGradient: 'from-orange-500/10 to-red-500/10',
      stripePriceId: 'price_elite_monthly',
      features: [
        { name: 'Enterprise vulnerability lab', included: true },
        { name: 'Classified threat intelligence', included: true },
        { name: 'Military-grade encryption', included: true },
        { name: 'VIP community & mentorship', included: true },
        { name: 'AI assistant (priority)', included: true },
        { name: '24/7 threat monitoring', included: true },
        { name: 'Advanced exploit simulations', included: true },
        { name: 'White-label solutions', included: true },
        { name: 'Elite development team', included: true },
        { name: 'Blockchain verification', included: true, premium: true }
      ]
    }
  ];

  const handleSubscribe = async (tierId: string) => {
    const tier = tiers.find(t => t.id === tierId);
    if (!tier || tier.price === 0) return;

    setIsProcessing(true);
    
    try {
      // Simulate Stripe checkout process
      console.log(`Initiating Stripe checkout for ${tier.name} - ${tier.stripePriceId}`);
      
      // In real implementation, this would redirect to Stripe Checkout
      // const stripe = await loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
      // const { error } = await stripe.redirectToCheckout({
      //   lineItems: [{ price: tier.stripePriceId, quantity: 1 }],
      //   mode: 'subscription',
      //   successUrl: `${window.location.origin}/dashboard?subscription=success`,
      //   cancelUrl: `${window.location.origin}/pricing?subscription=cancelled`,
      // });
      
      setTimeout(() => {
        setIsProcessing(false);
        alert(`Stripe checkout would be initiated for ${tier.name}`);
      }, 2000);
      
    } catch (error) {
      console.error('Subscription error:', error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="text-center mb-12">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary glitch" data-text="CHOOSE YOUR LEVEL">
          CHOOSE YOUR LEVEL
        </h2>
        <p className="text-muted-foreground text-lg">
          Unlock the full potential of the digital underground
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {tiers.map((tier) => (
          <Card
            key={tier.id}
            className={`relative p-6 transition-all duration-500 hover:scale-105 cursor-pointer ${
              tier.borderColor
            } ${
              selectedTier === tier.id ? 'ring-2 ring-primary' : ''
            } ${
              tier.popular ? 'ring-2 ring-purple-400 animate-pulse-glow' : ''
            } bg-gradient-to-br ${tier.bgGradient} backdrop-blur-sm`}
            onClick={() => setSelectedTier(tier.id)}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-purple-500 text-white px-4 py-1 animate-bounce">
                  <Star className="h-3 w-3 mr-1" />
                  MOST POPULAR
                </Badge>
              </div>
            )}

            <div className="text-center mb-6">
              <div className={`${tier.color} mb-4 flex justify-center animate-float`}>
                {tier.icon}
              </div>
              <h3 className={`text-xl font-bold ${tier.color} mb-2 neon-text`}>
                {tier.name}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                {tier.description}
              </p>
              <div className="flex items-baseline justify-center">
                <span className={`text-4xl font-bold ${tier.color}`}>
                  ${tier.price}
                </span>
                {tier.price > 0 && (
                  <span className="text-muted-foreground ml-1">/{tier.period}</span>
                )}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {tier.features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  {feature.included ? (
                    <Check className={`h-4 w-4 ${feature.premium ? 'text-orange-400' : 'text-green-400'}`} />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={`text-sm ${
                    feature.included 
                      ? feature.premium 
                        ? 'text-orange-400 font-medium' 
                        : 'text-foreground' 
                      : 'text-muted-foreground'
                  }`}>
                    {feature.name}
                  </span>
                  {feature.premium && (
                    <Diamond className="h-3 w-3 text-orange-400 animate-pulse" />
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={() => handleSubscribe(tier.id)}
              disabled={isProcessing}
              className={`w-full ${
                tier.price === 0
                  ? 'bg-card hover:bg-card/80 text-foreground border border-primary/30'
                  : selectedTier === tier.id
                  ? 'bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow'
                  : 'bg-card hover:bg-primary/20 text-foreground border border-primary/30'
              } transition-all duration-300`}
            >
              {tier.price === 0 ? (
                <>
                  <Unlock className="mr-2 h-4 w-4" />
                  Access Now
                </>
              ) : (
                <>
                  <Skull className="mr-2 h-4 w-4" />
                  {isProcessing ? 'Processing...' : 'Initiate Protocol'}
                </>
              )}
            </Button>
          </Card>
        ))}
      </div>

      {/* Additional Features Section */}
      <div className="mt-16 text-center">
        <h3 className="text-2xl font-bold text-primary mb-8">
          All Tiers Include
        </h3>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="flex flex-col items-center space-y-2">
            <Shield className="h-8 w-8 text-green-400 animate-pulse" />
            <span className="text-sm font-medium">99.9% Uptime</span>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <Lock className="h-8 w-8 text-blue-400 animate-pulse" />
            <span className="text-sm font-medium">End-to-End Encryption</span>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <Zap className="h-8 w-8 text-yellow-400 animate-pulse" />
            <span className="text-sm font-medium">Lightning Fast</span>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <Infinity className="h-8 w-8 text-purple-400 animate-pulse" />
            <span className="text-sm font-medium">Unlimited Bandwidth</span>
          </div>
        </div>
      </div>
    </div>
  );
};

