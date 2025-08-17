import { APIClientService } from './api-client.service';
import { EventEmitter } from 'events';

export interface LiveFight {
  id: string;
  eventId: string;
  fighter1: {
    id: string;
    name: string;
    nickname?: string;
    record: string;
    odds?: number;
  };
  fighter2: {
    id: string;
    name: string;
    nickname?: string;
    record: string;
    odds?: number;
  };
  weightClass: string;
  status: 'scheduled' | 'live' | 'completed';
  startTime?: Date;
  result?: {
    winner: string;
    method: string;
    round?: number;
    time?: string;
  };
}

export interface LiveOdds {
  fightId: string;
  sportsbook: string;
  timestamp: Date;
  moneyline: {
    fighter1: number;
    fighter2: number;
  };
  markets?: {
    method?: any;
    rounds?: any;
    props?: any;
  };
}

export interface LiveEvent {
  id: string;
  name: string;
  date: Date;
  venue: {
    name: string;
    city: string;
    state?: string;
    country: string;
  };
  fights: LiveFight[];
  status: 'upcoming' | 'live' | 'completed';
}

export class LiveDataService extends EventEmitter {
  private apiClient: APIClientService;
  private updateInterval: NodeJS.Timeout | null = null;
  private currentEvent: LiveEvent | null = null;
  private oddsCache: Map<string, LiveOdds[]> = new Map();

  constructor() {
    super();
    this.apiClient = new APIClientService();
  }

  async initialize(): Promise<void> {
    console.log('🔄 Initializing Live Data Service...');
    
    try {
      // Fetch UFC 319 data
      await this.fetchUFC319Data();
      
      // Start real-time updates
      this.startRealTimeUpdates();
      
      console.log('✅ Live Data Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Live Data Service:', error);
      throw error;
    }
  }

  async fetchUFC319Data(): Promise<LiveEvent> {
    console.log('📡 Fetching UFC 319 event data...');
    
    try {
      // Fetch event data from SportsData.io
      const eventData = await this.apiClient.getUFCEvent('864');
      console.log('📊 Event data received:', eventData?.Name || 'UFC 319');

      // Fetch odds data
      const oddsData = await this.apiClient.getEventOdds('864');
      console.log('💰 Odds data received for', oddsData?.length || 0, 'fights');

      // Fetch live odds from The Odds API
      const liveOdds = await this.apiClient.getLiveOdds();
      console.log('🔴 Live odds received for', liveOdds?.length || 0, 'MMA fights');

      // Transform and combine data
      const event = this.transformEventData(eventData, oddsData, liveOdds);
      this.currentEvent = event;

      // Cache odds data
      this.cacheOddsData(liveOdds);

      this.emit('eventUpdated', event);
      return event;

    } catch (error) {
      console.error('❌ Error fetching UFC 319 data:', error);
      
      // Return mock data if APIs fail (for development)
      const mockEvent = this.createMockUFC319Event();
      this.currentEvent = mockEvent;
      return mockEvent;
    }
  }

  private transformEventData(eventData: any, oddsData: any, liveOdds: any[]): LiveEvent {
    // Transform SportsData.io event data
    const event: LiveEvent = {
      id: eventData?.EventId?.toString() || '864',
      name: eventData?.Name || 'UFC 319: Teixeira vs. Hill',
      date: new Date(eventData?.DateTime || '2024-01-20T22:00:00Z'),
      venue: {
        name: eventData?.VenueName || 'T-Mobile Arena',
        city: eventData?.VenueCity || 'Las Vegas',
        state: eventData?.VenueState || 'Nevada',
        country: eventData?.VenueCountry || 'USA'
      },
      fights: [],
      status: this.determineEventStatus(eventData?.Status)
    };

    // Transform fights data
    if (eventData?.Fights) {
      event.fights = eventData.Fights.map((fight: any) => this.transformFightData(fight, oddsData, liveOdds));
    }

    return event;
  }

  private transformFightData(fightData: any, oddsData: any, liveOdds: any[]): LiveFight {
    // Find odds for this fight
    const fightOdds = this.findFightOdds(fightData, oddsData, liveOdds);

    return {
      id: fightData.FightId?.toString() || `fight-${Date.now()}`,
      eventId: fightData.EventId?.toString() || '864',
      fighter1: {
        id: fightData.Fighters?.[0]?.FighterId?.toString() || 'fighter1',
        name: fightData.Fighters?.[0]?.Name || 'Fighter 1',
        nickname: fightData.Fighters?.[0]?.Nickname,
        record: this.formatRecord(fightData.Fighters?.[0]),
        odds: fightOdds?.fighter1
      },
      fighter2: {
        id: fightData.Fighters?.[1]?.FighterId?.toString() || 'fighter2',
        name: fightData.Fighters?.[1]?.Name || 'Fighter 2',
        nickname: fightData.Fighters?.[1]?.Nickname,
        record: this.formatRecord(fightData.Fighters?.[1]),
        odds: fightOdds?.fighter2
      },
      weightClass: fightData.WeightClass || 'Unknown',
      status: this.determineFightStatus(fightData.Status),
      startTime: fightData.DateTime ? new Date(fightData.DateTime) : undefined,
      result: fightData.Winner ? {
        winner: fightData.Winner,
        method: fightData.ResultType || 'Decision',
        round: fightData.ResultRound,
        time: fightData.ResultTime
      } : undefined
    };
  }

  private findFightOdds(fightData: any, oddsData: any, liveOdds: any[]): { fighter1: number; fighter2: number } | null {
    // Try to match with live odds first
    const matchedLiveOdds = liveOdds.find(odds => 
      this.matchFighters(odds, fightData.Fighters)
    );

    if (matchedLiveOdds?.bookmakers?.[0]?.markets?.[0]?.outcomes) {
      const outcomes = matchedLiveOdds.bookmakers[0].markets[0].outcomes;
      return {
        fighter1: outcomes[0]?.price || 0,
        fighter2: outcomes[1]?.price || 0
      };
    }

    // Fallback to SportsData.io odds
    if (oddsData && Array.isArray(oddsData)) {
      const fightOdds = oddsData.find((odds: any) => odds.FightId === fightData.FightId);
      if (fightOdds?.MoneyLines?.[0]) {
        return {
          fighter1: fightOdds.MoneyLines[0].MoneyLine || 0,
          fighter2: fightOdds.MoneyLines[0].DrawMoneyLine || 0
        };
      }
    }

    return null;
  }

  private matchFighters(oddsData: any, fighters: any[]): boolean {
    if (!fighters || fighters.length < 2) return false;
    
    const fighter1Name = fighters[0]?.Name?.toLowerCase();
    const fighter2Name = fighters[1]?.Name?.toLowerCase();
    const homeTeam = oddsData.home_team?.toLowerCase();
    const awayTeam = oddsData.away_team?.toLowerCase();

    return (fighter1Name === homeTeam && fighter2Name === awayTeam) ||
           (fighter1Name === awayTeam && fighter2Name === homeTeam);
  }

  private formatRecord(fighter: any): string {
    if (!fighter) return '0-0-0';
    const wins = fighter.Wins || 0;
    const losses = fighter.Losses || 0;
    const draws = fighter.Draws || 0;
    return `${wins}-${losses}-${draws}`;
  }

  private determineEventStatus(status: string): 'upcoming' | 'live' | 'completed' {
    if (!status) return 'upcoming';
    
    switch (status.toLowerCase()) {
      case 'scheduled':
      case 'upcoming':
        return 'upcoming';
      case 'inprogress':
      case 'live':
        return 'live';
      case 'final':
      case 'completed':
        return 'completed';
      default:
        return 'upcoming';
    }
  }

  private determineFightStatus(status: string): 'scheduled' | 'live' | 'completed' {
    if (!status) return 'scheduled';
    
    switch (status.toLowerCase()) {
      case 'scheduled':
        return 'scheduled';
      case 'inprogress':
      case 'live':
        return 'live';
      case 'final':
      case 'completed':
        return 'completed';
      default:
        return 'scheduled';
    }
  }

  private cacheOddsData(liveOdds: any[]): void {
    if (!Array.isArray(liveOdds)) return;

    liveOdds.forEach(odds => {
      const fightId = odds.id || `${odds.home_team}-${odds.away_team}`;
      
      if (odds.bookmakers && Array.isArray(odds.bookmakers)) {
        const oddsEntries: LiveOdds[] = odds.bookmakers.map((bookmaker: any) => ({
          fightId,
          sportsbook: bookmaker.title || bookmaker.key,
          timestamp: new Date(bookmaker.last_update || Date.now()),
          moneyline: this.extractMoneyline(bookmaker.markets),
          markets: this.extractMarkets(bookmaker.markets)
        }));

        this.oddsCache.set(fightId, oddsEntries);
      }
    });
  }

  private extractMoneyline(markets: any[]): { fighter1: number; fighter2: number } {
    const h2hMarket = markets?.find(market => market.key === 'h2h');
    
    if (h2hMarket?.outcomes && h2hMarket.outcomes.length >= 2) {
      return {
        fighter1: h2hMarket.outcomes[0].price || 0,
        fighter2: h2hMarket.outcomes[1].price || 0
      };
    }

    return { fighter1: 0, fighter2: 0 };
  }

  private extractMarkets(markets: any[]): any {
    return markets?.reduce((acc, market) => {
      acc[market.key] = market.outcomes;
      return acc;
    }, {}) || {};
  }

  private startRealTimeUpdates(): void {
    // Update every 30 seconds
    this.updateInterval = setInterval(async () => {
      try {
        console.log('🔄 Updating live data...');
        await this.fetchUFC319Data();
      } catch (error) {
        console.error('❌ Error during live update:', error);
      }
    }, 30000);

    console.log('⏰ Real-time updates started (30s interval)');
  }

  private createMockUFC319Event(): LiveEvent {
    return {
      id: '864',
      name: 'UFC 319: Teixeira vs. Hill',
      date: new Date('2024-01-20T22:00:00Z'),
      venue: {
        name: 'T-Mobile Arena',
        city: 'Las Vegas',
        state: 'Nevada',
        country: 'USA'
      },
      fights: [
        {
          id: 'fight-main',
          eventId: '864',
          fighter1: {
            id: 'teixeira',
            name: 'Glover Teixeira',
            nickname: '',
            record: '33-7-0',
            odds: -150
          },
          fighter2: {
            id: 'hill',
            name: 'Jamahal Hill',
            nickname: 'Sweet Dreams',
            record: '11-1-0',
            odds: +130
          },
          weightClass: 'Light Heavyweight',
          status: 'scheduled',
          startTime: new Date('2024-01-20T23:00:00Z')
        }
      ],
      status: 'upcoming'
    };
  }

  // Public methods
  getCurrentEvent(): LiveEvent | null {
    return this.currentEvent;
  }

  getOddsForFight(fightId: string): LiveOdds[] {
    return this.oddsCache.get(fightId) || [];
  }

  async refreshData(): Promise<void> {
    await this.fetchUFC319Data();
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('⏹️ Real-time updates stopped');
    }
  }

  async getHealthStatus(): Promise<any> {
    const apiHealth = await this.apiClient.healthCheck();
    
    return {
      liveDataService: true,
      currentEvent: this.currentEvent?.name || null,
      lastUpdate: new Date().toISOString(),
      apiConnections: apiHealth,
      cachedFights: this.currentEvent?.fights?.length || 0,
      cachedOdds: this.oddsCache.size
    };
  }
}