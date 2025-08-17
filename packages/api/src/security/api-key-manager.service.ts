import { EncryptionService } from './encryption.service';
import { AuditLoggerService } from './audit-logger.service';

export interface APIKeyConfig {
  id: string;
  name: string;
  key: string;
  encryptedKey?: string;
  provider: string;
  createdAt: Date;
  lastUsed?: Date;
  expiresAt?: Date;
  isActive: boolean;
  rotationInterval?: number; // in milliseconds
  usageCount: number;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
}

export interface APIKeyRotationResult {
  oldKeyId: string;
  newKeyId: string;
  rotatedAt: Date;
  success: boolean;
  error?: string;
}

export class APIKeyManagerService {
  private apiKeys: Map<string, APIKeyConfig> = new Map();
  private rotationSchedule: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private encryption: EncryptionService,
    private auditLogger: AuditLoggerService
  ) {
    this.initializeAPIKeys();
    this.setupRotationScheduler();
  }

  /**
   * Initialize API keys from environment variables
   */
  private initializeAPIKeys(): void {
    const keys = [
      {
        id: 'sportsdata-io',
        name: 'SportsData.io API',
        key: process.env.SPORTSDATA_IO_API_KEY || '81a9726b488c4b57b48e59042405d1a6',
        provider: 'sportsdata.io',
        rotationInterval: process.env.NODE_ENV === 'test' ? 60000 : 30 * 24 * 60 * 60 * 1000, // 1 min for test, 30 days for prod
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
          requestsPerDay: 10000,
        },
      },
      {
        id: 'odds-api',
        name: 'The Odds API',
        key: process.env.ODDS_API_KEY || '22e59e4eccd8562ad4b697aeeaccb0fb',
        provider: 'the-odds-api.com',
        rotationInterval: process.env.NODE_ENV === 'test' ? 120000 : 90 * 24 * 60 * 60 * 1000, // 2 min for test, 90 days for prod
        rateLimit: {
          requestsPerMinute: 10,
          requestsPerHour: 500,
          requestsPerDay: 1000,
        },
      },
      {
        id: 'oxylabs-proxy',
        name: 'Oxylabs Proxy',
        key: `${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}`,
        provider: 'oxylabs.io',
        rotationInterval: process.env.NODE_ENV === 'test' ? 180000 : 60 * 24 * 60 * 60 * 1000, // 3 min for test, 60 days for prod
      },
    ];

    keys.forEach(keyConfig => {
      if (keyConfig.key && keyConfig.key !== ':') {
        this.addAPIKey({
          ...keyConfig,
          createdAt: new Date(),
          isActive: true,
          usageCount: 0,
        });
      }
    });
  }

  /**
   * Add a new API key
   */
  addAPIKey(config: Omit<APIKeyConfig, 'encryptedKey'>): void {
    try {
      const encryptedKey = this.encryption.encrypt(config.key, true);
      
      const apiKeyConfig: APIKeyConfig = {
        ...config,
        encryptedKey: JSON.stringify(encryptedKey),
      };

      this.apiKeys.set(config.id, apiKeyConfig);

      // Schedule rotation if interval is specified
      if (config.rotationInterval) {
        this.scheduleRotation(config.id, config.rotationInterval);
      }

      this.auditLogger.logEvent({
        action: 'api_key_added',
        resource: 'api_keys',
        method: 'POST',
        endpoint: '/security/api-keys',
        success: true,
        details: {
          keyId: config.id,
          provider: config.provider,
          hasRotationInterval: !!config.rotationInterval,
        },
        riskLevel: 'high',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'api-key-manager',
      });

      console.log(`API key added: ${config.name} (${config.id})`);
    } catch (error) {
      this.auditLogger.logEvent({
        action: 'api_key_add_failed',
        resource: 'api_keys',
        method: 'POST',
        endpoint: '/security/api-keys',
        success: false,
        details: {
          keyId: config.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        riskLevel: 'critical',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'api-key-manager',
      });
      throw error;
    }
  }

  /**
   * Get API key by ID
   */
  getAPIKey(keyId: string): string | null {
    try {
      const config = this.apiKeys.get(keyId);
      if (!config || !config.isActive) {
        return null;
      }

      // Check if key is expired
      if (config.expiresAt && config.expiresAt < new Date()) {
        this.deactivateAPIKey(keyId, 'expired');
        return null;
      }

      // Decrypt the key
      if (config.encryptedKey) {
        const encryptedData = JSON.parse(config.encryptedKey);
        const decryptedKey = this.encryption.decrypt(encryptedData);
        
        // Update usage statistics
        config.lastUsed = new Date();
        config.usageCount++;
        
        return decryptedKey;
      }

      return config.key;
    } catch (error) {
      this.auditLogger.logEvent({
        action: 'api_key_access_failed',
        resource: 'api_keys',
        method: 'GET',
        endpoint: '/security/api-keys',
        success: false,
        details: {
          keyId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        riskLevel: 'high',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'api-key-manager',
      });
      return null;
    }
  }

  /**
   * Rotate API key
   */
  async rotateAPIKey(keyId: string, newKey?: string): Promise<APIKeyRotationResult> {
    const config = this.apiKeys.get(keyId);
    if (!config) {
      throw new Error(`API key not found: ${keyId}`);
    }

    try {
      const oldKeyId = keyId;
      const rotatedAt = new Date();

      // Generate new key ID if rotating
      const newKeyId = newKey ? `${keyId}-${Date.now()}` : keyId;
      
      // If no new key provided, this is just a refresh of the existing key
      if (newKey) {
        // Create new key config
        const newConfig: APIKeyConfig = {
          ...config,
          id: newKeyId,
          key: newKey,
          encryptedKey: JSON.stringify(this.encryption.encrypt(newKey, true)),
          createdAt: rotatedAt,
          lastUsed: undefined,
          usageCount: 0,
        };

        // Add new key
        this.apiKeys.set(newKeyId, newConfig);

        // Deactivate old key after grace period (5 minutes)
        setTimeout(() => {
          this.deactivateAPIKey(oldKeyId, 'rotated');
        }, 5 * 60 * 1000);

        // Schedule next rotation
        if (config.rotationInterval) {
          this.scheduleRotation(newKeyId, config.rotationInterval);
        }
      } else {
        // Just update the last rotation time
        config.lastUsed = rotatedAt;
      }

      const result: APIKeyRotationResult = {
        oldKeyId,
        newKeyId,
        rotatedAt,
        success: true,
      };

      this.auditLogger.logEvent({
        action: 'api_key_rotated',
        resource: 'api_keys',
        method: 'PUT',
        endpoint: '/security/api-keys/rotate',
        success: true,
        details: {
          oldKeyId,
          newKeyId,
          provider: config.provider,
          hasNewKey: !!newKey,
        },
        riskLevel: 'high',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'api-key-manager',
      });

      console.log(`API key rotated: ${config.name} (${oldKeyId} -> ${newKeyId})`);
      return result;
    } catch (error) {
      const result: APIKeyRotationResult = {
        oldKeyId: keyId,
        newKeyId: keyId,
        rotatedAt: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.auditLogger.logEvent({
        action: 'api_key_rotation_failed',
        resource: 'api_keys',
        method: 'PUT',
        endpoint: '/security/api-keys/rotate',
        success: false,
        details: {
          keyId,
          error: result.error,
        },
        riskLevel: 'critical',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'api-key-manager',
      });

      return result;
    }
  }

  /**
   * Deactivate API key
   */
  deactivateAPIKey(keyId: string, reason: string): void {
    const config = this.apiKeys.get(keyId);
    if (config) {
      config.isActive = false;
      
      // Clear rotation schedule
      const timeout = this.rotationSchedule.get(keyId);
      if (timeout) {
        clearTimeout(timeout);
        this.rotationSchedule.delete(keyId);
      }

      this.auditLogger.logEvent({
        action: 'api_key_deactivated',
        resource: 'api_keys',
        method: 'PUT',
        endpoint: '/security/api-keys/deactivate',
        success: true,
        details: {
          keyId,
          reason,
          provider: config.provider,
        },
        riskLevel: 'medium',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'api-key-manager',
      });

      console.log(`API key deactivated: ${config.name} (${keyId}) - Reason: ${reason}`);
    }
  }

  /**
   * Get API key configuration (without the actual key)
   */
  getAPIKeyConfig(keyId: string): Omit<APIKeyConfig, 'key' | 'encryptedKey'> | null {
    const config = this.apiKeys.get(keyId);
    if (!config) {
      return null;
    }

    const { key, encryptedKey, ...safeConfig } = config;
    return safeConfig;
  }

  /**
   * List all API keys (without actual keys)
   */
  listAPIKeys(): Array<Omit<APIKeyConfig, 'key' | 'encryptedKey'>> {
    return Array.from(this.apiKeys.values()).map(config => {
      const { key, encryptedKey, ...safeConfig } = config;
      return safeConfig;
    });
  }

  /**
   * Get API key usage statistics
   */
  getUsageStatistics(keyId: string): {
    usageCount: number;
    lastUsed?: Date;
    isActive: boolean;
    daysUntilExpiration?: number;
  } | null {
    const config = this.apiKeys.get(keyId);
    if (!config) {
      return null;
    }

    let daysUntilExpiration: number | undefined;
    if (config.expiresAt) {
      const now = new Date();
      const timeDiff = config.expiresAt.getTime() - now.getTime();
      daysUntilExpiration = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    }

    return {
      usageCount: config.usageCount,
      lastUsed: config.lastUsed,
      isActive: config.isActive,
      daysUntilExpiration,
    };
  }

  /**
   * Schedule automatic key rotation
   */
  private scheduleRotation(keyId: string, intervalMs: number): void {
    // Clear existing schedule
    const existingTimeout = this.rotationSchedule.get(keyId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new rotation
    const timeout = setTimeout(async () => {
      try {
        await this.rotateAPIKey(keyId);
        console.log(`Automatic rotation completed for key: ${keyId}`);
      } catch (error) {
        console.error(`Automatic rotation failed for key: ${keyId}`, error);
      }
    }, intervalMs);

    this.rotationSchedule.set(keyId, timeout);
  }

  /**
   * Setup rotation scheduler
   */
  private setupRotationScheduler(): void {
    // Check for keys that need rotation every hour
    setInterval(() => {
      this.checkRotationNeeds();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Check which keys need rotation
   */
  private checkRotationNeeds(): void {
    const now = new Date();
    
    this.apiKeys.forEach((config, keyId) => {
      if (!config.isActive || !config.rotationInterval) {
        return;
      }

      const timeSinceCreation = now.getTime() - config.createdAt.getTime();
      const rotationDue = timeSinceCreation >= config.rotationInterval;

      if (rotationDue && !this.rotationSchedule.has(keyId)) {
        console.log(`Key rotation due for: ${config.name} (${keyId})`);
        
        // Create alert for manual rotation (since we can't auto-generate new API keys)
        this.auditLogger.createSecurityAlert({
          type: 'suspicious_activity',
          severity: 'medium',
          ipAddress: 'system',
          description: `API key rotation due for ${config.name}`,
          details: {
            keyId,
            provider: config.provider,
            daysSinceCreation: Math.floor(timeSinceCreation / (1000 * 60 * 60 * 24)),
          },
        });
      }
    });
  }

  /**
   * Validate API key format
   */
  validateAPIKeyFormat(keyId: string, key: string): boolean {
    // Basic validation patterns for different providers
    const patterns: { [key: string]: RegExp } = {
      'sportsdata-io': /^[a-f0-9]{32}$/i,
      'odds-api': /^[a-f0-9]{32}$/i,
      'oxylabs-proxy': /^.+:.+$/, // username:password format
    };

    const pattern = patterns[keyId];
    return pattern ? pattern.test(key) : true; // Default to true for unknown patterns
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clear all rotation schedules
    this.rotationSchedule.forEach(timeout => {
      clearTimeout(timeout);
    });
    this.rotationSchedule.clear();
    this.apiKeys.clear();
  }
}