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
import { User, Mail, Lock, Terminal, ArrowLeft } from "lucide-react";

const SignUp = () => {
  const navigate = useNavigate();
  const { addNotification } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Track user engagement
    analyticsService.trackInteraction('signup_form', 'change', {
      field,
      length: value.length
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Security validation
    const nameValidation = securityService.validateInput(formData.name, 'text');
    const emailValidation = securityService.validateInput(formData.email, 'email');
    const passwordValidation = securityService.validateInput(formData.password, 'password');
    
    if (!nameValidation.isValid || !emailValidation.isValid || !passwordValidation.isValid) {
      addNotification({
        type: 'error',
        message: 'Invalid input detected. Please check your form data.'
      });
      return;
    }

    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      addNotification({
        type: 'error',
        message: 'Please fill in all fields'
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      addNotification({
        type: 'error',
        message: 'Passwords do not match'
      });
      return;
    }

    if (formData.password.length < 8) {
      addNotification({
        type: 'error',
        message: 'Password must be at least 8 characters long'
      });
      return;
    }

    // Rate limiting check
    if (!securityService.checkRateLimit(`signup_${formData.email}`, 3, 300000)) {
      addNotification({
        type: 'error',
        message: 'Too many signup attempts. Please wait before trying again.'
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Track signup attempt
      analyticsService.trackFormSubmission('signup_form', formData);
      
      // Sign up with Supabase
      const { data, error } = await supabaseAPI.signUp(
        emailValidation.sanitized,
        formData.password,
        {
          name: nameValidation.sanitized,
          access_level: 'basic'
        }
      );
      
      if (error) throw error;
      
      // Track successful signup
      analyticsService.trackConversion('user_signup', 1, {
        method: 'email',
        access_level: 'basic'
      });
      
      addNotification({
        type: 'success',
        message: 'Account created successfully! Please check your email to verify your account.'
      });
      
      // Redirect to sign in page
      setTimeout(() => {
        navigate("/signin");
      }, 2000);
      
    } catch (error) {
      securityService.logSecurityEvent('failed_login', 'medium', {
        type: 'signup_error',
        email: formData.email,
        error: (error as Error).message
      });
      
      addNotification({
        type: 'error',
        message: 'Failed to create account. Please try again.'
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

        <TerminalWindow title="user-registration.exe" className="w-full">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-primary mb-2">
                <Terminal className="inline mr-2 h-6 w-6" />
                Initialize User Account
              </h1>
              <p className="text-muted-foreground">
                Join the ETERNYX network
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-cyber-green mb-2">
                  <User className="inline mr-2 h-4 w-4" />
                  Username:
                </label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="bg-background border-border text-foreground neon-border"
                  placeholder="Enter your username..."
                  required
                  disabled={isLoading}
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
                  placeholder="Enter secure password..."
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-cyber-green mb-2">
                  <Lock className="inline mr-2 h-4 w-4" />
                  Confirm Password:
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className="bg-background border-border text-foreground neon-border"
                  placeholder="Confirm your password..."
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
                  <LoadingSpinner size="sm" text="Creating Account..." />
                ) : (
                  <>
                    <Terminal className="mr-2 h-5 w-5" />
                    Create Account
                  </>
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="text-center pt-4 border-t border-border">
              <p className="text-muted-foreground">
                Already have an account?{" "}
                <Link 
                  to="/signin" 
                  className="text-cyber-blue hover:text-cyber-green transition-colors"
                >
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default SignUp;

