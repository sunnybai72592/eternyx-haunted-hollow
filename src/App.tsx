import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import NotificationSystem from "@/components/NotificationSystem";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import LoadingSpinner from "@/components/LoadingSpinner";
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
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const Profile = lazy(() => import("./pages/Profile"));
const FrontendDevelopment = lazy(() => import("./pages/FrontendDevelopment"));
const BackendDevelopment = lazy(() => import("./pages/BackendDevelopment"));
const MobileDevelopment = lazy(() => import("./pages/MobileDevelopment"));
const CloudSolutions = lazy(() => import("./pages/CloudSolutions"));
const PerformanceOptimization = lazy(() => import("./pages/PerformanceOptimization"));
const CustomSolutions = lazy(() => import("./pages/CustomSolutions"));

// Enhanced platform pages
const EnhancedDashboard = lazy(() => import("./pages/enhanced/EnhancedDashboard"));
const CyberArsenal = lazy(() => import("./pages/enhanced/CyberArsenal"));
const SubscriptionHub = lazy(() => import("./pages/enhanced/SubscriptionHub"));
const KnowledgeHub = lazy(() => import("./pages/enhanced/KnowledgeHub"));

import { AdminGuard } from "@/components/AdminGuard";

// Cyberpunk Boot Sequence Component
const BootSequence: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [bootStage, setBootStage] = useState(0);
  const [displayText, setDisplayText] = useState('');
  
  const bootMessages = [
    'INITIALIZING ETERNYX SYSTEMS...',
    'LOADING CYBERNETIC PROTOCOLS...',
    'ESTABLISHING NEURAL LINK...',
    'QUANTUM ENCRYPTION ACTIVE...',
    'HACKER INTERFACE READY...',
    'WELCOME TO THE MATRIX...'
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (bootStage < bootMessages.length) {
        const message = bootMessages[bootStage];
        let currentChar = 0;
        
        const typeWriter = setInterval(() => {
          if (currentChar <= message.length) {
            setDisplayText(message.substring(0, currentChar));
            currentChar++;
          } else {
            clearInterval(typeWriter);
            setTimeout(() => {
              setBootStage(prev => prev + 1);
            }, 500);
          }
        }, 50);
      } else {
        setTimeout(onComplete, 1000);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [bootStage, onComplete]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {/* Matrix Rain Background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-data-stream text-cyber-green opacity-30"
            style={{
              left: `${i * 5}%`,
              animationDelay: `${i * 0.2}s`,
              fontSize: '12px',
              fontFamily: 'Fira Code, monospace'
            }}
          >
            {Array.from({ length: 50 }, () => Math.random() > 0.5 ? '1' : '0').join('')}
          </div>
        ))}
      </div>
      
      {/* Boot Terminal */}
      <div className="relative z-10 cyber-card p-8 max-w-2xl w-full mx-4">
        <div className="border border-cyber-cyan rounded-lg p-6 bg-black/90 backdrop-blur-sm">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 rounded-full bg-cyber-pink mr-2 animate-pulse"></div>
            <div className="w-3 h-3 rounded-full bg-cyber-orange mr-2 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-3 h-3 rounded-full bg-cyber-green mr-2 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            <span className="text-cyber-cyan font-mono text-sm ml-4">ETERNYX TERMINAL v3.14.159</span>
          </div>
          
          <div className="terminal-text font-mono text-sm space-y-2">
            {bootMessages.slice(0, bootStage).map((msg, index) => (
              <div key={index} className="flex items-center">
                <span className="text-cyber-green mr-2">[OK]</span>
                <span>{msg}</span>
              </div>
            ))}
            
            {bootStage < bootMessages.length && (
              <div className="flex items-center">
                <span className="text-cyber-cyan mr-2 animate-pulse">[...]</span>
                <span className="typing-cursor">{displayText}</span>
              </div>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-xs text-cyber-cyan mb-2">
              <span>LOADING PROGRESS</span>
              <span>{Math.round((bootStage / bootMessages.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyber-cyan via-cyber-pink to-cyber-green transition-all duration-500 relative"
                style={{ width: `${(bootStage / bootMessages.length) * 100}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scan Lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-full h-0.5 bg-cyber-cyan opacity-50 animate-scan"></div>
      </div>
    </div>
  );
};

// Matrix Rain Component
const MatrixRain: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {[...Array(30)].map((_, i) => (
        <div
          key={i}
          className="absolute text-cyber-green opacity-20 animate-matrix-rain font-mono text-xs"
          style={{
            left: `${i * 3.33}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${15 + Math.random() * 10}s`
          }}
        >
          {Array.from({ length: 100 }, () => 
            String.fromCharCode(0x30A0 + Math.random() * 96)
          ).join('')}
        </div>
      ))}
    </div>
  );
};

// Floating Data Particles
const DataParticles: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      {[...Array(15)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-cyber-cyan rounded-full opacity-60 animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 2}s`
          }}
        />
      ))}
    </div>
  );
};

// Glitch Effect Component
const GlitchOverlay: React.FC = () => {
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    const glitchInterval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance every interval
        setIsGlitching(true);
        setTimeout(() => setIsGlitching(false), 200);
      }
    }, 3000);

    return () => clearInterval(glitchInterval);
  }, []);

  if (!isGlitching) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      <div className="w-full h-full bg-cyber-pink opacity-5 animate-glitch"></div>
      <div className="absolute inset-0 bg-cyber-cyan opacity-5 animate-glitch" style={{ animationDelay: '0.1s' }}></div>
    </div>
  );
};

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
  const [isBooting, setIsBooting] = useState(true);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const { initialize } = useAuthStore();

  useEffect(() => {
    // Initialize auth store when app starts
    initialize();
  }, [initialize]);

  const handleBootComplete = () => {
    setIsBooting(false);
    setTimeout(() => setIsSystemReady(true), 500);
  };

  if (isBooting) {
    return <BootSequence onComplete={handleBootComplete} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background Effects */}
      <MatrixRain />
      <DataParticles />
      <GlitchOverlay />
      
      {/* Cyberpunk Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div 
          className="w-full h-full opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Main Application */}
      <div className={`relative z-10 transition-all duration-1000 ${isSystemReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AccessibilityProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner 
                  toastOptions={{
                    style: {
                      background: 'rgba(0, 0, 0, 0.9)',
                      border: '1px solid hsl(var(--cyber-cyan))',
                      color: 'hsl(var(--cyber-cyan))',
                      fontFamily: 'Fira Code, monospace',
                      boxShadow: '0 0 20px hsl(var(--cyber-cyan) / 0.3)',
                      backdropFilter: 'blur(10px)'
                    }
                  }}
                />
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
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                </BrowserRouter>
              </TooltipProvider>
            </AccessibilityProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </div>

      {/* System Status Indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="cyber-card p-3 bg-black/80 backdrop-blur-sm">
          <div className="flex items-center space-x-2 text-xs font-mono">
            <div className="w-2 h-2 bg-cyber-green rounded-full animate-pulse"></div>
            <span className="text-cyber-green">SYSTEM OPERATIONAL</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

