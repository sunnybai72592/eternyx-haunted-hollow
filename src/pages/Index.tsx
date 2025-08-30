import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TypingText } from "@/components/TypingText";
import { CyberCard } from "@/components/CyberCard";
import { TerminalWindow } from "@/components/TerminalWindow";
import LoadingSpinner from "@/components/LoadingSpinner";
import cyberHeroBg from "@/assets/cyber-hero-bg.jpg";
import { Code, Shield, Zap, Terminal, Mail, User, MessageSquare } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { useAccessibility } from "@/components/AccessibilityProvider";
import { supabaseAPI } from "@/lib/supabase";
import { analyticsService } from "@/lib/analyticsService";
import { securityService } from "@/lib/securityService";
import { cacheService } from "@/lib/cacheService";

const Index = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { addNotification, isLoading } = useAppStore();
  const { measureApiCall, trackError } = usePerformanceMonitor();
  const { announceToScreenReader } = useAccessibility();

  useEffect(() => {
    // Initialize analytics tracking
    analyticsService.setUserId('anonymous');
    analyticsService.trackPageView('/');
    
    // Announce page load to screen readers
    announceToScreenReader("ETERNYX homepage loaded. Full stack development and cybersecurity services.");
    
    // Track performance metrics
    const loadTime = performance.now();
    analyticsService.trackPerformance('page_load', loadTime);
  }, [announceToScreenReader]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Security validation
    const nameValidation = securityService.validateInput(formData.name, 'text');
    const emailValidation = securityService.validateInput(formData.email, 'email');
    const messageValidation = securityService.validateInput(formData.message, 'text');
    
    if (!nameValidation.isValid || !emailValidation.isValid || !messageValidation.isValid) {
      addNotification({
        type: 'error',
        message: 'Invalid input detected. Please check your form data.'
      });
      return;
    }
    
    if (!formData.name || !formData.email || !formData.message) {
      addNotification({
        type: 'error',
        message: 'Please fill in all fields'
      });
      return;
    }

    // Rate limiting check
    if (!securityService.checkRateLimit(`form_${formData.email}`, 3, 300000)) { // 3 submissions per 5 minutes
      addNotification({
        type: 'error',
        message: 'Too many submissions. Please wait before trying again.'
      });
      return;
    }

    setIsSubmitting(true);
    const startTime = performance.now();
    
    try {
      // Track form submission
      analyticsService.trackFormSubmission('contact_form', formData);
      
      // Submit to Supabase with enhanced features
      const { data, error } = await supabaseAPI.submitContactForm({
        name: nameValidation.sanitized,
        email: emailValidation.sanitized,
        message: messageValidation.sanitized
      });
      
      if (error) throw error;
      
      const duration = measureApiCall('contact-form', startTime);
      
      // Cache successful submission
      cacheService.set(`submission_${data.id}`, data, 3600000); // 1 hour
      
      // Track conversion
      analyticsService.trackConversion('contact_form', 1, {
        formType: 'contact',
        responseTime: duration
      });
      
      addNotification({
        type: 'success',
        message: 'Message sent successfully! We\'ll get back to you soon.'
      });
      
      announceToScreenReader("Contact form submitted successfully");
      
      // Reset form
      setFormData({ name: "", email: "", message: "" });
      
    } catch (error) {
      trackError(error as Error, 'contact-form');
      securityService.logSecurityEvent('data_access', 'medium', {
        type: 'form_submission_error',
        error: (error as Error).message
      });
      
      addNotification({
        type: 'error',
        message: 'Failed to send message. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitializeConnection = () => {
    // Track user interaction
    analyticsService.trackInteraction('initialize_button', 'click', {
      page: '/',
      timestamp: Date.now()
    });
    
    // Security logging
    securityService.logSecurityEvent('data_access', 'low', {
      type: 'secure_area_access',
      action: 'initialize_connection'
    });
    
    addNotification({
      type: 'info',
      message: 'Initializing secure connection...'
    });
    
    announceToScreenReader("Initializing connection to secure area");
    
    setTimeout(() => {
      navigate("/hacked");
    }, 1000);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Track user engagement
    analyticsService.trackInteraction('form_input', 'change', {
      field,
      length: value.length
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading ETERNYX..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

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
            className="text-8xl md:text-9xl font-bold mb-6 glitch neon-text"
            data-text="ETERNYX"
            aria-label="ETERNYX - Full Stack Development and Cybersecurity"
          >
            ETERNYX
          </h1>
          
          <div className="text-xl md:text-2xl mb-8 h-12" aria-live="polite">
            <TypingText 
              text="Full Stack Development • Cybersecurity • Digital Innovation"
              speed={80}
              className="text-cyber-blue"
            />
          </div>
          
          <Button 
            size="lg" 
            onClick={handleInitializeConnection}
            className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow"
            aria-label="Initialize secure connection to premium services"
          >
            <Terminal className="mr-2 h-5 w-5" />
            Initialize Connection
          </Button>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 px-4 max-w-6xl mx-auto" id="services" aria-label="Our Services">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            <TypingText text="./services" speed={120} />
          </h2>
          <p className="text-muted-foreground text-lg">
            Advanced digital solutions powered by cutting-edge technology
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
                className="bg-background border-border text-foreground min-h-32"
                placeholder="Describe your project requirements..."
                required
                aria-required="true"
                aria-describedby="message-error"
              />
            </div>
            
            <Button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border"
              aria-label="Submit contact form"
            >
              {isSubmitting ? (
                <LoadingSpinner size="sm" text="" />
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

      {/* Footer */}
      <footer className="py-8 px-4 text-center border-t border-border" role="contentinfo">
        <p className="text-muted-foreground">
          © 2024 ETERNYX • <span className="text-cyber-green">System Online</span> • 
          <span className="text-xs ml-2">
            Secured by AI • Analytics Enabled • Performance Optimized
          </span>
        </p>
      </footer>
    </div>
  );
};

export default Index;
