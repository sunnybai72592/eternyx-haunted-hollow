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

      // Create security session
      await this.createSecuritySession();

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

      // In real implementation, this would integrate with actual MFA providers
      const mfaSecret = this.generateMFASecret();
      
      const { data, error } = await supabase
        .from('user_mfa_methods')
        .insert([{
          user_id: this.user.id,
          method_type: method,
          secret: mfaSecret,
          enabled: true
        }])
        .select()
        .single();

      if (error) throw error;

      // Update auth methods
      this.authMethods.push({
        id: data.id,
        type: method,
        name: this.getMFAMethodName(method),
        enabled: true,
        trustScore: 0.9
      });

      return { success: true, secret: mfaSecret, error: null };
    } catch (error) {
      console.error('MFA setup error:', error);
      return { success: false, error };
    }
  }

  // Verify MFA token
  async verifyMFA(token: string, methodId: string) {
    try {
      // In real implementation, verify against actual MFA provider
      const isValid = this.validateMFAToken(token, methodId);
      
      if (isValid) {
        // Update last used timestamp
        await supabase
          .from('user_mfa_methods')
          .update({ last_used: new Date().toISOString() })
          .eq('id', methodId);

        return { valid: true, error: null };
      } else {
        return { valid: false, error: 'Invalid MFA token' };
      }
    } catch (error) {
      console.error('MFA verification error:', error);
      return { valid: false, error };
    }
  }

  // Blockchain identity verification
  async verifyBlockchainIdentity(walletAddress: string, signature: string) {
    try {
      if (!this.user) throw new Error('User not authenticated');

      // In real implementation, verify blockchain signature
      const isValidSignature = this.verifyBlockchainSignature(walletAddress, signature);
      
      if (isValidSignature) {
        // Update user profile
        const { error } = await supabase
          .from('user_profiles')
          .update({ 
            blockchain_verified: true,
            wallet_address: walletAddress,
            verification_timestamp: new Date().toISOString()
          })
          .eq('id', this.user.id);

        if (error) throw error;

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

  // Security session management
  async createSecuritySession() {
    try {
      if (!this.user) throw new Error('User not authenticated');

      const sessionData = {
        user_id: this.user.id,
        ip_address: await this.getCurrentIP(),
        user_agent: navigator.userAgent,
        location: await this.getLocationFromIP(),
        risk_score: await this.calculateSessionRisk()
      };

      const { data, error } = await supabase
        .from('security_sessions')
        .insert([sessionData])
        .select()
        .single();

      if (error) throw error;

      const session: SecuritySession = {
        id: data.id,
        userId: data.user_id,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
        location: data.location,
        isActive: true,
        createdAt: new Date(data.created_at),
        lastActivity: new Date(),
        riskScore: data.risk_score
      };

      this.activeSessions.push(session);
      return { session, error: null };
    } catch (error) {
      console.error('Error creating security session:', error);
      return { session: null, error };
    }
  }

  // Get active sessions
  async getActiveSessions() {
    try {
      if (!this.user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('security_sessions')
        .select('*')
        .eq('user_id', this.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.activeSessions = data.map(session => ({
        id: session.id,
        userId: session.user_id,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        location: session.location,
        isActive: session.is_active,
        createdAt: new Date(session.created_at),
        lastActivity: new Date(session.last_activity),
        riskScore: session.risk_score
      }));

      return { sessions: this.activeSessions, error: null };
    } catch (error) {
      console.error('Error fetching active sessions:', error);
      return { sessions: [], error };
    }
  }

  // Terminate session
  async terminateSession(sessionId: string) {
    try {
      const { error } = await supabase
        .from('security_sessions')
        .update({ is_active: false, terminated_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      this.activeSessions = this.activeSessions.filter(s => s.id !== sessionId);
      return { success: true, error: null };
    } catch (error) {
      console.error('Error terminating session:', error);
      return { success: false, error };
    }
  }

  // Security checks
  private async performSecurityChecks() {
    if (!this.user) return;

    // Check for suspicious activity
    const suspiciousActivity = await this.detectSuspiciousActivity();
    
    // Update security score
    const securityScore = await this.calculateSecurityScore();
    
    // Log security event
    await this.logSecurityEvent('authentication', 'user_login', {
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

  private async calculateSessionRisk(): Promise<number> {
    // Mock session risk calculation
    return Math.random() * 0.5; // 0-0.5 risk score
  }

  private async getCurrentIP(): Promise<string> {
    // In real implementation, get actual IP
    return '192.168.1.100';
  }

  private async getLocationFromIP(): Promise<string> {
    // In real implementation, use IP geolocation service
    return 'San Francisco, CA, US';
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

  private getMFAMethodName(method: string): string {
    switch (method) {
      case 'totp': return 'Authenticator App';
      case 'hardware_key': return 'Hardware Security Key';
      case 'biometric': return 'Biometric Authentication';
      default: return 'Unknown Method';
    }
  }

  private validateMFAToken(token: string, methodId: string): boolean {
    // In real implementation, validate against actual MFA provider
    return token.length === 6 && /^\d+$/.test(token);
  }

  private verifyBlockchainSignature(walletAddress: string, signature: string): boolean {
    // In real implementation, verify actual blockchain signature
    return signature.length > 100 && walletAddress.startsWith('0x');
  }

  private async logSecurityEvent(category: string, action: string, details: any) {
    try {
      await supabase
        .from('security_audit_logs')
        .insert([{
          user_id: this.user?.id,
          category,
          action,
          details,
          ip_address: await this.getCurrentIP(),
          user_agent: navigator.userAgent
        }]);
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  // Subscription tier management
  async updateSubscriptionTier(userId: string, tier: 'free' | 'premium' | 'elite') {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ subscription_tier: tier })
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

  // Security clearance management
  async updateSecurityClearance(userId: string, clearance: 'basic' | 'elevated' | 'classified') {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ security_clearance: clearance })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      if (this.user && this.user.id === userId) {
        this.user.security_clearance = clearance;
      }

      return { data, error: null };
    } catch (error) {
      console.error('Error updating security clearance:', error);
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
      // Terminate all active sessions
      for (const session of this.activeSessions) {
        await this.terminateSession(session.id);
      }

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

