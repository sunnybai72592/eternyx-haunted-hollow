import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Lock, Mail, Terminal, User, Zap, Shield } from 'lucide-react';
import { TerminalWindow } from '@/components/TerminalWindow';
import LoadingSpinner from '@/components/LoadingSpinner';

interface SignupFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const SignupForm = ({ onSuccess, onSwitchToLogin }: SignupFormProps) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { signUp, isLoading } = useAuthStore();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await signUp(formData.email, formData.password, formData.username);
    
    if (result.success) {
      onSuccess?.();
    } else {
      const errorMessage = typeof result.error === 'string' ? result.error : 
        (result.error && typeof result.error === 'object' && 'message' in result.error) ? 
        (result.error as any).message : 'Registration failed';
      setErrors({ general: errorMessage });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const getPasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(formData.password);
  const strengthColors = ['bg-destructive', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-primary'];
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="w-full max-w-md mx-auto">
      <TerminalWindow title="network-registration.exe" className="mb-6">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-lg font-bold">
            <Shield className="inline mr-2 h-5 w-5" />
            NETWORK ACCESS REQUEST
          </div>
          <div className="text-muted-foreground text-sm">
            Register for ETERNYX network credentials
          </div>
        </div>
      </TerminalWindow>

      <Card className="cyber-card p-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md text-sm">
              <Zap className="inline mr-2 h-4 w-4" />
              {errors.general}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username" className="text-cyber-green flex items-center">
              <User className="mr-2 h-4 w-4" />
              Username
            </Label>
            <Input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className="bg-background border-border text-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300"
              placeholder="cyber_agent_001"
              disabled={isLoading}
            />
            {errors.username && (
              <p className="text-destructive text-sm">{errors.username}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-cyber-green flex items-center">
              <Mail className="mr-2 h-4 w-4" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="bg-background border-border text-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300"
              placeholder="agent@eternyx.net"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-destructive text-sm">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-cyber-green flex items-center">
              <Lock className="mr-2 h-4 w-4" />
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className="bg-background border-border text-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 pr-10"
                placeholder="••••••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                disabled={isLoading}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            
            {formData.password && (
              <div className="space-y-2">
                <div className="flex space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded ${
                        i < passwordStrength ? strengthColors[passwordStrength - 1] : 'bg-muted'
                      } transition-colors duration-300`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Strength: {passwordStrength > 0 ? strengthLabels[passwordStrength - 1] : 'Enter password'}
                </p>
              </div>
            )}
            
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-cyber-green flex items-center">
              <Lock className="mr-2 h-4 w-4" />
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                className="bg-background border-border text-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 pr-10"
                placeholder="••••••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                disabled={isLoading}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-destructive text-sm">{errors.confirmPassword}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border min-h-[48px] text-base font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
          >
            {isLoading ? (
              <LoadingSpinner size="sm" text="Creating account..." />
            ) : (
              <>
                <Terminal className="mr-2 h-5 w-5" />
                REQUEST ACCESS
              </>
            )}
          </Button>
        </form>

        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-primary hover:text-primary/80 text-sm transition-colors"
            >
              Already have network access? Sign in
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

