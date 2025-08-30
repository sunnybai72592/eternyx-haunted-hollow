import { supabase, supabaseAPI } from './supabase';
import { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
  access_level: 'basic' | 'premium' | 'elite';
  created_at: string;
  last_login: string;
  preferences: {
    theme: 'dark' | 'cyberpunk' | 'matrix';
    notifications: boolean;
    analytics: boolean;
    sound_effects: boolean;
  };
  stats: {
    login_count: number;
    projects_created: number;
    last_activity: string;
  };
}

export class AuthService {
  private currentUser: User | null = null;
  private userProfile: UserProfile | null = null;
  private authListeners: ((user: User | null) => void)[] = [];

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth() {
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      this.currentUser = session.user;
      await this.loadUserProfile();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      this.currentUser = session?.user || null;
      
      if (this.currentUser) {
        await this.loadUserProfile();
        await this.updateLastLogin();
      } else {
        this.userProfile = null;
      }

      // Notify listeners
      this.authListeners.forEach(listener => listener(this.currentUser));
    });
  }

  // Authentication methods
  async signUp(email: string, password: string, username: string) {
    try {
      const { data, error } = await supabaseAPI.signUp(email, password, {
        username,
        access_level: 'basic',
        preferences: {
          theme: 'cyberpunk',
          notifications: true,
          analytics: true,
          sound_effects: true
        }
      });

      if (error) throw error;

      // Create user profile
      if (data.user) {
        await this.createUserProfile(data.user, username);
      }

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  async signIn(email: string, password: string) {
    try {
      const { data, error } = await supabaseAPI.signIn(email, password);
      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  async signOut() {
    try {
      await supabaseAPI.signOut();
      this.currentUser = null;
      this.userProfile = null;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  async resetPassword(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  // Profile management
  private async createUserProfile(user: User, username: string) {
    const profile: Partial<UserProfile> = {
      id: user.id,
      email: user.email!,
      username,
      access_level: 'basic',
      preferences: {
        theme: 'cyberpunk',
        notifications: true,
        analytics: true,
        sound_effects: true
      },
      stats: {
        login_count: 1,
        projects_created: 0,
        last_activity: new Date().toISOString()
      }
    };

    const { error } = await supabase
      .from('user_profiles')
      .insert([profile]);

    if (error) {
      console.error('Error creating user profile:', error);
    }
  }

  private async loadUserProfile() {
    if (!this.currentUser) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', this.currentUser.id)
        .single();

      if (error) throw error;
      this.userProfile = data;
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  private async updateLastLogin() {
    if (!this.currentUser) return;

    try {
      await supabase
        .from('user_profiles')
        .update({ 
          last_login: new Date().toISOString(),
          'stats.login_count': supabase.sql`stats->>'login_count'::int + 1`
        })
        .eq('id', this.currentUser.id);
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  async updateProfile(updates: Partial<UserProfile>) {
    if (!this.currentUser) return { success: false, error: new Error('Not authenticated') };

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', this.currentUser.id);

      if (error) throw error;

      // Update local profile
      if (this.userProfile) {
        this.userProfile = { ...this.userProfile, ...updates };
      }

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  async uploadAvatar(file: File) {
    if (!this.currentUser) return { success: false, error: new Error('Not authenticated') };

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${this.currentUser.id}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(filePath);

      await this.updateProfile({ avatar_url: data.publicUrl });

      return { success: true, error: null, url: data.publicUrl };
    } catch (error) {
      return { success: false, error: error as Error, url: null };
    }
  }

  // Getters
  get user() {
    return this.currentUser;
  }

  get profile() {
    return this.userProfile;
  }

  get isAuthenticated() {
    return !!this.currentUser;
  }

  // Event listeners
  onAuthChange(callback: (user: User | null) => void) {
    this.authListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.authListeners.indexOf(callback);
      if (index > -1) {
        this.authListeners.splice(index, 1);
      }
    };
  }

  // Utility methods
  hasAccess(requiredLevel: UserProfile['access_level']) {
    if (!this.userProfile) return false;
    
    const levels = { basic: 1, premium: 2, elite: 3 };
    const userLevel = levels[this.userProfile.access_level];
    const required = levels[requiredLevel];
    
    return userLevel >= required;
  }

  async upgradeAccess(newLevel: UserProfile['access_level']) {
    return await this.updateProfile({ access_level: newLevel });
  }
}

// Export singleton instance
export const authService = new AuthService();

