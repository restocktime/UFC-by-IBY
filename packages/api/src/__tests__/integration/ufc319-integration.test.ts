import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';

describe('UFC 319 Integration API', () => {
  let app: any;

  beforeAll(async () => {
    app = createApp;
  });

  describe('GET /api/v1/ufc319/status', () => {
    it('should return integration status', async () => {
      const response = await request(app)
        .get('/api/v1/ufc319/status')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('isIntegrated');
      expect(response.body.data).toHaveProperty('hasEventData');
      expect(response.body.data).toHaveProperty('hasFighterData');
      expect(response.body.data).toHaveProperty('hasFightData');
    });
  });

  describe('GET /api/v1/ufc319/event', () => {
    it('should handle missing event data gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/ufc319/event');

      // Should either return 200 with data or 404 if not integrated
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
      } else {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toContain('not found');
      }
    });
  });

  describe('GET /api/v1/ufc319/fight-card', () => {
    it('should handle missing fight card gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/ufc319/fight-card');

      // Should either return 200 with data or 404 if not integrated
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('event');
        expect(response.body.data).toHaveProperty('totalFights');
        expect(response.body.data).toHaveProperty('cardStructure');
      } else {
        expect(response.body).toHaveProperty('success', false);
      }
    });
  });

  describe('POST /api/v1/ufc319/discover-events', () => {
    it('should attempt event discovery', async () => {
      const response = await request(app)
        .post('/api/v1/ufc319/discover-events');

      // Should either succeed or fail gracefully
      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
      
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('recordsProcessed');
        expect(response.body.data).toHaveProperty('recordsSkipped');
      }
    });
  });

  describe('API Documentation', () => {
    it('should include UFC 319 endpoints in API info', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body.endpoints).toHaveProperty('ufc319');
      expect(response.body.endpoints.ufc319).toBe('/api/v1/ufc319');
    });
  });
});