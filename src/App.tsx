import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import NotificationSystem from "@/components/NotificationSystem";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import LoadingSpinner from "@/components/LoadingSpinner";
import ResponsiveUnifiedNavigation from "@/components/ResponsiveUnifiedNavigation";
import { MobileResponsiveNavigation } from "@/components/MobileResponsiveNavigation";
import Footer from "@/components/Footer";
import { useAuthStore } from "@/store/authStore";

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
const Development = lazy(() => import("./pages/Development"));
const Innovation = lazy(() => import("./pages/Innovation"));
const KillerEdge = lazy(() => import("./pages/KillerEdge"));
const Premium = lazy(() => import("./pages/Premium"));
const BugReport = lazy(() => import("./pages/BugReport"));
const Contact = lazy(() => import("./pages/Contact"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const Profile = lazy(() => import("./pages/Profile"));
const FrontendDevelopment = lazy(() => import("./pages/FrontendDevelopment"));
const BackendDevelopment = lazy(() => import("./pages/BackendDevelopment"));
const MobileDevelopment = lazy(() => import("./pages/MobileDevelopment"));
const CloudSolutions = lazy(() => import("./pages/CloudSolutions"));
const PerformanceOptimization = lazy(() => import("./pages/PerformanceOptimization"));
const CustomSolutions = lazy(() => import("./pages/CustomSolutions"));
const SecurityAuditing = lazy(() => import("./pages/SecurityAuditing"));
const IncidentResponse = lazy(() => import("./pages/IncidentResponse"));
const PenetrationTesting = lazy(() => import("./pages/PenetrationTesting"));
const VulnerabilityAssessment = lazy(() => import("./pages/VulnerabilityAssessment"));

// Tool pages
const NetworkScanner = lazy(() => import("./pages/tools/NetworkScanner"));
const CodeAnalyzer = lazy(() => import("./pages/tools/CodeAnalyzer"));
const VulnerabilityScanner = lazy(() => import("./pages/VulnerabilityScanner"));

// Enhanced platform pages
const EnhancedDashboard = lazy(() => import("./pages/enhanced/EnhancedDashboard"));
const CyberArsenal = lazy(() => import("./pages/enhanced/CyberArsenal"));
const SubscriptionHub = lazy(() => import("./pages/enhanced/SubscriptionHub"));
const KnowledgeHub = lazy(() => import("./pages/enhanced/KnowledgeHub"));
const CyberDashboard = lazy(() => import("./pages/CyberDashboard"));
const CyberArena = lazy(() => import("./pages/CyberArena"));


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
  const { initialize } = useAuthStore();

  useEffect(() => {
    // Initialize auth store when app starts
    initialize();
  }, [initialize]);

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
                <BrowserRouter>
                  <MobileResponsiveNavigation />
                  <main className="flex-1 p-4 pt-32 transition-all duration-300">
                    <Suspense fallback={
                      <div className="min-h-screen bg-background flex items-center justify-center">
                        <LoadingSpinner variant="cyber" text="Initializing ETERNYX..." />
                      </div>
                    }>
                        <Routes>
                          <Route path="/" element={<Index />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/cyber-dashboard" element={<CyberDashboard />} />
                          <Route path="/cyber-arena" element={<CyberArena />} />
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
                          <Route path="/security-auditing" element={<SecurityAuditing />} />
                          <Route path="/incident-response" element={<IncidentResponse />} />
                          <Route path="/penetration-testing" element={<PenetrationTesting />} />
                          <Route path="/vulnerability-assessment" element={<VulnerabilityAssessment />} />
                          <Route path="/vulnerability-scanner" element={<VulnerabilityScanner />} />
                          <Route path="/quantum-encryption" element={<QuantumEncryption />} />
                          <Route path="/ai-powered-security" element={<AIPoweredSecurity />} />
                          <Route path="/elite-development-team" element={<EliteDevelopmentTeam />} />
                          <Route path="/threat-monitoring" element={<ThreatMonitoring />} />
                          <Route path="/services" element={<Services />} />
                          <Route path="/tools" element={<Tools />} />
                          <Route path="/development" element={<Development />} />
                          <Route path="/frontend-development" element={<FrontendDevelopment />} />
                          <Route path="/backend-development" element={<BackendDevelopment />} />
                          <Route path="/mobile-development" element={<MobileDevelopment />} />
                          <Route path="/cloud-solutions" element={<CloudSolutions />} />
                          <Route path="/performance-optimization" element={<PerformanceOptimization />} />
                          <Route path="/custom-solutions" element={<CustomSolutions />} />
                          <Route path="/innovation" element={<Innovation />} />
                          <Route path="/killer-edge" element={<KillerEdge />} />
                          <Route path="/premium" element={<Premium />} />
                          <Route path="/bug-report" element={<BugReport />} />
                          <Route path="/contact" element={<Contact />} />
                          <Route path="/tools/network-scanner" element={<NetworkScanner />} />
                          <Route path="/tools/code-analyzer" element={<CodeAnalyzer />} />
                          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </Suspense>
                    </main>
                  <Footer />
                </BrowserRouter>
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

export default App;


