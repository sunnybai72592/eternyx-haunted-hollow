import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Lock, Mail, Terminal, User, Zap, Shield, UserPlus } from 'lucide-react';
import { TerminalWindow } from '@/components/TerminalWindow';
import LoadingSpinner from '@/components/LoadingSpinner';
import { motion } from 'framer-motion';

interface SignupFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

const formVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
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

const strengthColors = ['bg-destructive', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-cyber-green'];
const strengthLabels = ['VERY WEAK', 'WEAK', 'FAIR', 'GOOD', 'STRONG'];

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
    } else if (getPasswordStrength(formData.password) < 3) {
      newErrors.password = 'Password strength is too low (must be at least FAIR)';
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
        (result.error as any).message : 'Registration failed. Access denied.';
      setErrors({ general: errorMessage });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <motion.div
      className="w-full max-w-md mx-auto"
      variants={formVariants}
      initial="hidden"
      animate="visible"
    >
      <TerminalWindow title="NETWORK_REGISTRATION_V4.1.2" className="mb-6">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-lg font-bold flex items-center justify-center">
            <UserPlus className="inline mr-2 h-5 w-5 animate-pulse" />
            AGENT PROFILE CREATION
          </div>
          <div className="text-muted-foreground text-sm">
            Requesting Credentials for ETERNYX Network
          </div>
        </div>
      </TerminalWindow>

      <Card className="cyber-card p-8 space-y-6 shadow-2xl shadow-primary/30 transition-all duration-500 hover:shadow-primary/50">
        <form onSubmit={handleSubmit} className="space-y-6">
          {errors.general && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-destructive/20 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm flex items-center glitch-text"
            >
              <Zap className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="font-mono">{errors.general}</span>
            </motion.div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username" className="text-cyber-green flex items-center text-sm font-mono">
              <User className="mr-2 h-4 w-4" />
              [AGENT_HANDLE] Username
            </Label>
            <Input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className={`bg-background/50 border-2 ${errors.username ? 'border-destructive' : 'border-border'} text-foreground focus:border-primary focus:ring-primary/40 transition-all duration-300 neon-input`}
              placeholder="cyber_agent_001"
              disabled={isLoading}
            />
            {errors.username && (
              <p className="text-destructive text-xs font-mono mt-1">{`// ERROR: ${errors.username}`}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-cyber-green flex items-center text-sm font-mono">
              <Mail className="mr-2 h-4 w-4" />
              [AGENT_ID] Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`bg-background/50 border-2 ${errors.email ? 'border-destructive' : 'border-border'} text-foreground focus:border-primary focus:ring-primary/40 transition-all duration-300 neon-input`}
              placeholder="agent@eternyx.net"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-destructive text-xs font-mono mt-1">{`// ERROR: ${errors.email}`}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-cyber-green flex items-center text-sm font-mono">
              <Lock className="mr-2 h-4 w-4" />
              [ACCESS_KEY] Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className={`bg-background/50 border-2 ${errors.password ? 'border-destructive' : 'border-border'} text-foreground focus:border-primary focus:ring-primary/40 transition-all duration-300 pr-10 neon-input`}
                placeholder="••••••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors z-10"
                disabled={isLoading}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            
            {formData.password && (
              <div className="space-y-2 mt-2">
                <div className="flex space-x-1 h-2">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className={`h-full flex-1 rounded-sm ${
                        i < passwordStrength ? strengthColors[passwordStrength - 1] : 'bg-muted/30'
                      }`}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  STRENGTH: <span className={`font-bold ${strengthColors[passwordStrength - 1]}`}>{passwordStrength > 0 ? strengthLabels[passwordStrength - 1] : 'PENDING'}</span>
                </p>
              </div>
            )}
            
            {errors.password && (
              <p className="text-destructive text-xs font-mono mt-1">{`// ERROR: ${errors.password}`}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-cyber-green flex items-center text-sm font-mono">
              <Lock className="mr-2 h-4 w-4" />
              [VERIFY_KEY] Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                className={`bg-background/50 border-2 ${errors.confirmPassword ? 'border-destructive' : 'border-border'} text-foreground focus:border-primary focus:ring-primary/40 transition-all duration-300 pr-10 neon-input`}
                placeholder="••••••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors z-10"
                disabled={isLoading}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-destructive text-xs font-mono mt-1">{`// ERROR: ${errors.confirmPassword}`}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground neon-border-lg min-h-[52px] text-lg font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-primary/50 flex items-center justify-center"
          >
            {isLoading ? (
              <LoadingSpinner size="md" text="PROCESSING REQUEST..." />
            ) : (
              <>
                <Shield className="mr-3 h-6 w-6" />
                <span className="tracking-widest">REQUEST ACCESS</span>
              </>
            )}
          </Button>
        </form>

        <div className="space-y-4 pt-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground/70 font-mono">OR</span>
            </div>
          </div>

          <div className="text-center">
            <motion.button
              type="button"
              onClick={onSwitchToLogin}
              className="text-primary hover:text-primary/80 text-sm transition-colors font-mono hover:underline"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              [EXISTING_AGENT] Already have network access? Sign in
            </motion.button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
