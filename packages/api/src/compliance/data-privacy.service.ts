import { EncryptionService } from '../security/encryption.service';
import { AuditLoggerService } from '../security/audit-logger.service';

export interface UserDataRecord {
  id: string;
  userId: string;
  dataType: 'personal' | 'behavioral' | 'preference' | 'financial' | 'biometric';
  data: any;
  encryptedData?: string;
  createdAt: Date;
  lastAccessed?: Date;
  retentionPeriod: number; // in milliseconds
  consentGiven: boolean;
  consentDate?: Date;
  consentWithdrawn?: boolean;
  consentWithdrawalDate?: Date;
  processingPurpose: string[];
  dataSource: string;
  isAnonymized: boolean;
  anonymizedAt?: Date;
}

export interface DataRetentionPolicy {
  id: string;
  name: string;
  dataTypes: string[];
  retentionPeriod: number; // in milliseconds
  autoDelete: boolean;
  anonymizeAfter?: number; // in milliseconds
  description: string;
  legalBasis: string;
  isActive: boolean;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: 'data_processing' | 'marketing' | 'analytics' | 'third_party_sharing';
  granted: boolean;
  grantedAt?: Date;
  withdrawnAt?: Date;
  ipAddress: string;
  userAgent: string;
  consentVersion: string;
  processingPurposes: string[];
  dataTypes: string[];
}

export interface DataExportRequest {
  id: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: 'json' | 'csv' | 'xml';
  includeDeleted: boolean;
  dataTypes?: string[];
  error?: string;
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  deletionType: 'soft' | 'hard' | 'anonymize';
  dataTypes?: string[];
  retainForLegal: boolean;
  error?: string;
}

export class DataPrivacyService {
  private userDataRecords: Map<string, UserDataRecord[]> = new Map();
  private retentionPolicies: Map<string, DataRetentionPolicy> = new Map();
  private consentRecords: Map<string, ConsentRecord[]> = new Map();
  private exportRequests: Map<string, DataExportRequest> = new Map();
  private deletionRequests: Map<string, DataDeletionRequest> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private encryption: EncryptionService,
    private auditLogger: AuditLoggerService
  ) {
    this.initializeDefaultPolicies();
    this.setupCleanupScheduler();
  }

  /**
   * Store user data with privacy compliance
   */
  storeUserData(record: Omit<UserDataRecord, 'id' | 'encryptedData'>): string {
    const recordId = this.generateId();
    
    // Encrypt sensitive data
    const encryptedData = this.encryption.encryptPII(record.data);
    
    const userDataRecord: UserDataRecord = {
      ...record,
      id: recordId,
      encryptedData,
      data: undefined, // Remove plain data after encryption
    };

    // Store record
    const userRecords = this.userDataRecords.get(record.userId) || [];
    userRecords.push(userDataRecord);
    this.userDataRecords.set(record.userId, userRecords);

    // Log data storage
    this.auditLogger.logEvent({
      userId: record.userId,
      action: 'data_stored',
      resource: 'user_data',
      method: 'POST',
      endpoint: '/privacy/data',
      success: true,
      details: {
        recordId,
        dataType: record.dataType,
        processingPurpose: record.processingPurpose,
        consentGiven: record.consentGiven,
      },
      riskLevel: 'medium',
      category: 'data_modification',
      ipAddress: 'system',
      userAgent: 'data-privacy-service',
    });

    return recordId;
  }

  /**
   * Retrieve user data with access logging
   */
  getUserData(userId: string, dataTypes?: string[]): UserDataRecord[] {
    const userRecords = this.userDataRecords.get(userId) || [];
    
    let filteredRecords = userRecords;
    if (dataTypes) {
      filteredRecords = userRecords.filter(record => 
        dataTypes.includes(record.dataType)
      );
    }

    // Decrypt data for authorized access
    const decryptedRecords = filteredRecords.map(record => {
      if (record.encryptedData) {
        try {
          const decryptedData = this.encryption.decryptPII(record.encryptedData);
          return {
            ...record,
            data: decryptedData,
            lastAccessed: new Date(),
          };
        } catch (error) {
          this.auditLogger.logEvent({
            userId,
            action: 'data_decryption_failed',
            resource: 'user_data',
            method: 'GET',
            endpoint: '/privacy/data',
            success: false,
            details: {
              recordId: record.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            riskLevel: 'high',
            category: 'data_access',
            ipAddress: 'system',
            userAgent: 'data-privacy-service',
          });
          return record; // Return encrypted record if decryption fails
        }
      }
      return record;
    });

    // Log data access
    this.auditLogger.logEvent({
      userId,
      action: 'data_accessed',
      resource: 'user_data',
      method: 'GET',
      endpoint: '/privacy/data',
      success: true,
      details: {
        recordCount: decryptedRecords.length,
        dataTypes: dataTypes || 'all',
      },
      riskLevel: 'medium',
      category: 'data_access',
      ipAddress: 'system',
      userAgent: 'data-privacy-service',
    });

    return decryptedRecords;
  }

  /**
   * Record user consent
   */
  recordConsent(consent: Omit<ConsentRecord, 'id'>): string {
    const consentId = this.generateId();
    
    const consentRecord: ConsentRecord = {
      ...consent,
      id: consentId,
    };

    const userConsents = this.consentRecords.get(consent.userId) || [];
    userConsents.push(consentRecord);
    this.consentRecords.set(consent.userId, userConsents);

    // Log consent recording
    this.auditLogger.logEvent({
      userId: consent.userId,
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
      action: consent.granted ? 'consent_granted' : 'consent_withdrawn',
      resource: 'consent',
      method: 'POST',
      endpoint: '/privacy/consent',
      success: true,
      details: {
        consentId,
        consentType: consent.consentType,
        processingPurposes: consent.processingPurposes,
        dataTypes: consent.dataTypes,
      },
      riskLevel: 'medium',
      category: 'compliance',
    });

    return consentId;
  }

  /**
   * Check if user has given consent for specific processing
   */
  hasConsent(userId: string, consentType: string, processingPurpose: string): boolean {
    const userConsents = this.consentRecords.get(userId) || [];
    
    // Find the most recent consent for this type
    const relevantConsents = userConsents
      .filter(consent => 
        consent.consentType === consentType &&
        consent.processingPurposes.includes(processingPurpose)
      )
      .sort((a, b) => {
        // Sort by the most recent action (granted or withdrawn)
        const aDate = a.withdrawnAt || a.grantedAt || new Date(0);
        const bDate = b.withdrawnAt || b.grantedAt || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

    if (relevantConsents.length === 0) {
      return false;
    }

    const latestConsent = relevantConsents[0];
    
    // If consent was withdrawn, return false
    if (latestConsent.withdrawnAt) {
      return false;
    }
    
    // Otherwise, return the granted status
    return latestConsent.granted;
  }

  /**
   * Create data export request (GDPR Article 20)
   */
  createDataExportRequest(request: Omit<DataExportRequest, 'id' | 'status'>): string {
    const requestId = this.generateId();
    
    const exportRequest: DataExportRequest = {
      ...request,
      id: requestId,
      status: 'pending',
    };

    this.exportRequests.set(requestId, exportRequest);

    // Log export request
    this.auditLogger.logEvent({
      userId: request.userId,
      action: 'data_export_requested',
      resource: 'data_export',
      method: 'POST',
      endpoint: '/privacy/export',
      success: true,
      details: {
        requestId,
        format: request.format,
        includeDeleted: request.includeDeleted,
        dataTypes: request.dataTypes,
      },
      riskLevel: 'high',
      category: 'data_access',
      ipAddress: 'system',
      userAgent: 'data-privacy-service',
    });

    // Process export asynchronously
    this.processDataExport(requestId);

    return requestId;
  }

  /**
   * Create data deletion request (GDPR Article 17)
   */
  createDataDeletionRequest(request: Omit<DataDeletionRequest, 'id' | 'status'>): string {
    const requestId = this.generateId();
    
    const deletionRequest: DataDeletionRequest = {
      ...request,
      id: requestId,
      status: 'pending',
    };

    this.deletionRequests.set(requestId, deletionRequest);

    // Log deletion request
    this.auditLogger.logEvent({
      userId: request.userId,
      action: 'data_deletion_requested',
      resource: 'data_deletion',
      method: 'POST',
      endpoint: '/privacy/delete',
      success: true,
      details: {
        requestId,
        deletionType: request.deletionType,
        dataTypes: request.dataTypes,
        retainForLegal: request.retainForLegal,
      },
      riskLevel: 'critical',
      category: 'data_modification',
      ipAddress: 'system',
      userAgent: 'data-privacy-service',
    });

    // Process deletion asynchronously
    this.processDataDeletion(requestId);

    return requestId;
  }

  /**
   * Add data retention policy
   */
  addRetentionPolicy(policy: DataRetentionPolicy): void {
    this.retentionPolicies.set(policy.id, policy);

    this.auditLogger.logEvent({
      action: 'retention_policy_added',
      resource: 'retention_policy',
      method: 'POST',
      endpoint: '/privacy/retention-policy',
      success: true,
      details: {
        policyId: policy.id,
        dataTypes: policy.dataTypes,
        retentionPeriod: policy.retentionPeriod,
        autoDelete: policy.autoDelete,
      },
      riskLevel: 'medium',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'data-privacy-service',
    });
  }

  /**
   * Anonymize user data
   */
  anonymizeUserData(userId: string, dataTypes?: string[]): number {
    const userRecords = this.userDataRecords.get(userId) || [];
    let anonymizedCount = 0;

    const updatedRecords = userRecords.map(record => {
      if (dataTypes && !dataTypes.includes(record.dataType)) {
        return record;
      }

      if (!record.isAnonymized) {
        // Anonymize the data
        const anonymizedData = this.anonymizeData(record.data || 
          (record.encryptedData ? this.encryption.decryptPII(record.encryptedData) : {}));
        
        anonymizedCount++;
        return {
          ...record,
          data: anonymizedData,
          encryptedData: this.encryption.encryptPII(anonymizedData),
          isAnonymized: true,
          anonymizedAt: new Date(),
        };
      }

      return record;
    });

    this.userDataRecords.set(userId, updatedRecords);

    // Log anonymization
    this.auditLogger.logEvent({
      userId,
      action: 'data_anonymized',
      resource: 'user_data',
      method: 'PUT',
      endpoint: '/privacy/anonymize',
      success: true,
      details: {
        anonymizedCount,
        dataTypes: dataTypes || 'all',
      },
      riskLevel: 'high',
      category: 'data_modification',
      ipAddress: 'system',
      userAgent: 'data-privacy-service',
    });

    return anonymizedCount;
  }

  /**
   * Get data export request status
   */
  getExportRequestStatus(requestId: string): DataExportRequest | null {
    return this.exportRequests.get(requestId) || null;
  }

  /**
   * Get data deletion request status
   */
  getDeletionRequestStatus(requestId: string): DataDeletionRequest | null {
    return this.deletionRequests.get(requestId) || null;
  }

  /**
   * Get user consent history
   */
  getUserConsentHistory(userId: string): ConsentRecord[] {
    return this.consentRecords.get(userId) || [];
  }

  /**
   * Get retention policies
   */
  getRetentionPolicies(): DataRetentionPolicy[] {
    return Array.from(this.retentionPolicies.values());
  }

  /**
   * Process data export request
   */
  private async processDataExport(requestId: string): Promise<void> {
    const request = this.exportRequests.get(requestId);
    if (!request) return;

    try {
      request.status = 'processing';
      
      // Get user data
      const userData = this.getUserData(request.userId, request.dataTypes);
      
      // Include consent history
      const consentHistory = this.getUserConsentHistory(request.userId);
      
      const exportData = {
        userData,
        consentHistory,
        exportedAt: new Date().toISOString(),
        requestId,
      };

      // In a real implementation, you would save this to a file or send via email
      console.log(`Data export completed for request ${requestId}`);
      
      request.status = 'completed';
      request.completedAt = new Date();

      this.auditLogger.logEvent({
        userId: request.userId,
        action: 'data_export_completed',
        resource: 'data_export',
        method: 'PUT',
        endpoint: '/privacy/export',
        success: true,
        details: {
          requestId,
          recordCount: userData.length,
        },
        riskLevel: 'high',
        category: 'data_access',
        ipAddress: 'system',
        userAgent: 'data-privacy-service',
      });
    } catch (error) {
      request.status = 'failed';
      request.error = error instanceof Error ? error.message : 'Unknown error';

      this.auditLogger.logEvent({
        userId: request.userId,
        action: 'data_export_failed',
        resource: 'data_export',
        method: 'PUT',
        endpoint: '/privacy/export',
        success: false,
        details: {
          requestId,
          error: request.error,
        },
        riskLevel: 'high',
        category: 'data_access',
        ipAddress: 'system',
        userAgent: 'data-privacy-service',
      });
    }
  }

  /**
   * Process data deletion request
   */
  private async processDataDeletion(requestId: string): Promise<void> {
    const request = this.deletionRequests.get(requestId);
    if (!request) return;

    try {
      request.status = 'processing';
      
      const userRecords = this.userDataRecords.get(request.userId) || [];
      let deletedCount = 0;

      if (request.deletionType === 'hard') {
        // Permanently delete data
        const remainingRecords = userRecords.filter(record => {
          if (request.dataTypes && !request.dataTypes.includes(record.dataType)) {
            return true; // Keep records not in deletion scope
          }
          if (request.retainForLegal && this.isLegallyRequired(record)) {
            return true; // Keep legally required records
          }
          deletedCount++;
          return false; // Delete this record
        });
        
        this.userDataRecords.set(request.userId, remainingRecords);
      } else if (request.deletionType === 'anonymize') {
        // Anonymize instead of delete
        deletedCount = this.anonymizeUserData(request.userId, request.dataTypes);
      } else {
        // Soft delete - mark as deleted but keep for legal purposes
        const updatedRecords = userRecords.map(record => {
          if (request.dataTypes && !request.dataTypes.includes(record.dataType)) {
            return record;
          }
          deletedCount++;
          return {
            ...record,
            isDeleted: true,
            deletedAt: new Date(),
          } as any;
        });
        
        this.userDataRecords.set(request.userId, updatedRecords);
      }

      request.status = 'completed';
      request.completedAt = new Date();

      this.auditLogger.logEvent({
        userId: request.userId,
        action: 'data_deletion_completed',
        resource: 'data_deletion',
        method: 'DELETE',
        endpoint: '/privacy/delete',
        success: true,
        details: {
          requestId,
          deletedCount,
          deletionType: request.deletionType,
        },
        riskLevel: 'critical',
        category: 'data_modification',
        ipAddress: 'system',
        userAgent: 'data-privacy-service',
      });
    } catch (error) {
      request.status = 'failed';
      request.error = error instanceof Error ? error.message : 'Unknown error';

      this.auditLogger.logEvent({
        userId: request.userId,
        action: 'data_deletion_failed',
        resource: 'data_deletion',
        method: 'DELETE',
        endpoint: '/privacy/delete',
        success: false,
        details: {
          requestId,
          error: request.error,
        },
        riskLevel: 'critical',
        category: 'data_modification',
        ipAddress: 'system',
        userAgent: 'data-privacy-service',
      });
    }
  }

  /**
   * Initialize default retention policies
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicies: DataRetentionPolicy[] = [
      {
        id: 'user-profile',
        name: 'User Profile Data',
        dataTypes: ['personal'],
        retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        autoDelete: false,
        anonymizeAfter: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
        description: 'User profile and account information',
        legalBasis: 'Contract performance',
        isActive: true,
      },
      {
        id: 'behavioral-data',
        name: 'Behavioral Analytics',
        dataTypes: ['behavioral'],
        retentionPeriod: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
        autoDelete: true,
        anonymizeAfter: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
        description: 'User behavior and analytics data',
        legalBasis: 'Legitimate interest',
        isActive: true,
      },
      {
        id: 'financial-data',
        name: 'Financial Records',
        dataTypes: ['financial'],
        retentionPeriod: 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
        autoDelete: false,
        description: 'Financial transactions and records',
        legalBasis: 'Legal obligation',
        isActive: true,
      },
    ];

    defaultPolicies.forEach(policy => {
      this.retentionPolicies.set(policy.id, policy);
    });
  }

  /**
   * Setup cleanup scheduler for expired data
   */
  private setupCleanupScheduler(): void {
    // Run cleanup every 24 hours
    this.cleanupInterval = setInterval(() => {
      this.performDataCleanup();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Perform automated data cleanup based on retention policies
   */
  private performDataCleanup(): void {
    const now = new Date();
    let cleanedRecords = 0;
    let anonymizedRecords = 0;

    this.userDataRecords.forEach((records, userId) => {
      const updatedRecords = records.filter(record => {
        const policy = this.getApplicablePolicy(record.dataType);
        if (!policy) return true;

        const age = now.getTime() - record.createdAt.getTime();

        // Check if record should be anonymized
        if (policy.anonymizeAfter && age > policy.anonymizeAfter && !record.isAnonymized) {
          this.anonymizeUserData(userId, [record.dataType]);
          anonymizedRecords++;
          return true;
        }

        // Check if record should be deleted
        if (policy.autoDelete && age > policy.retentionPeriod) {
          if (!this.isLegallyRequired(record)) {
            cleanedRecords++;
            return false; // Remove record
          }
        }

        return true; // Keep record
      });

      this.userDataRecords.set(userId, updatedRecords);
    });

    if (cleanedRecords > 0 || anonymizedRecords > 0) {
      this.auditLogger.logEvent({
        action: 'automated_data_cleanup',
        resource: 'data_retention',
        method: 'DELETE',
        endpoint: '/privacy/cleanup',
        success: true,
        details: {
          cleanedRecords,
          anonymizedRecords,
        },
        riskLevel: 'medium',
        category: 'compliance',
        ipAddress: 'system',
        userAgent: 'data-privacy-service',
      });

      console.log(`Data cleanup completed: ${cleanedRecords} deleted, ${anonymizedRecords} anonymized`);
    }
  }

  /**
   * Get applicable retention policy for data type
   */
  private getApplicablePolicy(dataType: string): DataRetentionPolicy | null {
    for (const policy of this.retentionPolicies.values()) {
      if (policy.isActive && policy.dataTypes.includes(dataType)) {
        return policy;
      }
    }
    return null;
  }

  /**
   * Check if record is legally required to be retained
   */
  private isLegallyRequired(record: UserDataRecord): boolean {
    // In a real implementation, this would check against legal requirements
    // For now, we'll consider financial data as legally required
    return record.dataType === 'financial';
  }

  /**
   * Anonymize data by removing or masking PII
   */
  private anonymizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return '[ANONYMIZED]';
    }

    const anonymized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (this.isPIIField(key)) {
        anonymized[key] = this.maskValue(value);
      } else if (typeof value === 'object') {
        anonymized[key] = this.anonymizeData(value);
      } else {
        anonymized[key] = value;
      }
    }

    return anonymized;
  }

  /**
   * Check if field contains PII
   */
  private isPIIField(fieldName: string): boolean {
    const piiFields = [
      'email', 'name', 'firstName', 'lastName', 'phone', 'address',
      'ssn', 'creditCard', 'bankAccount', 'ip', 'userId', 'username'
    ];
    
    return piiFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  /**
   * Mask sensitive values
   */
  private maskValue(value: any): string {
    if (typeof value === 'string') {
      if (value.includes('@')) {
        // Email masking
        const [local, domain] = value.split('@');
        return `${local.charAt(0)}***@${domain}`;
      }
      if (value.length > 4) {
        // General string masking
        return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
      }
    }
    return '[MASKED]';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get privacy compliance statistics
   */
  getComplianceStatistics(): {
    totalUsers: number;
    totalRecords: number;
    anonymizedRecords: number;
    activeConsents: number;
    pendingExports: number;
    pendingDeletions: number;
    retentionPolicies: number;
  } {
    let totalRecords = 0;
    let anonymizedRecords = 0;
    let activeConsents = 0;

    this.userDataRecords.forEach(records => {
      totalRecords += records.length;
      anonymizedRecords += records.filter(r => r.isAnonymized).length;
    });

    this.consentRecords.forEach(consents => {
      activeConsents += consents.filter(c => c.granted && !c.withdrawnAt).length;
    });

    const pendingExports = Array.from(this.exportRequests.values())
      .filter(r => r.status === 'pending' || r.status === 'processing').length;

    const pendingDeletions = Array.from(this.deletionRequests.values())
      .filter(r => r.status === 'pending' || r.status === 'processing').length;

    return {
      totalUsers: this.userDataRecords.size,
      totalRecords,
      anonymizedRecords,
      activeConsents,
      pendingExports,
      pendingDeletions,
      retentionPolicies: this.retentionPolicies.size,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.userDataRecords.clear();
    this.retentionPolicies.clear();
    this.consentRecords.clear();
    this.exportRequests.clear();
    this.deletionRequests.clear();
  }
}