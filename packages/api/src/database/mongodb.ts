import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { databaseConfig } from './config';

export class MongoDBConnection {
  private static instance: MongoDBConnection;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const options: MongoClientOptions = {
        ...databaseConfig.mongodb.options,
      };

      this.client = new MongoClient(databaseConfig.mongodb.uri, options);
      await this.client.connect();
      
      this.db = this.client.db(databaseConfig.mongodb.dbName);
      this.isConnected = true;

      console.log('MongoDB connected successfully');

      // Set up connection event handlers
      this.client.on('error', (error) => {
        console.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('MongoDB connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnect', () => {
        console.log('MongoDB reconnected');
        this.isConnected = true;
      });

    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.isConnected = false;
      console.log('MongoDB disconnected');
    }
  }

  public getDb(): Db {
    if (!this.db || !this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  public getClient(): MongoClient {
    if (!this.client || !this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.client;
  }

  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      if (!this.client || !this.isConnected) {
        return {
          status: 'unhealthy',
          details: { error: 'Not connected to MongoDB' }
        };
      }

      // Ping the database
      await this.client.db('admin').admin().ping();
      
      // Get server status
      const serverStatus = await this.client.db('admin').admin().serverStatus();
      
      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          host: serverStatus.host,
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }
}