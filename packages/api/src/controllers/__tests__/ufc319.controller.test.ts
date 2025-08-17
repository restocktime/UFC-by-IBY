import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Request, Response } from 'express';
import { UFC319Controller } from '../ufc319.controller.js';
import { UFC319IntegrationService } from '../../services/ufc319-integration.service.js';

// Mock the service
vi.mock('../../services/ufc319-integration.service.js');

describe('UFC319Controller', () => {
  let controller: UFC319Controller;
  let mockService: Mock;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: Mock;
  let mockStatus: Mock;

  const mockUFC319Data = {
    event: {
      id: 'event-1',
      name: 'UFC 319: Makhachev vs. Moicano',
      date: new Date('2025-01-18'),
      venue: {
        name: 'Intuit Dome',
        city: 'Inglewood',
        country: 'USA'
      },
      commission: 'California State Athletic Commission',
      fights: ['fight-1']
    },
    fighters: [
      {
        id: 'fighter-1',
        name: 'Islam Makhachev',
        nickname: 'The Eagle'
      }
    ],
    fights: [
      {
        id: 'fight-1',
        eventId: 'event-1',
        fighter1Id: 'fighter-1',
        fighter2Id: 'fighter-2',
        weightClass: 'Lightweight',
        titleFight: true,
        mainEvent: true
      }
    ],
    ingestionResults: [
      {
        recordsProcessed: 10,
        recordsSkipped: 2,
        errors: []
      }
    ]
  };

  const mockIngestionResult = {
    recordsProcessed: 15,
    recordsSkipped: 3,
    errors: [],
    processingTimeMs: 2000
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });

    mockRequest = {
      params: {}
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson
    };

    mockService = vi.mocked(UFC319IntegrationService);
    mockService.mockImplementation(() => ({
      integrateUFC319Event: vi.fn().mockResolvedValue(mockUFC319Data),
      getUFC319Data: vi.fn().mockResolvedValue(mockUFC319Data),
      getFightCardDetails: vi.fn().mockResolvedValue({
        event: mockUFC319Data.event,
        fights: mockUFC319Data.fights,
        mainEvent: mockUFC319Data.fights[0],
        mainCard: [mockUFC319Data.fights[0]],
        preliminaryCard: []
      }),
      getFighterDetails: vi.fn().mockResolvedValue(mockUFC319Data.fighters[0]),
      discoverAndUpdateEvents: vi.fn().mockResolvedValue(mockIngestionResult)
    }));

    controller = new UFC319Controller();
  });

  describe('integrateEvent', () => {
    it('should successfully integrate UFC 319 event', async () => {
      await controller.integrateEvent(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'UFC 319 event integration completed successfully',
        data: {
          event: mockUFC319Data.event,
          fightersCount: 1,
          fightsCount: 1,
          ingestionSummary: {
            totalProcessed: 10,
            totalSkipped: 2,
            totalErrors: 0
          }
        }
      });
    });

    it('should handle integration errors', async () => {
      const mockError = new Error('Integration failed');
      const mockFailingService = {
        integrateUFC319Event: vi.fn().mockRejectedValue(mockError)
      };

      mockService.mockImplementation(() => mockFailingService);
      controller = new UFC319Controller();

      await controller.integrateEvent(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to integrate UFC 319 event',
        error: 'Integration failed'
      });
    });
  });

  describe('getEventData', () => {
    it('should return UFC 319 event data', async () => {
      await controller.getEventData(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          event: mockUFC319Data.event,
          fighters: mockUFC319Data.fighters,
          fights: mockUFC319Data.fights,
          summary: {
            eventName: mockUFC319Data.event.name,
            eventDate: mockUFC319Data.event.date,
            fightersCount: 1,
            fightsCount: 1,
            venue: mockUFC319Data.event.venue
          }
        }
      });
    });

    it('should return 404 when event data not found', async () => {
      const mockEmptyService = {
        getUFC319Data: vi.fn().mockResolvedValue(null)
      };

      mockService.mockImplementation(() => mockEmptyService);
      controller = new UFC319Controller();

      await controller.getEventData(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'UFC 319 event data not found. Please integrate the event first.'
      });
    });
  });

  describe('getFightCard', () => {
    it('should return UFC 319 fight card', async () => {
      await controller.getFightCard(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          event: mockUFC319Data.event,
          mainEvent: mockUFC319Data.fights[0],
          mainCard: [mockUFC319Data.fights[0]],
          preliminaryCard: [],
          totalFights: 1,
          cardStructure: {
            mainEventCount: 1,
            mainCardCount: 1,
            preliminaryCardCount: 0
          }
        }
      });
    });

    it('should return 404 when fight card not found', async () => {
      const mockEmptyService = {
        getFightCardDetails: vi.fn().mockResolvedValue({ event: null, fights: [], mainEvent: undefined, mainCard: [], preliminaryCard: [] })
      };

      mockService.mockImplementation(() => mockEmptyService);
      controller = new UFC319Controller();

      await controller.getFightCard(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'UFC 319 fight card not found'
      });
    });
  });

  describe('getFighterDetails', () => {
    it('should return fighter details', async () => {
      mockRequest.params = { fighterId: 'fighter-1' };

      await controller.getFighterDetails(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          fighter: mockUFC319Data.fighters[0],
          profile: {
            name: mockUFC319Data.fighters[0].name,
            nickname: mockUFC319Data.fighters[0].nickname,
            record: undefined,
            physicalStats: undefined,
            rankings: undefined,
            camp: undefined
          }
        }
      });
    });

    it('should return 404 when fighter not found', async () => {
      mockRequest.params = { fighterId: 'nonexistent-fighter' };

      const mockEmptyService = {
        getFighterDetails: vi.fn().mockResolvedValue(null)
      };

      mockService.mockImplementation(() => mockEmptyService);
      controller = new UFC319Controller();

      await controller.getFighterDetails(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Fighter with ID nonexistent-fighter not found'
      });
    });
  });

  describe('discoverEvents', () => {
    it('should discover events successfully', async () => {
      await controller.discoverEvents(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Event discovery completed',
        data: {
          recordsProcessed: mockIngestionResult.recordsProcessed,
          recordsSkipped: mockIngestionResult.recordsSkipped,
          errors: mockIngestionResult.errors,
          processingTimeMs: mockIngestionResult.processingTimeMs
        }
      });
    });

    it('should handle discovery errors', async () => {
      const mockError = new Error('Discovery failed');
      const mockFailingService = {
        discoverAndUpdateEvents: vi.fn().mockRejectedValue(mockError)
      };

      mockService.mockImplementation(() => mockFailingService);
      controller = new UFC319Controller();

      await controller.discoverEvents(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to discover events',
        error: 'Discovery failed'
      });
    });
  });

  describe('getIntegrationStatus', () => {
    it('should return integration status when data exists', async () => {
      await controller.getIntegrationStatus(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          isIntegrated: true,
          hasEventData: true,
          hasFighterData: true,
          hasFightData: true,
          lastUpdated: undefined,
          summary: {
            eventName: mockUFC319Data.event.name,
            eventDate: mockUFC319Data.event.date,
            fightersCount: 1,
            fightsCount: 1
          }
        }
      });
    });

    it('should return integration status when no data exists', async () => {
      const mockEmptyService = {
        getUFC319Data: vi.fn().mockResolvedValue(null)
      };

      mockService.mockImplementation(() => mockEmptyService);
      controller = new UFC319Controller();

      await controller.getIntegrationStatus(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          isIntegrated: false,
          hasEventData: false,
          hasFighterData: false,
          hasFightData: false,
          lastUpdated: null,
          summary: null
        }
      });
    });
  });
});