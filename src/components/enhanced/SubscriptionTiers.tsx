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
  buttonText: string;
  buttonClass: string;
  buttonIcon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

interface SubscriptionTiersProps {
  onSubscribe: (planId: string) => Promise<void>;
  isLoading: boolean;
}

const SubscriptionTiers = ({ onSubscribe, isLoading }: SubscriptionTiersProps) => {
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
        { name: 'Custom security reports', included: false },
        { name: 'Priority support', included: false },
        { name: 'Quantum encryption', included: false }
      ],
      buttonText: 'Current Plan',
      buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white',
      buttonIcon: <Shield className="w-4 h-4 mr-2" />
    },
    {
      id: 'premium',
      name: 'SHADOW OPERATIVE',
      price: 29.99,
      period: 'month',
      description: 'Advanced tools for professional hackers',
      icon: <Crown className="h-8 w-8" />,
      color: 'text-purple-400',
      borderColor: 'border-purple-400/50',
      bgGradient: 'from-purple-500/10 to-pink-500/10',
      badge: 'MOST POPULAR',
      badgeColor: 'bg-purple-600',
      features: [
        { name: 'All Ghost Access features', included: true },
        { name: 'Advanced vulnerability scanner', included: true },
        { name: 'Premium threat intelligence', included: true },
        { name: 'Quantum-ready encryption', included: true },
        { name: 'Private community access', included: true },
        { name: 'AI assistant (unlimited)', included: true },
        { name: 'Real-time threat monitoring', included: true },
        { name: 'Penetration testing suite', included: true },
        { name: 'Custom security reports', included: true },
        { name: 'Priority support', included: true }
      ],
      buttonText: 'Upgrade to Shadow',
      buttonClass: 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/25',
      buttonIcon: <Crown className="w-4 h-4 mr-2" />
    },
    {
      id: 'elite',
      name: 'CYBER OVERLORD',
      price: 99.99,
      period: 'month',
      description: 'Ultimate power for cybersecurity masters',
      icon: <Diamond className="h-8 w-8" />,
      color: 'text-orange-400',
      borderColor: 'border-orange-400/50',
      bgGradient: 'from-orange-500/10 to-red-500/10',
      badge: 'ULTIMATE',
      badgeColor: 'bg-gradient-to-r from-orange-500 to-red-500',
      features: [
        { name: 'All Shadow Operative features', included: true },
        { name: 'Enterprise vulnerability lab', included: true },
        { name: 'Classified threat intelligence', included: true },
        { name: 'Military-grade encryption', included: true },
        { name: 'VIP community & mentorship', included: true },
        { name: 'AI assistant (priority)', included: true },
        { name: '24/7 threat monitoring', included: true },
        { name: 'Advanced exploit simulations', included: true },
        { name: 'White-label solutions', included: true },
        { name: 'Elite development team', included: true }
      ],
      buttonText: 'Become Overlord',
      buttonClass: 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/25',
      buttonIcon: <Diamond className="w-4 h-4 mr-2" />
    }
  ];

  const handleSubscribe = async (tierId: string) => {
    if (tierId === 'free') return; // Free tier doesn't need subscription
    
    setIsProcessing(true);
    try {
      await onSubscribe(tierId);
    } catch (error) {
      console.error('Subscription error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {tiers.map((tier) => (
        <Card
          key={tier.id}
          className={`relative overflow-hidden bg-gradient-to-br ${tier.bgGradient} border-2 ${tier.borderColor} hover:shadow-2xl transition-all duration-300 transform hover:scale-105 ${
            selectedTier === tier.id ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => setSelectedTier(tier.id)}
        >
          {/* Badge */}
          {tier.badge && (
            <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold text-white ${tier.badgeColor} shadow-lg`}>
              {tier.badge}
            </div>
          )}

          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className={`mx-auto w-16 h-16 rounded-full bg-gradient-to-br ${tier.bgGradient} border ${tier.borderColor} flex items-center justify-center mb-4`}>
                <span className={tier.color}>{tier.icon}</span>
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">{tier.name}</h3>
              <p className="text-sm text-muted-foreground">{tier.description}</p>
            </div>

            {/* Price */}
            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center">
                <span className="text-4xl font-bold text-foreground">
                  ${tier.price}
                </span>
                {tier.price > 0 && (
                  <span className="text-muted-foreground ml-2">/{tier.period}</span>
                )}
              </div>
              {tier.price === 0 && (
                <p className="text-sm text-muted-foreground mt-1">Always free</p>
              )}
            </div>

            {/* Features */}
            <div className="space-y-3 mb-8">
              {tier.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  {feature.included ? (
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                  ) : (
                    <Lock className="w-5 h-5 text-red-400 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${feature.included ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                    {feature.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Button */}
            <div className="space-y-4">
              {tier.id === 'free' ? (
                <Button
                  disabled
                  className="w-full bg-muted text-muted-foreground cursor-not-allowed"
                  size="lg"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Current Plan
                </Button>
              ) : (
                <Button
                  onClick={() => handleSubscribe(tier.id)}
                  disabled={isLoading || isProcessing}
                  className={`w-full ${tier.buttonClass} relative overflow-hidden group`}
                  size="lg"
                >
                  {(isLoading || isProcessing) ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      Processing...
                    </div>
                  ) : (
                    <>
                      {tier.buttonIcon}
                      {tier.buttonText}
                    </>
                  )}
                  <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </Button>
              )}
            </div>

            {/* Additional Info */}
            {tier.id === 'premium' && (
              <div className="mt-4 text-center">
                <p className="text-xs text-muted-foreground">
                  ⚡ Most chosen by professionals
                </p>
              </div>
            )}
            
            {tier.id === 'elite' && (
              <div className="mt-4 text-center">
                <p className="text-xs text-muted-foreground">
                  🔥 For the ultimate hackers
                </p>
              </div>
            )}
          </div>
        </Card>
      ))}

      {/* Additional Features Section */}
      <div className="col-span-full mt-16 text-center">
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

export default SubscriptionTiers;