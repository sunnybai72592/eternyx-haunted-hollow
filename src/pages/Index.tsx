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
  Skull,
  AlertTriangle,
  Diamond,
  Eye,
  Users,
  Wifi
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
  const securityServices = [
    {
      id: 'black-hat-pentesting',
      title: 'Black Hat Pentesting',
      description: 'Advanced penetration testing using cutting-edge techniques. We think like attackers to protect your systems from real threats.',
      icon: <Skull className="h-6 w-6" />,
      route: '/black-hat-pentesting',
      color: 'text-red-400'
    },
    {
      id: 'zero-day-protection',
      title: 'Zero-Day Protection',
      description: 'Stay ahead of unknown threats with our proprietary detection systems and real-time threat intelligence feeds.',
      icon: <AlertTriangle className="h-6 w-6" />,
      route: '/zero-day-protection',
      color: 'text-yellow-400'
    },
    {
      id: 'quantum-encryption',
      title: 'Quantum-Ready Encryption',
      description: 'Future-proof your data with quantum-resistant encryption algorithms and next-generation security protocols.',
      icon: <Diamond className="h-6 w-6" />,
      route: '/quantum-encryption',
      color: 'text-purple-400'
    },
    {
      id: 'ai-security',
      title: 'AI-Powered Security',
      description: 'Machine learning algorithms that adapt to new threats in real-time, providing predictive security measures.',
      icon: <Eye className="h-6 w-6" />,
      route: '/ai-powered-security',
      color: 'text-blue-400'
    },
    {
      id: 'elite-team',
      title: 'Elite Development Team',
      description: 'Access to our top-tier developers for mission-critical applications that require the highest security standards.',
      icon: <Users className="h-6 w-6" />,
      route: '/elite-development-team',
      color: 'text-green-400'
    },
    {
      id: 'threat-monitoring',
      title: '24/7 Threat Monitoring',
      description: 'Round-the-clock security operations center monitoring your infrastructure with instant threat response.',
      icon: <Wifi className="h-6 w-6" />,
      route: '/threat-monitoring',
      color: 'text-orange-400'
    }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading ETERNYX..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
        onModeChange={setAuthMode}
      />

      {/* Authentication Header */}
      <header className="fixed top-0 right-0 z-50 p-4">
        {isAuthenticated ? (
          <UserProfile className="animate-fade-in" />
        ) : (
          <div className="flex space-x-2 animate-fade-in">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAuthModal('login')}
              className="bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 hover:scale-105"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>
            <Button
              size="sm"
              onClick={() => openAuthModal('signup')}
              className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border transition-all duration-300 hover:scale-105"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Sign Up
            </Button>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section 
        className="relative min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${cyberHeroBg})` }}
        role="banner"
        aria-label="ETERNYX Hero Section"
      >
        <div className="absolute inset-0 bg-background/80"></div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 
            className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-bold mb-6 glitch neon-text"
            data-text="ETERNYX"
            aria-label="ETERNYX - Full Stack Development and Cybersecurity"
          >
            ETERNYX
          </h1>
          
          <div className="text-lg sm:text-xl md:text-2xl mb-8 h-12" aria-live="polite">
            <TypingText 
              text="Full Stack Development • Cybersecurity • Digital Innovation"
              speed={80}
              className="text-cyber-blue"
            />
          </div>
          
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                size="lg" 
                onClick={handleInitializeConnection}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow min-h-[48px] px-8 transition-all duration-300 hover:scale-105"
                aria-label="Initialize secure connection to premium services"
              >
                <Terminal className="mr-2 h-5 w-5" />
                Initialize Connection
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => openAuthModal('signup')}
                className="bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/40 min-h-[48px] px-8 transition-all duration-300 hover:scale-105"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Join Network
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-primary text-lg">
                Welcome back, <span className="font-bold text-cyber-green">{profile?.username}</span>
              </div>
              <Button 
                size="lg" 
                onClick={() => navigate('/dashboard')}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow min-h-[48px] px-8 transition-all duration-300 hover:scale-105"
              >
                <Terminal className="mr-2 h-5 w-5" />
                Access Dashboard
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Cybersecurity Services Section - Matching the Image */}
      <section className="py-20 px-4 max-w-6xl mx-auto" id="services" aria-label="Cybersecurity Services">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            <TypingText text="./security_services" speed={120} />
          </h2>
          <p className="text-muted-foreground text-lg">
            Advanced cybersecurity solutions powered by cutting-edge technology
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" role="list">
          {securityServices.map((service) => (
            <div key={service.id} role="listitem">
              <Button
                onClick={() => navigate(service.route)}
                className="w-full h-auto p-0 bg-transparent hover:bg-transparent border-0"
                variant="ghost"
              >
                <div className="w-full p-6 bg-card/50 backdrop-blur-sm border border-blue-500/20 rounded-lg hover:border-blue-500/40 hover:bg-card/70 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20">
                  <div className="flex items-center mb-4">
                    <div className={`${service.color} mr-3`}>
                      {service.icon}
                    </div>
                    <h3 className={`text-lg font-bold ${service.color} text-left`}>
                      {service.title}
                    </h3>
                  </div>
                  <p className="text-muted-foreground text-sm text-left leading-relaxed">
                    {service.description}
                  </p>
                </div>
              </Button>
            </div>
          ))}
        </div>
      </section>

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

