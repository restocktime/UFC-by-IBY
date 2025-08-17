import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  clientId?: string;
}

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  metadata: {
    userAgent?: string;
    ip?: string;
    connectedAt: Date;
    lastActivity: Date;
  };
}

export interface SubscriptionFilter {
  eventType?: string;
  sourceId?: string;
  entityId?: string;
  userId?: string;
}

export class WebSocketService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // topic -> clientIds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  constructor() {
    super();
  }

  /**
   * Initialize WebSocket server
   */
  public initialize(server: Server, path: string = '/ws'): void {
    this.wss = new WebSocketServer({ 
      server, 
      path,
      perMessageDeflate: false
    });

    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      this.handleConnection(socket, request);
    });

    this.wss.on('error', (error) => {
      this.emit('serverError', error);
    });

    // Start heartbeat
    this.startHeartbeat();

    this.emit('serverStarted', { path });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const clientId = this.generateClientId();
    
    const client: WebSocketClient = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      metadata: {
        userAgent: request.headers['user-agent'],
        ip: request.socket.remoteAddress,
        connectedAt: new Date(),
        lastActivity: new Date()
      }
    };

    this.clients.set(clientId, client);

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connection',
      data: { clientId, message: 'Connected successfully' },
      timestamp: new Date()
    });

    // Setup event handlers
    socket.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    socket.on('close', (code, reason) => {
      this.handleDisconnection(clientId, code, reason);
    });

    socket.on('error', (error) => {
      this.handleClientError(clientId, error);
    });

    socket.on('pong', () => {
      this.updateClientActivity(clientId);
    });

    this.emit('clientConnected', { clientId, client });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.updateClientActivity(clientId);

    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message.data);
          break;
        
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message.data);
          break;
        
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong',
            data: { timestamp: new Date() },
            timestamp: new Date()
          });
          break;
        
        default:
          this.emit('clientMessage', { clientId, message });
      }
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle client subscription
   */
  private handleSubscription(clientId: string, subscriptionData: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { topic, filter } = subscriptionData;
    
    if (!topic) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Topic is required for subscription' },
        timestamp: new Date()
      });
      return;
    }

    // Add client to topic subscription
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(clientId);
    
    // Add to client's subscriptions
    client.subscriptions.add(topic);

    this.sendToClient(clientId, {
      type: 'subscribed',
      data: { topic, filter },
      timestamp: new Date()
    });

    this.emit('clientSubscribed', { clientId, topic, filter });
  }

  /**
   * Handle client unsubscription
   */
  private handleUnsubscription(clientId: string, unsubscriptionData: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { topic } = unsubscriptionData;

    if (topic) {
      // Remove from specific topic
      this.subscriptions.get(topic)?.delete(clientId);
      client.subscriptions.delete(topic);
    } else {
      // Remove from all topics
      for (const [topicName, subscribers] of this.subscriptions) {
        subscribers.delete(clientId);
      }
      client.subscriptions.clear();
    }

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: { topic },
      timestamp: new Date()
    });

    this.emit('clientUnsubscribed', { clientId, topic });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all subscriptions
    for (const [topic, subscribers] of this.subscriptions) {
      subscribers.delete(clientId);
    }

    // Remove client
    this.clients.delete(clientId);

    this.emit('clientDisconnected', { 
      clientId, 
      code, 
      reason: reason.toString(),
      duration: Date.now() - client.metadata.connectedAt.getTime()
    });
  }

  /**
   * Handle client error
   */
  private handleClientError(clientId: string, error: Error): void {
    this.emit('clientError', { clientId, error });
  }

  /**
   * Send message to specific client
   */
  public sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      this.updateClientActivity(clientId);
      return true;
    } catch (error) {
      this.handleClientError(clientId, error as Error);
      return false;
    }
  }

  /**
   * Broadcast message to all subscribers of a topic
   */
  public broadcast(topic: string, message: Omit<WebSocketMessage, 'timestamp'>): number {
    const subscribers = this.subscriptions.get(topic);
    if (!subscribers) return 0;

    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: new Date()
    };

    let sentCount = 0;
    for (const clientId of subscribers) {
      if (this.sendToClient(clientId, fullMessage)) {
        sentCount++;
      }
    }

    this.emit('messageBroadcast', { topic, sentCount, totalSubscribers: subscribers.size });
    return sentCount;
  }

  /**
   * Broadcast to clients with filter
   */
  public broadcastWithFilter(
    topic: string, 
    message: Omit<WebSocketMessage, 'timestamp'>,
    filter: (client: WebSocketClient) => boolean
  ): number {
    const subscribers = this.subscriptions.get(topic);
    if (!subscribers) return 0;

    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: new Date()
    };

    let sentCount = 0;
    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && filter(client)) {
        if (this.sendToClient(clientId, fullMessage)) {
          sentCount++;
        }
      }
    }

    return sentCount;
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get subscribers count for topic
   */
  public getSubscribersCount(topic: string): number {
    return this.subscriptions.get(topic)?.size || 0;
  }

  /**
   * Get all topics
   */
  public getTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get client information
   */
  public getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients
   */
  public getAllClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Disconnect client
   */
  public disconnectClient(clientId: string, code: number = 1000, reason: string = 'Server disconnect'): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.socket.close(code, reason);
    return true;
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = now - (this.HEARTBEAT_INTERVAL * 2);

      for (const [clientId, client] of this.clients) {
        if (client.socket.readyState === WebSocket.OPEN) {
          // Check if client is stale
          if (client.metadata.lastActivity.getTime() < staleThreshold) {
            this.disconnectClient(clientId, 1001, 'Stale connection');
          } else {
            // Send ping
            client.socket.ping();
          }
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Update client activity timestamp
   */
  private updateClientActivity(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.metadata.lastActivity = new Date();
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown WebSocket server
   */
  public shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.wss) {
        // Close all client connections
        for (const client of this.clients.values()) {
          client.socket.close(1001, 'Server shutdown');
        }

        this.wss.close(() => {
          this.clients.clear();
          this.subscriptions.clear();
          this.emit('serverShutdown');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();