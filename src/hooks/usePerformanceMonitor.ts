import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';

interface PerformanceEntry {
  name: string;
  duration: number;
  startTime: number;
  entryType: string;
}

export const usePerformanceMonitor = () => {
  const { updatePerformanceMetrics, addNotification } = useAppStore();

  const measurePageLoad = useCallback(() => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0] as any;
      if (navigation) {
        const loadTime = navigation.loadEventEnd - navigation.fetchStart;
        updatePerformanceMetrics({ loadTime });
        
        // Alert if load time is too slow
        if (loadTime > 3000) {
          addNotification({
            type: 'warning',
            message: `Slow page load detected: ${Math.round(loadTime)}ms`
          });
        }
      }
    }
  }, [updatePerformanceMetrics, addNotification]);

  const measureApiCall = useCallback((name: string, startTime: number) => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    updatePerformanceMetrics({ apiResponseTime: duration });
    
    // Log slow API calls
    if (duration > 2000) {
      addNotification({
        type: 'warning',
        message: `Slow API response: ${name} took ${Math.round(duration)}ms`
      });
    }
    
    return duration;
  }, [updatePerformanceMetrics, addNotification]);

  const trackError = useCallback((error: Error, context?: string) => {
    updatePerformanceMetrics({ 
      errorCount: 1 
    });
    
    addNotification({
      type: 'error',
      message: `Error ${context ? `in ${context}` : ''}: ${error.message}`
    });
    
    // In production, send to error tracking service
    console.error('Performance Monitor - Error tracked:', error, context);
  }, [updatePerformanceMetrics, addNotification]);

  const observeResourceTiming = useCallback(() => {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: PerformanceEntry) => {
          // Track slow resources
          if (entry.duration > 1000) {
            addNotification({
              type: 'warning',
              message: `Slow resource load: ${entry.name.split('/').pop()} took ${Math.round(entry.duration)}ms`
            });
          }
        });
      });
      
      observer.observe({ entryTypes: ['resource'] });
      
      return () => observer.disconnect();
    }
  }, [addNotification]);

  const getWebVitals = useCallback(() => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      // Largest Contentful Paint
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        
        if (lastEntry.startTime > 2500) {
          addNotification({
            type: 'warning',
            message: `Poor LCP detected: ${Math.round(lastEntry.startTime)}ms`
          });
        }
      });
      
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      
      return () => observer.disconnect();
    }
  }, [addNotification]);

  useEffect(() => {
    // Measure initial page load
    measurePageLoad();
    
    // Set up resource timing observer
    const resourceCleanup = observeResourceTiming();
    
    // Set up web vitals monitoring
    const vitalsCleanup = getWebVitals();
    
    return () => {
      resourceCleanup?.();
      vitalsCleanup?.();
    };
  }, [measurePageLoad, observeResourceTiming, getWebVitals]);

  return {
    measureApiCall,
    trackError,
    measurePageLoad
  };
};

