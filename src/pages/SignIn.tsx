import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalWindow } from "@/components/TerminalWindow";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAppStore } from "@/store/useAppStore";
import { supabaseAPI } from "@/lib/supabase";
import { securityService } from "@/lib/securityService";
import { analyticsService } from "@/lib/analyticsService";
import { Mail, Lock, Terminal, ArrowLeft, Shield } from "lucide-react";

const SignIn = () => {
  const navigate = useNavigate();
  const { addNotification } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Track user engagement
    analyticsService.trackInteraction('signin_form', 'change', {
      field,
      length: value.length
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Security validation
    const emailValidation = securityService.validateInput(formData.email, 'email');
    const passwordValidation = securityService.validateInput(formData.password, 'password');
    
    if (!emailValidation.isValid || !passwordValidation.isValid) {
      addNotification({
        type: 'error',
        message: 'Invalid input detected. Please check your credentials.'
      });
      return;
    }

    if (!formData.email || !formData.password) {
      addNotification({
        type: 'error',
        message: 'Please fill in all fields'
      });
      return;
    }

    // Rate limiting check
    if (!securityService.checkRateLimit(`signin_${formData.email}`, 5, 300000)) {
      addNotification({
        type: 'error',
        message: 'Too many login attempts. Please wait before trying again.'
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Track signin attempt
      analyticsService.trackFormSubmission('signin_form', { email: formData.email });
      
      // Sign in with Supabase
      const { data, error } = await supabaseAPI.signIn(
        emailValidation.sanitized,
        formData.password
      );
      
      if (error) throw error;
      
      // Track successful signin
      analyticsService.trackConversion('user_signin', 1, {
        method: 'email',
        user_id: data.user?.id
      });
      
      addNotification({
        type: 'success',
        message: 'Welcome back! Redirecting to dashboard...'
      });
      
      // Redirect to dashboard
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
      
    } catch (error) {
      securityService.logSecurityEvent('failed_login', 'medium', {
        type: 'signin_error',
        email: formData.email,
        error: (error as Error).message
      });
      
      addNotification({
        type: 'error',
        message: 'Invalid credentials. Please check your email and password.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6 text-cyber-blue hover:text-cyber-green"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <TerminalWindow title="secure-login.exe" className="w-full">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-primary mb-2">
                <Shield className="inline mr-2 h-6 w-6" />
                Access Control
              </h1>
              <p className="text-muted-foreground">
                Enter your credentials to access the ETERNYX network
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="bg-background border-border text-foreground neon-border"
                  placeholder="your@email.com"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-cyber-green mb-2">
                  <Lock className="inline mr-2 h-4 w-4" />
                  Password:
                </label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="bg-background border-border text-foreground neon-border"
                  placeholder="Enter your password..."
                  required
                  disabled={isLoading}
                />
              </div>

              <Button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow"
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" text="Authenticating..." />
                ) : (
                  <>
                    <Terminal className="mr-2 h-5 w-5" />
                    Access Network
                  </>
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="text-center pt-4 border-t border-border space-y-2">
              <p className="text-muted-foreground">
                Don't have an account?{" "}
                <Link 
                  to="/signup" 
                  className="text-cyber-blue hover:text-cyber-green transition-colors"
                >
                  Create Account
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                <Link 
                  to="/forgot-password" 
                  className="text-cyber-blue hover:text-cyber-green transition-colors"
                >
                  Forgot Password?
                </Link>
              </p>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default SignIn;

