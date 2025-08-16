import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Request, Response } from 'express';
import { UserPreferencesController } from '../user-preferences.controller.js';
import { UserPreferencesService } from '../../notifications/user-preferences-service.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { UserPreferences, UserRole } from '@ufc-platform/shared';

describe('UserPreferencesController', () => {
  let controller: UserPreferencesController;
  let mockPreferencesService: UserPreferencesService;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;

  const mockPreferences: UserPreferences = {
    userId: 'user-123',
    followedFighters: ['fighter-1'],
    weightClasses: ['lightweight'],
    alertTypes: ['odds_movement'],
    deliveryMethods: ['email'],
    thresholds: {
      oddsMovementPercentage: 15,
      predictionConfidenceChange: 10,
      injuryReportSeverity: 'major',
      minimumNotificationInterval: 30
    },
    timezone: 'UTC',
    enabled: true
  };

  beforeEach(() => {
    mockPreferencesService = {
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
      createDefaultPreferences: vi.fn(),
      followFighter: vi.fn(),
      unfollowFighter: vi.fn(),
      updateThresholds: vi.fn(),
      setNotificationsEnabled: vi.fn(),
      validatePreferences: vi.fn()
    } as any;

    controller = new UserPreferencesController(mockPreferencesService);

    mockReq = {
      user: {
        userId: 'user-123',
        email: 'test@example.com',
        role: UserRole.USER
      },
      body: {},
      params: {}
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
  });

  describe('getPreferences', () => {
    it('should return user preferences when they exist', async () => {
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(mockPreferences);

      await controller.getPreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.getUserPreferences).toHaveBeenCalledWith('user-123');
      expect(mockRes.json).toHaveBeenCalledWith({ preferences: mockPreferences });
    });

    it('should create default preferences when none exist', async () => {
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(null);
      (mockPreferencesService.createDefaultPreferences as Mock).mockReturnValue(mockPreferences);

      await controller.getPreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.createDefaultPreferences).toHaveBeenCalledWith('user-123');
      expect(mockPreferencesService.updateUserPreferences).toHaveBeenCalledWith(mockPreferences);
      expect(mockRes.json).toHaveBeenCalledWith({ preferences: mockPreferences });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.getPreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle service errors', async () => {
      (mockPreferencesService.getUserPreferences as Mock).mockRejectedValue(new Error('Database error'));

      await controller.getPreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences successfully', async () => {
      mockReq.body = { alertTypes: ['odds_movement', 'fight_update'] };

      await controller.updatePreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.updateUserPreferences).toHaveBeenCalledWith({
        alertTypes: ['odds_movement', 'fight_update'],
        userId: 'user-123'
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Preferences updated successfully',
        preferences: {
          alertTypes: ['odds_movement', 'fight_update'],
          userId: 'user-123'
        }
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.updatePreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle validation errors', async () => {
      mockReq.body = { alertTypes: ['invalid_type'] };
      (mockPreferencesService.updateUserPreferences as Mock).mockRejectedValue(new Error('Invalid preferences'));

      await controller.updatePreferences(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid preferences' });
    });
  });

  describe('followFighter', () => {
    it('should follow fighter successfully', async () => {
      mockReq.params = { fighterId: 'fighter-123' };

      await controller.followFighter(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.followFighter).toHaveBeenCalledWith('user-123', 'fighter-123');
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Fighter followed successfully' });
    });

    it('should return 400 if fighter ID is missing', async () => {
      mockReq.params = {};

      await controller.followFighter(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Fighter ID is required' });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { fighterId: 'fighter-123' };

      await controller.followFighter(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });
  });

  describe('unfollowFighter', () => {
    it('should unfollow fighter successfully', async () => {
      mockReq.params = { fighterId: 'fighter-123' };

      await controller.unfollowFighter(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.unfollowFighter).toHaveBeenCalledWith('user-123', 'fighter-123');
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Fighter unfollowed successfully' });
    });

    it('should return 400 if fighter ID is missing', async () => {
      mockReq.params = {};

      await controller.unfollowFighter(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Fighter ID is required' });
    });
  });

  describe('updateThresholds', () => {
    it('should update thresholds successfully', async () => {
      mockReq.body = { oddsMovementPercentage: 20 };

      await controller.updateThresholds(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.updateThresholds).toHaveBeenCalledWith('user-123', { oddsMovementPercentage: 20 });
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Thresholds updated successfully' });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.updateThresholds(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });
  });

  describe('setNotificationsEnabled', () => {
    it('should enable notifications successfully', async () => {
      mockReq.body = { enabled: true };

      await controller.setNotificationsEnabled(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.setNotificationsEnabled).toHaveBeenCalledWith('user-123', true);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Notifications enabled successfully' });
    });

    it('should disable notifications successfully', async () => {
      mockReq.body = { enabled: false };

      await controller.setNotificationsEnabled(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.setNotificationsEnabled).toHaveBeenCalledWith('user-123', false);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Notifications disabled successfully' });
    });

    it('should return 400 if enabled is not boolean', async () => {
      mockReq.body = { enabled: 'true' };

      await controller.setNotificationsEnabled(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Enabled must be a boolean value' });
    });
  });

  describe('addAlertType', () => {
    it('should add alert type successfully', async () => {
      mockReq.body = { alertType: 'fight_update' };
      const updatedPreferences = { ...mockPreferences, alertTypes: ['odds_movement'] };
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(updatedPreferences);

      await controller.addAlertType(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.getUserPreferences).toHaveBeenCalledWith('user-123');
      expect(mockPreferencesService.updateUserPreferences).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Alert type added successfully' });
    });

    it('should return 400 for invalid alert type', async () => {
      mockReq.body = { alertType: 'invalid_type' };

      await controller.addAlertType(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid alert type' });
    });

    it('should return 404 if user preferences not found', async () => {
      mockReq.body = { alertType: 'fight_update' };
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(null);

      await controller.addAlertType(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User preferences not found' });
    });
  });

  describe('removeAlertType', () => {
    it('should remove alert type successfully', async () => {
      mockReq.params = { alertType: 'odds_movement' };
      const updatedPreferences = { ...mockPreferences, alertTypes: ['odds_movement', 'fight_update'] };
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(updatedPreferences);

      await controller.removeAlertType(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.getUserPreferences).toHaveBeenCalledWith('user-123');
      expect(mockPreferencesService.updateUserPreferences).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Alert type removed successfully' });
    });

    it('should return 404 if user preferences not found', async () => {
      mockReq.params = { alertType: 'odds_movement' };
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(null);

      await controller.removeAlertType(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User preferences not found' });
    });
  });

  describe('updateTimezone', () => {
    it('should update timezone successfully', async () => {
      mockReq.body = { timezone: 'America/New_York' };
      (mockPreferencesService.getUserPreferences as Mock).mockResolvedValue(mockPreferences);

      await controller.updateTimezone(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockPreferencesService.getUserPreferences).toHaveBeenCalledWith('user-123');
      expect(mockPreferencesService.updateUserPreferences).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Timezone updated successfully' });
    });

    it('should return 400 if timezone is invalid', async () => {
      mockReq.body = { timezone: null };

      await controller.updateTimezone(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Valid timezone is required' });
    });
  });

  describe('validatePreferences', () => {
    it('should validate preferences successfully', async () => {
      mockReq.body = mockPreferences;
      const validationResult = { valid: true, errors: [] };
      (mockPreferencesService.validatePreferences as Mock).mockReturnValue(validationResult);

      await controller.validatePreferences(mockReq as Request, mockRes as Response);

      expect(mockPreferencesService.validatePreferences).toHaveBeenCalledWith(mockPreferences);
      expect(mockRes.json).toHaveBeenCalledWith(validationResult);
    });

    it('should return validation errors', async () => {
      mockReq.body = { ...mockPreferences, alertTypes: ['invalid_type'] };
      const validationResult = { valid: false, errors: ['Invalid alert type: invalid_type'] };
      (mockPreferencesService.validatePreferences as Mock).mockReturnValue(validationResult);

      await controller.validatePreferences(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(validationResult);
    });
  });
});