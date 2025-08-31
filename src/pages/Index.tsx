import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TypingText } from "@/components/TypingText";
import { CyberCard } from "@/components/CyberCard";
import { TerminalWindow } from "@/components/TerminalWindow";
import { UserProfile } from "@/components/auth/UserProfile";
import { AuthModal } from "@/components/auth/AuthModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { MobileViewport } from "@/components/MobileViewport";
import { Navigation } from "@/components/Navigation";
import cyberHeroBg from "@/assets/cyber-hero-bg.jpg";
import { 
  Code, 
  Shield, 
  Zap, 
  Terminal, 
  Mail, 
  User, 
  MessageSquare, 
  LogIn, 
  UserPlus,
  Settings,
  Wrench
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/authStore";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { useAccessibility } from "@/components/AccessibilityProvider";
import { supabaseAPI } from "@/lib/supabase";
import { analyticsService } from "@/lib/analyticsService";
import { securityService } from "@/lib/securityService";
import { cacheService } from "@/lib/cacheService";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, profile, initialize } = useAuthStore();
  const { addNotification } = useAppStore();
  const { measureApiCall, trackError } = usePerformanceMonitor();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { announceToScreenReader } = useAccessibility();
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading time or actual data fetching
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  }, []);

  // Initialize auth on component mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  const openAuthModal = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleInitializeConnection = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      openAuthModal('login');
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error status when user starts typing
    if (submitStatus === 'error') {
      setSubmitStatus('idle');
    }
  };

  const validateForm = () => {
    const errors = [];
    
    if (!formData.name.trim()) {
      errors.push('Name is required');
    }
    
    if (!formData.email.trim()) {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.push('Please enter a valid email address');
    }
    
    if (!formData.message.trim()) {
      errors.push('Message is required');
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (errors.length > 0) {
      addNotification({
        type: 'error',
        message: errors.join(', ')
      });
      setSubmitStatus('error');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const startTime = performance.now();
      
      // Submit form data  
      const result = await supabaseAPI.submitContactForm(formData);

      if (result.error) {
        throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
      }

      // Track successful submission
      analyticsService.trackEvent('contact_form_submitted', {
        name: formData.name,
        email: formData.email,
        message_length: formData.message.length
      });

      // Security logging - remove this as it doesn't exist
      console.log('Contact form submitted successfully');

      setSubmitStatus('success');
      setFormData({ name: "", email: "", message: "" });
      
      addNotification({
        type: 'success',
        message: 'Your message has been transmitted successfully. We\'ll respond within 24 hours.'
      });

      announceToScreenReader('Contact form submitted successfully');

    } catch (error) {
      console.error('Contact form submission error:', error);
      
      trackError(error as Error, 'contact_form_submission');

      setSubmitStatus('error');
      
      addNotification({
        type: 'error',
        message: 'Failed to send message. Please try again or contact us directly.'
      });

      announceToScreenReader('Contact form submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cybersecurity services from the image

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading ETERNYX..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      
      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
        onModeChange={setAuthMode}
      />

      {/* Hero Section */}
      <section 
        className="relative min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat safe-area-padding pt-20 sm:pt-24"
        style={{ backgroundImage: `url(${cyberHeroBg})` }}
        role="banner"
        aria-label="ETERNYX Hero Section"
      >
        <div className="absolute inset-0 bg-background/80"></div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto responsive-container">
          <h1 
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-bold mb-4 sm:mb-6 glitch neon-text responsive-text-8xl"
            data-text="ETERNYX"
            aria-label="ETERNYX - Full Stack Development and Cybersecurity"
          >
            ETERNYX
          </h1>
          
          <div className="text-base sm:text-lg md:text-xl lg:text-2xl mb-6 sm:mb-8 h-8 sm:h-10 md:h-12" aria-live="polite">
            <TypingText 
              text="Full Stack Development • Cybersecurity • Digital Innovation"
              speed={80}
              className="text-cyber-blue responsive-text-xl"
            />
          </div>
          
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mobile-space-y-4">
              <Button 
                size="lg" 
                onClick={handleInitializeConnection}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow touch-button w-full sm:w-auto min-h-[48px] px-6 sm:px-8 text-sm sm:text-base transition-all duration-300 hover:scale-105"
                aria-label="Initialize secure connection to premium services"
              >
                <Terminal className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Initialize Connection
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => openAuthModal('signup')}
                className="bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/40 touch-button w-full sm:w-auto min-h-[48px] px-6 sm:px-8 text-sm sm:text-base transition-all duration-300 hover:scale-105"
              >
                <UserPlus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Join Network
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mobile-animate-fade-in">
              <div className="text-primary text-base sm:text-lg responsive-text-lg">
                Welcome back, <span className="font-bold text-cyber-green">{profile?.username}</span>
              </div>
              <Button 
                size="lg" 
                onClick={() => navigate('/dashboard')}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow touch-button min-h-[48px] px-6 sm:px-8 text-sm sm:text-base transition-all duration-300 hover:scale-105"
              >
                <Terminal className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Access Dashboard
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Cybersecurity Navigation Section */}
      <section className="py-12 sm:py-16 md:py-20 px-4 max-w-6xl mx-auto responsive-container mobile-section-padding" id="cybersecurity" aria-label="Cybersecurity Services">
        <div className="text-center mb-8 sm:mb-12 mobile-animate-fade-in">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 text-cyber-green neon-text responsive-text-4xl">
            ./cybersecurity
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto responsive-text-lg">
            Advanced cybersecurity solutions powered by cutting-edge technology
          </p>
        </div>
        
        <div className="flex justify-center mobile-animate-slide-up">
          <Button 
            onClick={() => navigate('/services')}
            className="bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-lg text-base sm:text-lg transition-all duration-300 hover:scale-105 neon-border animate-pulse-glow touch-button w-full sm:w-auto max-w-sm"
            aria-label="Access comprehensive cybersecurity services"
          >
            <Shield className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
            Access Cybersecurity Services
          </Button>
        </div>
      </section>
      {isAuthenticated && (
        <section className="py-12 sm:py-16 md:py-20 px-4 max-w-6xl mx-auto responsive-container mobile-section-padding" aria-label="Advanced Features">
          <div className="text-center mb-8 sm:mb-12 mobile-animate-fade-in">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-4xl">
              ./advanced_features
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg">
              Access your personalized dashboard and advanced tools
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mobile-grid">
            <div className="mobile-card hover:border-primary/40 transition-all duration-300 mobile-animate-slide-up">
              <div className="flex items-center mb-3 sm:mb-4">
                <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary mr-2 sm:mr-3" />
                <h3 className="text-base sm:text-lg font-semibold text-primary responsive-text-lg">User Profile</h3>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 responsive-text-base">
                Manage your account settings, preferences, and security options
              </p>
              <Button 
                onClick={() => navigate("/profile")}
                variant="outline"
                size="sm"
                className="w-full touch-button border-primary/20 hover:bg-primary/10 text-xs sm:text-sm"
              >
                Access Profile
              </Button>
            </div>

            <div className="mobile-card hover:border-secondary/40 transition-all duration-300 mobile-animate-slide-up" style={{animationDelay: "0.1s"}}>
              <div className="flex items-center mb-3 sm:mb-4">
                <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-secondary mr-2 sm:mr-3" />
                <h3 className="text-base sm:text-lg font-semibold text-secondary responsive-text-lg">Settings</h3>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 responsive-text-base">
                Customize your experience with advanced configuration options
              </p>
              <Button 
                onClick={() => navigate("/settings")}
                variant="outline"
                size="sm"
                className="w-full touch-button border-secondary/20 hover:bg-secondary/10 text-xs sm:text-sm"
              >
                Open Settings
              </Button>
            </div>

            <div className="mobile-card hover:border-accent/40 transition-all duration-300 mobile-animate-slide-up sm:col-span-2 lg:col-span-1" style={{animationDelay: "0.2s"}}>
              <div className="flex items-center mb-3 sm:mb-4">
                <Wrench className="h-5 w-5 sm:h-6 sm:w-6 text-accent mr-2 sm:mr-3" />
                <h3 className="text-base sm:text-lg font-semibold text-accent responsive-text-lg">Tools Hub</h3>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 responsive-text-base">
                Access our comprehensive suite of cybersecurity and development tools
              </p>
              <Button 
                onClick={() => navigate("/tools")}
                variant="outline"
                size="sm"
                className="w-full touch-button border-accent/20 hover:bg-accent/10 text-xs sm:text-sm"
              >
                Launch Tools
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Traditional Services Section */}
      <section className="py-20 px-4 max-w-6xl mx-auto" aria-label="Our Services">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            <TypingText text="./services" speed={120} />
          </h2>
          <p className="text-muted-foreground text-lg">
            Complete digital solutions for modern businesses
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8" role="list">
          <div role="listitem">
            <CyberCard
              title="Full Stack Development"
              description="Complete web applications built with modern frameworks. From responsive frontends to scalable backends, we architect solutions that perform."
              icon={<Code />}
            />
          </div>
          
          <div role="listitem">
            <CyberCard
              title="Cybersecurity"
              description="Protect your digital assets with enterprise-grade security measures. Penetration testing, vulnerability assessments, and security audits."
              icon={<Shield />}
            />
          </div>
          
          <div role="listitem">
            <CyberCard
              title="Performance Optimization"
              description="Lightning-fast applications that scale. Database optimization, caching strategies, and infrastructure that handles growth."
              icon={<Zap />}
            />
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-20 px-4 max-w-4xl mx-auto" aria-label="Technology Stack">
        <TerminalWindow title="tech-stack.sh" className="mb-8">
          <div className="space-y-2">
            <div className="text-cyber-green">$ cat tech_stack.txt</div>
            <div className="text-foreground">
              <div>Frontend: React • TypeScript • Next.js • Tailwind CSS</div>
              <div>Backend: Node.js • Python • PostgreSQL • Redis</div>
              <div>Cloud: AWS • Docker • Kubernetes • Terraform</div>
              <div>Security: OWASP • Pentesting • Encryption • Zero Trust</div>
              <div>AI/ML: OpenAI • TensorFlow • PyTorch • Analytics</div>
            </div>
            <div className="text-cyber-green typing-cursor">$ _</div>
          </div>
        </TerminalWindow>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-4 max-w-4xl mx-auto" id="contact" aria-label="Contact Form">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            <TypingText text="./contact" speed={120} />
          </h2>
          <p className="text-muted-foreground text-lg">
            Ready to build something extraordinary?
          </p>
        </div>

        <TerminalWindow title="contact-form.exe">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-cyber-green mb-2">
                  <User className="inline mr-2 h-4 w-4" />
                  Name:
                </label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="bg-background border-border text-foreground"
                  placeholder="Enter your name..."
                  required
                  aria-required="true"
                  aria-describedby="name-error"
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-cyber-green mb-2">
                  <Mail className="inline mr-2 h-4 w-4" />
                  Email:
                </label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="bg-background border-border text-foreground"
                  placeholder="your@email.com"
                  required
                  aria-required="true"
                  aria-describedby="email-error"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="message" className="block text-cyber-green mb-2">
                <MessageSquare className="inline mr-2 h-4 w-4" />
                Message:
              </label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => handleInputChange('message', e.target.value)}
                className="bg-background border-border text-foreground min-h-[120px]"
                placeholder="Describe your project requirements..."
                required
                aria-required="true"
                aria-describedby="message-error"
              />
            </div>
            
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className={`w-full neon-border transition-all duration-300 hover:scale-105 ${
                submitStatus === 'success' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : submitStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary hover:bg-primary/80'
              }`}
            >
              {isSubmitting ? (
                <LoadingSpinner size="sm" text="Transmitting..." />
              ) : (
                <>
                  <Terminal className="mr-2 h-5 w-5" />
                  Execute Connection
                </>
              )}
            </Button>
          </form>
        </TerminalWindow>
      </section>
    </div>
  );
};

export default Index;

