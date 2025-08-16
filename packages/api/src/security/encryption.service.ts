import * as crypto from 'crypto';

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength: number;
  saltLength: number;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt?: string;
}

export class EncryptionService {
  private readonly config: EncryptionConfig;
  private readonly masterKey: string;

  constructor(masterKey?: string) {
    this.config = {
      algorithm: 'aes-256-cbc',
      keyLength: 32,
      ivLength: 16,
      tagLength: 16,
      saltLength: 32,
    };
    
    this.masterKey = masterKey || process.env.ENCRYPTION_KEY || '';
    
    if (!this.masterKey) {
      this.masterKey = this.generateKey();
    }
  }

  /**
   * Generate a random encryption key
   */
  private generateKey(): string {
    return crypto.randomBytes(this.config.keyLength).toString('hex');
  }

  /**
   * Derive key from master key and salt using PBKDF2
   */
  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000, // iterations
      this.config.keyLength,
      'sha256'
    );
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext: string, useSalt: boolean = true): EncryptedData {
    try {
      const iv = crypto.randomBytes(this.config.ivLength);
      let key: Buffer;
      let salt: Buffer | undefined;

      if (useSalt) {
        salt = crypto.randomBytes(this.config.saltLength);
        key = this.deriveKey(salt);
      } else {
        key = Buffer.from(this.masterKey, 'hex');
      }

      const cipher = crypto.createCipher(this.config.algorithm, key);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: '', // Not used with CBC
        salt: salt?.toString('hex'),
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      let key: Buffer;

      if (encryptedData.salt) {
        const salt = Buffer.from(encryptedData.salt, 'hex');
        key = this.deriveKey(salt);
      } else {
        key = Buffer.from(this.masterKey, 'hex');
      }

      const decipher = crypto.createDecipher(this.config.algorithm, key);

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  hash(data: string, salt?: string): { hash: string; salt: string } {
    const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(this.config.saltLength);
    const hash = crypto.pbkdf2Sync(data, saltBuffer, 100000, 64, 'sha256');
    
    return {
      hash: hash.toString('hex'),
      salt: saltBuffer.toString('hex'),
    };
  }

  /**
   * Verify hashed data
   */
  verifyHash(data: string, hash: string, salt: string): boolean {
    try {
      const { hash: computedHash } = this.hash(data, salt);
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(computedHash, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt user PII data
   */
  encryptPII(data: any): string {
    const jsonString = JSON.stringify(data);
    const encrypted = this.encrypt(jsonString, true);
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt user PII data
   */
  decryptPII(encryptedString: string): any {
    try {
      const encryptedData = JSON.parse(encryptedString) as EncryptedData;
      const decryptedString = this.decrypt(encryptedData);
      return JSON.parse(decryptedString);
    } catch (error) {
      throw new Error(`PII decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mask sensitive data for logging
   */
  maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (data.length <= visibleChars * 2) {
      return '*'.repeat(data.length);
    }
    
    const start = data.substring(0, visibleChars);
    const end = data.substring(data.length - visibleChars);
    const middle = '*'.repeat(data.length - (visibleChars * 2));
    
    return `${start}${middle}${end}`;
  }
}