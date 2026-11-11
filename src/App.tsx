import { Toaster } from "@/components/ui/toaster";
import AuthPage from './pages/AuthPage';
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom"; // Added useLocation
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
import RequireAuth from "@/components/auth/RequireAuth";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const CybersecurityHub = lazy(() => import("./pages/CybersecurityHub"));
const Explore = lazy(() => import("./pages/Explore"));
const EcosystemPillarPage = lazy(() => import("./pages/EcosystemPillarPage"));
const DeveloperStudio = lazy(() => import("./pages/DeveloperStudio"));
const AdvancedDeveloperTools = lazy(() => import("./pages/AdvancedDeveloperTools"));
const ApiEngineeringWorkbench = lazy(() => import("./pages/ApiEngineeringWorkbench"));
const DevOpsLaunchpad = lazy(() => import("./pages/DevOpsLaunchpad"));
const DeploymentIntelligence = lazy(() => import("./pages/DeploymentIntelligence"));
const ContainerInfrastructureIntelligence = lazy(() => import("./pages/ContainerInfrastructureIntelligence"));
const InfrastructureAsCodeIntelligence = lazy(() => import("./pages/InfrastructureAsCodeIntelligence"));
const ObservabilityIntelligence = lazy(() => import("./pages/ObservabilityIntelligence"));
const SreReliabilityWorkbench = lazy(() => import("./pages/SreReliabilityWorkbench"));
const CicdPipelineSecurityIntelligence = lazy(() => import("./pages/CicdPipelineSecurityIntelligence"));
const SoftwareSupplyChainIntelligence = lazy(() => import("./pages/SoftwareSupplyChainIntelligence"));
const ArtifactProvenanceIntelligence = lazy(() => import("./pages/ArtifactProvenanceIntelligence"));
const DatabaseSqlIntelligence = lazy(() => import("./pages/DatabaseSqlIntelligence"));
const RlsSecurityIntelligence = lazy(() => import("./pages/RlsSecurityIntelligence"));
const ApiSecurityThreatIntelligence = lazy(() => import("./pages/ApiSecurityThreatIntelligence"));
const WebApplicationSecurityReadiness = lazy(() => import("./pages/WebApplicationSecurityReadiness"));
const ThreatModelingWorkbench = lazy(() => import("./pages/ThreatModelingWorkbench"));
const SecurityAssessmentWorkbench = lazy(() => import("./pages/SecurityAssessmentWorkbench"));
const IncidentResponsePlaybookWorkbench = lazy(() => import("./pages/IncidentResponsePlaybookWorkbench"));
const AwsIamPolicySecurityWorkbench = lazy(() => import("./pages/AwsIamPolicySecurityWorkbench"));
const GitHubIntegrationHub = lazy(() => import("./pages/GitHubIntegrationHub"));
const GitHubCollaborationCenter = lazy(() => import("./pages/GitHubCollaborationCenter"));
const GitHubChangeIntelligence = lazy(() => import("./pages/GitHubChangeIntelligence"));
const GitHubActionsIntelligence = lazy(() => import("./pages/GitHubActionsIntelligence"));
const GitHubReleaseIntelligence = lazy(() => import("./pages/GitHubReleaseIntelligence"));
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
const MyBugReports = lazy(() => import("./pages/MyBugReports"));
const AccountCenter = lazy(() => import("./pages/AccountCenter"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AdminBugReports = lazy(() => import("./pages/AdminBugReports"));
const Contact = lazy(() => import("./pages/Contact"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const Profile = lazy(() => import("./pages/Profile"));


const SecurityAuditing = lazy(() => import("./pages/SecurityAuditing"));
const IncidentResponse = lazy(() => import("./pages/IncidentResponse"));
const PenetrationTesting = lazy(() => import("./pages/PenetrationTesting"));
const VulnerabilityAssessment = lazy(() => import("./pages/VulnerabilityAssessment"));

// Tool pages
const VulnerabilityScanner = lazy(() => import("./pages/VulnerabilityScanner"));

// New specialized tool pages


// Enhanced platform pages
const CyberArsenal = lazy(() => import("./pages/enhanced/CyberArsenal"));
const SubscriptionHub = lazy(() => import("./pages/enhanced/SubscriptionHub"));
const KnowledgeHub = lazy(() => import("./pages/enhanced/KnowledgeHub"));

// CBT System pages
const Education = lazy(() => import("./pages/Education"));
const TestInterface = lazy(() => import("./pages/TestInterface"));
const TestResults = lazy(() => import("./pages/TestResults"));

// Eternyx AI pages
const EternixAI = lazy(() => import("./pages/EternyxAI"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));


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

// Compatibility route for legacy OAuth callbacks that still return to /login.
const LoginRedirect = () => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Restoring your ETERNYX session..." />
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? "/account" : "/"} replace />;
};

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
                <div className="fixed top-[4.75rem] left-3 sm:left-4 z-40">
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
                        <Route path="/login" element={<AuthPage />} />
                        <Route path="/auth" element={<AuthPage />} />
                        <Route path="/dashboard" element={<Navigate to="/account" replace />} />
                        <Route path="/account" element={<RequireAuth><AccountCenter /></RequireAuth>} />
                        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
                        <Route path="/cybersecurity" element={<CybersecurityHub />} />
                        <Route path="/explore" element={<Explore />} />
                        <Route path="/developer-studio" element={<DeveloperStudio />} />
                        <Route path="/developer-studio/advanced" element={<AdvancedDeveloperTools />} />
                        <Route path="/developer-studio/api-workbench" element={<ApiEngineeringWorkbench />} />
                        <Route path="/developer-studio/devops" element={<DevOpsLaunchpad />} />
                        <Route path="/developer-studio/deployment-intelligence" element={<DeploymentIntelligence />} />
                        <Route path="/developer-studio/container-infrastructure" element={<ContainerInfrastructureIntelligence />} />
                        <Route path="/developer-studio/infrastructure-as-code" element={<InfrastructureAsCodeIntelligence />} />
                        <Route path="/developer-studio/observability" element={<ObservabilityIntelligence />} />
                        <Route path="/developer-studio/sre-reliability" element={<SreReliabilityWorkbench />} />
                        <Route path="/developer-studio/cicd-security" element={<CicdPipelineSecurityIntelligence />} />
                        <Route path="/developer-studio/supply-chain" element={<SoftwareSupplyChainIntelligence />} />
                        <Route path="/developer-studio/artifact-provenance" element={<ArtifactProvenanceIntelligence />} />
                        <Route path="/developer-studio/database-sql" element={<DatabaseSqlIntelligence />} />
                        <Route path="/developer-studio/rls-security" element={<RlsSecurityIntelligence />} />
                        <Route path="/developer-studio/api-security" element={<ApiSecurityThreatIntelligence />} />
                        <Route path="/developer-studio/web-security" element={<WebApplicationSecurityReadiness />} />
                        <Route path="/cybersecurity/web-security" element={<WebApplicationSecurityReadiness />} />
                        <Route path="/cybersecurity/threat-modeling" element={<ThreatModelingWorkbench />} />
                        <Route path="/cybersecurity/assessment-remediation" element={<SecurityAssessmentWorkbench />} />
                        <Route path="/cybersecurity/incident-playbooks" element={<IncidentResponsePlaybookWorkbench />} />
                        <Route path="/cybersecurity/aws-iam-policy" element={<AwsIamPolicySecurityWorkbench />} />
                        <Route path="/developer-studio/github-hub" element={<GitHubIntegrationHub />} />
                        <Route path="/developer-studio/github-collaboration" element={<GitHubCollaborationCenter />} />
                        <Route path="/developer-studio/github-changes" element={<GitHubChangeIntelligence />} />
                        <Route path="/developer-studio/github-actions" element={<GitHubActionsIntelligence />} />
                        <Route path="/developer-studio/github-releases" element={<GitHubReleaseIntelligence />} />
                        <Route path="/ai-arsenal" element={<EcosystemPillarPage pillarId="ai-arsenal" />} />
                        <Route path="/workspace" element={<EcosystemPillarPage pillarId="workspace" />} />
                        <Route path="/integrations" element={<EcosystemPillarPage pillarId="integrations" />} />
                        <Route path="/automation" element={<EcosystemPillarPage pillarId="automation" />} />
                        <Route path="/arsenal" element={<CyberArsenal />} />
                        <Route path="/subscriptions" element={<SubscriptionHub />} />
                        <Route path="/knowledge" element={<KnowledgeHub />} />
                        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
                        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
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

                        <Route path="/tools" element={<Navigate to="/explore" replace />} />
                        <Route path="/tools/category/:categoryId" element={<Navigate to="/explore" replace />} />

                        <Route path="/killer-edge" element={<KillerEdge />} />
                        <Route path="/premium" element={<Premium />} />
                        <Route path="/bug-report" element={<BugReport />} />
                         <Route path="/my-bug-reports" element={<RequireAuth><MyBugReports /></RequireAuth>} />
                        <Route path="/admin/bug-reports" element={<AdminBugReports />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/tools/network-scanner" element={<Navigate to="/explore" replace />} />
                        <Route path="/tools/code-analyzer" element={<Navigate to="/explore" replace />} />

                        {/* CBT System Routes */}
                        <Route path="/education" element={<Education />} />
                        <Route path="/test/:testId" element={<TestInterface />} />
                        <Route path="/test-results/:attemptId" element={<TestResults />} />

                        {/* Eternyx AI Routes */}
                        <Route path="/eternyx-ai" element={<EternixAI />} />
                        <Route path="/reset-password" element={<ResetPassword />} />

                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </PageTransitionWrapper>
                  </Suspense>
                </main>
              <Footer />
            </TooltipProvider>
          </AccessibilityProvider>
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
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
