import { ComplianceService, DisclaimerConfig, UserAcknowledgment } from '../compliance.service';

describe('ComplianceService', () => {
  let complianceService: ComplianceService;

  beforeEach(() => {
    complianceService = new ComplianceService();
  });

  describe('Disclaimer Management', () => {
    it('should initialize with default disclaimers', () => {
      const generalDisclaimer = complianceService.getDisclaimer('general-analysis');
      expect(generalDisclaimer).toBeDefined();
      expect(generalDisclaimer?.type).toBe('general');
      expect(generalDisclaimer?.required).toBe(true);
    });

    it('should add new disclaimer', () => {
      const newDisclaimer: DisclaimerConfig = {
        id: 'test-disclaimer',
        type: 'prediction',
        title: 'Test Disclaimer',
        content: 'This is a test disclaimer',
        required: true,
        version: '1.0',
        effectiveDate: new Date(),
      };

      complianceService.addDisclaimer(newDisclaimer);
      const retrieved = complianceService.getDisclaimer('test-disclaimer');
      expect(retrieved).toEqual(newDisclaimer);
    });

    it('should get disclaimers by type', () => {
      const predictionDisclaimers = complianceService.getDisclaimersByType('prediction');
      expect(predictionDisclaimers.length).toBeGreaterThan(0);
      expect(predictionDisclaimers.every(d => d.type === 'prediction')).toBe(true);
    });

    it('should get required disclaimers', () => {
      const requiredDisclaimers = complianceService.getRequiredDisclaimers();
      expect(requiredDisclaimers.length).toBeGreaterThan(0);
      expect(requiredDisclaimers.every(d => d.required)).toBe(true);
    });

    it('should filter disclaimers by jurisdiction', () => {
      const jurisdictionDisclaimer: DisclaimerConfig = {
        id: 'us-disclaimer',
        type: 'general',
        title: 'US Disclaimer',
        content: 'US specific disclaimer',
        required: true,
        version: '1.0',
        effectiveDate: new Date(),
        jurisdictions: ['US'],
      };

      complianceService.addDisclaimer(jurisdictionDisclaimer);
      
      const usDisclaimers = complianceService.getRequiredDisclaimers('US');
      const ukDisclaimers = complianceService.getRequiredDisclaimers('UK');
      
      expect(usDisclaimers.some(d => d.id === 'us-disclaimer')).toBe(true);
      expect(ukDisclaimers.some(d => d.id === 'us-disclaimer')).toBe(false);
    });

    it('should exclude expired disclaimers', () => {
      const expiredDisclaimer: DisclaimerConfig = {
        id: 'expired-disclaimer',
        type: 'general',
        title: 'Expired Disclaimer',
        content: 'This disclaimer has expired',
        required: true,
        version: '1.0',
        effectiveDate: new Date('2020-01-01'),
        expiryDate: new Date('2020-12-31'),
      };

      complianceService.addDisclaimer(expiredDisclaimer);
      const activeDisclaimers = complianceService.getRequiredDisclaimers();
      
      expect(activeDisclaimers.some(d => d.id === 'expired-disclaimer')).toBe(false);
    });
  });

  describe('User Acknowledgments', () => {
    const mockAcknowledgment: UserAcknowledgment = {
      userId: 'user123',
      disclaimerId: 'general-analysis',
      version: '1.0',
      acknowledgedAt: new Date(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    it('should record user acknowledgment', () => {
      complianceService.recordAcknowledgment(mockAcknowledgment);
      
      const hasAcknowledged = complianceService.hasUserAcknowledged(
        'user123',
        'general-analysis',
        '1.0'
      );
      
      expect(hasAcknowledged).toBe(true);
    });

    it('should track acknowledgment history', () => {
      complianceService.recordAcknowledgment(mockAcknowledgment);
      
      const history = complianceService.getUserAcknowledgmentHistory('user123');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(mockAcknowledgment);
    });

    it('should identify pending acknowledgments', () => {
      const pendingAcknowledgments = complianceService.getPendingAcknowledgments('user123');
      expect(pendingAcknowledgments.length).toBeGreaterThan(0);
      
      // After acknowledging, should have fewer pending
      complianceService.recordAcknowledgment(mockAcknowledgment);
      const afterAcknowledgment = complianceService.getPendingAcknowledgments('user123');
      expect(afterAcknowledgment.length).toBeLessThan(pendingAcknowledgments.length);
    });

    it('should handle version-specific acknowledgments', () => {
      complianceService.recordAcknowledgment(mockAcknowledgment);
      
      // Should not be acknowledged for different version
      const hasV2Acknowledged = complianceService.hasUserAcknowledged(
        'user123',
        'general-analysis',
        '2.0'
      );
      
      expect(hasV2Acknowledged).toBe(false);
    });
  });

  describe('Compliance Indicators', () => {
    it('should generate prediction compliance indicators', () => {
      const indicators = complianceService.generateComplianceIndicators('prediction');
      
      expect(indicators.length).toBeGreaterThan(0);
      expect(indicators.some(i => i.type === 'analysis')).toBe(true);
      expect(indicators.some(i => i.message.includes('Not Gambling Advice'))).toBe(true);
    });

    it('should generate odds compliance indicators', () => {
      const indicators = complianceService.generateComplianceIndicators('odds');
      
      expect(indicators.length).toBeGreaterThan(0);
      expect(indicators.some(i => i.message.includes('Analytical Purposes Only'))).toBe(true);
    });

    it('should generate analysis compliance indicators', () => {
      const indicators = complianceService.generateComplianceIndicators('analysis');
      
      expect(indicators.length).toBeGreaterThan(0);
      expect(indicators.some(i => i.type === 'educational')).toBe(true);
    });
  });

  describe('Content Compliance Validation', () => {
    it('should validate content compliance for user with acknowledgments', () => {
      // Acknowledge required disclaimers
      complianceService.recordAcknowledgment({
        userId: 'user123',
        disclaimerId: 'general-analysis',
        version: '1.0',
        acknowledgedAt: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      const validation = complianceService.validateContentCompliance('user123', 'prediction');
      
      expect(validation.canDisplay).toBe(true);
      expect(validation.indicators.length).toBeGreaterThan(0);
    });

    it('should require acknowledgments for prediction content', () => {
      const validation = complianceService.validateContentCompliance('newuser', 'prediction');
      
      expect(validation.pendingAcknowledgments.length).toBeGreaterThan(0);
    });

    it('should allow analysis content without acknowledgments', () => {
      const validation = complianceService.validateContentCompliance('newuser', 'analysis');
      
      expect(validation.canDisplay).toBe(true);
      expect(validation.indicators.length).toBeGreaterThan(0);
    });
  });

  describe('Event Emission', () => {
    it('should emit events on disclaimer updates', async () => {
      const newDisclaimer: DisclaimerConfig = {
        id: 'event-test',
        type: 'general',
        title: 'Event Test',
        content: 'Test disclaimer for events',
        required: false,
        version: '1.0',
        effectiveDate: new Date(),
      };

      const eventPromise = new Promise<DisclaimerConfig>((resolve) => {
        complianceService.on('disclaimerUpdated', resolve);
      });

      complianceService.addDisclaimer(newDisclaimer);
      
      const emittedDisclaimer = await eventPromise;
      expect(emittedDisclaimer.id).toBe('event-test');
    });

    it('should emit events on acknowledgment recording', async () => {
      const acknowledgment: UserAcknowledgment = {
        userId: 'eventuser',
        disclaimerId: 'general-analysis',
        version: '1.0',
        acknowledgedAt: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const eventPromise = new Promise<UserAcknowledgment>((resolve) => {
        complianceService.on('acknowledgmentRecorded', resolve);
      });

      complianceService.recordAcknowledgment(acknowledgment);
      
      const emittedAcknowledgment = await eventPromise;
      expect(emittedAcknowledgment.userId).toBe('eventuser');
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up expired disclaimers', () => {
      const expiredDisclaimer: DisclaimerConfig = {
        id: 'cleanup-test',
        type: 'general',
        title: 'Cleanup Test',
        content: 'Test disclaimer for cleanup',
        required: false,
        version: '1.0',
        effectiveDate: new Date('2020-01-01'),
        expiryDate: new Date('2020-12-31'),
      };

      complianceService.addDisclaimer(expiredDisclaimer);
      expect(complianceService.getDisclaimer('cleanup-test')).toBeDefined();

      complianceService.cleanupExpiredDisclaimers();
      expect(complianceService.getDisclaimer('cleanup-test')).toBeUndefined();
    });

    it('should emit events on disclaimer expiry', async () => {
      const expiredDisclaimer: DisclaimerConfig = {
        id: 'expiry-event-test',
        type: 'general',
        title: 'Expiry Event Test',
        content: 'Test disclaimer for expiry events',
        required: false,
        version: '1.0',
        effectiveDate: new Date('2020-01-01'),
        expiryDate: new Date('2020-12-31'),
      };

      complianceService.addDisclaimer(expiredDisclaimer);

      const eventPromise = new Promise<string>((resolve) => {
        complianceService.on('disclaimerExpired', resolve);
      });

      complianceService.cleanupExpiredDisclaimers();
      
      const expiredId = await eventPromise;
      expect(expiredId).toBe('expiry-event-test');
    });
  });
});