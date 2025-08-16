import { EncryptionService } from '../encryption.service';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  const testKey = 'a'.repeat(64); // 32 bytes in hex

  beforeEach(() => {
    encryptionService = new EncryptionService(testKey);
  });

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt data successfully', () => {
      const plaintext = 'This is sensitive data';
      
      const encrypted = encryptionService.encrypt(plaintext);
      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt with salt', () => {
      const plaintext = 'This is sensitive data with salt';
      
      const encrypted = encryptionService.encrypt(plaintext, true);
      expect(encrypted.salt).toBeDefined();
      
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt without salt', () => {
      const plaintext = 'This is sensitive data without salt';
      
      const encrypted = encryptionService.encrypt(plaintext, false);
      expect(encrypted.salt).toBeUndefined();
      
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted values for same plaintext', () => {
      const plaintext = 'Same plaintext';
      
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);
      
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Unicode: 🔒 安全 مأمون';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for invalid encrypted data', () => {
      const invalidEncrypted = {
        encrypted: 'invalid',
        iv: 'invalid',
        tag: 'invalid',
      };
      
      expect(() => {
        encryptionService.decrypt(invalidEncrypted);
      }).toThrow('Decryption failed');
    });
  });

  describe('Hashing', () => {
    it('should hash data with generated salt', () => {
      const data = 'password123';
      
      const result = encryptionService.hash(data);
      
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.hash.length).toBe(128); // 64 bytes in hex
      expect(result.salt.length).toBe(64); // 32 bytes in hex
    });

    it('should hash data with provided salt', () => {
      const data = 'password123';
      const salt = 'a'.repeat(64);
      
      const result = encryptionService.hash(data, salt);
      
      expect(result.hash).toBeDefined();
      expect(result.salt).toBe(salt);
    });

    it('should produce same hash for same data and salt', () => {
      const data = 'password123';
      const salt = 'a'.repeat(64);
      
      const result1 = encryptionService.hash(data, salt);
      const result2 = encryptionService.hash(data, salt);
      
      expect(result1.hash).toBe(result2.hash);
    });

    it('should produce different hashes for different salts', () => {
      const data = 'password123';
      
      const result1 = encryptionService.hash(data);
      const result2 = encryptionService.hash(data);
      
      expect(result1.hash).not.toBe(result2.hash);
      expect(result1.salt).not.toBe(result2.salt);
    });
  });

  describe('Hash Verification', () => {
    it('should verify correct hash', () => {
      const data = 'password123';
      const { hash, salt } = encryptionService.hash(data);
      
      const isValid = encryptionService.verifyHash(data, hash, salt);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const data = 'password123';
      const wrongData = 'wrongpassword';
      const { hash, salt } = encryptionService.hash(data);
      
      const isValid = encryptionService.verifyHash(wrongData, hash, salt);
      expect(isValid).toBe(false);
    });

    it('should reject incorrect salt', () => {
      const data = 'password123';
      const { hash } = encryptionService.hash(data);
      const wrongSalt = 'b'.repeat(64);
      
      const isValid = encryptionService.verifyHash(data, hash, wrongSalt);
      expect(isValid).toBe(false);
    });

    it('should handle invalid hash gracefully', () => {
      const data = 'password123';
      const invalidHash = 'invalid';
      const salt = 'a'.repeat(64);
      
      const isValid = encryptionService.verifyHash(data, invalidHash, salt);
      expect(isValid).toBe(false);
    });
  });

  describe('Token Generation', () => {
    it('should generate token with default length', () => {
      const token = encryptionService.generateToken();
      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes in hex
    });

    it('should generate token with custom length', () => {
      const token = encryptionService.generateToken(16);
      expect(token).toBeDefined();
      expect(token.length).toBe(32); // 16 bytes in hex
    });

    it('should generate different tokens', () => {
      const token1 = encryptionService.generateToken();
      const token2 = encryptionService.generateToken();
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('PII Encryption', () => {
    it('should encrypt and decrypt PII data', () => {
      const piiData = {
        email: 'user@example.com',
        phone: '+1234567890',
        address: '123 Main St',
      };
      
      const encrypted = encryptionService.encryptPII(piiData);
      expect(typeof encrypted).toBe('string');
      
      const decrypted = encryptionService.decryptPII(encrypted);
      expect(decrypted).toEqual(piiData);
    });

    it('should handle complex PII objects', () => {
      const piiData = {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
        },
        contactInfo: {
          email: 'john.doe@example.com',
          phone: '+1234567890',
          addresses: [
            { type: 'home', street: '123 Main St', city: 'Anytown' },
            { type: 'work', street: '456 Office Blvd', city: 'Business City' },
          ],
        },
      };
      
      const encrypted = encryptionService.encryptPII(piiData);
      const decrypted = encryptionService.decryptPII(encrypted);
      
      expect(decrypted).toEqual(piiData);
    });

    it('should throw error for invalid PII data', () => {
      const invalidEncrypted = 'invalid-json';
      
      expect(() => {
        encryptionService.decryptPII(invalidEncrypted);
      }).toThrow('PII decryption failed');
    });
  });

  describe('Data Masking', () => {
    it('should mask data with default visible characters', () => {
      const data = 'sensitive123456';
      const masked = encryptionService.maskSensitiveData(data);
      
      expect(masked).toBe('sens*******3456');
    });

    it('should mask data with custom visible characters', () => {
      const data = 'sensitive123456';
      const masked = encryptionService.maskSensitiveData(data, 2);
      
      expect(masked).toBe('se***********56');
    });

    it('should handle short data', () => {
      const data = 'short';
      const masked = encryptionService.maskSensitiveData(data);
      
      expect(masked).toBe('*****');
    });

    it('should handle very short data', () => {
      const data = 'ab';
      const masked = encryptionService.maskSensitiveData(data, 4);
      
      expect(masked).toBe('**');
    });

    it('should handle empty string', () => {
      const data = '';
      const masked = encryptionService.maskSensitiveData(data);
      
      expect(masked).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should generate key when no encryption key provided', () => {
      // Mock environment to not have encryption key
      const originalEnv = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      
      const service = new EncryptionService();
      expect(service).toBeDefined();
      
      // Should be able to encrypt/decrypt
      const plaintext = 'test';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
      
      // Restore environment
      if (originalEnv) {
        process.env.ENCRYPTION_KEY = originalEnv;
      }
    });
  });
});