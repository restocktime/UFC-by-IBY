import Redis from 'ioredis';
import { config } from '../config';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  compress?: boolean; // Whether to compress large values
  priority?: 'low' | 'medium' | 'high'; // Cache priority
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  memoryUsage: number;
  keyCount: number;
}

export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  size: number;
}

export class CacheManagerService {
  private static instance: CacheManagerService;
  private redis: Redis;
  private localCache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
    memoryUsage: 0,
    keyCount: 0
  };
  private readonly maxLocalCacheSize = 1000; // Maximum number of items in local cache
  private readonly maxValueSize = 1024 * 1024; // 1MB max value size for local cache
  private readonly compressionThreshold = 1024; // Compress values larger than 1KB

  private constructor() {
    this.initializeRedis();
    this.startStatsCollection();
  }

  public static getInstance(): CacheManagerService {
    if (!CacheManagerService.instance) {
      CacheManagerService.instance = new CacheManagerService();
    }
    return CacheManagerService.instance;
  }

  private initializeRedis(): void {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis cache');
    });

    this.redis.on('error', (error) => {
      console.error('Redis cache error:', error);
    });

    this.redis.on('reconnecting', () => {
      console.log('Reconnecting to Redis cache...');
    });
  }

  private startStatsCollection(): void {
    setInterval(() => {
      this.updateStats();
    }, 60000); // Update stats every minute
  }

  private updateStats(): void {
    this.stats.hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
      : 0;
    
    this.stats.keyCount = this.localCache.size;
    this.stats.memoryUsage = this.calculateMemoryUsage();
  }

  private calculateMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.localCache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  private generateCacheKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private compressValue(value: any): string {
    const jsonString = JSON.stringify(value);
    if (jsonString.length > this.compressionThreshold) {
      // Simple compression using gzip would go here
      // For now, just return the JSON string
      return jsonString;
    }
    return jsonString;
  }

  private decompressValue(compressedValue: string): any {
    try {
      return JSON.parse(compressedValue);
    } catch (error) {
      console.error('Error decompressing cache value:', error);
      return null;
    }
  }

  private evictLocalCache(): void {
    if (this.localCache.size <= this.maxLocalCacheSize) return;

    // Sort by timestamp (LRU eviction)
    const entries = Array.from(this.localCache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.localCache.delete(entries[i][0]);
    }
  }

  public async get<T = any>(key: string, namespace?: string): Promise<T | null> {
    const cacheKey = this.generateCacheKey(key, namespace);

    // Try local cache first
    const localEntry = this.localCache.get(cacheKey);
    if (localEntry) {
      // Check if entry is still valid
      if (Date.now() - localEntry.timestamp < localEntry.ttl * 1000) {
        this.stats.hits++;
        localEntry.timestamp = Date.now(); // Update access time for LRU
        return localEntry.value as T;
      } else {
        // Entry expired, remove from local cache
        this.localCache.delete(cacheKey);
      }
    }

    // Try Redis cache
    try {
      const redisValue = await this.redis.get(cacheKey);
      if (redisValue) {
        this.stats.hits++;
        const value = this.decompressValue(redisValue);
        
        // Store in local cache if not too large
        const size = JSON.stringify(value).length;
        if (size <= this.maxValueSize) {
          this.localCache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            ttl: 300, // Default 5 minutes for local cache
            tags: [],
            size
          });
          this.evictLocalCache();
        }
        
        return value as T;
      }
    } catch (error) {
      console.error('Redis get error:', error);
    }

    this.stats.misses++;
    return null;
  }

  public async set<T = any>(
    key: string, 
    value: T, 
    options: CacheOptions = {}, 
    namespace?: string
  ): Promise<boolean> {
    const cacheKey = this.generateCacheKey(key, namespace);
    const ttl = options.ttl || 300; // Default 5 minutes
    const compressedValue = this.compressValue(value);
    const size = compressedValue.length;

    try {
      // Store in Redis
      if (ttl > 0) {
        await this.redis.setex(cacheKey, ttl, compressedValue);
      } else {
        await this.redis.set(cacheKey, compressedValue);
      }

      // Store tags for invalidation
      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          await this.redis.sadd(`tag:${tag}`, cacheKey);
          if (ttl > 0) {
            await this.redis.expire(`tag:${tag}`, ttl);
          }
        }
      }

      // Store in local cache if not too large
      if (size <= this.maxValueSize) {
        this.localCache.set(cacheKey, {
          value,
          timestamp: Date.now(),
          ttl,
          tags: options.tags || [],
          size
        });
        this.evictLocalCache();
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  public async delete(key: string, namespace?: string): Promise<boolean> {
    const cacheKey = this.generateCacheKey(key, namespace);

    try {
      // Remove from local cache
      this.localCache.delete(cacheKey);

      // Remove from Redis
      const result = await this.redis.del(cacheKey);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  public async invalidateByTag(tag: string): Promise<number> {
    try {
      const keys = await this.redis.smembers(`tag:${tag}`);
      if (keys.length === 0) return 0;

      // Remove from local cache
      for (const key of keys) {
        this.localCache.delete(key);
      }

      // Remove from Redis
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      pipeline.del(`tag:${tag}`);
      
      const results = await pipeline.exec();
      const deletedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;
      
      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return 0;
    }
  }

  public async exists(key: string, namespace?: string): Promise<boolean> {
    const cacheKey = this.generateCacheKey(key, namespace);

    // Check local cache first
    if (this.localCache.has(cacheKey)) {
      const entry = this.localCache.get(cacheKey)!;
      if (Date.now() - entry.timestamp < entry.ttl * 1000) {
        return true;
      } else {
        this.localCache.delete(cacheKey);
      }
    }

    // Check Redis
    try {
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  public async getTTL(key: string, namespace?: string): Promise<number> {
    const cacheKey = this.generateCacheKey(key, namespace);

    try {
      const ttl = await this.redis.ttl(cacheKey);
      return ttl;
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -1;
    }
  }

  public async extend(key: string, additionalTTL: number, namespace?: string): Promise<boolean> {
    const cacheKey = this.generateCacheKey(key, namespace);

    try {
      const currentTTL = await this.redis.ttl(cacheKey);
      if (currentTTL > 0) {
        const newTTL = currentTTL + additionalTTL;
        await this.redis.expire(cacheKey, newTTL);
        
        // Update local cache TTL if exists
        const localEntry = this.localCache.get(cacheKey);
        if (localEntry) {
          localEntry.ttl = newTTL;
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Cache extend error:', error);
      return false;
    }
  }

  public async clear(namespace?: string): Promise<number> {
    let deletedCount = 0;

    try {
      if (namespace) {
        // Clear specific namespace
        const pattern = `${namespace}:*`;
        const keys = await this.redis.keys(pattern);
        
        if (keys.length > 0) {
          // Remove from local cache
          for (const key of keys) {
            this.localCache.delete(key);
          }
          
          // Remove from Redis
          deletedCount = await this.redis.del(...keys);
        }
      } else {
        // Clear all cache
        this.localCache.clear();
        await this.redis.flushdb();
        deletedCount = 1; // Indicate success
      }

      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }

  public getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  public async getMemoryInfo(): Promise<{
    redis: { used: number; peak: number; fragmentation: number };
    local: { used: number; keyCount: number };
  }> {
    try {
      const redisInfo = await this.redis.memory('usage');
      const redisStats = await this.redis.info('memory');
      
      // Parse Redis memory info
      const usedMemory = parseInt(redisStats.match(/used_memory:(\d+)/)?.[1] || '0');
      const peakMemory = parseInt(redisStats.match(/used_memory_peak:(\d+)/)?.[1] || '0');
      const fragmentation = parseFloat(redisStats.match(/mem_fragmentation_ratio:([\d.]+)/)?.[1] || '1');

      return {
        redis: {
          used: usedMemory,
          peak: peakMemory,
          fragmentation
        },
        local: {
          used: this.stats.memoryUsage,
          keyCount: this.stats.keyCount
        }
      };
    } catch (error) {
      console.error('Error getting memory info:', error);
      return {
        redis: { used: 0, peak: 0, fragmentation: 1 },
        local: { used: this.stats.memoryUsage, keyCount: this.stats.keyCount }
      };
    }
  }

  public async healthCheck(): Promise<{
    redis: { status: boolean; responseTime?: number; error?: string };
    local: { status: boolean; keyCount: number; memoryUsage: number };
  }> {
    const startTime = Date.now();
    
    try {
      await this.redis.ping();
      const redisResponseTime = Date.now() - startTime;
      
      return {
        redis: {
          status: true,
          responseTime: redisResponseTime
        },
        local: {
          status: true,
          keyCount: this.localCache.size,
          memoryUsage: this.calculateMemoryUsage()
        }
      };
    } catch (error) {
      return {
        redis: {
          status: false,
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        local: {
          status: true,
          keyCount: this.localCache.size,
          memoryUsage: this.calculateMemoryUsage()
        }
      };
    }
  }

  public destroy(): void {
    this.localCache.clear();
    this.redis.disconnect();
  }
}