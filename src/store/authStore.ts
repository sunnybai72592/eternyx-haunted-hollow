import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Auth profile shape based on public.profiles table
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
  // Additional computed fields
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
  // State
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  initialize: () => void;
}

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error('fetchUserProfile error', error);
    return null;
  }
  
  if (data) {
    // Add computed fields - cast to any first to allow adding computed properties
    return {
      ...(data as any),
      email: (data as any).email || '',
      access_level: (data as any).access_level || 'basic',
      preferences: (data as any).preferences || {
        theme: 'cyberpunk',
        notifications: true,
        sound_effects: true,
        analytics: true
      },
      stats: (data as any).stats || {
        login_count: 0,
        projects_created: 0,
        last_activity: null
      }
    } as UserProfile;
  }
  
  return null;
}

async function createDefaultProfile(user: User, username?: string): Promise<UserProfile | null> {
  const profile = {
    user_id: user.id,
    full_name: username || user.user_metadata?.username || (user.email ? user.email.split('@')[0] : 'agent'),
    username: username || user.user_metadata?.username || (user.email ? user.email.split('@')[0] : 'agent'),
    role: 'user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("profiles").insert([profile]);
  if (error) {
   console.error('createDefaultProfile error', error);
    return null;
  }
  
  return {
    id: user.id,
    ...profile,
    email: user.email || '',
    access_level: 'basic',
    preferences: {
      theme: 'cyberpunk',
      notifications: true,
      analytics: true,
      sound_effects: true,
    },
    stats: {
      login_count: 1,
      projects_created: 0,
      last_activity: new Date().toISOString(),
    },
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

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },

      setProfile: (profile) => set({ profile }),
      setLoading: (isLoading) => set({ isLoading }),

      signIn: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;

          const user = data.user!;
          // Load or create profile
          let profile = await fetchUserProfile(user.id);
          if (!profile) profile = await createDefaultProfile(user);

          // Ensure admin role for configured admin emails
          if (user.email && ['naimatullahullahofficial01@gmail.com','naimatullahofficial01@gmail.com'].includes(user.email)) {
            try {
              await supabase
                .from("profiles")
                .update({
                  role: 'admin',
                  username: profile?.username || 'admin',
                  full_name: profile?.full_name || 'Admin',
                  updated_at: new Date().toISOString()
                })
                .eq("user_id", user.id);
              // Refresh profile after update
              const refreshed = await fetchUserProfile(user.id);
              if (refreshed) profile = refreshed;
            } catch (e) {
              console.error('Admin role assignment failed', e);
            }
          }

          set({
            user,
            session: data.session,
            profile,
            isAuthenticated: !!user,
            isLoading: false,
          });
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Login failed' };
        }
      },

      signUp: async (email, password, username) => {
        set({ isLoading: true });
        try {
          const redirectUrl = `${window.location.origin}/`;
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: redirectUrl,
              data: { username },
            },
          });
          if (error) throw error;

          const user = data.user;
          if (user) {
            let profile = await fetchUserProfile(user.id);
            if (!profile) profile = await createDefaultProfile(user, username);
            set({ user, session: data.session, profile, isAuthenticated: true, isLoading: false });
          } else {
            // Email confirmation flow – no session yet
            set({ isLoading: false });
          }
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Registration failed' };
        }
      },

      signInWithGoogle: async () => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/dashboard`,
            },
          });

          if (error) throw error;
          
          // OAuth flow will redirect, so we'll handle success in initialize()
          return { success: true };
        } catch (err: any) {
          set({ isLoading: false });
          return { success: false, error: err?.message || 'Google sign-in failed' };
        }
      },

      signOut: async () => {
        set({ isLoading: true });
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.error('Logout error:', e);
        }
        set({ user: null, session: null, profile: null, isAuthenticated: false, isLoading: false });
      },

      updateProfile: async (updates) => {
        try {
          const currentUser = get().user;
          if (!currentUser) return { success: false, error: 'Not authenticated' };

          const { data, error } = await supabase
            .from("profiles")
            .update(updates)
            .eq("user_id", currentUser.id)
            .select()
            .maybeSingle();

          if (error) throw error;
          set({ profile: (data as UserProfile) || get().profile });
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Update failed' };
        }
      },

      initialize: () => {
        // Set up listener FIRST
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
          // Only synchronous updates in callback
          set({ session, user: session?.user ?? null, isAuthenticated: !!session?.user });

          // Defer profile fetching to avoid deadlocks
          if (session?.user) {
            setTimeout(async () => {
              const profile = await fetchUserProfile(session.user!.id);
              set({ profile, isLoading: false });
            }, 0);
          } else {
            set({ profile: null, isLoading: false });
          }
        });

        // THEN get existing session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          const user = session?.user ?? null;
          let profile: UserProfile | null = null;
          if (user) profile = await fetchUserProfile(user.id);
          set({ session: session ?? null, user, profile, isAuthenticated: !!user, isLoading: false });
        });

        // Optional: return unsubscribe when used inside components
        // but here we don't expose it from the store
      },
    }),
    {
      name: 'eternyx-auth',
      partialize: (state) => ({
        // Only persist non-sensitive flag
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
