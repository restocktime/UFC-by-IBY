import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebSocketService } from '../websocket.service.js';

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WebSocketService();
  });

  afterEach(() => {
    service.removeAllListeners();
  });

  describe('basic functionality', () => {
    it('should create WebSocket service instance', () => {
      expect(service).toBeDefined();
      expect(service.getConnectedClientsCount()).toBe(0);
    });

    it('should return empty topics initially', () => {
      const topics = service.getTopics();
      expect(topics).toEqual([]);
    });

    it('should return 0 subscribers for non-existent topic', () => {
      const count = service.getSubscribersCount('non-existent');
      expect(count).toBe(0);
    });

    it('should return false when sending to non-existent client', () => {
      const result = service.sendToClient('non-existent', {
        type: 'test',
        data: {},
        timestamp: new Date()
      });
      expect(result).toBe(false);
    });

    it('should return 0 when broadcasting to non-existent topic', () => {
      const result = service.broadcast('non-existent', {
        type: 'test',
        data: {}
      });
      expect(result).toBe(0);
    });

    it('should return empty clients array initially', () => {
      const clients = service.getAllClients();
      expect(clients).toEqual([]);
    });

    it('should return undefined for non-existent client', () => {
      const client = service.getClient('non-existent');
      expect(client).toBeUndefined();
    });

    it('should return false when disconnecting non-existent client', () => {
      const result = service.disconnectClient('non-existent');
      expect(result).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      const eventSpy = vi.fn();
      service.on('serverShutdown', eventSpy);

      await service.shutdown();

      // Should complete without error
      expect(eventSpy).not.toHaveBeenCalled();
    });
  });
});