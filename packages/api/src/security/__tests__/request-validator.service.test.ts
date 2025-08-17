import { Request } from 'express';
import { RequestValidatorService } from '../request-validator.service';
import { AuditLoggerService } from '../audit-logger.service';
import { EncryptionService } from '../encryption.service';

describe('RequestValidatorService', () => {
  let requestValidator: RequestValidatorService;
  let auditLogger: AuditLoggerService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    auditLogger = new AuditLoggerService();
    encryptionService = new EncryptionService('test-key');
    requestValidator = new RequestValidatorService(auditLogger, encryptionService);
  });

  afterEach(() => {
    requestValidator.destroy();
    auditLogger.destroy?.();
  });

  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      method: 'GET',
      path: '/api/test',
      originalUrl: '/api/test',
      url: '/api/test',
      headers: {
        'user-agent': 'test-agent',
        'content-length': '100',
      },
      query: {},
      body: {},
      params: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      get: (header: string) => overrides.headers?.[header.toLowerCase()] || '',
      ...overrides,
    } as Request;
  };

  describe('validateRequest', () => {
    const defaultConfig = {
      enableSignatureValidation: false,
      enableTimestampValidation: false,
      enableNonceValidation: false,
      timestampToleranceMs: 300000, // 5 minutes
      requiredHeaders: [],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxBodySize: 1024 * 1024, // 1MB
    };

    it('should validate a basic request successfully', () => {
      const req = createMockRequest();
      const result = requestValidator.validateRequest(req, defaultConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.riskLevel).toBe('low');
    });

    it('should reject disallowed HTTP methods', () => {
      const req = createMockRequest({ method: 'PATCH' });
      const config = { ...defaultConfig, allowedMethods: ['GET', 'POST'] };
      
      const result = requestValidator.validateRequest(req, config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('HTTP method PATCH not allowed');
      expect(result.riskLevel).toBe('medium');
    });

    it('should check for required headers', () => {
      const req = createMockRequest();
      const config = { ...defaultConfig, requiredHeaders: ['Authorization', 'X-API-Key'] };
      
      const result = requestValidator.validateRequest(req, config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Required header missing: Authorization');
      expect(result.errors).toContain('Required header missing: X-API-Key');
    });

    it('should validate content length', () => {
      const req = createMockRequest({
        headers: { 'content-length': '2000000' } // 2MB
      });
      const config = { ...defaultConfig, maxBodySize: 1024 * 1024 }; // 1MB limit
      
      const result = requestValidator.validateRequest(req, config);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Request body too large');
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('timestamp validation', () => {
    const configWithTimestamp = {
      enableSignatureValidation: false,
      enableTimestampValidation: true,
      enableNonceValidation: false,
      timestampToleranceMs: 300000, // 5 minutes
      requiredHeaders: [],
      allowedMethods: ['GET', 'POST'],
      maxBodySize: 1024 * 1024,
    };

    it('should validate valid timestamp', () => {
      const now = Date.now();
      const req = createMockRequest({
        headers: { 'x-timestamp': now.toString() }
      });
      
      const result = requestValidator.validateRequest(req, configWithTimestamp);

      expect(result.isValid).toBe(true);
    });

    it('should reject missing timestamp', () => {
      const req = createMockRequest();
      
      const result = requestValidator.validateRequest(req, configWithTimestamp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing timestamp header (x-timestamp)');
    });

    it('should reject invalid timestamp format', () => {
      const req = createMockRequest({
        headers: { 'x-timestamp': 'invalid-timestamp' }
      });
      
      const result = requestValidator.validateRequest(req, configWithTimestamp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid timestamp format');
    });

    it('should reject timestamp outside tolerance', () => {
      const oldTimestamp = Date.now() - 600000; // 10 minutes ago
      const req = createMockRequest({
        headers: { 'x-timestamp': oldTimestamp.toString() }
      });
      
      const result = requestValidator.validateRequest(req, configWithTimestamp);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Request timestamp outside tolerance');
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('nonce validation', () => {
    const configWithNonce = {
      enableSignatureValidation: false,
      enableTimestampValidation: false,
      enableNonceValidation: true,
      timestampToleranceMs: 300000,
      requiredHeaders: [],
      allowedMethods: ['GET', 'POST'],
      maxBodySize: 1024 * 1024,
    };

    it('should validate valid nonce', () => {
      const req = createMockRequest({
        headers: { 'x-nonce': 'valid-nonce-12345678' }
      });
      
      const result = requestValidator.validateRequest(req, configWithNonce);

      expect(result.isValid).toBe(true);
    });

    it('should reject missing nonce', () => {
      const req = createMockRequest();
      
      const result = requestValidator.validateRequest(req, configWithNonce);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing nonce header (x-nonce)');
    });

    it('should reject short nonce', () => {
      const req = createMockRequest({
        headers: { 'x-nonce': 'short' }
      });
      
      const result = requestValidator.validateRequest(req, configWithNonce);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Nonce too short (minimum 16 characters)');
    });

    it('should reject reused nonce', () => {
      const nonce = 'reused-nonce-12345678';
      const req1 = createMockRequest({
        headers: { 'x-nonce': nonce }
      });
      const req2 = createMockRequest({
        headers: { 'x-nonce': nonce }
      });
      
      // First request should pass
      const result1 = requestValidator.validateRequest(req1, configWithNonce);
      expect(result1.isValid).toBe(true);
      
      // Second request with same nonce should fail
      const result2 = requestValidator.validateRequest(req2, configWithNonce);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Nonce already used (replay attack detected)');
      expect(result2.riskLevel).toBe('critical');
    });
  });

  describe('signature validation', () => {
    const configWithSignature = {
      enableSignatureValidation: true,
      enableTimestampValidation: false,
      enableNonceValidation: false,
      timestampToleranceMs: 300000,
      requiredHeaders: [],
      allowedMethods: ['GET', 'POST'],
      maxBodySize: 1024 * 1024,
    };

    beforeEach(() => {
      // Set signing key for tests
      process.env.API_SIGNING_KEY = 'test-signing-key';
    });

    it('should validate correct signature', () => {
      const timestamp = Date.now().toString();
      const signature = requestValidator.generateRequestSignature('GET', '/api/test', '', timestamp);
      
      const req = createMockRequest({
        headers: {
          'x-signature': `sha256=${signature}`,
          'x-timestamp': timestamp
        }
      });
      
      const result = requestValidator.validateRequest(req, configWithSignature);

      expect(result.isValid).toBe(true);
    });

    it('should reject missing signature', () => {
      const req = createMockRequest({
        headers: { 'x-timestamp': Date.now().toString() }
      });
      
      const result = requestValidator.validateRequest(req, configWithSignature);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing signature header (x-signature)');
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject invalid signature', () => {
      const req = createMockRequest({
        headers: {
          'x-signature': 'sha256=invalid-signature',
          'x-timestamp': Date.now().toString()
        }
      });
      
      const result = requestValidator.validateRequest(req, configWithSignature);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid request signature');
      expect(result.riskLevel).toBe('critical');
    });
  });

  describe('security checks', () => {
    const defaultConfig = {
      enableSignatureValidation: false,
      enableTimestampValidation: false,
      enableNonceValidation: false,
      timestampToleranceMs: 300000,
      requiredHeaders: [],
      allowedMethods: ['GET', 'POST'],
      maxBodySize: 1024 * 1024,
    };

    it('should detect suspicious user agents', () => {
      const req = createMockRequest({
        headers: { 'user-agent': 'curl/7.68.0' }
      });
      
      const result = requestValidator.validateRequest(req, defaultConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Suspicious user agent detected');
      expect(result.riskLevel).toBe('medium');
    });

    it('should detect SQL injection in query parameters', () => {
      const req = createMockRequest({
        query: { search: "'; DROP TABLE users; --" }
      });
      
      const result = requestValidator.validateRequest(req, defaultConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Potential SQL injection attempt detected in query parameters');
      expect(result.riskLevel).toBe('high');
    });

    it('should detect XSS in request body', () => {
      const req = createMockRequest({
        body: { content: '<script>alert("xss")</script>' }
      });
      
      const result = requestValidator.validateRequest(req, defaultConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Potential XSS attempt detected in request body');
      expect(result.riskLevel).toBe('high');
    });

    it('should detect path traversal attempts', () => {
      const req = createMockRequest({
        originalUrl: '/api/../../../etc/passwd'
      });
      
      const result = requestValidator.validateRequest(req, defaultConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Potential path traversal attempt detected');
      expect(result.riskLevel).toBe('high');
    });

    it('should detect excessive headers', () => {
      const headers: any = { 'user-agent': 'test' };
      // Add 60 headers to exceed the limit of 50
      for (let i = 0; i < 60; i++) {
        headers[`custom-header-${i}`] = `value-${i}`;
      }
      
      const req = createMockRequest({ headers });
      
      const result = requestValidator.validateRequest(req, defaultConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Excessive header count');
      expect(result.riskLevel).toBe('medium');
    });
  });

  describe('utility methods', () => {
    it('should generate secure nonce', () => {
      const nonce1 = requestValidator.generateNonce();
      const nonce2 = requestValidator.generateNonce();
      
      expect(nonce1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(nonce2).toHaveLength(64);
      expect(nonce1).not.toBe(nonce2);
    });

    it('should generate request signature', () => {
      process.env.API_SIGNING_KEY = 'test-key';
      
      const signature = requestValidator.generateRequestSignature('POST', '/api/test', '{"data":"test"}', '1234567890');
      
      expect(signature).toBeDefined();
      expect(signature).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should get validation statistics', () => {
      const stats = requestValidator.getValidationStatistics();
      
      expect(stats).toHaveProperty('nonceCacheSize');
      expect(stats).toHaveProperty('cleanupIntervalActive');
      expect(typeof stats.nonceCacheSize).toBe('number');
      expect(typeof stats.cleanupIntervalActive).toBe('boolean');
    });
  });
});