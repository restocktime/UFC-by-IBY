import { MongoMemoryServer } from 'mongodb-memory-server';
import { createClient } from 'redis';
import { DatabaseManager } from '../../database/manager';
import { config } from '../../config';

export class IntegrationTestSetup {
  private mongoServer?: MongoMemoryServer;
  private redisClient?: any;
  private dbManager?: DatabaseManager;

  async setup(): Promise<void> {
    // Setup in-memory MongoDB
    this.mongoServer = await MongoMemoryServer.create();
    const mongoUri = this.mongoServer.getUri();
    
    // Setup Redis (use test database)
    this.redisClient = createClient({
      url: process.env.REDIS_TEST_URL || 'redis://localhost:6379/1'
    });
    await this.redisClient.connect();

    // Initialize database manager with test configurations
    this.dbManager = new DatabaseManager({
      mongodb: {
        uri: mongoUri,
        options: { maxPoolSize: 5 }
      },
      redis: {
        url: process.env.REDIS_TEST_URL || 'redis://localhost:6379/1'
      },
      influxdb: {
        url: process.env.INFLUXDB_TEST_URL || 'http://localhost:8086',
        token: process.env.INFLUXDB_TEST_TOKEN || 'test-token',
        org: 'test-org',
        bucket: 'test-bucket'
      }
    });

    await this.dbManager.connect();
  }

  async teardown(): Promise<void> {
    if (this.dbManager) {
      await this.dbManager.disconnect();
    }
    
    if (this.redisClient) {
      await this.redisClient.flushDb();
      await this.redisClient.disconnect();
    }
    
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
  }

  getDatabaseManager(): DatabaseManager {
    if (!this.dbManager) {
      throw new Error('Database manager not initialized. Call setup() first.');
    }
    return this.dbManager;
  }

  getRedisClient() {
    return this.redisClient;
  }
}

// Global test setup
let testSetup: IntegrationTestSetup;

export const setupIntegrationTests = async (): Promise<IntegrationTestSetup> => {
  testSetup = new IntegrationTestSetup();
  await testSetup.setup();
  return testSetup;
};

export const teardownIntegrationTests = async (): Promise<void> => {
  if (testSetup) {
    await testSetup.teardown();
  }
};