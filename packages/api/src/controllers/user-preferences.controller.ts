import { Request, Response } from 'express';
import { UserPreferences, AlertType, DeliveryMethod, WeightClass } from '@ufc-platform/shared';
import { UserPreferencesService } from '../notifications/user-preferences-service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export class UserPreferencesController {
  private preferencesService: UserPreferencesService;

  constructor(preferencesService: UserPreferencesService) {
    this.preferencesService = preferencesService;
  }

  /**
   * Get user preferences
   */
  getPreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const preferences = await this.preferencesService.getUserPreferences(req.user.userId);
      
      if (!preferences) {
        // Create default preferences if none exist
        const defaultPreferences = this.preferencesService.createDefaultPreferences(req.user.userId);
        await this.preferencesService.updateUserPreferences(defaultPreferences);
        res.json({ preferences: defaultPreferences });
        return;
      }

      res.json({ preferences });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get preferences';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Update user preferences
   */
  updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const updates: Partial<UserPreferences> = req.body;
      
      // Ensure userId matches authenticated user
      const preferences: UserPreferences = {
        ...updates,
        userId: req.user.userId
      } as UserPreferences;

      await this.preferencesService.updateUserPreferences(preferences);
      
      res.json({ 
        message: 'Preferences updated successfully',
        preferences 
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update preferences';
      res.status(400).json({ error: message });
    }
  };

  /**
   * Follow a fighter
   */
  followFighter = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { fighterId } = req.params;
      
      if (!fighterId) {
        res.status(400).json({ error: 'Fighter ID is required' });
        return;
      }

      await this.preferencesService.followFighter(req.user.userId, fighterId);
      
      res.json({ message: 'Fighter followed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to follow fighter';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Unfollow a fighter
   */
  unfollowFighter = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { fighterId } = req.params;
      
      if (!fighterId) {
        res.status(400).json({ error: 'Fighter ID is required' });
        return;
      }

      await this.preferencesService.unfollowFighter(req.user.userId, fighterId);
      
      res.json({ message: 'Fighter unfollowed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unfollow fighter';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Update alert thresholds
   */
  updateThresholds = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const thresholds = req.body;
      
      await this.preferencesService.updateThresholds(req.user.userId, thresholds);
      
      res.json({ message: 'Thresholds updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update thresholds';
      res.status(400).json({ error: message });
    }
  };

  /**
   * Enable/disable notifications
   */
  setNotificationsEnabled = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'Enabled must be a boolean value' });
        return;
      }

      await this.preferencesService.setNotificationsEnabled(req.user.userId, enabled);
      
      res.json({ 
        message: `Notifications ${enabled ? 'enabled' : 'disabled'} successfully` 
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update notification settings';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Add alert type to user preferences
   */
  addAlertType = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { alertType } = req.body;
      
      const validAlertTypes: AlertType[] = ['odds_movement', 'fight_update', 'prediction_change', 'injury_report'];
      if (!validAlertTypes.includes(alertType)) {
        res.status(400).json({ error: 'Invalid alert type' });
        return;
      }

      const preferences = await this.preferencesService.getUserPreferences(req.user.userId);
      if (!preferences) {
        res.status(404).json({ error: 'User preferences not found' });
        return;
      }

      if (!preferences.alertTypes.includes(alertType)) {
        preferences.alertTypes.push(alertType);
        await this.preferencesService.updateUserPreferences(preferences);
      }

      res.json({ message: 'Alert type added successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add alert type';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Remove alert type from user preferences
   */
  removeAlertType = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { alertType } = req.params;
      
      const preferences = await this.preferencesService.getUserPreferences(req.user.userId);
      if (!preferences) {
        res.status(404).json({ error: 'User preferences not found' });
        return;
      }

      const index = preferences.alertTypes.indexOf(alertType as AlertType);
      if (index > -1) {
        preferences.alertTypes.splice(index, 1);
        await this.preferencesService.updateUserPreferences(preferences);
      }

      res.json({ message: 'Alert type removed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove alert type';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Add delivery method to user preferences
   */
  addDeliveryMethod = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { deliveryMethod } = req.body;
      
      const validDeliveryMethods: DeliveryMethod[] = ['email', 'push', 'sms'];
      if (!validDeliveryMethods.includes(deliveryMethod)) {
        res.status(400).json({ error: 'Invalid delivery method' });
        return;
      }

      const preferences = await this.preferencesService.getUserPreferences(req.user.userId);
      if (!preferences) {
        res.status(404).json({ error: 'User preferences not found' });
        return;
      }

      if (!preferences.deliveryMethods.includes(deliveryMethod)) {
        preferences.deliveryMethods.push(deliveryMethod);
        await this.preferencesService.updateUserPreferences(preferences);
      }

      res.json({ message: 'Delivery method added successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add delivery method';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Remove delivery method from user preferences
   */
  removeDeliveryMethod = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { deliveryMethod } = req.params;
      
      const preferences = await this.preferencesService.getUserPreferences(req.user.userId);
      if (!preferences) {
        res.status(404).json({ error: 'User preferences not found' });
        return;
      }

      const index = preferences.deliveryMethods.indexOf(deliveryMethod as DeliveryMethod);
      if (index > -1) {
        preferences.deliveryMethods.splice(index, 1);
        await this.preferencesService.updateUserPreferences(preferences);
      }

      res.json({ message: 'Delivery method removed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove delivery method';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Update timezone
   */
  updateTimezone = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { timezone } = req.body;
      
      if (!timezone || typeof timezone !== 'string') {
        res.status(400).json({ error: 'Valid timezone is required' });
        return;
      }

      const preferences = await this.preferencesService.getUserPreferences(req.user.userId);
      if (!preferences) {
        res.status(404).json({ error: 'User preferences not found' });
        return;
      }

      preferences.timezone = timezone;
      await this.preferencesService.updateUserPreferences(preferences);

      res.json({ message: 'Timezone updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update timezone';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Get preferences validation
   */
  validatePreferences = async (req: Request, res: Response): Promise<void> => {
    try {
      const preferences: UserPreferences = req.body;
      
      const validation = this.preferencesService.validatePreferences(preferences);
      
      res.json(validation);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to validate preferences';
      res.status(500).json({ error: message });
    }
  };
}