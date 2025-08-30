import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Lock, Mail, Terminal, Zap } from 'lucide-react';
import { TerminalWindow } from '@/components/TerminalWindow';
import LoadingSpinner from '@/components/LoadingSpinner';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
}

export const LoginForm = ({ onSuccess, onSwitchToSignup }: LoginFormProps) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { signIn, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const result = await signIn(formData.email, formData.password);
    
    if (result.success) {
      onSuccess?.();
    } else {
      setErrors({ general: result.error?.message || 'Login failed' });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <TerminalWindow title="access-terminal.exe" className="mb-6">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-lg font-bold">
            <Terminal className="inline mr-2 h-5 w-5" />
            SECURE ACCESS REQUIRED
          </div>
          <div className="text-muted-foreground text-sm">
            Enter your credentials to access the ETERNYX network
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
              placeholder="user@eternyx.net"
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
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border min-h-[48px] text-base font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
          >
            {isLoading ? (
              <LoadingSpinner size="sm" text="Authenticating..." />
            ) : (
              <>
                <Terminal className="mr-2 h-5 w-5" />
                ACCESS NETWORK
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

          <div className="space-y-2 text-center">
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-primary hover:text-primary/80 text-sm transition-colors"
            >
              Need access? Request network credentials
            </button>
            <br />
            <button
              type="button"
              className="text-muted-foreground hover:text-primary text-sm transition-colors"
            >
              Forgot your access code?
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

