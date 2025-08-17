import * as https from 'https';
import * as crypto from 'crypto';
import { EncryptionService } from '../security/encryption.service';
import { AuditLoggerService } from '../security/audit-logger.service';

export interface TransmissionConfig {
  enableTLS: boolean;
  minTLSVersion: string;
  cipherSuites: string[];
  enableCertificatePinning: boolean;
  pinnedCertificates: string[];
  enableHSTS: boolean;
  hstsMaxAge: number;
  enableEndToEndEncryption: boolean;
  compressionEnabled: boolean;
  timeoutMs: number;
}

export interface SecureTransmissionResult {
  success: boolean;
  statusCode?: number;
  headers?: any;
  data?: any;
  error?: string;
  transmissionId: string;
  encryptedPayload?: boolean;
  tlsVersion?: string;
  cipherSuite?: string;
  certificateValid?: boolean;
}

export interface TransmissionLog {
  id: string;
  timestamp: Date;
  destination: string;
  method: string;
  dataSize: number;
  encrypted: boolean;
  tlsVersion?: string;
  success: boolean;
  error?: string;
  duration: number;
}

export class SecureTransmissionService {
  private transmissionLogs: TransmissionLog[] = [];
  private pinnedCertificates: Set<string> = new Set();
  private defaultConfig: TransmissionConfig;

  constructor(
    private encryption: EncryptionService,
    private auditLogger: AuditLoggerService
  ) {
    this.defaultConfig = {
      enableTLS: true,
      minTLSVersion: 'TLSv1.2',
      cipherSuites: [
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-SHA384',
        'ECDHE-RSA-AES128-SHA256',
      ],
      enableCertificatePinning: false,
      pinnedCertificates: [],
      enableHSTS: true,
      hstsMaxAge: 31536000, // 1 year
      enableEndToEndEncryption: true,
      compressionEnabled: false, // Disabled for security (CRIME/BREACH attacks)
      timeoutMs: 30000,
    };

    this.initializePinnedCertificates();
  }

  /**
   * Send secure HTTP request
   */
  async sendSecureRequest(
    url: string,
    options: {
      method?: string;
      headers?: any;
      data?: any;
      config?: Partial<TransmissionConfig>;
    } = {}
  ): Promise<SecureTransmissionResult> {
    const transmissionId = this.generateTransmissionId();
    const startTime = Date.now();
    const config = { ...this.defaultConfig, ...options.config };

    try {
      // Prepare request data
      let payload = options.data;
      let encryptedPayload = false;

      if (payload && config.enableEndToEndEncryption) {
        payload = this.encryption.encryptPII(payload);
        encryptedPayload = true;
      }

      // Configure HTTPS agent
      const httpsAgent = this.createSecureAgent(config);

      // Prepare request options
      const requestOptions = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'UFC-Platform-SecureClient/1.0',
          ...options.headers,
        },
        agent: httpsAgent,
        timeout: config.timeoutMs,
      };

      // Add HSTS header for responses
      if (config.enableHSTS) {
        requestOptions.headers['Strict-Transport-Security'] = 
          `max-age=${config.hstsMaxAge}; includeSubDomains; preload`;
      }

      // Make the request
      const result = await this.makeHttpsRequest(url, requestOptions, payload);

      // Log successful transmission
      this.logTransmission({
        id: transmissionId,
        timestamp: new Date(),
        destination: url,
        method: requestOptions.method,
        dataSize: payload ? JSON.stringify(payload).length : 0,
        encrypted: encryptedPayload,
        tlsVersion: result.tlsVersion,
        success: true,
        duration: Date.now() - startTime,
      });

      // Audit log
      this.auditLogger.logEvent({
        action: 'secure_transmission_success',
        resource: 'secure_transmission',
        method: requestOptions.method,
        endpoint: url,
        success: true,
        details: {
          transmissionId,
          encryptedPayload,
          tlsVersion: result.tlsVersion,
          cipherSuite: result.cipherSuite,
          dataSize: payload ? JSON.stringify(payload).length : 0,
        },
        riskLevel: 'low',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'secure-transmission-service',
      });

      return {
        success: true,
        statusCode: result.statusCode,
        headers: result.headers,
        data: result.data,
        transmissionId,
        encryptedPayload,
        tlsVersion: result.tlsVersion,
        cipherSuite: result.cipherSuite,
        certificateValid: result.certificateValid,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failed transmission
      this.logTransmission({
        id: transmissionId,
        timestamp: new Date(),
        destination: url,
        method: options.method || 'GET',
        dataSize: payload ? JSON.stringify(payload).length : 0,
        encrypted: false,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      // Audit log
      this.auditLogger.logEvent({
        action: 'secure_transmission_failed',
        resource: 'secure_transmission',
        method: options.method || 'GET',
        endpoint: url,
        success: false,
        details: {
          transmissionId,
          error: errorMessage,
        },
        riskLevel: 'high',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'secure-transmission-service',
      });

      return {
        success: false,
        error: errorMessage,
        transmissionId,
        encryptedPayload: false,
      };
    }
  }

  /**
   * Validate SSL/TLS certificate
   */
  validateCertificate(certificate: any, hostname: string): boolean {
    try {
      // Check certificate expiration
      const now = new Date();
      const notBefore = new Date(certificate.valid_from);
      const notAfter = new Date(certificate.valid_to);

      if (now < notBefore || now > notAfter) {
        return false;
      }

      // Check hostname
      if (certificate.subject && certificate.subject.CN !== hostname) {
        // Check Subject Alternative Names
        if (certificate.subjectaltname) {
          const altNames = certificate.subjectaltname.split(', ');
          const hostnameMatch = altNames.some((name: string) => 
            name.includes(hostname) || name.includes(`*.${hostname.split('.').slice(1).join('.')}`)
          );
          if (!hostnameMatch) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Check certificate pinning if enabled
      if (this.pinnedCertificates.size > 0) {
        const fingerprint = this.getCertificateFingerprint(certificate);
        if (!this.pinnedCertificates.has(fingerprint)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Encrypt data for transmission
   */
  encryptForTransmission(data: any, recipientPublicKey?: string): string {
    if (recipientPublicKey) {
      // Use recipient's public key for encryption
      return this.encryptWithPublicKey(data, recipientPublicKey);
    } else {
      // Use symmetric encryption
      return this.encryption.encryptPII(data);
    }
  }

  /**
   * Decrypt received data
   */
  decryptFromTransmission(encryptedData: string, senderPublicKey?: string): any {
    if (senderPublicKey) {
      // Verify signature and decrypt
      return this.decryptWithPublicKey(encryptedData, senderPublicKey);
    } else {
      // Use symmetric decryption
      return this.encryption.decryptPII(encryptedData);
    }
  }

  /**
   * Generate secure headers for API responses
   */
  getSecureHeaders(): { [key: string]: string } {
    return {
      'Strict-Transport-Security': `max-age=${this.defaultConfig.hstsMaxAge}; includeSubDomains; preload`,
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    };
  }

  /**
   * Create secure HTTPS agent
   */
  private createSecureAgent(config: TransmissionConfig): https.Agent {
    const agentOptions: any = {
      keepAlive: true,
      maxSockets: 10,
      timeout: config.timeoutMs,
    };

    if (config.enableTLS) {
      agentOptions.secureProtocol = this.getSecureProtocol(config.minTLSVersion);
      agentOptions.ciphers = config.cipherSuites.join(':');
      agentOptions.honorCipherOrder = true;
      agentOptions.secureOptions = crypto.constants.SSL_OP_NO_SSLv2 | 
                                   crypto.constants.SSL_OP_NO_SSLv3 | 
                                   crypto.constants.SSL_OP_NO_TLSv1 |
                                   crypto.constants.SSL_OP_NO_TLSv1_1;

      // Certificate validation
      agentOptions.checkServerIdentity = (hostname: string, cert: any) => {
        if (!this.validateCertificate(cert, hostname)) {
          throw new Error(`Certificate validation failed for ${hostname}`);
        }
        return undefined;
      };
    }

    return new https.Agent(agentOptions);
  }

  /**
   * Make HTTPS request with security measures
   */
  private async makeHttpsRequest(
    url: string, 
    options: any, 
    data?: any
  ): Promise<{
    statusCode: number;
    headers: any;
    data: any;
    tlsVersion?: string;
    cipherSuite?: string;
    certificateValid: boolean;
  }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        ...options,
      };

      const req = https.request(requestOptions, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = responseData ? JSON.parse(responseData) : null;
            
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              data: parsedData,
              tlsVersion: (res.socket as any)?.getProtocol?.(),
              cipherSuite: (res.socket as any)?.getCipher?.()?.name,
              certificateValid: true, // If we got here, certificate was valid
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              data: responseData,
              tlsVersion: (res.socket as any)?.getProtocol?.(),
              cipherSuite: (res.socket as any)?.getCipher?.()?.name,
              certificateValid: true,
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Get secure protocol string
   */
  private getSecureProtocol(minVersion: string): string {
    const protocolMap: { [key: string]: string } = {
      'TLSv1.2': 'TLSv1_2_method',
      'TLSv1.3': 'TLSv1_3_method',
    };
    
    return protocolMap[minVersion] || 'TLSv1_2_method';
  }

  /**
   * Get certificate fingerprint
   */
  private getCertificateFingerprint(certificate: any): string {
    const der = certificate.raw || certificate.der;
    if (!der) return '';
    
    return crypto.createHash('sha256').update(der).digest('hex');
  }

  /**
   * Encrypt with public key
   */
  private encryptWithPublicKey(data: any, publicKey: string): string {
    const dataString = JSON.stringify(data);
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(dataString)
    );
    
    return encrypted.toString('base64');
  }

  /**
   * Decrypt with public key (for signature verification)
   */
  private decryptWithPublicKey(encryptedData: string, publicKey: string): any {
    try {
      const decrypted = crypto.publicDecrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(encryptedData, 'base64')
      );
      
      return JSON.parse(decrypted.toString());
    } catch (error) {
      throw new Error('Failed to decrypt data with public key');
    }
  }

  /**
   * Initialize pinned certificates
   */
  private initializePinnedCertificates(): void {
    // In a real implementation, these would be loaded from configuration
    const pinnedCerts = process.env.PINNED_CERTIFICATES?.split(',') || [];
    pinnedCerts.forEach(cert => {
      this.pinnedCertificates.add(cert.trim());
    });
  }

  /**
   * Log transmission
   */
  private logTransmission(log: TransmissionLog): void {
    this.transmissionLogs.push(log);
    
    // Keep only last 1000 logs
    if (this.transmissionLogs.length > 1000) {
      this.transmissionLogs = this.transmissionLogs.slice(-1000);
    }
  }

  /**
   * Generate transmission ID
   */
  private generateTransmissionId(): string {
    return `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get transmission logs
   */
  getTransmissionLogs(limit: number = 100): TransmissionLog[] {
    return this.transmissionLogs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get transmission statistics
   */
  getTransmissionStatistics(): {
    totalTransmissions: number;
    successfulTransmissions: number;
    failedTransmissions: number;
    encryptedTransmissions: number;
    averageDuration: number;
    successRate: number;
  } {
    const total = this.transmissionLogs.length;
    const successful = this.transmissionLogs.filter(log => log.success).length;
    const encrypted = this.transmissionLogs.filter(log => log.encrypted).length;
    const totalDuration = this.transmissionLogs.reduce((sum, log) => sum + log.duration, 0);

    return {
      totalTransmissions: total,
      successfulTransmissions: successful,
      failedTransmissions: total - successful,
      encryptedTransmissions: encrypted,
      averageDuration: total > 0 ? totalDuration / total : 0,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  /**
   * Update transmission configuration
   */
  updateConfig(config: Partial<TransmissionConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    
    this.auditLogger.logEvent({
      action: 'transmission_config_updated',
      resource: 'secure_transmission',
      method: 'PUT',
      endpoint: '/transmission/config',
      success: true,
      details: {
        updatedFields: Object.keys(config),
      },
      riskLevel: 'medium',
      category: 'system',
      ipAddress: 'system',
      userAgent: 'secure-transmission-service',
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.transmissionLogs = [];
    this.pinnedCertificates.clear();
  }
}