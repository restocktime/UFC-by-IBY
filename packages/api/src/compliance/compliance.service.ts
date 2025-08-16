import { EventEmitter } from 'events';

export interface DisclaimerConfig {
  id: string;
  type: 'general' | 'prediction' | 'odds' | 'analysis';
  title: string;
  content: string;
  required: boolean;
  version: string;
  effectiveDate: Date;
  expiryDate?: Date;
  jurisdictions?: string[];
}

export interface UserAcknowledgment {
  userId: string;
  disclaimerId: string;
  version: string;
  acknowledgedAt: Date;
  ipAddress: string;
  userAgent: string;
}

export interface ComplianceIndicator {
  type: 'analysis' | 'educational' | 'disclaimer';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  placement: 'header' | 'footer' | 'inline' | 'modal';
}

export class ComplianceService extends EventEmitter {
  private disclaimers: Map<string, DisclaimerConfig> = new Map();
  private acknowledgments: Map<string, UserAcknowledgment[]> = new Map();

  constructor() {
    super();
    this.initializeDefaultDisclaimers();
  }

  /**
   * Initialize default compliance disclaimers
   */
  private initializeDefaultDisclaimers(): void {
    const defaultDisclaimers: DisclaimerConfig[] = [
      {
        id: 'general-analysis',
        type: 'general',
        title: 'Analysis Platform Disclaimer',
        content: 'This platform provides statistical analysis and educational content only. We do not facilitate gambling or betting activities. All predictions and odds data are for analytical and educational purposes.',
        required: true,
        version: '1.0',
        effectiveDate: new Date('2024-01-01'),
      },
      {
        id: 'prediction-disclaimer',
        type: 'prediction',
        title: 'Prediction Analysis Notice',
        content: 'Fight predictions are generated using machine learning models and statistical analysis. These are analytical insights, not gambling advice. Past performance does not guarantee future results.',
        required: false,
        version: '1.0',
        effectiveDate: new Date('2024-01-01'),
      },
      {
        id: 'odds-data-disclaimer',
        type: 'odds',
        title: 'Odds Data Attribution',
        content: 'Odds data is provided for analytical purposes only and is sourced from third-party providers. We do not endorse or facilitate betting activities. Data accuracy is not guaranteed.',
        required: false,
        version: '1.0',
        effectiveDate: new Date('2024-01-01'),
      },
      {
        id: 'educational-content',
        type: 'analysis',
        title: 'Educational Content Notice',
        content: 'All content on this platform is for educational and analytical purposes. This is not financial or gambling advice. Users should conduct their own research and consult professionals.',
        required: false,
        version: '1.0',
        effectiveDate: new Date('2024-01-01'),
      },
    ];

    defaultDisclaimers.forEach(disclaimer => {
      this.disclaimers.set(disclaimer.id, disclaimer);
    });
  }

  /**
   * Add or update a disclaimer configuration
   */
  addDisclaimer(disclaimer: DisclaimerConfig): void {
    this.disclaimers.set(disclaimer.id, disclaimer);
    this.emit('disclaimerUpdated', disclaimer);
  }

  /**
   * Get disclaimer by ID
   */
  getDisclaimer(id: string): DisclaimerConfig | undefined {
    return this.disclaimers.get(id);
  }

  /**
   * Get all active disclaimers for a specific type
   */
  getDisclaimersByType(type: DisclaimerConfig['type']): DisclaimerConfig[] {
    const now = new Date();
    return Array.from(this.disclaimers.values()).filter(
      disclaimer => 
        disclaimer.type === type &&
        disclaimer.effectiveDate <= now &&
        (!disclaimer.expiryDate || disclaimer.expiryDate > now)
    );
  }

  /**
   * Get all required disclaimers that user must acknowledge
   */
  getRequiredDisclaimers(jurisdiction?: string): DisclaimerConfig[] {
    const now = new Date();
    return Array.from(this.disclaimers.values()).filter(
      disclaimer => 
        disclaimer.required &&
        disclaimer.effectiveDate <= now &&
        (!disclaimer.expiryDate || disclaimer.expiryDate > now) &&
        (!jurisdiction || !disclaimer.jurisdictions || disclaimer.jurisdictions.includes(jurisdiction))
    );
  }

  /**
   * Record user acknowledgment of a disclaimer
   */
  recordAcknowledgment(acknowledgment: UserAcknowledgment): void {
    const userAcknowledgments = this.acknowledgments.get(acknowledgment.userId) || [];
    userAcknowledgments.push(acknowledgment);
    this.acknowledgments.set(acknowledgment.userId, userAcknowledgments);
    
    this.emit('acknowledgmentRecorded', acknowledgment);
  }

  /**
   * Check if user has acknowledged a specific disclaimer version
   */
  hasUserAcknowledged(userId: string, disclaimerId: string, version: string): boolean {
    const userAcknowledgments = this.acknowledgments.get(userId) || [];
    return userAcknowledgments.some(
      ack => ack.disclaimerId === disclaimerId && ack.version === version
    );
  }

  /**
   * Get pending acknowledgments for a user
   */
  getPendingAcknowledgments(userId: string, jurisdiction?: string): DisclaimerConfig[] {
    const requiredDisclaimers = this.getRequiredDisclaimers(jurisdiction);
    return requiredDisclaimers.filter(
      disclaimer => !this.hasUserAcknowledged(userId, disclaimer.id, disclaimer.version)
    );
  }

  /**
   * Generate compliance indicators for content
   */
  generateComplianceIndicators(contentType: 'prediction' | 'odds' | 'analysis'): ComplianceIndicator[] {
    const indicators: ComplianceIndicator[] = [];

    switch (contentType) {
      case 'prediction':
        indicators.push({
          type: 'analysis',
          message: 'For Analysis Only - Not Gambling Advice',
          severity: 'warning',
          placement: 'header',
        });
        indicators.push({
          type: 'disclaimer',
          message: 'Predictions are statistical models for educational purposes',
          severity: 'info',
          placement: 'footer',
        });
        break;

      case 'odds':
        indicators.push({
          type: 'analysis',
          message: 'Odds Data for Analytical Purposes Only',
          severity: 'warning',
          placement: 'header',
        });
        indicators.push({
          type: 'disclaimer',
          message: 'We do not facilitate betting - Data for analysis only',
          severity: 'info',
          placement: 'footer',
        });
        break;

      case 'analysis':
        indicators.push({
          type: 'educational',
          message: 'Educational Content - Statistical Analysis',
          severity: 'info',
          placement: 'header',
        });
        break;
    }

    return indicators;
  }

  /**
   * Validate compliance for content display
   */
  validateContentCompliance(
    userId: string,
    contentType: 'prediction' | 'odds' | 'analysis',
    jurisdiction?: string
  ): {
    canDisplay: boolean;
    pendingAcknowledgments: DisclaimerConfig[];
    indicators: ComplianceIndicator[];
  } {
    const pendingAcknowledgments = this.getPendingAcknowledgments(userId, jurisdiction);
    const indicators = this.generateComplianceIndicators(contentType);

    // Allow display but require acknowledgments for certain content
    const canDisplay = contentType === 'analysis' || pendingAcknowledgments.length === 0;

    return {
      canDisplay,
      pendingAcknowledgments,
      indicators,
    };
  }

  /**
   * Get user's acknowledgment history
   */
  getUserAcknowledgmentHistory(userId: string): UserAcknowledgment[] {
    return this.acknowledgments.get(userId) || [];
  }

  /**
   * Remove expired disclaimers
   */
  cleanupExpiredDisclaimers(): void {
    const now = new Date();
    const expiredIds: string[] = [];

    this.disclaimers.forEach((disclaimer, id) => {
      if (disclaimer.expiryDate && disclaimer.expiryDate <= now) {
        expiredIds.push(id);
      }
    });

    expiredIds.forEach(id => {
      this.disclaimers.delete(id);
      this.emit('disclaimerExpired', id);
    });
  }
}