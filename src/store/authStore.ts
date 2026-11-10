import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface UserProfile {
  id: string;
  user_id: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  company?: string | null;
  job_title?: string | null;
  phone?: string | null;
  github_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  skills?: string[] | null;
  role?: string | null;
  is_profile_public?: boolean;
  show_email?: boolean;
  show_phone?: boolean;
  created_at?: string;
  updated_at?: string;
  email?: string;
  access_level?: 'basic' | 'premium' | 'elite';
  last_login?: string | null;
  preferences?: {
    theme?: 'dark' | 'cyberpunk' | 'matrix';
    notifications?: boolean;
    analytics?: boolean;
    sound_effects?: boolean;
  } | null;
  stats?: {
    login_count?: number;
    projects_created?: number;
    last_activity?: string | null;
  } | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ success: boolean; needsEmailConfirmation?: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  initialize: () => void;
}

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('fetchUserProfile error', error);
    return null;
  }
  if (!data) return null;
  return {
    ...(data as any),
    email: (data as any).email || '',
    access_level: (data as any).access_level || 'basic',
    preferences: (data as any).preferences || {
      theme: 'cyberpunk', notifications: true, sound_effects: true, analytics: true,
    },
    stats: (data as any).stats || { login_count: 0, projects_created: 0, last_activity: null },
  } as UserProfile;
}

async function createDefaultProfile(user: User, username?: string): Promise<UserProfile | null> {
  const name = username || user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0] || 'agent';
  const profile = {
    user_id: user.id,
    full_name: name,
    username: name,
    role: 'user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('profiles').insert([profile]);
  if (error) {
    // Profile creation is secondary to authentication; never turn a valid login into a failed login.
    console.error('createDefaultProfile error', error);
    return null;
  }
  return {
    id: user.id, ...profile, email: user.email || '', access_level: 'basic',
    preferences: { theme: 'cyberpunk', notifications: true, analytics: true, sound_effects: true },
    stats: { login_count: 1, projects_created: 0, last_activity: new Date().toISOString() },
    last_login: new Date().toISOString(),
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setProfile: (profile) => set({ profile }),
      setLoading: (isLoading) => set({ isLoading }),

      signIn: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(), password,
          });
          if (error) throw error;
          const user = data.user;
          let profile = await fetchUserProfile(user.id);
          if (!profile) profile = await createDefaultProfile(user);
          set({ user, session: data.session, profile, isAuthenticated: true, isLoading: false });
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Unable to sign in. Please try again.' };
        }
      },

      signUp: async (email, password, username) => {
        set({ isLoading: true });
        try {
          const cleanEmail = email.trim().toLowerCase();
          const cleanUsername = username?.trim();
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: { username: cleanUsername || cleanEmail.split('@')[0], full_name: cleanUsername || '' },
            },
          });
          if (error) throw error;

          // With email confirmation enabled, Supabase returns a user but no session.
          // Wait for the confirmation/sign-in event before attempting an RLS-protected profile insert.
          if (data.session && data.user) {
            let profile = await fetchUserProfile(data.user.id);
            if (!profile) profile = await createDefaultProfile(data.user, cleanUsername);
            set({ user: data.user, session: data.session, profile, isAuthenticated: true, isLoading: false });
            return { success: true, needsEmailConfirmation: false };
          }
          set({ user: null, session: null, profile: null, isAuthenticated: false, isLoading: false });
          return { success: true, needsEmailConfirmation: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Unable to create your account. Please try again.' };
        }
      },

      signInWithGoogle: async () => {
        set({ isLoading: true });
        try {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
          });
          if (error) throw error;
          // The browser is expected to leave for Google's consent screen.
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Google sign-in could not be started.' };
        }
      },

      resetPassword: async (email) => {
        set({ isLoading: true });
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          if (error) throw error;
          set({ isLoading: false });
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Unable to send the password reset email.' };
        }
      },

      updatePassword: async (password) => {
        set({ isLoading: true });
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          set({ isLoading: false });
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Unable to update your password.' };
        }
      },

      signOut: async () => {
        set({ isLoading: true });
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        } catch (error) {
          console.error('Logout error:', error);
        }
        set({ user: null, session: null, profile: null, isAuthenticated: false, isLoading: false });
      },

      updateProfile: async (updates) => {
        try {
          const currentUser = get().user;
          if (!currentUser) return { success: false, error: 'Not authenticated' };
          const { data, error } = await supabase.from('profiles').update(updates as any)
            .eq('user_id', currentUser.id).select().maybeSingle();
          if (error) throw error;
          set({ profile: (data as UserProfile) || get().profile });
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Profile update failed.' };
        }
      },

      initialize: () => {
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, user: session?.user ?? null, isAuthenticated: !!session?.user });
          if (session?.user) {
            setTimeout(async () => {
              let profile = await fetchUserProfile(session.user.id);
              if (!profile) profile = await createDefaultProfile(session.user);
              set({ profile, isLoading: false });
            }, 0);
          } else {
            set({ profile: null, isLoading: false });
          }
        });

        supabase.auth.getSession().then(async ({ data: { session }, error }) => {
          if (error) console.error('Unable to restore Supabase session:', error);
          const user = session?.user ?? null;
          let profile: UserProfile | null = null;
          if (user) {
            profile = await fetchUserProfile(user.id);
            if (!profile) profile = await createDefaultProfile(user);
          }
          set({ session: session ?? null, user, profile, isAuthenticated: !!user, isLoading: false });
        }).catch((error) => {
          console.error('Unable to initialize authentication:', error);
          set({ session: null, user: null, profile: null, isAuthenticated: false, isLoading: false });
        });

        // Supabase owns the auth subscription for the lifetime of the application.
        void listener;
      },
    }),
    {
      name: 'eternyx-auth',
      partialize: (state) => ({ isAuthenticated: state.isAuthenticated }),
    },
  ),
);
