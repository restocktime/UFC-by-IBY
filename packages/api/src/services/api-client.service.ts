import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { APIClientFactory } from './api-client-factory';
import { apiKeys } from '../config/api-keys';
import { config } from '../config';

export class APIClientService {
  private factory: APIClientFactory;
  private sportsDataIOClient: AxiosInstance;
  private oddsAPIClient: AxiosInstance;
  private espnAPIClient: AxiosInstance;

  constructor() {
    this.factory = APIClientFactory.getInstance();
    this.initializeClients();
  }

  private initializeClients(): void {
    // SportsData.io client
    this.sportsDataIOClient = this.factory.createClient('sportsDataIO', {
      baseURL: apiKeys.sportsDataIO.baseUrl,
      timeout: config.timeouts.sportsDataIO,
      rateLimitConfig: config.rateLimits.sportsDataIO,
      useProxy: true,
      headers: {
        'User-Agent': 'UFC-Prediction-Platform/1.0'
      }
    });

    // The Odds API client
    this.oddsAPIClient = this.factory.createClient('oddsAPI', {
      baseURL: apiKeys.oddsAPI.baseUrl,
      timeout: config.timeouts.oddsAPI,
      rateLimitConfig: config.rateLimits.oddsAPI,
      useProxy: true,
      headers: {
        'User-Agent': 'UFC-Prediction-Platform/1.0'
      }
    });

    // ESPN API client
    this.espnAPIClient = this.factory.createClient('espnAPI', {
      baseURL: apiKeys.espnAPI.baseUrl,
      timeout: config.timeouts.espnAPI,
      rateLimitConfig: config.rateLimits.espnAPI,
      useProxy: false, // ESPN might block proxy requests
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Add request interceptors for API keys
    this.setupAPIKeyInterceptors();
  }

  private setupAPIKeyInterceptors(): void {
    // SportsData.io API key interceptor
    this.sportsDataIOClient.interceptors.request.use((config) => {
      config.params = { ...config.params, key: apiKeys.sportsDataIO.key };
      return config;
    });

    // The Odds API key interceptor
    this.oddsAPIClient.interceptors.request.use((config) => {
      config.params = { ...config.params, apiKey: apiKeys.oddsAPI.key };
      return config;
    });

    // ESPN doesn't require API key for public endpoints
  }

  // Public methods for making API calls
  async getSportsDataIO(endpoint: string, params?: any): Promise<AxiosResponse> {
    return this.sportsDataIOClient.get(endpoint, { params });
  }

  async getOddsAPI(endpoint: string, params?: any): Promise<AxiosResponse> {
    return this.oddsAPIClient.get(endpoint, { params });
  }

  async getESPN(endpoint: string, params?: any): Promise<AxiosResponse> {
    return this.espnAPIClient.get(endpoint, { params });
  }

  // Specific API methods for UFC data
  async getUFCEvent(eventId: string): Promise<any> {
    try {
      const response = await this.getSportsDataIO(`${apiKeys.sportsDataIO.endpoints.events}/${eventId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching UFC event ${eventId}:`, error);
      throw error;
    }
  }

  async getEventOdds(eventId: string): Promise<any> {
    try {
      const response = await this.getSportsDataIO(`${apiKeys.sportsDataIO.endpoints.eventOdds}/${eventId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching event odds ${eventId}:`, error);
      throw error;
    }
  }

  async getAllEvents(): Promise<any> {
    try {
      const response = await this.getSportsDataIO(apiKeys.sportsDataIO.endpoints.events);
      return response.data;
    } catch (error) {
      console.error('Error fetching all UFC events:', error);
      throw error;
    }
  }

  async getFighters(): Promise<any> {
    try {
      const response = await this.getSportsDataIO(apiKeys.sportsDataIO.endpoints.fighters);
      return response.data;
    } catch (error) {
      console.error('Error fetching fighters:', error);
      throw error;
    }
  }

  async getFights(): Promise<any> {
    try {
      const response = await this.getSportsDataIO(apiKeys.sportsDataIO.endpoints.fights);
      return response.data;
    } catch (error) {
      console.error('Error fetching fights:', error);
      throw error;
    }
  }

  async getLiveOdds(regions = 'us', markets = 'h2h', oddsFormat = 'american'): Promise<any> {
    try {
      const params = {
        regions,
        markets,
        oddsFormat
      };
      const response = await this.getOddsAPI(apiKeys.oddsAPI.endpoints.odds, params);
      return response.data;
    } catch (error) {
      console.error('Error fetching live odds:', error);
      throw error;
    }
  }

  async getOddsSports(): Promise<any> {
    try {
      const response = await this.getOddsAPI(apiKeys.oddsAPI.endpoints.sports);
      return response.data;
    } catch (error) {
      console.error('Error fetching odds sports:', error);
      throw error;
    }
  }

  async getOddsEvents(): Promise<any> {
    try {
      const response = await this.getOddsAPI(apiKeys.oddsAPI.endpoints.events);
      return response.data;
    } catch (error) {
      console.error('Error fetching odds events:', error);
      throw error;
    }
  }

  async getESPNScoreboard(): Promise<any> {
    try {
      const params = {
        sport: 'mma',
        league: 'ufc',
        region: 'us',
        lang: 'en',
        contentorigin: 'espn',
        configuration: 'SITE_DEFAULT',
        platform: 'web',
        buyWindow: '1m',
        showAirings: 'buy,live,replay',
        showZipLookup: true,
        tz: 'America/New_York',
        postalCode: '33126',
        playabilitySource: 'playbackId'
      };
      const response = await this.getESPN(apiKeys.espnAPI.endpoints.scoreboard, params);
      return response.data;
    } catch (error) {
      console.error('Error fetching ESPN scoreboard:', error);
      throw error;
    }
  }

  async getESPNEvents(): Promise<any> {
    try {
      const response = await this.getESPN(apiKeys.espnAPI.endpoints.events);
      return response.data;
    } catch (error) {
      console.error('Error fetching ESPN events:', error);
      throw error;
    }
  }

  async getESPNFighters(): Promise<any> {
    try {
      const response = await this.getESPN(apiKeys.espnAPI.endpoints.fighters);
      return response.data;
    } catch (error) {
      console.error('Error fetching ESPN fighters:', error);
      throw error;
    }
  }

  // Health check method
  async healthCheck(): Promise<{ [key: string]: { status: boolean; responseTime?: number; error?: string } }> {
    const results: { [key: string]: { status: boolean; responseTime?: number; error?: string } } = {};

    // Test SportsData.io
    const sportsDataIOStart = Date.now();
    try {
      await this.getSportsDataIO('/scores/json/Competitions');
      results.sportsDataIO = {
        status: true,
        responseTime: Date.now() - sportsDataIOStart
      };
    } catch (error) {
      results.sportsDataIO = {
        status: false,
        responseTime: Date.now() - sportsDataIOStart,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test The Odds API
    const oddsAPIStart = Date.now();
    try {
      await this.getOddsAPI('/sports');
      results.oddsAPI = {
        status: true,
        responseTime: Date.now() - oddsAPIStart
      };
    } catch (error) {
      results.oddsAPI = {
        status: false,
        responseTime: Date.now() - oddsAPIStart,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test ESPN API
    const espnAPIStart = Date.now();
    try {
      await this.getESPN('/common/v3/sports');
      results.espnAPI = {
        status: true,
        responseTime: Date.now() - espnAPIStart
      };
    } catch (error) {
      results.espnAPI = {
        status: false,
        responseTime: Date.now() - espnAPIStart,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    return results;
  }

  // Get rate limit status
  getRateLimitStatus(): any {
    return this.factory.getRateLimitStatus();
  }

  // Destroy clients and cleanup
  destroy(): void {
    this.factory.destroy();
  }
}