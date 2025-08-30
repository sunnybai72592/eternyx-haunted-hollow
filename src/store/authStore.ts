import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@supabase/supabase-js';
import { authService, UserProfile } from '@/lib/auth';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: Error }>;
  signUp: (email: string, password: string, username: string) => Promise<{ success: boolean; error?: Error }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: Error }>;
  uploadAvatar: (file: File) => Promise<{ success: boolean; error?: Error; url?: string }>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) => {
        set({ 
          user, 
          isAuthenticated: !!user,
          profile: user ? get().profile : null
        });
      },

      setProfile: (profile) => {
        set({ profile });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      signIn: async (email, password) => {
        set({ isLoading: true });
        const result = await authService.signIn(email, password);
        set({ isLoading: false });
        return result;
      },

      signUp: async (email, password, username) => {
        set({ isLoading: true });
        const result = await authService.signUp(email, password, username);
        set({ isLoading: false });
        return result;
      },

      signOut: async () => {
        set({ isLoading: true });
        await authService.signOut();
        set({ 
          user: null, 
          profile: null, 
          isAuthenticated: false, 
          isLoading: false 
        });
      },

      updateProfile: async (updates) => {
        const result = await authService.updateProfile(updates);
        if (result.success && get().profile) {
          set({ profile: { ...get().profile!, ...updates } });
        }
        return result;
      },

      uploadAvatar: async (file) => {
        return await authService.uploadAvatar(file);
      },

      initialize: () => {
        set({ isLoading: true });
        
        // Set initial state from auth service
        const user = authService.user;
        const profile = authService.profile;
        
        set({
          user,
          profile,
          isAuthenticated: !!user,
          isLoading: false
        });

        // Listen for auth changes
        authService.onAuthChange((user) => {
          set({
            user,
            profile: authService.profile,
            isAuthenticated: !!user
          });
        });
      }
    }),
    {
      name: 'eternyx-auth',
      partialize: (state) => ({
        // Only persist non-sensitive data
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

