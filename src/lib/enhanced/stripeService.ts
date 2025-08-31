// Stripe Service for ETERNYX Platform Subscriptions
// Handles payment processing and subscription management

export interface SubscriptionPlan {
  id: string;
  name: string;
  stripePriceId: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  tier: 'free' | 'premium' | 'elite';
}

export interface CustomerSubscription {
  id: string;
  customerId: string;
  subscriptionId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

class StripeService {
  private publishableKey: string;
  private stripe: any = null;

  constructor() {
    this.publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '';
  }

  // Initialize Stripe
  async initializeStripe() {
    if (!this.stripe && typeof window !== 'undefined') {
      // In real implementation, load Stripe.js
      // const { loadStripe } = await import('@stripe/stripe-js');
      // this.stripe = await loadStripe(this.publishableKey);
      
      // Mock Stripe object for development
      this.stripe = {
        redirectToCheckout: async (options: any) => {
          console.log('Mock Stripe checkout redirect:', options);
          return { error: null };
        },
        confirmCardPayment: async (clientSecret: string, paymentMethod: any) => {
          console.log('Mock card payment confirmation:', { clientSecret, paymentMethod });
          return { error: null, paymentIntent: { status: 'succeeded' } };
        }
      };
    }
    return this.stripe;
  }

  // Subscription Plans
  getSubscriptionPlans(): SubscriptionPlan[] {
    return [
      {
        id: 'free',
        name: 'Ghost Access',
        stripePriceId: '',
        price: 0,
        interval: 'month',
        tier: 'free',
        features: [
          'Basic vulnerability scanner',
          'Community threat intelligence',
          'Standard encryption tools',
          'Public forums access',
          'AI assistant (5 queries/day)'
        ]
      },
      {
        id: 'premium',
        name: 'Shadow Operative',
        stripePriceId: 'price_premium_monthly',
        price: 29.99,
        interval: 'month',
        tier: 'premium',
        features: [
          'Advanced vulnerability scanner',
          'Premium threat intelligence',
          'Quantum-ready encryption',
          'Private community access',
          'AI assistant (unlimited)',
          'Real-time threat monitoring',
          'Penetration testing suite',
          'Custom security reports'
        ]
      },
      {
        id: 'elite',
        name: 'Cyber Overlord',
        stripePriceId: 'price_elite_monthly',
        price: 99.99,
        interval: 'month',
        tier: 'elite',
        features: [
          'Enterprise vulnerability lab',
          'Classified threat intelligence',
          'Military-grade encryption',
          'VIP community & mentorship',
          'AI assistant (priority)',
          '24/7 threat monitoring',
          'Advanced exploit simulations',
          'White-label solutions',
          'Elite development team',
          'Blockchain verification'
        ]
      }
    ];
  }

  // Create checkout session
  async createCheckoutSession(priceId: string, customerId?: string): Promise<{ sessionId?: string; error?: any }> {
    try {
      // In real implementation, this would call your backend API
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          customerId,
          successUrl: `${window.location.origin}/dashboard?subscription=success`,
          cancelUrl: `${window.location.origin}/pricing?subscription=cancelled`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { sessionId } = await response.json();
      return { sessionId, error: null };
    } catch (error) {
      console.error('Error creating checkout session:', error);
      return { error };
    }
  }

  // Redirect to Stripe Checkout
  async redirectToCheckout(sessionId: string): Promise<{ error?: any }> {
    try {
      const stripe = await this.initializeStripe();
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });
      return { error };
    } catch (error) {
      console.error('Error redirecting to checkout:', error);
      return { error };
    }
  }

  // Subscribe to plan
  async subscribeToPlan(planId: string, customerId?: string): Promise<{ success: boolean; error?: any }> {
    try {
      const plan = this.getSubscriptionPlans().find(p => p.id === planId);
      if (!plan || plan.price === 0) {
        // Free plan - no payment required
        return { success: true };
      }

      const { sessionId, error: sessionError } = await this.createCheckoutSession(plan.stripePriceId, customerId);
      
      if (sessionError) {
        throw sessionError;
      }

      if (sessionId) {
        const { error: redirectError } = await this.redirectToCheckout(sessionId);
        if (redirectError) {
          throw redirectError;
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error subscribing to plan:', error);
      return { success: false, error };
    }
  }

  // Get customer subscriptions
  async getCustomerSubscriptions(customerId: string): Promise<{ subscriptions?: CustomerSubscription[]; error?: any }> {
    try {
      // In real implementation, call your backend API
      const response = await fetch(`/api/customers/${customerId}/subscriptions`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch subscriptions');
      }

      const subscriptions = await response.json();
      return { subscriptions, error: null };
    } catch (error) {
      console.error('Error fetching customer subscriptions:', error);
      return { error };
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd = true): Promise<{ success: boolean; error?: any }> {
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancelAtPeriodEnd }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      return { success: true };
    } catch (error) {
      console.error('Error canceling subscription:', error);
      return { success: false, error };
    }
  }

  // Update subscription
  async updateSubscription(subscriptionId: string, newPriceId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId: newPriceId }),
      });

      if (!response.ok) {
        throw new Error('Failed to update subscription');
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating subscription:', error);
      return { success: false, error };
    }
  }

  // Get payment methods
  async getPaymentMethods(customerId: string): Promise<{ paymentMethods?: PaymentMethod[]; error?: any }> {
    try {
      const response = await fetch(`/api/customers/${customerId}/payment-methods`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch payment methods');
      }

      const paymentMethods = await response.json();
      return { paymentMethods, error: null };
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      return { error };
    }
  }

  // Add payment method
  async addPaymentMethod(customerId: string, paymentMethodId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const response = await fetch(`/api/customers/${customerId}/payment-methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentMethodId }),
      });

      if (!response.ok) {
        throw new Error('Failed to add payment method');
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding payment method:', error);
      return { success: false, error };
    }
  }

  // Create customer portal session
  async createCustomerPortalSession(customerId: string): Promise<{ url?: string; error?: any }> {
    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          customerId,
          returnUrl: `${window.location.origin}/dashboard`
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      return { url, error: null };
    } catch (error) {
      console.error('Error creating portal session:', error);
      return { error };
    }
  }

  // Handle webhook events (for backend use)
  async handleWebhookEvent(event: any): Promise<{ success: boolean; error?: any }> {
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          // Handle new subscription
          console.log('New subscription created:', event.data.object);
          break;
        
        case 'customer.subscription.updated':
          // Handle subscription update
          console.log('Subscription updated:', event.data.object);
          break;
        
        case 'customer.subscription.deleted':
          // Handle subscription cancellation
          console.log('Subscription cancelled:', event.data.object);
          break;
        
        case 'invoice.payment_succeeded':
          // Handle successful payment
          console.log('Payment succeeded:', event.data.object);
          break;
        
        case 'invoice.payment_failed':
          // Handle failed payment
          console.log('Payment failed:', event.data.object);
          break;
        
        default:
          console.log('Unhandled webhook event:', event.type);
      }

      return { success: true };
    } catch (error) {
      console.error('Error handling webhook event:', error);
      return { success: false, error };
    }
  }

  // Utility methods
  formatPrice(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  calculateProration(currentPlan: SubscriptionPlan, newPlan: SubscriptionPlan, daysRemaining: number): number {
    const dailyCurrentCost = currentPlan.price / 30;
    const dailyNewCost = newPlan.price / 30;
    const refund = dailyCurrentCost * daysRemaining;
    const newCharge = dailyNewCost * daysRemaining;
    return newCharge - refund;
  }
}

export const stripeService = new StripeService();

