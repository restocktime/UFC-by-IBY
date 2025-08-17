import { DataPrivacyService } from '../data-privacy.service';
import { EncryptionService } from '../../security/encryption.service';
import { AuditLoggerService } from '../../security/audit-logger.service';

describe('DataPrivacyService', () => {
  let dataPrivacyService: DataPrivacyService;
  let encryptionService: EncryptionService;
  let auditLogger: AuditLoggerService;

  beforeEach(() => {
    encryptionService = new EncryptionService('test-key');
    auditLogger = new AuditLoggerService();
    dataPrivacyService = new DataPrivacyService(encryptionService, auditLogger);
  });

  afterEach(() => {
    dataPrivacyService.destroy();
    auditLogger.destroy?.();
  });

  describe('storeUserData', () => {
    it('should store user data with encryption', () => {
      const userData = {
        userId: 'user123',
        dataType: 'personal' as const,
        data: { name: 'John Doe', email: 'john@example.com' },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
        consentGiven: true,
        processingPurpose: ['service_provision'],
        dataSource: 'user_registration',
        isAnonymized: false,
      };

      const recordId = dataPrivacyService.storeUserData(userData);

      expect(recordId).toBeDefined();
      expect(typeof recordId).toBe('string');
    });

    it('should encrypt sensitive data when storing', () => {
      const userData = {
        userId: 'user123',
        dataType: 'personal' as const,
        data: { name: 'John Doe', email: 'john@example.com' },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        consentGiven: true,
        processingPurpose: ['service_provision'],
        dataSource: 'user_registration',
        isAnonymized: false,
      };

      const recordId = dataPrivacyService.storeUserData(userData);
      const retrievedData = dataPrivacyService.getUserData('user123');

      expect(retrievedData).toHaveLength(1);
      expect(retrievedData[0].data).toEqual(userData.data);
      expect(retrievedData[0].encryptedData).toBeDefined();
    });
  });

  describe('getUserData', () => {
    beforeEach(() => {
      // Store test data
      dataPrivacyService.storeUserData({
        userId: 'user123',
        dataType: 'personal',
        data: { name: 'John Doe' },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        consentGiven: true,
        processingPurpose: ['service_provision'],
        dataSource: 'test',
        isAnonymized: false,
      });

      dataPrivacyService.storeUserData({
        userId: 'user123',
        dataType: 'behavioral',
        data: { clicks: 10 },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        consentGiven: true,
        processingPurpose: ['analytics'],
        dataSource: 'test',
        isAnonymized: false,
      });
    });

    it('should retrieve all user data', () => {
      const userData = dataPrivacyService.getUserData('user123');

      expect(userData).toHaveLength(2);
      expect(userData[0].data).toEqual({ name: 'John Doe' });
      expect(userData[1].data).toEqual({ clicks: 10 });
    });

    it('should filter by data types', () => {
      const userData = dataPrivacyService.getUserData('user123', ['personal']);

      expect(userData).toHaveLength(1);
      expect(userData[0].dataType).toBe('personal');
    });

    it('should return empty array for non-existent user', () => {
      const userData = dataPrivacyService.getUserData('nonexistent');

      expect(userData).toHaveLength(0);
    });
  });

  describe('recordConsent', () => {
    it('should record user consent', () => {
      const consent = {
        userId: 'user123',
        consentType: 'data_processing' as const,
        granted: true,
        grantedAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['service_provision'],
        dataTypes: ['personal'],
      };

      const consentId = dataPrivacyService.recordConsent(consent);

      expect(consentId).toBeDefined();
      expect(typeof consentId).toBe('string');
    });

    it('should record consent withdrawal', () => {
      const consent = {
        userId: 'user123',
        consentType: 'marketing' as const,
        granted: false,
        withdrawnAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['marketing'],
        dataTypes: ['personal'],
      };

      const consentId = dataPrivacyService.recordConsent(consent);

      expect(consentId).toBeDefined();
    });
  });

  describe('hasConsent', () => {
    beforeEach(() => {
      // Record consent
      dataPrivacyService.recordConsent({
        userId: 'user123',
        consentType: 'data_processing',
        granted: true,
        grantedAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['service_provision'],
        dataTypes: ['personal'],
      });
    });

    it('should return true for granted consent', () => {
      const hasConsent = dataPrivacyService.hasConsent('user123', 'data_processing', 'service_provision');

      expect(hasConsent).toBe(true);
    });

    it('should return false for non-existent consent', () => {
      const hasConsent = dataPrivacyService.hasConsent('user123', 'marketing', 'advertising');

      expect(hasConsent).toBe(false);
    });

    it('should return false for withdrawn consent', () => {
      // Use a different user to avoid interference from beforeEach
      const testUserId = 'user456';
      
      // First grant consent
      dataPrivacyService.recordConsent({
        userId: testUserId,
        consentType: 'data_processing',
        granted: true,
        grantedAt: new Date(Date.now() - 2000), // 2 seconds ago
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['service_provision'],
        dataTypes: ['personal'],
      });

      // Then withdraw consent (more recent)
      dataPrivacyService.recordConsent({
        userId: testUserId,
        consentType: 'data_processing',
        granted: false, // This must be false for withdrawal
        withdrawnAt: new Date(), // Now
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['service_provision'],
        dataTypes: ['personal'],
      });

      const hasConsent = dataPrivacyService.hasConsent(testUserId, 'data_processing', 'service_provision');

      expect(hasConsent).toBe(false);
    });
  });

  describe('createDataExportRequest', () => {
    it('should create data export request', () => {
      const request = {
        userId: 'user123',
        requestedAt: new Date(),
        format: 'json' as const,
        includeDeleted: false,
      };

      const requestId = dataPrivacyService.createDataExportRequest(request);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
    });

    it('should process export request asynchronously', async () => {
      const request = {
        userId: 'user123',
        requestedAt: new Date(),
        format: 'json' as const,
        includeDeleted: false,
      };

      const requestId = dataPrivacyService.createDataExportRequest(request);
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = dataPrivacyService.getExportRequestStatus(requestId);
      expect(status).toBeDefined();
      expect(['pending', 'processing', 'completed']).toContain(status?.status);
    });
  });

  describe('createDataDeletionRequest', () => {
    it('should create data deletion request', () => {
      const request = {
        userId: 'user123',
        requestedAt: new Date(),
        deletionType: 'hard' as const,
        retainForLegal: false,
      };

      const requestId = dataPrivacyService.createDataDeletionRequest(request);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
    });

    it('should process deletion request asynchronously', async () => {
      const request = {
        userId: 'user123',
        requestedAt: new Date(),
        deletionType: 'soft' as const,
        retainForLegal: true,
      };

      const requestId = dataPrivacyService.createDataDeletionRequest(request);
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = dataPrivacyService.getDeletionRequestStatus(requestId);
      expect(status).toBeDefined();
      expect(['pending', 'processing', 'completed']).toContain(status?.status);
    });
  });

  describe('anonymizeUserData', () => {
    beforeEach(() => {
      dataPrivacyService.storeUserData({
        userId: 'user123',
        dataType: 'personal',
        data: { name: 'John Doe', email: 'john@example.com' },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        consentGiven: true,
        processingPurpose: ['service_provision'],
        dataSource: 'test',
        isAnonymized: false,
      });
    });

    it('should anonymize user data', () => {
      const anonymizedCount = dataPrivacyService.anonymizeUserData('user123');

      expect(anonymizedCount).toBe(1);
      
      const userData = dataPrivacyService.getUserData('user123');
      expect(userData[0].isAnonymized).toBe(true);
      expect(userData[0].anonymizedAt).toBeDefined();
    });

    it('should anonymize specific data types only', () => {
      // Add another data type
      dataPrivacyService.storeUserData({
        userId: 'user123',
        dataType: 'behavioral',
        data: { clicks: 10 },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        consentGiven: true,
        processingPurpose: ['analytics'],
        dataSource: 'test',
        isAnonymized: false,
      });

      const anonymizedCount = dataPrivacyService.anonymizeUserData('user123', ['personal']);

      expect(anonymizedCount).toBe(1);
      
      const userData = dataPrivacyService.getUserData('user123');
      const personalData = userData.find(d => d.dataType === 'personal');
      const behavioralData = userData.find(d => d.dataType === 'behavioral');
      
      expect(personalData?.isAnonymized).toBe(true);
      expect(behavioralData?.isAnonymized).toBe(false);
    });
  });

  describe('retention policies', () => {
    it('should have default retention policies', () => {
      const policies = dataPrivacyService.getRetentionPolicies();

      expect(policies.length).toBeGreaterThan(0);
      expect(policies[0]).toHaveProperty('id');
      expect(policies[0]).toHaveProperty('name');
      expect(policies[0]).toHaveProperty('dataTypes');
      expect(policies[0]).toHaveProperty('retentionPeriod');
    });

    it('should add custom retention policy', () => {
      const policy = {
        id: 'test-policy',
        name: 'Test Policy',
        dataTypes: ['test'],
        retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
        autoDelete: true,
        description: 'Test retention policy',
        legalBasis: 'Consent',
        isActive: true,
      };

      dataPrivacyService.addRetentionPolicy(policy);
      
      const policies = dataPrivacyService.getRetentionPolicies();
      const addedPolicy = policies.find(p => p.id === 'test-policy');
      
      expect(addedPolicy).toBeDefined();
      expect(addedPolicy?.name).toBe('Test Policy');
    });
  });

  describe('compliance statistics', () => {
    beforeEach(() => {
      // Add some test data
      dataPrivacyService.storeUserData({
        userId: 'user1',
        dataType: 'personal',
        data: { name: 'User 1' },
        createdAt: new Date(),
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        consentGiven: true,
        processingPurpose: ['service_provision'],
        dataSource: 'test',
        isAnonymized: false,
      });

      dataPrivacyService.recordConsent({
        userId: 'user1',
        consentType: 'data_processing',
        granted: true,
        grantedAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['service_provision'],
        dataTypes: ['personal'],
      });
    });

    it('should return compliance statistics', () => {
      const stats = dataPrivacyService.getComplianceStatistics();

      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('totalRecords');
      expect(stats).toHaveProperty('anonymizedRecords');
      expect(stats).toHaveProperty('activeConsents');
      expect(stats).toHaveProperty('pendingExports');
      expect(stats).toHaveProperty('pendingDeletions');
      expect(stats).toHaveProperty('retentionPolicies');

      expect(stats.totalUsers).toBeGreaterThan(0);
      expect(stats.totalRecords).toBeGreaterThan(0);
      expect(stats.activeConsents).toBeGreaterThan(0);
    });
  });

  describe('getUserConsentHistory', () => {
    beforeEach(() => {
      dataPrivacyService.recordConsent({
        userId: 'user123',
        consentType: 'data_processing',
        granted: true,
        grantedAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['service_provision'],
        dataTypes: ['personal'],
      });

      dataPrivacyService.recordConsent({
        userId: 'user123',
        consentType: 'marketing',
        granted: false,
        withdrawnAt: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        consentVersion: '1.0',
        processingPurposes: ['marketing'],
        dataTypes: ['personal'],
      });
    });

    it('should return user consent history', () => {
      const history = dataPrivacyService.getUserConsentHistory('user123');

      expect(history).toHaveLength(2);
      expect(history[0].consentType).toBe('data_processing');
      expect(history[1].consentType).toBe('marketing');
    });

    it('should return empty array for user with no consent history', () => {
      const history = dataPrivacyService.getUserConsentHistory('nonexistent');

      expect(history).toHaveLength(0);
    });
  });
});