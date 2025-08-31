import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Auth profile shape based on public.user_profiles
export interface UserProfile {
  id: string; // equals auth.user.id
  email: string;
  username: string;
  avatar_url?: string | null;
  access_level?: 'basic' | 'premium' | 'elite';
  created_at?: string;
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
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  initialize: () => void;
}

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchUserProfile error', error);
    return null;
  }
  return data as UserProfile | null;
}

async function createDefaultProfile(user: User, username?: string): Promise<UserProfile | null> {
  const profile: UserProfile = {
    id: user.id,
    email: user.email || '',
    username: username || user.user_metadata?.username || (user.email ? user.email.split('@')[0] : 'agent'),
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

  const { error } = await supabase.from('user_profiles').insert([profile]);
  if (error) {
    console.error('createDefaultProfile error', error);
    return null;
  }
  return profile;
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
            .from('user_profiles')
            .update(updates)
            .eq('id', currentUser.id)
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
