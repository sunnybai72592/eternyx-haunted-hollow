// Advanced Caching Service for ETERNYX
// Provides multi-layer caching with Redis-like functionality in the browser

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  tags: string[];
  compressed?: boolean;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  oldestEntry: number;
  newestEntry: number;
}

interface CacheConfig {
  maxSize: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
  compressionThreshold: number; // Compress data larger than this size
  enablePersistence: boolean; // Persist to localStorage
  enableMetrics: boolean; // Track cache metrics
}

export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0,
    deletes: 0
  };
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000, // 1 minute
      compressionThreshold: 10000, // 10KB
      enablePersistence: true,
      enableMetrics: true,
      ...config
    };

    this.startCleanupTimer();
    this.loadFromPersistence();
  }

  // Get value from cache
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    // Decompress if needed
    let data = entry.data;
    if (entry.compressed && typeof data === 'string') {
      data = this.decompress(data);
    }

    return data;
  }

  // Set value in cache
  set<T>(
    key: string, 
    value: T, 
    ttl: number = this.config.defaultTTL,
    tags: string[] = []
  ): void {
    // Check cache size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    // Compress large data
    let data: any = value;
    let compressed = false;
    const serialized = JSON.stringify(value);
    
    if (serialized.length > this.config.compressionThreshold) {
      data = this.compress(serialized);
      compressed = true;
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccessed: Date.now(),
      tags,
      compressed
    };

    this.cache.set(key, entry);
    this.stats.sets++;

    // Persist to localStorage if enabled
    if (this.config.enablePersistence) {
      this.persistEntry(key, entry);
    }
  }

  // Delete from cache
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      this.removePersistentEntry(key);
    }
    return deleted;
  }

  // Check if key exists
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry ? !this.isExpired(entry) : false;
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.clearPersistence();
  }

  // Get cache statistics
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((size, entry) => {
      return size + JSON.stringify(entry.data).length;
    }, 0);

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.stats.misses / totalRequests : 0;

    const timestamps = entries.map(e => e.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    return {
      totalEntries: this.cache.size,
      totalSize,
      hitRate,
      missRate,
      evictionCount: this.stats.evictions,
      oldestEntry,
      newestEntry
    };
  }

  // Get all keys
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // Get all values
  values<T>(): T[] {
    return Array.from(this.cache.values()).map(entry => {
      let data = entry.data;
      if (entry.compressed && typeof data === 'string') {
        data = this.decompress(data);
      }
      return data;
    });
  }

  // Get entries by tag
  getByTag<T>(tag: string): Array<{ key: string; value: T }> {
    const results: Array<{ key: string; value: T }> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag) && !this.isExpired(entry)) {
        let data = entry.data;
        if (entry.compressed && typeof data === 'string') {
          data = this.decompress(data);
        }
        results.push({ key, value: data });
      }
    }
    
    return results;
  }

  // Delete entries by tag
  deleteByTag(tag: string): number {
    let deletedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        this.removePersistentEntry(key);
        deletedCount++;
      }
    }
    
    this.stats.deletes += deletedCount;
    return deletedCount;
  }

  // Memoization wrapper
  memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string,
    ttl?: number
  ): T {
    return ((...args: Parameters<T>) => {
      const key = keyGenerator ? keyGenerator(...args) : `memoized_${fn.name}_${JSON.stringify(args)}`;
      
      let result = this.get<ReturnType<T>>(key);
      if (result === null) {
        result = fn(...args);
        this.set(key, result, ttl);
      }
      
      return result;
    }) as T;
  }

  // Batch operations
  mget<T>(keys: string[]): Array<T | null> {
    return keys.map(key => this.get<T>(key));
  }

  mset<T>(entries: Array<{ key: string; value: T; ttl?: number; tags?: string[] }>): void {
    entries.forEach(({ key, value, ttl, tags }) => {
      this.set(key, value, ttl, tags);
    });
  }

  // Cache warming
  async warmCache(warmupFunctions: Array<{ key: string; fn: () => Promise<any>; ttl?: number }>): Promise<void> {
    const promises = warmupFunctions.map(async ({ key, fn, ttl }) => {
      try {
        const result = await fn();
        this.set(key, result, ttl);
      } catch (error) {
        console.error(`Cache warming failed for key ${key}:`, error);
      }
    });

    await Promise.all(promises);
  }

  // Cache invalidation patterns
  invalidatePattern(pattern: RegExp): number {
    let invalidatedCount = 0;
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        this.removePersistentEntry(key);
        invalidatedCount++;
      }
    }
    
    this.stats.deletes += invalidatedCount;
    return invalidatedCount;
  }

  // TTL management
  expire(key: string, ttl: number): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      entry.ttl = ttl;
      entry.timestamp = Date.now();
      return true;
    }
    return false;
  }

  getTTL(key: string): number | null {
    const entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      return entry.ttl - (Date.now() - entry.timestamp);
    }
    return null;
  }

  // Private helper methods
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.removePersistentEntry(oldestKey);
      this.stats.evictions++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.removePersistentEntry(key);
    });

    if (expiredKeys.length > 0) {
      console.log(`Cache cleanup: removed ${expiredKeys.length} expired entries`);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Persistence methods
  private persistEntry(key: string, entry: CacheEntry<any>): void {
    if (!this.config.enablePersistence) return;
    
    try {
      const persistKey = `eternyx_cache_${key}`;
      localStorage.setItem(persistKey, JSON.stringify(entry));
    } catch (error) {
      console.warn('Cache persistence failed:', error);
    }
  }

  private loadFromPersistence(): void {
    if (!this.config.enablePersistence) return;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('eternyx_cache_')) {
          const cacheKey = key.replace('eternyx_cache_', '');
          const entryData = localStorage.getItem(key);
          
          if (entryData) {
            const entry = JSON.parse(entryData);
            if (!this.isExpired(entry)) {
              this.cache.set(cacheKey, entry);
            } else {
              localStorage.removeItem(key);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Cache persistence loading failed:', error);
    }
  }

  private removePersistentEntry(key: string): void {
    if (!this.config.enablePersistence) return;
    
    try {
      const persistKey = `eternyx_cache_${key}`;
      localStorage.removeItem(persistKey);
    } catch (error) {
      console.warn('Cache persistence removal failed:', error);
    }
  }

  private clearPersistence(): void {
    if (!this.config.enablePersistence) return;

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('eternyx_cache_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('Cache persistence clearing failed:', error);
    }
  }

  // Compression methods (simple base64 for demonstration)
  private compress(data: string): string {
    try {
      return btoa(data);
    } catch {
      return data;
    }
  }

  private decompress(data: string): any {
    try {
      return JSON.parse(atob(data));
    } catch {
      return data;
    }
  }

  // Cleanup on destruction
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// Export singleton instance
export const cacheService = new CacheService({
  maxSize: 500,
  defaultTTL: 10 * 60 * 1000, // 10 minutes
  enablePersistence: true,
  enableMetrics: true
});

