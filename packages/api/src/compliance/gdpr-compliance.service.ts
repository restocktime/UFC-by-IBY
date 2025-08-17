import { DataPrivacyService, ConsentRecord, DataExportRequest, DataDeletionRequest } from './data-privacy.service';
import { AuditLoggerService } from '../security/audit-logger.service';

export interface GDPRRights {
  rightToInformation: boolean;
  rightOfAccess: boolean;
  rightToRectification: boolean;
  rightToErasure: boolean;
  rightToRestrictProcessing: boolean;
  rightToDataPortability: boolean;
  rightToObject: boolean;
  rightsRelatedToAutomatedDecisionMaking: boolean;
}

export interface ProcessingActivity {
  id: string;
  name: string;
  description: string;
  controller: string;
  processor?: string;
  dataSubjects: string[];
  categories: string[];
  purposes: string[];
  recipients: string[];
  thirdCountryTransfers: boolean;
  retentionPeriod: string;
  technicalMeasures: string[];
  organisationalMeasures: string[];
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataBreachIncident {
  id: string;
  reportedAt: Date;
  discoveredAt: Date;
  description: string;
  affectedDataTypes: string[];
  affectedUsers: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  containmentMeasures: string[];
  notificationRequired: boolean;
  supervisoryAuthorityNotified: boolean;
  dataSubjectsNotified: boolean;
  status: 'open' | 'investigating' | 'contained' | 'resolved';
  reportedBy: string;
  assignedTo?: string;
  resolution?: string;
  resolvedAt?: Date;
}

export interface ComplianceReport {
  id: string;
  generatedAt: Date;
  reportType: 'monthly' | 'quarterly' | 'annual' | 'incident';
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalDataSubjects: number;
    newConsents: number;
    withdrawnConsents: number;
    dataExportRequests: number;
    dataDeletionRequests: number;
    dataBreaches: number;
    complianceScore: number;
  };
  findings: string[];
  recommendations: string[];
  status: 'draft' | 'final' | 'submitted';
}

export class GDPRComplianceService {
  private processingActivities: Map<string, ProcessingActivity> = new Map();
  private dataBreaches: Map<string, DataBreachIncident> = new Map();
  private complianceReports: Map<string, ComplianceReport> = new Map();

  constructor(
    private dataPrivacyService: DataPrivacyService,
    private auditLogger: AuditLoggerService
  ) {
    this.initializeDefaultActivities();
  }

  /**
   * Handle data subject access request (Article 15)
   */
  async handleAccessRequest(userId: string, requesterId: string): Promise<{
    userData: any[];
    consentHistory: ConsentRecord[];
    processingActivities: ProcessingActivity[];
    requestId: string;
  }> {
    // Log the access request
    this.auditLogger.logEvent({
      userId: requesterId,
      action: 'gdpr_access_request',
      resource: 'gdpr_compliance',
      method: 'GET',
      endpoint: '/gdpr/access',
      success: true,
      details: {
        subjectUserId: userId,
        requestType: 'access',
      },
      riskLevel: 'high',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'gdpr-compliance-service',
    });

    // Get user data
    const userData = this.dataPrivacyService.getUserData(userId);
    
    // Get consent history
    const consentHistory = this.dataPrivacyService.getUserConsentHistory(userId);
    
    // Get relevant processing activities
    const processingActivities = Array.from(this.processingActivities.values())
      .filter(activity => activity.isActive);

    // Create export request for audit trail
    const requestId = this.dataPrivacyService.createDataExportRequest({
      userId,
      requestedAt: new Date(),
      format: 'json',
      includeDeleted: false,
    });

    return {
      userData,
      consentHistory,
      processingActivities,
      requestId,
    };
  }

  /**
   * Handle right to rectification (Article 16)
   */
  async handleRectificationRequest(
    userId: string, 
    corrections: { [key: string]: any },
    requesterId: string
  ): Promise<boolean> {
    try {
      // Log rectification request
      this.auditLogger.logEvent({
        userId: requesterId,
        action: 'gdpr_rectification_request',
        resource: 'gdpr_compliance',
        method: 'PUT',
        endpoint: '/gdpr/rectification',
        success: true,
        details: {
          subjectUserId: userId,
          corrections: Object.keys(corrections),
        },
        riskLevel: 'medium',
        category: 'compliance',
        ipAddress: 'system',
        userAgent: 'gdpr-compliance-service',
      });

      // In a real implementation, this would update the user data
      // For now, we'll just log the rectification
      console.log(`Rectification request processed for user ${userId}:`, corrections);

      return true;
    } catch (error) {
      this.auditLogger.logEvent({
        userId: requesterId,
        action: 'gdpr_rectification_failed',
        resource: 'gdpr_compliance',
        method: 'PUT',
        endpoint: '/gdpr/rectification',
        success: false,
        details: {
          subjectUserId: userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        riskLevel: 'high',
        category: 'compliance',
        ipAddress: 'system',
        userAgent: 'gdpr-compliance-service',
      });

      return false;
    }
  }

  /**
   * Handle right to erasure (Article 17)
   */
  async handleErasureRequest(
    userId: string,
    reason: string,
    requesterId: string,
    dataTypes?: string[]
  ): Promise<string> {
    // Log erasure request
    this.auditLogger.logEvent({
      userId: requesterId,
      action: 'gdpr_erasure_request',
      resource: 'gdpr_compliance',
      method: 'DELETE',
      endpoint: '/gdpr/erasure',
      success: true,
      details: {
        subjectUserId: userId,
        reason,
        dataTypes: dataTypes || 'all',
      },
      riskLevel: 'critical',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'gdpr-compliance-service',
    });

    // Create deletion request
    const requestId = this.dataPrivacyService.createDataDeletionRequest({
      userId,
      requestedAt: new Date(),
      deletionType: 'hard',
      dataTypes,
      retainForLegal: true, // Retain legally required data
    });

    return requestId;
  }

  /**
   * Handle data portability request (Article 20)
   */
  async handlePortabilityRequest(
    userId: string,
    format: 'json' | 'csv' | 'xml',
    requesterId: string
  ): Promise<string> {
    // Log portability request
    this.auditLogger.logEvent({
      userId: requesterId,
      action: 'gdpr_portability_request',
      resource: 'gdpr_compliance',
      method: 'GET',
      endpoint: '/gdpr/portability',
      success: true,
      details: {
        subjectUserId: userId,
        format,
      },
      riskLevel: 'high',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'gdpr-compliance-service',
    });

    // Create export request with structured format
    const requestId = this.dataPrivacyService.createDataExportRequest({
      userId,
      requestedAt: new Date(),
      format,
      includeDeleted: false,
      dataTypes: ['personal', 'preference'], // Only portable data
    });

    return requestId;
  }

  /**
   * Record processing activity (Article 30)
   */
  recordProcessingActivity(activity: Omit<ProcessingActivity, 'id' | 'createdAt' | 'updatedAt'>): string {
    const activityId = this.generateId();
    
    const processingActivity: ProcessingActivity = {
      ...activity,
      id: activityId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.processingActivities.set(activityId, processingActivity);

    // Log processing activity registration
    this.auditLogger.logEvent({
      action: 'processing_activity_recorded',
      resource: 'gdpr_compliance',
      method: 'POST',
      endpoint: '/gdpr/processing-activity',
      success: true,
      details: {
        activityId,
        name: activity.name,
        purposes: activity.purposes,
        legalBasis: activity.legalBasis,
      },
      riskLevel: 'medium',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'gdpr-compliance-service',
    });

    return activityId;
  }

  /**
   * Report data breach (Article 33/34)
   */
  reportDataBreach(breach: Omit<DataBreachIncident, 'id' | 'reportedAt' | 'status'>): string {
    const breachId = this.generateId();
    
    const dataBreachIncident: DataBreachIncident = {
      ...breach,
      id: breachId,
      reportedAt: new Date(),
      status: 'open',
    };

    this.dataBreaches.set(breachId, dataBreachIncident);

    // Log data breach
    this.auditLogger.logEvent({
      action: 'data_breach_reported',
      resource: 'gdpr_compliance',
      method: 'POST',
      endpoint: '/gdpr/data-breach',
      success: true,
      details: {
        breachId,
        riskLevel: breach.riskLevel,
        affectedUsers: breach.affectedUsers,
        affectedDataTypes: breach.affectedDataTypes,
      },
      riskLevel: 'critical',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'gdpr-compliance-service',
    });

    // Create security alert
    this.auditLogger.createSecurityAlert({
      type: 'data_breach_attempt',
      severity: breach.riskLevel,
      ipAddress: 'system',
      description: `Data breach reported: ${breach.description}`,
      details: {
        breachId,
        affectedUsers: breach.affectedUsers,
        affectedDataTypes: breach.affectedDataTypes,
      },
    });

    // Check if supervisory authority notification is required (within 72 hours)
    if (breach.notificationRequired) {
      setTimeout(() => {
        this.checkBreachNotificationCompliance(breachId);
      }, 72 * 60 * 60 * 1000); // 72 hours
    }

    return breachId;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(
    reportType: 'monthly' | 'quarterly' | 'annual' | 'incident',
    period: { start: Date; end: Date }
  ): string {
    const reportId = this.generateId();
    
    // Calculate metrics
    const stats = this.dataPrivacyService.getComplianceStatistics();
    const breaches = Array.from(this.dataBreaches.values())
      .filter(breach => 
        breach.reportedAt >= period.start && 
        breach.reportedAt <= period.end
      );

    // Calculate compliance score (simplified)
    const complianceScore = this.calculateComplianceScore(stats, breaches);

    const report: ComplianceReport = {
      id: reportId,
      generatedAt: new Date(),
      reportType,
      period,
      metrics: {
        totalDataSubjects: stats.totalUsers,
        newConsents: stats.activeConsents, // Simplified
        withdrawnConsents: 0, // Would need to track this separately
        dataExportRequests: stats.pendingExports,
        dataDeletionRequests: stats.pendingDeletions,
        dataBreaches: breaches.length,
        complianceScore,
      },
      findings: this.generateFindings(stats, breaches),
      recommendations: this.generateRecommendations(stats, breaches),
      status: 'draft',
    };

    this.complianceReports.set(reportId, report);

    // Log report generation
    this.auditLogger.logEvent({
      action: 'compliance_report_generated',
      resource: 'gdpr_compliance',
      method: 'POST',
      endpoint: '/gdpr/report',
      success: true,
      details: {
        reportId,
        reportType,
        complianceScore,
        dataBreaches: breaches.length,
      },
      riskLevel: 'medium',
      category: 'compliance',
      ipAddress: 'system',
      userAgent: 'gdpr-compliance-service',
    });

    return reportId;
  }

  /**
   * Get GDPR rights for user
   */
  getUserRights(userId: string): GDPRRights {
    // In a real implementation, this might vary based on user location, age, etc.
    return {
      rightToInformation: true,
      rightOfAccess: true,
      rightToRectification: true,
      rightToErasure: true,
      rightToRestrictProcessing: true,
      rightToDataPortability: true,
      rightToObject: true,
      rightsRelatedToAutomatedDecisionMaking: true,
    };
  }

  /**
   * Get processing activities
   */
  getProcessingActivities(): ProcessingActivity[] {
    return Array.from(this.processingActivities.values());
  }

  /**
   * Get data breaches
   */
  getDataBreaches(): DataBreachIncident[] {
    return Array.from(this.dataBreaches.values());
  }

  /**
   * Get compliance reports
   */
  getComplianceReports(): ComplianceReport[] {
    return Array.from(this.complianceReports.values());
  }

  /**
   * Initialize default processing activities
   */
  private initializeDefaultActivities(): void {
    const defaultActivities: Omit<ProcessingActivity, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'User Account Management',
        description: 'Processing user account information for service provision',
        controller: 'UFC Prediction Platform',
        dataSubjects: ['users'],
        categories: ['personal_data', 'contact_data'],
        purposes: ['service_provision', 'account_management'],
        recipients: ['internal_staff'],
        thirdCountryTransfers: false,
        retentionPeriod: '7 years after account closure',
        technicalMeasures: ['encryption', 'access_controls', 'audit_logging'],
        organisationalMeasures: ['staff_training', 'data_protection_policies'],
        legalBasis: 'contract',
        isActive: true,
      },
      {
        name: 'Prediction Analytics',
        description: 'Processing user behavior for prediction improvements',
        controller: 'UFC Prediction Platform',
        dataSubjects: ['users'],
        categories: ['behavioral_data', 'usage_data'],
        purposes: ['service_improvement', 'analytics'],
        recipients: ['internal_staff', 'analytics_team'],
        thirdCountryTransfers: false,
        retentionPeriod: '2 years',
        technicalMeasures: ['pseudonymization', 'encryption'],
        organisationalMeasures: ['data_minimization', 'purpose_limitation'],
        legalBasis: 'legitimate_interests',
        isActive: true,
      },
      {
        name: 'Marketing Communications',
        description: 'Sending promotional materials and updates',
        controller: 'UFC Prediction Platform',
        dataSubjects: ['users', 'subscribers'],
        categories: ['contact_data', 'preference_data'],
        purposes: ['marketing', 'communication'],
        recipients: ['marketing_team'],
        thirdCountryTransfers: false,
        retentionPeriod: 'Until consent withdrawn',
        technicalMeasures: ['encryption', 'secure_transmission'],
        organisationalMeasures: ['consent_management', 'opt_out_mechanisms'],
        legalBasis: 'consent',
        isActive: true,
      },
    ];

    defaultActivities.forEach(activity => {
      this.recordProcessingActivity(activity);
    });
  }

  /**
   * Check breach notification compliance
   */
  private checkBreachNotificationCompliance(breachId: string): void {
    const breach = this.dataBreaches.get(breachId);
    if (!breach) return;

    const timeSinceReport = Date.now() - breach.reportedAt.getTime();
    const seventyTwoHours = 72 * 60 * 60 * 1000;

    if (timeSinceReport > seventyTwoHours && !breach.supervisoryAuthorityNotified) {
      // Create compliance violation alert
      this.auditLogger.createSecurityAlert({
        type: 'suspicious_activity',
        severity: 'critical',
        ipAddress: 'system',
        description: `GDPR violation: Data breach ${breachId} not reported to supervisory authority within 72 hours`,
        details: {
          breachId,
          timeSinceReport,
          requiredTime: seventyTwoHours,
        },
      });
    }
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(stats: any, breaches: DataBreachIncident[]): number {
    let score = 100;

    // Deduct points for data breaches
    score -= breaches.length * 10;

    // Deduct points for pending requests (indicates slow response)
    score -= stats.pendingExports * 2;
    score -= stats.pendingDeletions * 3;

    // Bonus points for good practices
    if (stats.anonymizedRecords > 0) score += 5;
    if (stats.retentionPolicies > 0) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate compliance findings
   */
  private generateFindings(stats: any, breaches: DataBreachIncident[]): string[] {
    const findings: string[] = [];

    if (breaches.length > 0) {
      findings.push(`${breaches.length} data breach(es) reported during the period`);
    }

    if (stats.pendingExports > 0) {
      findings.push(`${stats.pendingExports} pending data export request(s)`);
    }

    if (stats.pendingDeletions > 0) {
      findings.push(`${stats.pendingDeletions} pending data deletion request(s)`);
    }

    if (stats.anonymizedRecords > 0) {
      findings.push(`${stats.anonymizedRecords} records have been anonymized`);
    }

    return findings;
  }

  /**
   * Generate compliance recommendations
   */
  private generateRecommendations(stats: any, breaches: DataBreachIncident[]): string[] {
    const recommendations: string[] = [];

    if (breaches.length > 0) {
      recommendations.push('Review and strengthen security measures to prevent future breaches');
      recommendations.push('Conduct staff training on data protection and incident response');
    }

    if (stats.pendingExports > 5) {
      recommendations.push('Improve data export processing efficiency to meet GDPR timelines');
    }

    if (stats.pendingDeletions > 5) {
      recommendations.push('Streamline data deletion processes to ensure timely compliance');
    }

    if (stats.anonymizedRecords === 0) {
      recommendations.push('Consider implementing data anonymization for older records');
    }

    recommendations.push('Regular compliance audits and staff training');
    recommendations.push('Update privacy policies and consent mechanisms');

    return recommendations;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `gdpr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}