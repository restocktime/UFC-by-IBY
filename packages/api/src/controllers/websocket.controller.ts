import { Request, Response } from 'express';
import { webSocketService } from '../websocket/websocket.service.js';
import { liveUpdatesService } from '../websocket/live-updates.service.js';
import { bettingAlertsService } from '../notifications/betting-alerts.service.js';

export class WebSocketController {
  /**
   * Get WebSocket connection statistics
   */
  public async getConnectionStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = {
        connectedClients: webSocketService.getConnectedClientsCount(),
        topics: webSocketService.getTopics(),
        subscriptionStats: liveUpdatesService.getSubscriptionStats(),
        queueStatus: liveUpdatesService.getQueueStatus()
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get connected clients
   */
  public async getConnectedClients(req: Request, res: Response): Promise<void> {
    try {
      const clients = webSocketService.getAllClients().map(client => ({
        id: client.id,
        subscriptions: Array.from(client.subscriptions),
        metadata: {
          connectedAt: client.metadata.connectedAt,
          lastActivity: client.metadata.lastActivity,
          userAgent: client.metadata.userAgent,
          ip: client.metadata.ip
        }
      }));

      res.json({
        success: true,
        data: clients
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Send message to specific client
   */
  public async sendMessageToClient(req: Request, res: Response): Promise<void> {
    try {
      const { clientId } = req.params;
      const { type, data } = req.body;

      if (!clientId || !type) {
        res.status(400).json({
          success: false,
          error: 'Client ID and message type are required'
        });
        return;
      }

      const sent = webSocketService.sendToClient(clientId, {
        type,
        data,
        timestamp: new Date()
      });

      if (sent) {
        res.json({
          success: true,
          message: 'Message sent successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Client not found or not connected'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Broadcast message to topic
   */
  public async broadcastToTopic(req: Request, res: Response): Promise<void> {
    try {
      const { topic } = req.params;
      const { type, data } = req.body;

      if (!topic || !type) {
        res.status(400).json({
          success: false,
          error: 'Topic and message type are required'
        });
        return;
      }

      const sentCount = webSocketService.broadcast(topic, {
        type,
        data
      });

      res.json({
        success: true,
        data: {
          topic,
          sentCount,
          subscribersCount: webSocketService.getSubscribersCount(topic)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Disconnect client
   */
  public async disconnectClient(req: Request, res: Response): Promise<void> {
    try {
      const { clientId } = req.params;
      const { code = 1000, reason = 'Admin disconnect' } = req.body;

      const disconnected = webSocketService.disconnectClient(clientId, code, reason);

      if (disconnected) {
        res.json({
          success: true,
          message: 'Client disconnected successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Client not found'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get topic subscribers
   */
  public async getTopicSubscribers(req: Request, res: Response): Promise<void> {
    try {
      const { topic } = req.params;

      const subscribersCount = webSocketService.getSubscribersCount(topic);
      const allClients = webSocketService.getAllClients();
      
      const subscribers = allClients
        .filter(client => client.subscriptions.has(topic))
        .map(client => ({
          id: client.id,
          connectedAt: client.metadata.connectedAt,
          lastActivity: client.metadata.lastActivity
        }));

      res.json({
        success: true,
        data: {
          topic,
          subscribersCount,
          subscribers
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Publish live update
   */
  public async publishLiveUpdate(req: Request, res: Response): Promise<void> {
    try {
      const {
        type,
        entityType,
        entityId,
        data,
        sourceId,
        priority = 'medium',
        metadata
      } = req.body;

      if (!type || !entityType || !entityId) {
        res.status(400).json({
          success: false,
          error: 'Type, entityType, and entityId are required'
        });
        return;
      }

      liveUpdatesService.publishUpdate({
        type,
        entityType,
        entityId,
        data,
        sourceId,
        priority,
        metadata
      });

      res.json({
        success: true,
        message: 'Live update published successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get betting alerts for user
   */
  public async getUserBettingAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
        return;
      }

      const alerts = bettingAlertsService.getUserAlerts(userId);

      res.json({
        success: true,
        data: alerts
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Create betting alert
   */
  public async createBettingAlert(req: Request, res: Response): Promise<void> {
    try {
      const {
        userId,
        type,
        fightId,
        conditions,
        metadata
      } = req.body;

      if (!userId || !type || !fightId || !conditions) {
        res.status(400).json({
          success: false,
          error: 'UserId, type, fightId, and conditions are required'
        });
        return;
      }

      const alertId = bettingAlertsService.createAlert({
        userId,
        type,
        fightId,
        conditions,
        isActive: true,
        metadata
      });

      res.status(201).json({
        success: true,
        data: {
          alertId,
          message: 'Betting alert created successfully'
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update betting alert
   */
  public async updateBettingAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;
      const updates = req.body;

      if (!alertId) {
        res.status(400).json({
          success: false,
          error: 'Alert ID is required'
        });
        return;
      }

      const updated = bettingAlertsService.updateAlert(alertId, updates);

      if (updated) {
        res.json({
          success: true,
          message: 'Betting alert updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete betting alert
   */
  public async deleteBettingAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;

      if (!alertId) {
        res.status(400).json({
          success: false,
          error: 'Alert ID is required'
        });
        return;
      }

      const deleted = bettingAlertsService.deleteAlert(alertId);

      if (deleted) {
        res.json({
          success: true,
          message: 'Betting alert deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get betting opportunities
   */
  public async getBettingOpportunities(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.query;

      let opportunities;
      if (fightId) {
        opportunities = bettingAlertsService.getFightOpportunities(fightId as string);
      } else {
        opportunities = bettingAlertsService.getActiveOpportunities();
      }

      res.json({
        success: true,
        data: opportunities
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get alert statistics
   */
  public async getAlertStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = bettingAlertsService.getAlertStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export const webSocketController = new WebSocketController();