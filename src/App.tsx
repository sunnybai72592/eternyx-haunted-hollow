import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import NotificationSystem from "@/components/NotificationSystem";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import LoadingSpinner from "@/components/LoadingSpinner";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Hacked = lazy(() => import("./pages/Hacked"));
const NotFound = lazy(() => import("./pages/NotFound"));
const BlackHatPentesting = lazy(() => import("./pages/BlackHatPentesting"));
const ZeroDayProtection = lazy(() => import("./pages/ZeroDayProtection"));
const QuantumEncryption = lazy(() => import("./pages/QuantumEncryption"));
const AIPoweredSecurity = lazy(() => import("./pages/AIPoweredSecurity"));
const EliteDevelopmentTeam = lazy(() => import("./pages/EliteDevelopmentTeam"));
const ThreatMonitoring = lazy(() => import("./pages/ThreatMonitoring"));
const Services = lazy(() => import("./pages/Services"));
const Tools = lazy(() => import("./pages/Tools"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const Profile = lazy(() => import("./pages/Profile"));

// Enhanced platform pages
const EnhancedDashboard = lazy(() => import("./pages/enhanced/EnhancedDashboard"));
const CyberArsenal = lazy(() => import("./pages/enhanced/CyberArsenal"));
const SubscriptionHub = lazy(() => import("./pages/enhanced/SubscriptionHub"));
const KnowledgeHub = lazy(() => import("./pages/enhanced/KnowledgeHub"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AccessibilityProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <NotificationSystem />
            <PWAInstallPrompt />
            <BrowserRouter>
              <Suspense fallback={
                <div className="min-h-screen bg-background flex items-center justify-center">
                  <LoadingSpinner variant="cyber" text="Initializing ETERNYX..." />
                </div>
              }>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/enhanced-dashboard" element={<EnhancedDashboard />} />
                  <Route path="/arsenal" element={<CyberArsenal />} />
                  <Route path="/subscriptions" element={<SubscriptionHub />} />
                  <Route path="/knowledge" element={<KnowledgeHub />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/hacked" element={<Hacked />} />
                  <Route path="/black-hat-pentesting" element={<BlackHatPentesting />} />
                  <Route path="/zero-day-protection" element={<ZeroDayProtection />} />
                  <Route path="/quantum-encryption" element={<QuantumEncryption />} />
                  <Route path="/ai-powered-security" element={<AIPoweredSecurity />} />
                  <Route path="/elite-development-team" element={<EliteDevelopmentTeam />} />
                  <Route path="/threat-monitoring" element={<ThreatMonitoring />} />
                  <Route path="/services" element={<Services />} />
                  <Route path="/tools" element={<Tools />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AccessibilityProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

