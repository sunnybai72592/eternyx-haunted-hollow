import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  email: string;
  access_level: string;
  security_score: number;
  performance_rating: number;
  projects_created: number;
  login_count: number;
  last_activity: string;
  created_at: string;
  is_active: boolean;
  profile_data: any;
}

interface AuthState {
  user: User | null;
  profile: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: User | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  initialize: () => void;
}

const API_BASE = 'http://localhost:5000/api';

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
          profile: user,
          isAuthenticated: !!user
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
        try {
          const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ email, password }),
          });

          const data = await response.json();

          if (response.ok) {
            set({ 
              user: data.user, 
              profile: data.user,
              isAuthenticated: true, 
              isLoading: false 
            });
            return { success: true };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error || 'Login failed' };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: 'Network error' };
        }
      },

      signUp: async (email, password, username) => {
        set({ isLoading: true });
        try {
          const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ email, password, username }),
          });

          const data = await response.json();

          if (response.ok) {
            set({ 
              user: data.user, 
              profile: data.user,
              isAuthenticated: true, 
              isLoading: false 
            });
            return { success: true };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error || 'Registration failed' };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: 'Network error' };
        }
      },

      signOut: async () => {
        set({ isLoading: true });
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch (error) {
          console.error('Logout error:', error);
        }
        
        set({ 
          user: null, 
          profile: null, 
          isAuthenticated: false, 
          isLoading: false 
        });
      },

      updateProfile: async (updates) => {
        try {
          const currentUser = get().user;
          if (!currentUser) {
            return { success: false, error: 'Not authenticated' };
          }

          const response = await fetch(`${API_BASE}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(updates),
          });

          const data = await response.json();

          if (response.ok) {
            set({ 
              user: data, 
              profile: data 
            });
            return { success: true };
          } else {
            return { success: false, error: data.error || 'Update failed' };
          }
        } catch (error) {
          return { success: false, error: 'Network error' };
        }
      },

      initialize: () => {
        set({ isLoading: true });
        
        // Check if user is authenticated by trying to get profile
        fetch(`${API_BASE}/auth/profile`, {
          credentials: 'include',
        })
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            set({ 
              user: null, 
              profile: null, 
              isAuthenticated: false, 
              isLoading: false 
            });
          } else {
            set({ 
              user: data, 
              profile: data, 
              isAuthenticated: true, 
              isLoading: false 
            });
          }
        })
        .catch(() => {
          set({ 
            user: null, 
            profile: null, 
            isAuthenticated: false, 
            isLoading: false 
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

