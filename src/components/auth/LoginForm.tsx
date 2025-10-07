import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Lock, Mail, Terminal, Zap, LogIn } from 'lucide-react';
import { TerminalWindow } from '@/components/TerminalWindow';
import LoadingSpinner from '@/components/LoadingSpinner';
import { motion } from 'framer-motion';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
}

const formVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

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
      setErrors({ general: result.error || 'Login failed. Access denied.' });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <motion.div
      className="w-full max-w-md mx-auto"
      variants={formVariants}
      initial="hidden"
      animate="visible"
    >
      <TerminalWindow title="ACCESS_PROTOCOL_V4.1.2" className="mb-6">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-lg font-bold flex items-center justify-center">
            <LogIn className="inline mr-2 h-5 w-5 animate-pulse" />
            SECURE NETWORK LOGIN
          </div>
          <div className="text-muted-foreground text-sm">
            Authenticate to ETERNYX Core System
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
            <Label htmlFor="email" className="text-cyber-green flex items-center text-sm font-mono">
              <Mail className="mr-2 h-4 w-4" />
              [AGENT_ID] Email
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
            {errors.password && (
              <p className="text-destructive text-xs font-mono mt-1">{`// ERROR: ${errors.password}`}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground neon-border-lg min-h-[52px] text-lg font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-primary/50 flex items-center justify-center"
          >
            {isLoading ? (
              <LoadingSpinner size="md" text="INITIATING CONNECTION..." />
            ) : (
              <>
                <Terminal className="mr-3 h-6 w-6" />
                <span className="tracking-widest">ACCESS NETWORK</span>
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

          <div className="flex flex-col space-y-2 text-center">
            <motion.button
              type="button"
              onClick={onSwitchToSignup}
              className="text-primary hover:text-primary/80 text-sm transition-colors font-mono hover:underline"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              [NEW_USER] Request Network Credentials
            </motion.button>
            <motion.button
              type="button"
              className="text-muted-foreground/80 hover:text-primary/80 text-xs transition-colors font-mono hover:underline"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              [RECOVERY] Forgot Access Key?
            </motion.button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
