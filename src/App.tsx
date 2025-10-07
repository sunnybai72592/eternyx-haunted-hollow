import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom"; // Added useLocation
import { Suspense, lazy, useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import NotificationSystem from "@/components/NotificationSystem";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import LoadingSpinner from "@/components/LoadingSpinner";
import ResponsiveUnifiedNavigation from "@/components/ResponsiveUnifiedNavigation";
import { MobileResponsiveNavigation } from "@/components/MobileResponsiveNavigation";
import { PageTransitionWrapper } from "@/components/PageTransitionWrapper";
import Footer from "@/components/Footer";
import { useAuthStore } from "@/store/authStore";
import { BackButton } from "@/components/BackButton"; // <-- NEW IMPORT

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const UnifiedDashboard = lazy(() => import("./pages/UnifiedDashboard"));
const Hacked = lazy(() => import("./pages/Hacked"));
const NotFound = lazy(() => import("./pages/NotFound"));
const BlackHatPentesting = lazy(() => import("./pages/BlackHatPentesting"));
const ZeroDayProtection = lazy(() => import("./pages/ZeroDayProtection"));
const QuantumEncryption = lazy(() => import("./pages/QuantumEncryption"));
const AIPoweredSecurity = lazy(() => import("./pages/AIPoweredSecurity"));
const EliteDevelopmentTeam = lazy(() => import("./pages/EliteDevelopmentTeam"));
const ThreatMonitoring = lazy(() => import("./pages/ThreatMonitoring"));
const ServicesHub = lazy(() => import("./pages/ServicesHub"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const ServiceDetailPage = lazy(() => import("./pages/ServiceDetailPage")); // <-- NEW IMPORT
const Development = lazy(() => import("./pages/Development"));
const Innovation = lazy(() => import("./pages/Innovation"));
const KillerEdge = lazy(() => import("./pages/KillerEdge"));
const Premium = lazy(() => import("./pages/Premium"));
const BugReport = lazy(() => import("./pages/BugReport"));
const Contact = lazy(() => import("./pages/Contact"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const Profile = lazy(() => import("./pages/Profile"));

// Tools page - arsenal of cybersecurity and development tools
const Tools = lazy(() => import("./pages/Tools"));
const ToolCategoryPage = lazy(() => import("./pages/ToolCategoryPage")); // <-- NEW IMPORT

const SecurityAuditing = lazy(() => import("./pages/SecurityAuditing"));
const IncidentResponse = lazy(() => import("./pages/IncidentResponse"));
const PenetrationTesting = lazy(() => import("./pages/PenetrationTesting"));
const VulnerabilityAssessment = lazy(() => import("./pages/VulnerabilityAssessment"));

// Tool pages
const NetworkScanner = lazy(() => import("./pages/tools/NetworkScanner"));
const CodeAnalyzer = lazy(() => import("./pages/tools/CodeAnalyzer"));
const VulnerabilityScanner = lazy(() => import("./pages/VulnerabilityScanner"));

// New specialized tool pages


// Enhanced platform pages
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

// Component to handle routing and back button logic
const AppContent = () => {
  const location = useLocation();
  const { initialize } = useAuthStore();

  useEffect(() => {
    // Initialize auth store when app starts
    initialize();
  }, [initialize]);

  // Determine if the back button should be shown
  const showBackButton = location.pathname !== '/';

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Main Application */}
      <div className={`relative z-10 transition-all duration-1000 opacity-100 translate-y-0`}>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AccessibilityProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner 
                  toastOptions={{
                    style: {
                      background: "rgba(0, 0, 0, 0.9)",
                      border: "1px solid hsl(var(--cyber-cyan))",
                      color: "hsl(var(--cyber-cyan))",
                      fontFamily: "Fira Code, monospace",
                      boxShadow: "0 0 20px hsl(var(--cyber-cyan) / 0.3)",
                      backdropFilter: "blur(10px)"
                    }
                  }}
                />
                <NotificationSystem />
                <PWAInstallPrompt />
                
                <MobileResponsiveNavigation />
                
                {/* Back Button Placement */}
                {showBackButton && (
                  <div className="fixed top-20 left-4 z-50">
                    <BackButton />
                  </div>
                )}

                <main className="flex-1 p-4 pt-32 transition-all duration-300">
                  <Suspense fallback={
                    <div className="min-h-screen bg-background flex items-center justify-center">
                      <LoadingSpinner variant="cyber" text="Initializing ETERNYX..." />
                    </div>
                  }>
                      <PageTransitionWrapper>
<Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/dashboard" element={<UnifiedDashboard />} />
                        <Route path="/arsenal" element={<CyberArsenal />} />
                        <Route path="/subscriptions" element={<SubscriptionHub />} />
                        <Route path="/knowledge" element={<KnowledgeHub />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/help" element={<Help />} />
                        <Route path="/hacked" element={<Hacked />} />
                        <Route path="/black-hat-pentesting" element={<BlackHatPentesting />} />
                        <Route path="/zero-day-protection" element={<ZeroDayProtection />} />
                        <Route path="/security-auditing" element={<SecurityAuditing />} />
                        <Route path="/incident-response" element={<IncidentResponse />} />
                        <Route path="/penetration-testing" element={<PenetrationTesting />} />
                        <Route path="/vulnerability-assessment" element={<VulnerabilityAssessment />} />
                        <Route path="/vulnerability-scanner" element={<VulnerabilityScanner />} />
                        <Route path="/quantum-encryption" element={<QuantumEncryption />} />
                        <Route path="/ai-powered-security" element={<AIPoweredSecurity />} />
                        <Route path="/elite-development-team" element={<EliteDevelopmentTeam />} />
                        <Route path="/threat-monitoring" element={<ThreatMonitoring />} />
                        <Route path="/services-hub" element={<ServicesHub />} />
                        <Route path="/services" element={<ServicesPage />} />
                        <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
                        <Route path="/development" element={<Development />} />
                        <Route path="/innovation" element={<Innovation />} />

                        <Route path="/tools" element={<Tools />} />
                        <Route path="/tools/category/:categoryId" element={<ToolCategoryPage />} />


                        <Route path="/killer-edge" element={<KillerEdge />} />
                        <Route path="/premium" element={<Premium />} />
                        <Route path="/bug-report" element={<BugReport />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/tools/network-scanner" element={<NetworkScanner />} />
                        <Route path="/tools/code-analyzer" element={<CodeAnalyzer />} />

                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
</PageTransitionWrapper>
                    </Suspense>
                  </main>
                <Footer />
              </TooltipProvider>
            </AccessibilityProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </div>

      {/* System Status Indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        {/* <SystemStatusIndicator isOnline={true} /> */}
      </div>
    </div>
  );
};

const App = () => (
  <BrowserRouter>
    <AppContent />
  </BrowserRouter>
);

export default App;
