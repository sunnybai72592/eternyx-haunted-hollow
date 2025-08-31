import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Crown, Check, Zap, Shield, Star, Rocket } from 'lucide-react';

export default function Premium() {
  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      
      <main className="pt-20 sm:pt-24">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 md:py-20 px-4 max-w-6xl mx-auto responsive-container">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-gold neon-text responsive-text-5xl">
              ./premium_access
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg">
              Unlock elite cybersecurity features and advanced development tools
            </p>
          </div>
        </section>

        {/* Pricing Plans */}
        <section className="py-12 px-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mobile-grid">
            {/* Basic Plan */}
            <div className="mobile-card hover:border-blue-400/40 transition-all duration-300">
              <div className="text-center mb-6">
                <Shield className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-blue-400 mb-2">Basic</h3>
                <div className="text-3xl font-bold text-foreground mb-1">$29</div>
                <p className="text-sm text-muted-foreground">per month</p>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Basic security scans
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Standard development tools
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Email support
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  5 projects limit
                </li>
              </ul>
              
              <Button variant="outline" className="w-full border-blue-400/20 hover:bg-blue-400/10">
                Choose Basic
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="mobile-card hover:border-purple-400/40 transition-all duration-300 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-purple-400 text-black px-3 py-1 rounded-full text-xs font-bold">
                  POPULAR
                </span>
              </div>
              
              <div className="text-center mb-6">
                <Star className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-purple-400 mb-2">Pro</h3>
                <div className="text-3xl font-bold text-foreground mb-1">$79</div>
                <p className="text-sm text-muted-foreground">per month</p>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Advanced security suite
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Premium development tools
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Priority support
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Unlimited projects
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  AI-powered analysis
                </li>
              </ul>
              
              <Button className="w-full bg-purple-400 hover:bg-purple-500 text-black">
                Choose Pro
              </Button>
            </div>

            {/* Elite Plan */}
            <div className="mobile-card hover:border-amber-400/40 transition-all duration-300">
              <div className="text-center mb-6">
                <Crown className="h-12 w-12 text-amber-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-amber-400 mb-2">Elite</h3>
                <div className="text-3xl font-bold text-foreground mb-1">$199</div>
                <p className="text-sm text-muted-foreground">per month</p>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Enterprise security suite
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Full development ecosystem
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  24/7 dedicated support
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  White-label solutions
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Custom integrations
                </li>
                <li className="flex items-center text-sm">
                  <Check className="h-4 w-4 text-green-400 mr-2" />
                  Dedicated account manager
                </li>
              </ul>
              
              <Button variant="outline" className="w-full border-amber-400/20 hover:bg-amber-400/10">
                Choose Elite
              </Button>
            </div>
          </div>
        </section>

        {/* Features Comparison */}
        <section className="py-12 px-4 max-w-6xl mx-auto">
          <div className="mobile-card">
            <h3 className="text-xl font-bold text-center mb-8 text-primary">Premium Features</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="text-center">
                <Zap className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
                <h4 className="font-semibold text-yellow-400 mb-2">Advanced Analytics</h4>
                <p className="text-sm text-muted-foreground">
                  Real-time performance monitoring and detailed security analytics
                </p>
              </div>
              
              <div className="text-center">
                <Shield className="h-8 w-8 text-red-400 mx-auto mb-3" />
                <h4 className="font-semibold text-red-400 mb-2">Enterprise Security</h4>
                <p className="text-sm text-muted-foreground">
                  Military-grade encryption and advanced threat detection
                </p>
              </div>
              
              <div className="text-center">
                <Rocket className="h-8 w-8 text-blue-400 mx-auto mb-3" />
                <h4 className="font-semibold text-blue-400 mb-2">Priority Processing</h4>
                <p className="text-sm text-muted-foreground">
                  Faster processing speeds and priority queue access
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

