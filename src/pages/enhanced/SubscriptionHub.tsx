import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SubscriptionTiers from '@/components/enhanced/SubscriptionTiers';
import { stripeService, SubscriptionPlan } from '@/lib/enhanced/stripeService';
import { 
  Crown, 
  Zap, 
  Shield, 
  Star,
  CheckCircle,
  XCircle,
  CreditCard,
  Calendar,
  Users,
  Sparkles,
  Diamond,
  Skull,
  Eye,
  Lock,
  Globe,
  Brain,
  Target,
  Activity
} from 'lucide-react';

interface UserSubscription {
  id: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

interface UsageMetrics {
  vulnerabilityScans: { used: number; limit: number };
  aiQueries: { used: number; limit: number };
  threatMonitoring: { used: number; limit: number };
  encryptionKeys: { used: number; limit: number };
}

export default function SubscriptionHub() {
  const [activeTab, setActiveTab] = useState('plans');
  const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize subscription data
    setSubscriptionPlans(stripeService.getSubscriptionPlans());
    
    // Mock current subscription
    setCurrentSubscription({
      id: 'sub_1234567890',
      planId: 'premium',
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000 * 15),
      currentPeriodEnd: new Date(Date.now() + 86400000 * 15),
      cancelAtPeriodEnd: false
    });

    // Mock usage metrics
    setUsageMetrics({
      vulnerabilityScans: { used: 47, limit: 100 },
      aiQueries: { used: 234, limit: -1 }, // -1 means unlimited
      threatMonitoring: { used: 1, limit: 1 }, // boolean feature
      encryptionKeys: { used: 8, limit: 25 }
    });
  }, []);

  const handleSubscribe = async (planId: string) => {
    setIsLoading(true);
    try {
      const result = await stripeService.subscribeToPlan(planId);
      if (result.success) {
        console.log('Subscription successful');
        // In real app, update UI state
      } else {
        console.error('Subscription failed:', result.error);
      }
    } catch (error) {
      console.error('Subscription error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!currentSubscription) return;
    
    setIsLoading(true);
    try {
      const result = await stripeService.cancelSubscription(currentSubscription.id);
      if (result.success) {
        setCurrentSubscription({
          ...currentSubscription,
          cancelAtPeriodEnd: true
        });
      }
    } catch (error) {
      console.error('Cancellation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentPlan = () => {
    if (!currentSubscription) return subscriptionPlans.find(p => p.id === 'free');
    return subscriptionPlans.find(p => p.id === currentSubscription.planId);
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // unlimited
    return (used / limit) * 100;
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-400';
    if (percentage >= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getPlanIcon = (tier: string) => {
    switch (tier) {
      case 'free': return <Eye className="h-6 w-6" />;
      case 'premium': return <Shield className="h-6 w-6" />;
      case 'elite': return <Crown className="h-6 w-6" />;
      default: return <Star className="h-6 w-6" />;
    }
  };

  const getPlanColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'border-blue-400/50 bg-blue-500/10';
      case 'premium': return 'border-purple-400/50 bg-purple-500/10';
      case 'elite': return 'border-orange-400/50 bg-orange-500/10';
      default: return 'border-gray-400/50 bg-gray-500/10';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-primary/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-primary glitch mb-2" data-text="SUBSCRIPTION HUB">
                SUBSCRIPTION HUB
              </h1>
              <p className="text-muted-foreground">
                Unlock the full power of the digital underground
              </p>
            </div>
            {currentSubscription && (
              <div className="text-right">
                <Badge variant="outline" className={getPlanColor(getCurrentPlan()?.tier || 'free')}>
                  {getCurrentPlan()?.name.toUpperCase()}
                </Badge>
                <div className="text-xs text-muted-foreground mt-1">
                  Renews {currentSubscription.currentPeriodEnd.toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-primary/20">
            <TabsTrigger value="plans" className="data-[state=active]:bg-primary/20">
              <Crown className="h-4 w-4 mr-2" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="current" className="data-[state=active]:bg-primary/20">
              <Shield className="h-4 w-4 mr-2" />
              Current
            </TabsTrigger>
            <TabsTrigger value="usage" className="data-[state=active]:bg-primary/20">
              <Activity className="h-4 w-4 mr-2" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="billing" className="data-[state=active]:bg-primary/20">
              <CreditCard className="h-4 w-4 mr-2" />
              Billing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans">
            <SubscriptionTiers onSubscribe={handleSubscribe} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="current" className="space-y-6">
            {currentSubscription && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Current Plan */}
                <Card className={`p-6 border ${getPlanColor(getCurrentPlan()?.tier || 'free')} neon-border`}>
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="text-primary">
                      {getPlanIcon(getCurrentPlan()?.tier || 'free')}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-primary">{getCurrentPlan()?.name}</h3>
                      <p className="text-muted-foreground">
                        ${getCurrentPlan()?.price}/month
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant="outline" className="text-green-400 border-green-400/50">
                        {currentSubscription.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Billing Period:</span>
                      <span className="text-blue-400">
                        {currentSubscription.currentPeriodStart.toLocaleDateString()} - {currentSubscription.currentPeriodEnd.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Auto-Renewal:</span>
                      <span className={currentSubscription.cancelAtPeriodEnd ? 'text-red-400' : 'text-green-400'}>
                        {currentSubscription.cancelAtPeriodEnd ? 'Disabled' : 'Enabled'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full border-blue-400/50 text-blue-400"
                      onClick={() => setActiveTab('plans')}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Upgrade Plan
                    </Button>
                    
                    {currentSubscription.planId !== 'free' && (
                      <Button
                        variant="outline"
                        className="w-full border-red-400/50 text-red-400"
                        onClick={handleCancelSubscription}
                        disabled={isLoading}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {currentSubscription.cancelAtPeriodEnd ? 'Reactivate' : 'Cancel Subscription'}
                      </Button>
                    )}
                  </div>
                </Card>

                {/* Plan Features */}
                <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                  <h3 className="text-xl font-bold text-primary mb-4">Active Features</h3>
                  
                  <div className="space-y-3">
                    {getCurrentPlan()?.features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-green-400/20">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {getCurrentPlan()?.tier !== 'elite' && (
                    <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-orange-500/10 rounded border border-purple-400/20">
                      <div className="flex items-center space-x-2 mb-2">
                        <Crown className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-bold text-orange-400">Unlock Elite Features</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Get access to enterprise-grade tools, priority support, and exclusive content.
                      </p>
                      <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                        <Diamond className="h-3 w-3 mr-1" />
                        Upgrade to Elite
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="usage" className="space-y-6">
            {usageMetrics && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Usage Statistics */}
                <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                  <h3 className="text-xl font-bold text-primary mb-4">Usage This Month</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Vulnerability Scans</span>
                        <span className="text-sm font-medium">
                          {usageMetrics.vulnerabilityScans.used}/{usageMetrics.vulnerabilityScans.limit}
                        </span>
                      </div>
                      <Progress 
                        value={getUsagePercentage(usageMetrics.vulnerabilityScans.used, usageMetrics.vulnerabilityScans.limit)} 
                        className="h-2" 
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-muted-foreground">AI Assistant Queries</span>
                        <span className="text-sm font-medium">
                          {usageMetrics.aiQueries.used}/{usageMetrics.aiQueries.limit === -1 ? '∞' : usageMetrics.aiQueries.limit}
                        </span>
                      </div>
                      {usageMetrics.aiQueries.limit !== -1 && (
                        <Progress 
                          value={getUsagePercentage(usageMetrics.aiQueries.used, usageMetrics.aiQueries.limit)} 
                          className="h-2" 
                        />
                      )}
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Threat Monitoring</span>
                        <span className="text-sm font-medium">
                          {usageMetrics.threatMonitoring.used ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className={`h-2 rounded ${usageMetrics.threatMonitoring.used ? 'bg-green-400' : 'bg-gray-600'}`} />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Encryption Keys</span>
                        <span className="text-sm font-medium">
                          {usageMetrics.encryptionKeys.used}/{usageMetrics.encryptionKeys.limit}
                        </span>
                      </div>
                      <Progress 
                        value={getUsagePercentage(usageMetrics.encryptionKeys.used, usageMetrics.encryptionKeys.limit)} 
                        className="h-2" 
                      />
                    </div>
                  </div>
                </Card>

                {/* Feature Access */}
                <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                  <h3 className="text-xl font-bold text-primary mb-4">Feature Access</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-green-400/20">
                      <div className="flex items-center space-x-3">
                        <Target className="h-4 w-4 text-green-400" />
                        <span className="text-sm">Vulnerability Scanner</span>
                      </div>
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-green-400/20">
                      <div className="flex items-center space-x-3">
                        <Brain className="h-4 w-4 text-green-400" />
                        <span className="text-sm">AI Security Assistant</span>
                      </div>
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-green-400/20">
                      <div className="flex items-center space-x-3">
                        <Globe className="h-4 w-4 text-green-400" />
                        <span className="text-sm">Threat Monitoring</span>
                      </div>
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-gray-400/20">
                      <div className="flex items-center space-x-3">
                        <Diamond className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">Elite Development Team</span>
                      </div>
                      <XCircle className="h-4 w-4 text-gray-400" />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-gray-400/20">
                      <div className="flex items-center space-x-3">
                        <Crown className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">White-label Solutions</span>
                      </div>
                      <XCircle className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-r from-orange-500/10 to-purple-500/10 rounded border border-orange-400/20">
                    <div className="flex items-center space-x-2 mb-2">
                      <Crown className="h-4 w-4 text-orange-400" />
                      <span className="text-sm font-bold text-orange-400">Upgrade for More Power</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Unlock enterprise features, priority support, and unlimited access.
                    </p>
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                      <Zap className="h-3 w-3 mr-1" />
                      View Elite Plans
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Billing Information */}
              <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                <h3 className="text-xl font-bold text-primary mb-4">Billing Information</h3>
                
                {currentSubscription && currentSubscription.planId !== 'free' ? (
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Current Plan:</span>
                      <span className="text-primary font-medium">{getCurrentPlan()?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Monthly Cost:</span>
                      <span className="text-green-400 font-bold">${getCurrentPlan()?.price}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Next Billing:</span>
                      <span className="text-blue-400">{currentSubscription.currentPeriodEnd.toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Payment Method:</span>
                      <span className="text-purple-400">•••• 4242</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CreditCard className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />
                    <h4 className="text-lg font-bold text-primary mb-2">Free Plan Active</h4>
                    <p className="text-muted-foreground mb-4">
                      You're currently on the free plan. Upgrade to unlock premium features.
                    </p>
                    <Button
                      onClick={() => setActiveTab('plans')}
                      className="bg-primary hover:bg-primary/80 neon-border"
                    >
                      <Crown className="h-4 w-4 mr-2" />
                      View Premium Plans
                    </Button>
                  </div>
                )}
              </Card>

              {/* Payment History */}
              <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                <h3 className="text-xl font-bold text-primary mb-4">Payment History</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-green-400/20">
                    <div>
                      <div className="text-sm font-medium">Shadow Operative</div>
                      <div className="text-xs text-muted-foreground">Dec 1, 2024</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-400">$29.99</div>
                      <div className="text-xs text-green-400">Paid</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-green-400/20">
                    <div>
                      <div className="text-sm font-medium">Shadow Operative</div>
                      <div className="text-xs text-muted-foreground">Nov 1, 2024</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-400">$29.99</div>
                      <div className="text-xs text-green-400">Paid</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded border border-green-400/20">
                    <div>
                      <div className="text-sm font-medium">Shadow Operative</div>
                      <div className="text-xs text-muted-foreground">Oct 1, 2024</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-400">$29.99</div>
                      <div className="text-xs text-green-400">Paid</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <Button variant="outline" className="w-full border-blue-400/50 text-blue-400">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Manage Payment Methods
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

