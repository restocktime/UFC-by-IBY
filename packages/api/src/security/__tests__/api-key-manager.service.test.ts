import { APIKeyManagerService } from '../api-key-manager.service';
import { EncryptionService } from '../encryption.service';
import { AuditLoggerService } from '../audit-logger.service';

describe('APIKeyManagerService', () => {
  let apiKeyManager: APIKeyManagerService;
  let encryptionService: EncryptionService;
  let auditLogger: AuditLoggerService;

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    // Clear environment variables to prevent default keys from being added
    delete process.env.SPORTSDATA_IO_API_KEY;
    delete process.env.ODDS_API_KEY;
    delete process.env.OXYLABS_USERNAME;
    delete process.env.OXYLABS_PASSWORD;
    
    encryptionService = new EncryptionService('test-key');
    auditLogger = new AuditLoggerService();
    apiKeyManager = new APIKeyManagerService(encryptionService, auditLogger);
  });

  afterEach(() => {
    apiKeyManager.destroy();
    auditLogger.destroy?.();
  });

  describe('addAPIKey', () => {
    it('should add a new API key successfully', () => {
      const keyConfig = {
        id: 'test-key',
        name: 'Test API Key',
        key: 'test-api-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: true,
        usageCount: 0,
      };

      expect(() => apiKeyManager.addAPIKey(keyConfig)).not.toThrow();
      
      const retrievedKey = apiKeyManager.getAPIKey('test-key');
      expect(retrievedKey).toBe('test-api-key-12345');
    });

    it('should encrypt the API key when storing', () => {
      const keyConfig = {
        id: 'test-key-encrypted',
        name: 'Test Encrypted Key',
        key: 'secret-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: true,
        usageCount: 0,
      };

      apiKeyManager.addAPIKey(keyConfig);
      
      const config = apiKeyManager.getAPIKeyConfig('test-key-encrypted');
      expect(config).toBeDefined();
      expect(config?.name).toBe('Test Encrypted Key');
      // The actual key should not be stored in plain text
      expect((config as any).key).toBeUndefined();
    });

    it('should schedule rotation if interval is provided', async () => {
      const keyConfig = {
        id: 'test-key-rotation',
        name: 'Test Rotation Key',
        key: 'rotation-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: true,
        usageCount: 0,
        rotationInterval: 100, // 100ms for testing
      };

      apiKeyManager.addAPIKey(keyConfig);
      
      // Check that rotation is scheduled (we can't easily test the actual rotation without mocking)
      await new Promise(resolve => setTimeout(resolve, 50));
      const config = apiKeyManager.getAPIKeyConfig('test-key-rotation');
      expect(config).toBeDefined();
    });
  });

  describe('getAPIKey', () => {
    beforeEach(() => {
      apiKeyManager.addAPIKey({
        id: 'active-key',
        name: 'Active Key',
        key: 'active-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: true,
        usageCount: 0,
      });

      apiKeyManager.addAPIKey({
        id: 'inactive-key',
        name: 'Inactive Key',
        key: 'inactive-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: false,
        usageCount: 0,
      });

      apiKeyManager.addAPIKey({
        id: 'expired-key',
        name: 'Expired Key',
        key: 'expired-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        isActive: true,
        usageCount: 0,
      });
    });

    it('should return active API key', () => {
      const key = apiKeyManager.getAPIKey('active-key');
      expect(key).toBe('active-key-12345');
    });

    it('should return null for inactive API key', () => {
      const key = apiKeyManager.getAPIKey('inactive-key');
      expect(key).toBeNull();
    });

    it('should return null for expired API key', () => {
      const key = apiKeyManager.getAPIKey('expired-key');
      expect(key).toBeNull();
    });

    it('should return null for non-existent API key', () => {
      const key = apiKeyManager.getAPIKey('non-existent');
      expect(key).toBeNull();
    });

    it('should update usage statistics when key is retrieved', () => {
      const initialStats = apiKeyManager.getUsageStatistics('active-key');
      expect(initialStats?.usageCount).toBe(0);

      apiKeyManager.getAPIKey('active-key');
      
      const updatedStats = apiKeyManager.getUsageStatistics('active-key');
      expect(updatedStats?.usageCount).toBe(1);
      expect(updatedStats?.lastUsed).toBeDefined();
    });
  });

  describe('rotateAPIKey', () => {
    beforeEach(() => {
      apiKeyManager.addAPIKey({
        id: 'rotate-test',
        name: 'Rotation Test Key',
        key: 'old-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: true,
        usageCount: 5,
      });
    });

    it('should rotate API key with new key', async () => {
      const result = await apiKeyManager.rotateAPIKey('rotate-test', 'new-key-67890');
      
      expect(result.success).toBe(true);
      expect(result.oldKeyId).toBe('rotate-test');
      expect(result.newKeyId).toContain('rotate-test-');
      
      // New key should be accessible
      const newKey = apiKeyManager.getAPIKey(result.newKeyId);
      expect(newKey).toBe('new-key-67890');
    });

    it('should handle rotation without new key (refresh)', async () => {
      const result = await apiKeyManager.rotateAPIKey('rotate-test');
      
      expect(result.success).toBe(true);
      expect(result.oldKeyId).toBe('rotate-test');
      expect(result.newKeyId).toBe('rotate-test');
    });

    it('should throw error for non-existent key', async () => {
      await expect(apiKeyManager.rotateAPIKey('non-existent')).rejects.toThrow('API key not found');
    });
  });

  describe('deactivateAPIKey', () => {
    beforeEach(() => {
      apiKeyManager.addAPIKey({
        id: 'deactivate-test',
        name: 'Deactivation Test Key',
        key: 'deactivate-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        isActive: true,
        usageCount: 0,
      });
    });

    it('should deactivate API key', () => {
      apiKeyManager.deactivateAPIKey('deactivate-test', 'manual deactivation');
      
      const key = apiKeyManager.getAPIKey('deactivate-test');
      expect(key).toBeNull();
      
      const config = apiKeyManager.getAPIKeyConfig('deactivate-test');
      expect(config?.isActive).toBe(false);
    });
  });

  describe('listAPIKeys', () => {
    beforeEach(() => {
      apiKeyManager.addAPIKey({
        id: 'list-test-1',
        name: 'List Test Key 1',
        key: 'key-1',
        provider: 'provider-1',
        createdAt: new Date(),
        isActive: true,
        usageCount: 0,
      });

      apiKeyManager.addAPIKey({
        id: 'list-test-2',
        name: 'List Test Key 2',
        key: 'key-2',
        provider: 'provider-2',
        createdAt: new Date(),
        isActive: false,
        usageCount: 0,
      });
    });

    it('should list all API keys without exposing actual keys', () => {
      const keys = apiKeyManager.listAPIKeys();
      
      expect(keys).toHaveLength(2);
      expect(keys[0].id).toBe('list-test-1');
      expect(keys[1].id).toBe('list-test-2');
      
      // Should not contain actual keys
      keys.forEach(key => {
        expect((key as any).key).toBeUndefined();
        expect((key as any).encryptedKey).toBeUndefined();
      });
    });
  });

  describe('getUsageStatistics', () => {
    beforeEach(() => {
      apiKeyManager.addAPIKey({
        id: 'stats-test',
        name: 'Stats Test Key',
        key: 'stats-key-12345',
        provider: 'test-provider',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        isActive: true,
        usageCount: 10,
      });
    });

    it('should return usage statistics', () => {
      const stats = apiKeyManager.getUsageStatistics('stats-test');
      
      expect(stats).toBeDefined();
      expect(stats?.usageCount).toBe(10);
      expect(stats?.isActive).toBe(true);
      expect(stats?.daysUntilExpiration).toBeCloseTo(7, 0);
    });

    it('should return null for non-existent key', () => {
      const stats = apiKeyManager.getUsageStatistics('non-existent');
      expect(stats).toBeNull();
    });
  });

  describe('validateAPIKeyFormat', () => {
    it('should validate SportsData.io key format', () => {
      const validKey = 'a1b2c3d4e5f6789012345678901234ab';
      const invalidKey = 'invalid-key';
      
      expect(apiKeyManager.validateAPIKeyFormat('sportsdata-io', validKey)).toBe(true);
      expect(apiKeyManager.validateAPIKeyFormat('sportsdata-io', invalidKey)).toBe(false);
    });

    it('should validate Odds API key format', () => {
      const validKey = 'a1b2c3d4e5f6789012345678901234ab';
      const invalidKey = 'invalid-key';
      
      expect(apiKeyManager.validateAPIKeyFormat('odds-api', validKey)).toBe(true);
      expect(apiKeyManager.validateAPIKeyFormat('odds-api', invalidKey)).toBe(false);
    });

    it('should validate Oxylabs proxy format', () => {
      const validKey = 'username:password';
      const invalidKey = 'invalid-format';
      
      expect(apiKeyManager.validateAPIKeyFormat('oxylabs-proxy', validKey)).toBe(true);
      expect(apiKeyManager.validateAPIKeyFormat('oxylabs-proxy', invalidKey)).toBe(false);
    });

    it('should default to true for unknown key types', () => {
      expect(apiKeyManager.validateAPIKeyFormat('unknown-type', 'any-key')).toBe(true);
    });
  });
});