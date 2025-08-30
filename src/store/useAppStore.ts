import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  accessLevel: 'basic' | 'premium' | 'elite';
  isAuthenticated: boolean;
}

interface AppState {
  // User state
  user: User | null;
  
  // UI state
  theme: 'dark' | 'light' | 'cyber';
  isLoading: boolean;
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
  }>;
  
  // Performance metrics
  performanceMetrics: {
    loadTime: number;
    apiResponseTime: number;
    errorCount: number;
  };
  
  // Real-time features
  isConnected: boolean;
  connectionStatus: 'online' | 'offline' | 'connecting';
  
  // Actions
  setUser: (user: User | null) => void;
  setTheme: (theme: 'dark' | 'light' | 'cyber') => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<AppState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  updatePerformanceMetrics: (metrics: Partial<AppState['performanceMetrics']>) => void;
  setConnectionStatus: (status: AppState['connectionStatus']) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      theme: 'cyber',
      isLoading: false,
      notifications: [],
      performanceMetrics: {
        loadTime: 0,
        apiResponseTime: 0,
        errorCount: 0,
      },
      isConnected: true,
      connectionStatus: 'online',
      
      // Actions
      setUser: (user) => set({ user }),
      
      setTheme: (theme) => set({ theme }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      addNotification: (notification) => {
        const id = Math.random().toString(36).substr(2, 9);
        const timestamp = Date.now();
        set((state) => ({
          notifications: [
            ...state.notifications,
            { ...notification, id, timestamp }
          ]
        }));
        
        // Auto-remove notification after 5 seconds
        setTimeout(() => {
          get().removeNotification(id);
        }, 5000);
      },
      
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),
      
      clearNotifications: () => set({ notifications: [] }),
      
      updatePerformanceMetrics: (metrics) => set((state) => ({
        performanceMetrics: { ...state.performanceMetrics, ...metrics }
      })),
      
      setConnectionStatus: (connectionStatus) => {
        const isConnected = connectionStatus === 'online';
        set({ connectionStatus, isConnected });
      },
      
      login: async (email: string, password: string) => {
        set({ isLoading: true });
        
        try {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Mock authentication logic
          if (email && password) {
            const user: User = {
              id: Math.random().toString(36).substr(2, 9),
              name: email.split('@')[0],
              email,
              accessLevel: email.includes('admin') ? 'elite' : 'premium',
              isAuthenticated: true,
            };
            
            set({ user, isLoading: false });
            get().addNotification({
              type: 'success',
              message: 'Successfully logged in!'
            });
            return true;
          }
          
          throw new Error('Invalid credentials');
        } catch (error) {
          set({ isLoading: false });
          get().addNotification({
            type: 'error',
            message: 'Login failed. Please check your credentials.'
          });
          return false;
        }
      },
      
      logout: () => {
        set({ user: null });
        get().addNotification({
          type: 'info',
          message: 'Successfully logged out'
        });
      },
    }),
    {
      name: 'eternyx-app-store',
      partialize: (state) => ({
        user: state.user,
        theme: state.theme,
      }),
    }
  )
);

