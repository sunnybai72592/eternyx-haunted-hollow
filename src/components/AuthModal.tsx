import React, { useState } from 'react';
import { X, Eye, EyeOff, User, Mail, Lock, Zap, Shield, Crown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { signInWithGoogle } from "../services/authService";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose, 
  initialMode = 'signin' 
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    fullName: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  const { signIn, signUp, resetPassword, loading, error } = useAuth();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (mode !== 'reset') {
      if (!formData.password) {
        errors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }

      if (mode === 'signup') {
        if (!formData.confirmPassword) {
          errors.confirmPassword = 'Please confirm your password';
        } else if (formData.password !== formData.confirmPassword) {
          errors.confirmPassword = 'Passwords do not match';
        }

        if (!formData.username) {
          errors.username = 'Username is required';
        } else if (formData.username.length < 3) {
          errors.username = 'Username must be at least 3 characters';
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      if (mode === 'signin') {
        const { error } = await signIn(formData.email, formData.password);
        if (!error) {
          onClose();
        }
      } else if (mode === 'signup') {
        const { error } = await signUp(formData.email, formData.password, {
          username: formData.username,
          fullName: formData.fullName
        });
        if (!error) {
          onClose();
        }
      } else if (mode === 'reset') {
        const { error } = await resetPassword(formData.email);
        if (!error) {
          setMode('signin');
          // Show success message
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      username: '',
      fullName: ''
    });
    setFormErrors({});
  };

  const switchMode = (newMode: 'signin' | 'signup' | 'reset') => {
    setMode(newMode);
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-black/95 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/20 overflow-hidden">
        {/* Matrix Rain Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="matrix-rain opacity-5"></div>
        </div>

        {/* Header */}
        <div className="relative p-6 border-b border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                {mode === 'signin' ? (
                  <Shield className="w-5 h-5 text-white" />
                ) : mode === 'signup' ? (
                  <Crown className="w-5 h-5 text-white" />
                ) : (
                  <Lock className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {mode === 'signin' && 'SECURE ACCESS'}
                  {mode === 'signup' && 'JOIN NETWORK'}
                  {mode === 'reset' && 'RESET ACCESS'}
                </h2>
                <p className="text-sm text-gray-400">
                  {mode === 'signin' && 'Enter your credentials to access the ETERNYX network'}
                  {mode === 'signup' && 'Create your account to join the elite network'}
                  {mode === 'reset' && 'Reset your access credentials'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="relative p-6 space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Address
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="user@eternyx.net"
              className="bg-gray-900/50 border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-cyan-500/20"
              disabled={loading}
            />
            {formErrors.email && (
              <p className="text-red-400 text-sm">{formErrors.email}</p>
            )}
          </div>

          {/* Username Field (Signup only) */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                Username
              </label>
              <Input
                type="text"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                placeholder="elite_hacker"
                className="bg-gray-900/50 border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                disabled={loading}
              />
              {formErrors.username && (
                <p className="text-red-400 text-sm">{formErrors.username}</p>
              )}
            </div>
          )}

          {/* Full Name Field (Signup only) */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name (Optional)
              </label>
              <Input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Your full name"
                className="bg-gray-900/50 border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                disabled={loading}
              />
            </div>
          )}

          {/* Password Field */}
          {mode !== 'reset' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="••••••••••••"
                  className="bg-gray-900/50 border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-cyan-500/20 pr-12"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {formErrors.password && (
                <p className="text-red-400 text-sm">{formErrors.password}</p>
              )}
            </div>
          )}

          {/* Confirm Password Field (Signup only) */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Confirm Password
              </label>
              <Input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                placeholder="••••••••••••"
                className="bg-gray-900/50 border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                disabled={loading}
              />
              {formErrors.confirmPassword && (
                <p className="text-red-400 text-sm">{formErrors.confirmPassword}</p>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Google Sign-in Button */}
          <Button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            <img src="/google-icon.svg" alt="Google" className="w-5 h-5" />
            Sign {mode === 'signup' ? 'up' : 'in'} with Google
          </Button>

          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-black/95 px-2 text-gray-500">Or</span>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-3 rounded-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'signin' && 'Accessing...'}
                {mode === 'signup' && 'Creating Account...'}
                {mode === 'reset' && 'Sending Reset...'}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                {mode === 'signin' && 'ACCESS NETWORK'}
                {mode === 'signup' && 'JOIN NETWORK'}
                {mode === 'reset' && 'RESET PASSWORD'}
              </div>
            )}
          </Button>

          {/* Mode Switching */}
          <div className="pt-4 border-t border-gray-700">
            {mode === 'signin' && (
              <div className="space-y-2 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                  disabled={loading}
                >
                  Need access? Request network credentials
                </button>
                <br />
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
                  disabled={loading}
                >
                  Forgot your access code?
                </button>
              </div>
            )}

            {mode === 'signup' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                  disabled={loading}
                >
                  Already have access? Sign in
                </button>
              </div>
            )}

            {mode === 'reset' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                  disabled={loading}
                >
                  Back to sign in
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;

