import { create } from 'zustand';
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
  setSession: (session: Session | null) => void;
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
  // Don't let a slow or unreachable database freeze sign-in forever.
  const timeout = new Promise<{ data: null; error: Error }>((resolve) =>
    setTimeout(() => resolve({ data: null, error: new Error('Profile request timed out') }), 8000));
  const { data, error } = await Promise.race([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    timeout,
  ]) as { data: any; error: any };
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

let authInitialized = false;
let authEventVersion = 0;
let profileLoadVersion = 0;
let profileLoadInFlightUserId: string | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setSession: (session) => set({ session, user: session?.user ?? null, isAuthenticated: !!session?.user }),
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
        // React may invoke startup effects more than once in development.
        // Keep one subscription for this shared Supabase browser client.
        if (authInitialized) return;
        authInitialized = true;
        set({ isLoading: true });

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
          authEventVersion += 1;
          const currentUser = session?.user ?? null;
          const previousUserId = get().user?.id ?? null;
          const existingProfile = get().profile;

          // Token rotation changes credentials, not identity. Preserve the profile
          // and avoid issuing another profile query for every TOKEN_REFRESHED event.
          set({
            session: session ?? null,
            user: currentUser,
            isAuthenticated: !!currentUser,
            profile: currentUser?.id === previousUserId ? existingProfile : null,
            isLoading: currentUser
              ? (currentUser.id !== previousUserId || (!existingProfile && profileLoadInFlightUserId !== currentUser.id))
              : false,
          });

          if (!currentUser) {
            profileLoadVersion += 1;
            profileLoadInFlightUserId = null;
            set({ profile: null, isLoading: false });
            return;
          }

          const identityChanged = currentUser.id !== previousUserId;
          const profileNeedsLoading = !existingProfile && profileLoadInFlightUserId !== currentUser.id;
          const profileNeedsRefresh = event === 'USER_UPDATED';
          if (!identityChanged && !profileNeedsLoading && !profileNeedsRefresh) return;

          const loadVersion = ++profileLoadVersion;
          profileLoadInFlightUserId = currentUser.id;

          // Defer database work until the auth callback has returned.
          setTimeout(async () => {
            try {
              let profile = await fetchUserProfile(currentUser.id);
              if (!profile) profile = await createDefaultProfile(currentUser);
              if (loadVersion !== profileLoadVersion || get().user?.id !== currentUser.id) return;
              set({ profile, isLoading: false });
            } finally {
              if (profileLoadInFlightUserId === currentUser.id) {
                profileLoadInFlightUserId = null;
              }
            }
          }, 0);
        });

        void listener.subscription;

        // Browsers pause background tabs. Reconcile the shared store when this
        // document becomes visible again, without treating a transient empty
        // read or storage error as an explicit sign-out.
        const reconcileVisibleSession = async () => {
          if (document.visibilityState !== 'visible') return;
          const versionAtRequest = authEventVersion;
          try {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
              console.error('Unable to reconcile the session after tab focus:', error);
              return;
            }
            if (!data.session || versionAtRequest !== authEventVersion) return;

            const current = get();
            if (
              current.user?.id !== data.session.user.id ||
              current.session?.access_token !== data.session.access_token
            ) {
              set({
                session: data.session,
                user: data.session.user,
                isAuthenticated: true,
              });
            }
          } catch (error) {
            console.error('Session reconciliation after tab focus failed:', error);
          }
        };
        document.addEventListener('visibilitychange', reconcileVisibleSession);

        const versionAtRequest = authEventVersion;
        supabase.auth.getSession().then(async ({ data: { session }, error }) => {
          if (error) console.error('Unable to restore Supabase session:', error);
          // Never let a slower initial read overwrite a newer auth event.
          if (versionAtRequest !== authEventVersion) return;

          const user = session?.user ?? null;
          const loadVersion = ++profileLoadVersion;
          set({ session: session ?? null, user, profile: null, isAuthenticated: !!user, isLoading: !!user });

          if (!user) {
            set({ isLoading: false });
            return;
          }

          let profile = await fetchUserProfile(user.id);
          if (!profile) profile = await createDefaultProfile(user);
          if (loadVersion !== profileLoadVersion || get().user?.id !== user.id) return;
          set({ profile, isLoading: false });
        }).catch((error) => {
          console.error('Unable to initialize authentication:', error);
          if (versionAtRequest !== authEventVersion) return;
          set({ session: null, user: null, profile: null, isAuthenticated: false, isLoading: false });
        });
      },
}));
