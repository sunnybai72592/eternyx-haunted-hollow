import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Cloud, Bell, CreditCard, Database, 
  Zap, ExternalLink, FileCode, Users, Globe
} from 'lucide-react';

interface WebUtility {
  id: string;
  name: string;
  description: string;
  type: 'API' | 'SDK' | 'Service' | 'Platform';
  category: 'Authentication' | 'Database' | 'Deployment' | 'Notifications' | 'Payments';
  icon: React.ReactNode;
  features: string[];
  link?: string;
  documentation?: string;
  installation?: string;
  pricing: 'Free' | 'Freemium' | 'Paid';
}

const webUtilities: WebUtility[] = [
  {
    id: 'firebase-auth',
    name: 'Firebase Auth',
    description: 'Complete authentication solution with multiple sign-in methods',
    type: 'SDK',
    category: 'Authentication',
    icon: React.createElement(Shield),
    features: ['Email/password auth', 'Social logins', 'Phone auth', 'Anonymous auth', 'Multi-factor auth'],
    link: 'https://firebase.google.com/products/auth',
    documentation: 'https://firebase.google.com/docs/auth',
    installation: 'npm install firebase',
    pricing: 'Freemium'
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Open source Firebase alternative with PostgreSQL database',
    type: 'Service',
    category: 'Database',
    icon: React.createElement(Database),
    features: ['PostgreSQL database', 'Real-time subscriptions', 'Authentication', 'Storage', 'Edge functions'],
    link: 'https://supabase.com/',
    documentation: 'https://supabase.com/docs',
    installation: 'npm install @supabase/supabase-js',
    pricing: 'Freemium'
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Frontend deployment platform with serverless functions',
    type: 'Platform',
    category: 'Deployment',
    icon: React.createElement(Zap),
    features: ['Git integration', 'Serverless functions', 'Edge network', 'Preview deployments', 'Analytics'],
    link: 'https://vercel.com/',
    documentation: 'https://vercel.com/docs',
    installation: 'npm install -g vercel',
    pricing: 'Freemium'
  },
  {
    id: 'netlify',
    name: 'Netlify',
    description: 'All-in-one platform for web development with continuous deployment',
    type: 'Platform',
    category: 'Deployment',
    icon: React.createElement(Globe),
    features: ['Continuous deployment', 'Forms handling', 'Functions', 'Identity', 'Split testing'],
    link: 'https://www.netlify.com/',
    documentation: 'https://docs.netlify.com/',
    installation: 'npm install -g netlify-cli',
    pricing: 'Freemium'
  },
  {
    id: 'render',
    name: 'Render',
    description: 'Cloud platform for hosting web apps, APIs, and databases',
    type: 'Platform',
    category: 'Deployment',
    icon: React.createElement(Cloud),
    features: ['Auto-deploy from Git', 'Managed databases', 'Static sites', 'Background jobs', 'Private services'],
    link: 'https://render.com/',
    documentation: 'https://render.com/docs',
    installation: 'Web-based platform',
    pricing: 'Freemium'
  },
  {
    id: 'onesignal',
    name: 'OneSignal',
    description: 'Push notification service for web and mobile applications',
    type: 'SDK',
    category: 'Notifications',
    icon: React.createElement(Bell),
    features: ['Push notifications', 'In-app messaging', 'Email campaigns', 'SMS', 'Segmentation'],
    link: 'https://onesignal.com/',
    documentation: 'https://documentation.onesignal.com/',
    installation: 'npm install react-onesignal',
    pricing: 'Freemium'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Complete payments platform for internet businesses',
    type: 'API',
    category: 'Payments',
    icon: React.createElement(CreditCard),
    features: ['Payment processing', 'Subscriptions', 'Marketplace', 'Connect', 'Fraud prevention'],
    link: 'https://stripe.com/',
    documentation: 'https://stripe.com/docs',
    installation: 'npm install stripe',
    pricing: 'Paid'
  }
];

const UniversalWebAppUtilities = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { toast } = useToast();

  const categories = [
    { id: 'all', name: 'All Utilities', icon: <Zap className="w-4 h-4" /> },
    { id: 'Authentication', name: 'Auth', icon: <Shield className="w-4 h-4" /> },
    { id: 'Database', name: 'Database', icon: <Database className="w-4 h-4" /> },
    { id: 'Deployment', name: 'Deploy', icon: <Cloud className="w-4 h-4" /> },
    { id: 'Notifications', name: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'Payments', name: 'Payments', icon: <CreditCard className="w-4 h-4" /> }
  ];

  const filteredUtilities = selectedCategory === 'all' 
    ? webUtilities 
    : webUtilities.filter(utility => utility.category === selectedCategory);

  const handleUtilityAction = (utility: WebUtility) => {
    if (utility.link) {
      window.open(utility.link, '_blank');
    }
    toast({
      title: `${utility.name} Accessed`,
      description: `Opening ${utility.name} platform and documentation`,
    });
  };

  const getTypeColor = (type: string) => {
    const colors = {
      'API': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'SDK': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Service': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Platform': 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getPricingColor = (pricing: string) => {
    const colors = {
      'Free': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Freemium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Paid': 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[pricing as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent mb-4">
            Universal Web App Utilities
          </h1>
          <p className="text-gray-300 text-lg">
            Essential services and APIs for building modern web applications
          </p>
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-8">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-gray-900/50 border border-green-500/30">
            {categories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="flex items-center gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
              >
                {category.icon}
                <span className="hidden sm:inline">{category.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Utilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUtilities.map((utility) => (
            <Card key={utility.id} className="bg-gray-900/50 border-green-500/30 hover:border-green-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                      {utility.icon}
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">{utility.name}</CardTitle>
                      <div className="flex gap-2 mt-1">
                        <Badge className={getTypeColor(utility.type)}>
                          {utility.type}
                        </Badge>
                        <Badge className={getPricingColor(utility.pricing)}>
                          {utility.pricing}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 mb-4">{utility.description}</p>
                
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-green-400 mb-2">Key Features:</h4>
                  <ul className="text-sm text-gray-300 space-y-1">
                    {utility.features.slice(0, 3).map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-green-400 rounded-full"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {utility.installation && (
                  <div className="mb-4 p-2 bg-black/50 rounded border border-gray-700">
                    <p className="text-xs text-gray-400 mb-1">Setup:</p>
                    <code className="text-xs text-green-400 font-mono">{utility.installation}</code>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleUtilityAction(utility)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Visit
                  </Button>
                  {utility.documentation && (
                    <Button
                      onClick={() => window.open(utility.documentation, '_blank')}
                      variant="outline"
                      className="border-green-500/30 text-green-400 hover:bg-green-500/20"
                    >
                      <FileCode className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredUtilities.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No utilities found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UniversalWebAppUtilities;

