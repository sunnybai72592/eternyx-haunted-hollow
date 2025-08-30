import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
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
  
  // Dashboard data
  dashboardStats: any;
  systemMetrics: any;
  projects: any[];
  securityLogs: any[];
  
  // Actions
  setTheme: (theme: 'dark' | 'light' | 'cyber') => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<AppState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  updatePerformanceMetrics: (metrics: Partial<AppState['performanceMetrics']>) => void;
  setConnectionStatus: (status: AppState['connectionStatus']) => void;
  
  // API actions
  fetchDashboardStats: () => Promise<void>;
  fetchSystemMetrics: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchSecurityLogs: () => Promise<void>;
  executeTerminalCommand: (command: string) => Promise<any>;
  runSecurityScan: () => Promise<any>;
}

const API_BASE = 'http://localhost:5000/api';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
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
      dashboardStats: null,
      systemMetrics: null,
      projects: [],
      securityLogs: [],
      
      // Actions
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
      
      // API actions
      fetchDashboardStats: async () => {
        try {
          const response = await fetch(`${API_BASE}/dashboard/stats`, {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            set({ dashboardStats: data });
          }
        } catch (error) {
          console.error('Failed to fetch dashboard stats:', error);
          get().addNotification({
            type: 'error',
            message: 'Failed to load dashboard data'
          });
        }
      },
      
      fetchSystemMetrics: async () => {
        try {
          const response = await fetch(`${API_BASE}/dashboard/metrics`, {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            set({ systemMetrics: data });
          }
        } catch (error) {
          console.error('Failed to fetch system metrics:', error);
        }
      },
      
      fetchProjects: async () => {
        try {
          const response = await fetch(`${API_BASE}/projects`, {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            set({ projects: data });
          }
        } catch (error) {
          console.error('Failed to fetch projects:', error);
        }
      },
      
      fetchSecurityLogs: async () => {
        try {
          const response = await fetch(`${API_BASE}/security/logs`, {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            set({ securityLogs: data });
          }
        } catch (error) {
          console.error('Failed to fetch security logs:', error);
        }
      },
      
      executeTerminalCommand: async (command: string) => {
        try {
          const response = await fetch(`${API_BASE}/terminal/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ command }),
          });
          
          if (response.ok) {
            const data = await response.json();
            return data;
          } else {
            throw new Error('Command execution failed');
          }
        } catch (error) {
          console.error('Failed to execute command:', error);
          return {
            command,
            output: 'Error: Command execution failed',
            timestamp: new Date().toISOString()
          };
        }
      },
      
      runSecurityScan: async () => {
        try {
          const response = await fetch(`${API_BASE}/security/scan`, {
            method: 'POST',
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            get().addNotification({
              type: 'success',
              message: `Security scan completed - ${data.threats_found} threats found`
            });
            return data;
          } else {
            throw new Error('Security scan failed');
          }
        } catch (error) {
          console.error('Failed to run security scan:', error);
          get().addNotification({
            type: 'error',
            message: 'Security scan failed'
          });
          return null;
        }
      },
    }),
    {
      name: 'eternyx-app-store',
      partialize: (state) => ({
        theme: state.theme,
      }),
    }
  )
);

