import { Request, Response, NextFunction } from 'express';
import { vi } from 'vitest';
import { ComplianceMiddleware, ComplianceRequest } from '../compliance.middleware';
import { ComplianceService } from '../compliance.service';

// Mock the ComplianceService
vi.mock('../compliance.service');

describe('ComplianceMiddleware', () => {
  let complianceMiddleware: ComplianceMiddleware;
  let mockComplianceService: any;
  let mockRequest: Partial<ComplianceRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockComplianceService = {
      generateComplianceIndicators: vi.fn(),
      validateContentCompliance: vi.fn(),
    };
    complianceMiddleware = new ComplianceMiddleware(mockComplianceService);
    
    mockRequest = {
      params: {},
      query: {},
      body: {},
      path: '/test',
      method: 'GET',
      ip: '192.168.1.1',
      get: vi.fn().mockReturnValue('Mozilla/5.0'),
      user: undefined,
    };
    
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };
    
    mockNext = vi.fn();
  });

  describe('addComplianceIndicators', () => {
    it('should add compliance indicators to request and response', () => {
      const mockIndicators = [
        {
          type: 'analysis' as const,
          message: 'For Analysis Only',
          severity: 'warning' as const,
          placement: 'header' as const,
        },
      ];

      mockComplianceService.generateComplianceIndicators.mockReturnValue(mockIndicators);

      const middleware = complianceMiddleware.addComplianceIndicators('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockRequest.compliance).toEqual({
        indicators: mockIndicators,
        canDisplay: true,
        pendingAcknowledgments: [],
      });

      expect(mockNext).toHaveBeenCalled();
    });

    it('should intercept JSON responses to add compliance data', () => {
      const mockIndicators = [
        {
          type: 'analysis' as const,
          message: 'For Analysis Only',
          severity: 'warning' as const,
          placement: 'header' as const,
        },
      ];

      mockComplianceService.generateComplianceIndicators.mockReturnValue(mockIndicators);

      const middleware = complianceMiddleware.addComplianceIndicators('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      // Simulate calling res.json()
      const testData = { test: 'data' };
      (mockResponse.json as any)(testData);

      expect(testData).toHaveProperty('compliance');
      expect((testData as any).compliance).toEqual({
        indicators: mockIndicators,
        contentType: 'prediction',
        timestamp: expect.any(String),
      });
    });

    it('should handle errors gracefully', () => {
      mockComplianceService.generateComplianceIndicators.mockImplementation(() => {
        throw new Error('Service error');
      });

      const middleware = complianceMiddleware.addComplianceIndicators('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('validateUserCompliance', () => {
    it('should validate compliance for authenticated user', () => {
      const mockValidation = {
        canDisplay: true,
        pendingAcknowledgments: [],
        indicators: [],
      };

      mockComplianceService.validateContentCompliance.mockReturnValue(mockValidation);
      mockRequest.user = { id: 'user123' };
      mockRequest.query = { jurisdiction: 'US' };

      const middleware = complianceMiddleware.validateUserCompliance('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockComplianceService.validateContentCompliance).toHaveBeenCalledWith(
        'user123',
        'prediction',
        'US'
      );
      expect(mockRequest.compliance).toEqual(mockValidation);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle anonymous users', () => {
      const mockIndicators = [
        {
          type: 'analysis' as const,
          message: 'For Analysis Only',
          severity: 'warning' as const,
          placement: 'header' as const,
        },
      ];

      mockComplianceService.generateComplianceIndicators.mockReturnValue(mockIndicators);

      const middleware = complianceMiddleware.validateUserCompliance('analysis');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockRequest.compliance).toEqual({
        indicators: mockIndicators,
        canDisplay: true,
        pendingAcknowledgments: [],
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should restrict prediction content for anonymous users', () => {
      const mockIndicators = [
        {
          type: 'analysis' as const,
          message: 'For Analysis Only',
          severity: 'warning' as const,
          placement: 'header' as const,
        },
      ];

      mockComplianceService.generateComplianceIndicators.mockReturnValue(mockIndicators);

      const middleware = complianceMiddleware.validateUserCompliance('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockRequest.compliance).toEqual({
        indicators: mockIndicators,
        canDisplay: false,
        pendingAcknowledgments: [],
      });
    });

    it('should block content when acknowledgments are required', () => {
      const mockValidation = {
        canDisplay: false,
        pendingAcknowledgments: [
          {
            id: 'general-analysis',
            type: 'general' as const,
            title: 'General Disclaimer',
            content: 'General disclaimer content',
            required: true,
            version: '1.0',
            effectiveDate: new Date(),
          },
        ],
        indicators: [],
      };

      mockComplianceService.validateContentCompliance.mockReturnValue(mockValidation);
      mockRequest.user = { id: 'user123' };

      const middleware = complianceMiddleware.validateUserCompliance('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Compliance acknowledgments required',
        data: {
          pendingAcknowledgments: mockValidation.pendingAcknowledgments,
          indicators: mockValidation.indicators,
        },
      });
    });

    it('should get userId from params when user object not available', () => {
      const mockValidation = {
        canDisplay: true,
        pendingAcknowledgments: [],
        indicators: [],
      };

      mockComplianceService.validateContentCompliance.mockReturnValue(mockValidation);
      mockRequest.params = { userId: 'user456' };

      const middleware = complianceMiddleware.validateUserCompliance('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockComplianceService.validateContentCompliance).toHaveBeenCalledWith(
        'user456',
        'prediction',
        undefined
      );
    });

    it('should handle errors gracefully', () => {
      mockComplianceService.validateContentCompliance.mockImplementation(() => {
        throw new Error('Service error');
      });

      mockRequest.user = { id: 'user123' };

      const middleware = complianceMiddleware.validateUserCompliance('prediction');
      middleware(mockRequest as ComplianceRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('addComplianceHeaders', () => {
    it('should add compliance headers to response', () => {
      complianceMiddleware.addComplianceHeaders(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Purpose', 'analysis-only');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Gambling-Disclaimer', 'not-gambling-service');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type', 'educational-analytical');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logComplianceActivity', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log activity for sensitive endpoints', () => {
      mockRequest.path = '/predictions/test';
      mockRequest.user = { id: 'user123' };

      complianceMiddleware.logComplianceActivity(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate calling res.json()
      (mockResponse.json as any)({ test: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith('Compliance Activity:', {
        timestamp: expect.any(String),
        userId: 'user123',
        endpoint: '/predictions/test',
        method: 'GET',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
        jurisdiction: undefined,
      });
    });

    it('should log anonymous user activity', () => {
      mockRequest.path = '/odds/test';

      complianceMiddleware.logComplianceActivity(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate calling res.json()
      (mockResponse.json as any)({ test: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith('Compliance Activity:', {
        timestamp: expect.any(String),
        userId: 'anonymous',
        endpoint: '/odds/test',
        method: 'GET',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
        jurisdiction: undefined,
      });
    });

    it('should not log activity for non-sensitive endpoints', () => {
      mockRequest.path = '/health';

      complianceMiddleware.logComplianceActivity(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate calling res.json()
      (mockResponse.json as any)({ test: 'data' });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should include jurisdiction in logs when provided', () => {
      mockRequest.path = '/predictions/test';
      mockRequest.query = { jurisdiction: 'US' };

      complianceMiddleware.logComplianceActivity(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate calling res.json()
      (mockResponse.json as any)({ test: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith('Compliance Activity:', 
        expect.objectContaining({
          jurisdiction: 'US',
        })
      );
    });
  });
});