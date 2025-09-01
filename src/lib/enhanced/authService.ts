import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export interface EnhancedUser extends User {
  subscription_tier?: 'free' | 'premium' | 'elite';
  security_clearance?: 'basic' | 'elevated' | 'classified';
  blockchain_verified?: boolean;
  reputation_score?: number;
  mfa_enabled?: boolean;
  last_security_check?: string;
}

export interface AuthenticationMethod {
  id: string;
  type: 'password' | 'totp' | 'hardware_key' | 'biometric' | 'blockchain';
  name: string;
  enabled: boolean;
  lastUsed?: Date;
  trustScore: number;
}

export interface SecuritySession {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  riskScore: number;
}

export interface AccessControl {
  resource: string;
  requiredTier: 'free' | 'premium' | 'elite';
  requiredClearance?: 'basic' | 'elevated' | 'classified';
  requiresBlockchainVerification?: boolean;
  requiresMFA?: boolean;
}

class EnhancedAuthService {
  private user: EnhancedUser | null = null;
  private authMethods: AuthenticationMethod[] = [];
  private activeSessions: SecuritySession[] = [];

  // Access control rules
  private accessRules: AccessControl[] = [
    {
      resource: 'vulnerability_scanner',
      requiredTier: 'free'
    },
    {
      resource: 'ai_assistant_basic',
      requiredTier: 'free'
    },
    {
      resource: 'threat_monitoring',
      requiredTier: 'premium'
    },
    {
      resource: 'vulnerability_lab',
      requiredTier: 'premium',
      requiresMFA: true
    },
    {
      resource: 'exploit_simulator',
      requiredTier: 'premium',
      requiredClearance: 'elevated'
    },
    {
      resource: 'quantum_encryption',
      requiredTier: 'elite',
      requiresBlockchainVerification: true
    },
    {
      resource: 'classified_intelligence',
      requiredTier: 'elite',
      requiredClearance: 'classified',
      requiresBlockchainVerification: true,
      requiresMFA: true
    }
  ];

  // Enhanced authentication
  async signInWithEnhancedSecurity(email: string, password: string, mfaToken?: string) {
    try {
      // Standard Supabase authentication
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw authError;

      // Get enhanced user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        console.warn('Could not fetch user profile:', profileError);
      }

      // Combine user data
      this.user = {
        ...authData.user,
        ...profileData
      } as EnhancedUser;

      // Perform security checks
      await this.performSecurityChecks();

      return { user: this.user, error: null };
    } catch (error) {
      console.error('Enhanced sign-in error:', error);
      return { user: null, error };
    }
  }

  // Multi-factor authentication setup
  async setupMFA(method: 'totp' | 'hardware_key' | 'biometric') {
    try {
      if (!this.user) throw new Error('User not authenticated');

      // Mock MFA setup for now - would use actual MFA table in production
      const mfaSecret = this.generateMFASecret();
      
      // Update auth methods
      this.authMethods.push({
        id: `mfa_${Date.now()}`,
        type: method,
        name: this.getMFAMethodName(method),
        enabled: true,
        trustScore: 0.9
      });

      // Mock MFA setup success
      return {
        success: true,
        qrCode: this.generateQRCode('mock_id', mfaSecret),
        backupCodes: this.generateBackupCodes()
      };
    } catch (error) {
      console.error('MFA setup error:', error);
      return { success: false, error: 'Failed to set up MFA' };
    }
  }

  async verifyMFA(token: string, method: string = 'totp'): Promise<{ verified: boolean; error?: string }> {
    try {
      // Mock MFA verification for now
      const isValidToken = token.length === 6 && /^\d+$/.test(token);
      
      if (!isValidToken) {
        return { verified: false, error: 'Invalid MFA token format' };
      }

      // Mock verification - in real implementation, verify TOTP token
      const isValid = token === '123456' || this.verifyTOTP(token, 'mock_secret');
      return { verified: isValid };
    } catch (error) {
      console.error('MFA verification error:', error);
      return { verified: false, error: 'Failed to verify MFA' };
    }
  }

  async disableMFA(method: string = 'totp'): Promise<{ success: boolean; error?: string }> {
    try {
      // Mock MFA disable - would update actual MFA table in production
      return { success: true };
    } catch (error) {
      console.error('MFA disable error:', error);
      return { success: false, error: 'Failed to disable MFA' };
    }
  }

  // Blockchain identity verification
  async verifyBlockchainIdentity(walletAddress: string, signature: string) {
    try {
      if (!this.user) throw new Error('User not authenticated');

      // Mock blockchain signature verification
      const isValidSignature = this.verifyBlockchainSignature(walletAddress, signature);
      
      if (isValidSignature) {
        this.user.blockchain_verified = true;
        return { verified: true, error: null };
      } else {
        return { verified: false, error: 'Invalid blockchain signature' };
      }
    } catch (error) {
      console.error('Blockchain verification error:', error);
      return { verified: false, error };
    }
  }

  // Check access permissions
  async checkAccess(resource: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.user) {
      return { allowed: false, reason: 'User not authenticated' };
    }

    const rule = this.accessRules.find(r => r.resource === resource);
    if (!rule) {
      return { allowed: true }; // No specific rule, allow access
    }

    // Check subscription tier
    const userTier = this.user.subscription_tier || 'free';
    const tierHierarchy = { free: 0, premium: 1, elite: 2 };
    const requiredTierLevel = tierHierarchy[rule.requiredTier];
    const userTierLevel = tierHierarchy[userTier];

    if (userTierLevel < requiredTierLevel) {
      return { 
        allowed: false, 
        reason: `Requires ${rule.requiredTier} subscription or higher` 
      };
    }

    // Check security clearance
    if (rule.requiredClearance) {
      const userClearance = this.user.security_clearance || 'basic';
      const clearanceHierarchy = { basic: 0, elevated: 1, classified: 2 };
      const requiredClearanceLevel = clearanceHierarchy[rule.requiredClearance];
      const userClearanceLevel = clearanceHierarchy[userClearance];

      if (userClearanceLevel < requiredClearanceLevel) {
        return { 
          allowed: false, 
          reason: `Requires ${rule.requiredClearance} security clearance` 
        };
      }
    }

    // Check blockchain verification
    if (rule.requiresBlockchainVerification && !this.user.blockchain_verified) {
      return { 
        allowed: false, 
        reason: 'Requires blockchain identity verification' 
      };
    }

    // Check MFA requirement
    if (rule.requiresMFA && !this.user.mfa_enabled) {
      return { 
        allowed: false, 
        reason: 'Requires multi-factor authentication' 
      };
    }

    return { allowed: true };
  }

  // Security checks
  private async performSecurityChecks() {
    if (!this.user) return;

    // Check for suspicious activity
    const suspiciousActivity = await this.detectSuspiciousActivity();
    
    // Update security score
    const securityScore = await this.calculateSecurityScore();
    
    // Log security event
    console.log('Security check completed:', {
      userId: this.user.id,
      suspiciousActivity,
      securityScore
    });
  }

  private async detectSuspiciousActivity(): Promise<boolean> {
    // Mock suspicious activity detection
    return Math.random() < 0.1; // 10% chance of suspicious activity
  }

  private async calculateSecurityScore(): Promise<number> {
    // Mock security score calculation
    return Math.floor(Math.random() * 30) + 70; // 70-100
  }

  private generateMFASecret(): string {
    // Generate base32 secret for TOTP
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  private generateQRCode(id: string, secret: string): string {
    // Mock QR code generation - would use actual QR library in production
    return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
  }

  private generateBackupCodes(): string[] {
    // Generate backup codes
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substr(2, 8).toUpperCase());
    }
    return codes;
  }

  private getMFAMethodName(method: string): string {
    switch (method) {
      case 'totp': return 'Authenticator App';
      case 'hardware_key': return 'Hardware Security Key';
      case 'biometric': return 'Biometric Authentication';
      default: return 'Unknown Method';
    }
  }

  private verifyTOTP(token: string, secret: string): boolean {
    // Mock TOTP verification - would use actual TOTP library in production
    return token === '123456';
  }

  private verifyBlockchainSignature(walletAddress: string, signature: string): boolean {
    // In real implementation, verify actual blockchain signature
    return signature.length > 100 && walletAddress.startsWith('0x');
  }

  // Subscription tier management
  async updateSubscriptionTier(userId: string, tier: 'free' | 'premium' | 'elite') {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ 
          stats: { subscription_tier: tier }
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      if (this.user && this.user.id === userId) {
        this.user.subscription_tier = tier;
      }

      return { data, error: null };
    } catch (error) {
      console.error('Error updating subscription tier:', error);
      return { data: null, error };
    }
  }

  // Get user permissions
  getUserPermissions(): string[] {
    if (!this.user) return [];

    const permissions: string[] = [];
    
    for (const rule of this.accessRules) {
      const access = this.checkAccessSync(rule);
      if (access.allowed) {
        permissions.push(rule.resource);
      }
    }

    return permissions;
  }

  // Synchronous access check (for UI state)
  private checkAccessSync(rule: AccessControl): { allowed: boolean; reason?: string } {
    if (!this.user) {
      return { allowed: false, reason: 'User not authenticated' };
    }

    // Check subscription tier
    const userTier = this.user.subscription_tier || 'free';
    const tierHierarchy = { free: 0, premium: 1, elite: 2 };
    const requiredTierLevel = tierHierarchy[rule.requiredTier];
    const userTierLevel = tierHierarchy[userTier];

    if (userTierLevel < requiredTierLevel) {
      return { 
        allowed: false, 
        reason: `Requires ${rule.requiredTier} subscription` 
      };
    }

    // Check security clearance
    if (rule.requiredClearance) {
      const userClearance = this.user.security_clearance || 'basic';
      const clearanceHierarchy = { basic: 0, elevated: 1, classified: 2 };
      const requiredClearanceLevel = clearanceHierarchy[rule.requiredClearance];
      const userClearanceLevel = clearanceHierarchy[userClearance];

      if (userClearanceLevel < requiredClearanceLevel) {
        return { 
          allowed: false, 
          reason: `Requires ${rule.requiredClearance} clearance` 
        };
      }
    }

    // Check blockchain verification
    if (rule.requiresBlockchainVerification && !this.user.blockchain_verified) {
      return { 
        allowed: false, 
        reason: 'Requires blockchain verification' 
      };
    }

    // Check MFA requirement
    if (rule.requiresMFA && !this.user.mfa_enabled) {
      return { 
        allowed: false, 
        reason: 'Requires multi-factor authentication' 
      };
    }

    return { allowed: true };
  }

  // Get current user
  getCurrentUser(): EnhancedUser | null {
    return this.user;
  }

  // Sign out
  async signOut() {
    try {
      // Supabase sign out
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear local state
      this.user = null;
      this.authMethods = [];
      this.activeSessions = [];

      return { success: true, error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error };
    }
  }

  // Password strength validation
  validatePasswordStrength(password: string): { score: number; feedback: string[] } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 12) score += 20;
    else feedback.push('Use at least 12 characters');

    if (/[a-z]/.test(password)) score += 15;
    else feedback.push('Include lowercase letters');

    if (/[A-Z]/.test(password)) score += 15;
    else feedback.push('Include uppercase letters');

    if (/\d/.test(password)) score += 15;
    else feedback.push('Include numbers');

    if (/[^a-zA-Z\d]/.test(password)) score += 20;
    else feedback.push('Include special characters');

    if (!/(.)\1{2,}/.test(password)) score += 15;
    else feedback.push('Avoid repeated characters');

    return { score, feedback };
  }

  // Rate limiting
  private rateLimitAttempts = new Map<string, { count: number; resetTime: number }>();

  checkRateLimit(identifier: string, maxAttempts = 5, windowMs = 300000): boolean {
    const now = Date.now();
    const attempts = this.rateLimitAttempts.get(identifier);

    if (!attempts || now > attempts.resetTime) {
      this.rateLimitAttempts.set(identifier, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (attempts.count >= maxAttempts) {
      return false;
    }

    attempts.count++;
    return true;
  }
}

export const enhancedAuthService = new EnhancedAuthService();