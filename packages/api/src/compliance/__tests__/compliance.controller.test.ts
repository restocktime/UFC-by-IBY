import { Request, Response } from 'express';
import { vi } from 'vitest';
import { ComplianceController } from '../compliance.controller';
import { ComplianceService } from '../compliance.service';

// Mock the ComplianceService
vi.mock('../compliance.service');

describe('ComplianceController', () => {
  let complianceController: ComplianceController;
  let mockComplianceService: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockComplianceService = {
      getRequiredDisclaimers: vi.fn(),
      getPendingAcknowledgments: vi.fn(),
      recordAcknowledgment: vi.fn(),
      generateComplianceIndicators: vi.fn(),
      validateContentCompliance: vi.fn(),
      getUserAcknowledgmentHistory: vi.fn(),
      getDisclaimer: vi.fn(),
    };
    complianceController = new ComplianceController(mockComplianceService);
    
    mockRequest = {
      params: {},
      query: {},
      body: {},
      ip: '192.168.1.1',
      get: vi.fn().mockReturnValue('Mozilla/5.0'),
    };
    
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('getRequiredDisclaimers', () => {
    it('should return required disclaimers successfully', async () => {
      const mockDisclaimers = [
        {
          id: 'general-analysis',
          type: 'general' as const,
          title: 'General Disclaimer',
          content: 'General disclaimer content',
          required: true,
          version: '1.0',
          effectiveDate: new Date(),
        },
      ];

      mockComplianceService.getRequiredDisclaimers.mockReturnValue(mockDisclaimers);
      mockRequest.query = { jurisdiction: 'US' };

      await complianceController.getRequiredDisclaimers(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.getRequiredDisclaimers).toHaveBeenCalledWith('US');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockDisclaimers,
      });
    });

    it('should handle errors gracefully', async () => {
      mockComplianceService.getRequiredDisclaimers.mockImplementation(() => {
        throw new Error('Service error');
      });

      await complianceController.getRequiredDisclaimers(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch required disclaimers',
      });
    });
  });

  describe('getPendingAcknowledgments', () => {
    it('should return pending acknowledgments for user', async () => {
      const mockPendingAcknowledgments = [
        {
          id: 'pending-disclaimer',
          type: 'prediction' as const,
          title: 'Pending Disclaimer',
          content: 'Pending disclaimer content',
          required: true,
          version: '1.0',
          effectiveDate: new Date(),
        },
      ];

      mockComplianceService.getPendingAcknowledgments.mockReturnValue(mockPendingAcknowledgments);
      mockRequest.params = { userId: 'user123' };
      mockRequest.query = { jurisdiction: 'US' };

      await complianceController.getPendingAcknowledgments(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.getPendingAcknowledgments).toHaveBeenCalledWith('user123', 'US');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockPendingAcknowledgments,
      });
    });
  });

  describe('recordAcknowledgment', () => {
    it('should record acknowledgment successfully', async () => {
      mockRequest.params = { userId: 'user123' };
      mockRequest.body = {
        disclaimerId: 'general-analysis',
        version: '1.0',
      };

      await complianceController.recordAcknowledgment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.recordAcknowledgment).toHaveBeenCalledWith({
        userId: 'user123',
        disclaimerId: 'general-analysis',
        version: '1.0',
        acknowledgedAt: expect.any(Date),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Acknowledgment recorded successfully',
      });
    });

    it('should handle missing IP address gracefully', async () => {
      mockRequest.params = { userId: 'user123' };
      mockRequest.body = {
        disclaimerId: 'general-analysis',
        version: '1.0',
      };
      mockRequest.ip = undefined;
      (mockRequest as any).connection = {};

      await complianceController.recordAcknowledgment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.recordAcknowledgment).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: 'unknown',
        })
      );
    });
  });

  describe('getComplianceIndicators', () => {
    it('should return compliance indicators for valid content type', async () => {
      const mockIndicators = [
        {
          type: 'analysis' as const,
          message: 'For Analysis Only',
          severity: 'warning' as const,
          placement: 'header' as const,
        },
      ];

      mockComplianceService.generateComplianceIndicators.mockReturnValue(mockIndicators);
      mockRequest.params = { contentType: 'prediction' };

      await complianceController.getComplianceIndicators(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.generateComplianceIndicators).toHaveBeenCalledWith('prediction');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockIndicators,
      });
    });

    it('should reject invalid content type', async () => {
      mockRequest.params = { contentType: 'invalid' };

      await complianceController.getComplianceIndicators(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid content type',
      });
    });
  });

  describe('validateContentCompliance', () => {
    it('should validate content compliance successfully', async () => {
      const mockValidation = {
        canDisplay: true,
        pendingAcknowledgments: [],
        indicators: [],
      };

      mockComplianceService.validateContentCompliance.mockReturnValue(mockValidation);
      mockRequest.params = { userId: 'user123', contentType: 'prediction' };
      mockRequest.query = { jurisdiction: 'US' };

      await complianceController.validateContentCompliance(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.validateContentCompliance).toHaveBeenCalledWith(
        'user123',
        'prediction',
        'US'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockValidation,
      });
    });

    it('should reject invalid content type for validation', async () => {
      mockRequest.params = { userId: 'user123', contentType: 'invalid' };

      await complianceController.validateContentCompliance(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid content type',
      });
    });
  });

  describe('getAcknowledgmentHistory', () => {
    it('should return user acknowledgment history', async () => {
      const mockHistory = [
        {
          userId: 'user123',
          disclaimerId: 'general-analysis',
          version: '1.0',
          acknowledgedAt: new Date(),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      ];

      mockComplianceService.getUserAcknowledgmentHistory.mockReturnValue(mockHistory);
      mockRequest.params = { userId: 'user123' };

      await complianceController.getAcknowledgmentHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.getUserAcknowledgmentHistory).toHaveBeenCalledWith('user123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockHistory,
      });
    });
  });

  describe('getDisclaimer', () => {
    it('should return disclaimer by ID', async () => {
      const mockDisclaimer = {
        id: 'general-analysis',
        type: 'general' as const,
        title: 'General Disclaimer',
        content: 'General disclaimer content',
        required: true,
        version: '1.0',
        effectiveDate: new Date(),
      };

      mockComplianceService.getDisclaimer.mockReturnValue(mockDisclaimer);
      mockRequest.params = { disclaimerId: 'general-analysis' };

      await complianceController.getDisclaimer(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockComplianceService.getDisclaimer).toHaveBeenCalledWith('general-analysis');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockDisclaimer,
      });
    });

    it('should return 404 for non-existent disclaimer', async () => {
      mockComplianceService.getDisclaimer.mockReturnValue(undefined);
      mockRequest.params = { disclaimerId: 'non-existent' };

      await complianceController.getDisclaimer(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Disclaimer not found',
      });
    });
  });
});