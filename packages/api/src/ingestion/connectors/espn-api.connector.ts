import { APIConnector } from '../base/api-connector.js';
import { 
  Fighter, 
  Fight, 
  Event,
  ValidationError, 
  DataIngestionResult,
  WeightClass,
  FightStance,
  FightStatus,
  FightMethod
} from '@ufc-platform/shared';
import { APISourceConfig, sourceConfigManager } from '../config/source-configs.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';
import { EventRepository } from '../../repositories/event.repository.js';

export interface ESPNScoreboardResponse {
  sports: ESPNSport[];
}

export interface ESPNSport {
  id: string;
  name: string;
  leagues: ESPNLeague[];
}

export interface ESPNLeague {
  id: string;
  name: string;
  abbreviation: string;
  events: ESPNEvent[];
}

export interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  status: ESPNEventStatus;
  competitions: ESPNCompetition[];
}

export interface ESPNEventStatus {
  clock: number;
  displayClock: string;
  period: number;
  type: {
    id: string;
    name: string;
    state: string;
    completed: boolean;
    description: string;
  };
}

export interface ESPNCompetition {
  id: string;
  date: string;
  attendance?: number;
  type: {
    id: string;
    abbreviation: string;
  };
  timeValid: boolean;
  neutralSite: boolean;
  conferenceCompetition: boolean;
  playByPlayAvailable: boolean;
  recent: boolean;
  venue: ESPNVenue;
  competitors: ESPNCompetitor[];
  notes?: ESPNNote[];
  status: ESPNEventStatus;
  broadcasts?: ESPNBroadcast[];
}

export interface ESPNVenue {
  id: string;
  fullName: string;
  address: {
    city: string;
    state?: string;
    country?: string;
  };
  capacity?: number;
  indoor?: boolean;
}

export interface ESPNCompetitor {
  id: string;
  uid: string;
  type: string;
  order: number;
  homeAway: string;
  winner?: boolean;
  team: ESPNTeam;
  score?: string;
  linescores?: any[];
  statistics?: any[];
  records?: ESPNRecord[];
}

export interface ESPNTeam {
  id: string;
  uid: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  color: string;
  alternateColor: string;
  isActive: boolean;
  venue: ESPNVenue;
  links: ESPNLink[];
  logo: string;
}

export interface ESPNRecord {
  name: string;
  abbreviation: string;
  type: string;
  summary: string;
}

export interface ESPNNote {
  type: string;
  headline: string;
}

export interface ESPNBroadcast {
  market: string;
  names: string[];
}

export interface ESPNLink {
  rel: string[];
  href: string;
  text: string;
  isExternal: boolean;
  isPremium: boolean;
}

export interface ESPNFighterRankings {
  athletes: ESPNAthlete[];
}

export interface ESPNAthlete {
  id: string;
  uid: string;
  guid: string;
  displayName: string;
  shortName: string;
  weight: number;
  displayWeight: string;
  age: number;
  dateOfBirth: string;
  birthPlace: {
    city: string;
    state?: string;
    country: string;
  };
  citizenship: string;
  height: number;
  displayHeight: string;
  position: {
    id: string;
    name: string;
    displayName: string;
    abbreviation: string;
  };
  jersey: string;
  active: boolean;
  alternateIds: {
    sdr: string;
  };
  headshot: {
    href: string;
    alt: string;
  };
  links: ESPNLink[];
  statistics?: ESPNAthleteStats[];
}

export interface ESPNAthleteStats {
  name: string;
  displayName: string;
  shortDisplayName: string;
  description: string;
  abbreviation: string;
  type: string;
  value: number;
  displayValue: string;
}

export interface LiveFightData {
  eventId: string;
  fightId: string;
  status: FightStatus;
  currentRound?: number;
  timeRemaining?: string;
  fighter1Stats?: FightStats;
  fighter2Stats?: FightStats;
  lastUpdate: Date;
}

export interface FightStats {
  significantStrikes: { landed: number; attempted: number };
  totalStrikes: { landed: number; attempted: number };
  takedowns: { landed: number; attempted: number };
  submissionAttempts: number;
  knockdowns: number;
  controlTime: string;
}

export class ESPNAPIConnector extends APIConnector {
  private fighterRepository: FighterRepository;
  private fightRepository: FightRepository;
  private eventRepository: EventRepository;
  private liveFightCache: Map<string, LiveFightData> = new Map();

  constructor(
    fighterRepository?: FighterRepository,
    fightRepository?: FightRepository,
    eventRepository?: EventRepository
  ) {
    const config = sourceConfigManager.getConfig('ESPN_API');
    if (!config) {
      throw new Error('ESPN API configuration not found');
    }
    
    super('ESPN_API', config);
    
    this.fighterRepository = fighterRepository || new FighterRepository();
    this.fightRepository = fightRepository || new FightRepository();
    this.eventRepository = eventRepository || new EventRepository();
  }

  public async syncData(): Promise<DataIngestionResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalSkipped = 0;
    const allErrors: ValidationError[] = [];

    try {
      // Sync current MMA events from ESPN scoreboard
      const eventResult = await this.syncMMAEvents();
      totalProcessed += eventResult.recordsProcessed;
      totalSkipped += eventResult.recordsSkipped;
      allErrors.push(...eventResult.errors);

      // Sync fighter rankings and data
      const fighterResult = await this.syncFighterRankings();
      totalProcessed += fighterResult.recordsProcessed;
      totalSkipped += fighterResult.recordsSkipped;
      allErrors.push(...fighterResult.errors);

      const result = this.createIngestionResult(totalProcessed, totalSkipped, allErrors);
      result.processingTimeMs = Date.now() - startTime;
      
      this.emit('syncComplete', result);
      return result;

    } catch (error: any) {
      this.emit('syncError', { error: error.message, sourceId: this.sourceId });
      throw error;
    }
  }

  public async syncMMAEvents(): Promise<DataIngestionResult> {
    try {
      // ESPN uses a different URL structure for MMA
      const url = 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
      
      const response = await this.makeRequest<ESPNScoreboardResponse>({
        method: 'GET',
        url
      });

      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      // ESPN returns sports array, find MMA/UFC
      const mmaSport = response.data.sports?.find(sport => 
        sport.name.toLowerCase().includes('mma') || 
        sport.name.toLowerCase().includes('ufc')
      );

      if (!mmaSport || !mmaSport.leagues) {
        return this.createIngestionResult(0, 0, [
          this.createValidationError('sports', 'No MMA/UFC data found in ESPN response', response.data, 'warning')
        ]);
      }

      for (const league of mmaSport.leagues) {
        if (!league.events) continue;

        for (const eventData of league.events) {
          const validationErrors = this.validateEventData(eventData);
          if (validationErrors.length > 0) {
            errors.push(...validationErrors);
            if (validationErrors.some(e => e.severity === 'error')) {
              skipped++;
              continue;
            }
          }

          try {
            const transformedEvent = this.transformEventData(eventData);
            
            // Check if event already exists
            const existingEvent = await this.eventRepository.findByName(transformedEvent.name);
            let savedEvent: Event;
            if (existingEvent) {
              savedEvent = await this.eventRepository.update(existingEvent.id, transformedEvent) || existingEvent;
            } else {
              savedEvent = await this.eventRepository.create(transformedEvent);
            }

            // Process fights within the event
            const fightResults = await this.processFightsFromEvent(eventData, savedEvent.id);
            processed += 1 + fightResults.recordsProcessed;
            skipped += fightResults.recordsSkipped;
            errors.push(...fightResults.errors);

            this.emit('eventProcessed', { 
              eventId: savedEvent.id, 
              name: savedEvent.name, 
              fightsCount: fightResults.recordsProcessed 
            });

          } catch (error: any) {
            errors.push(this.createValidationError(
              'event_processing',
              `Failed to process event ${eventData.id}: ${error.message}`,
              eventData,
              'error'
            ));
            skipped++;
          }
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync MMA events from ESPN: ${error.message}`);
    }
  }

  public async syncFighterRankings(): Promise<DataIngestionResult> {
    try {
      // ESPN fighter rankings endpoint
      const url = 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/athletes';
      
      const response = await this.makeRequest<ESPNFighterRankings>({
        method: 'GET',
        url,
        params: {
          limit: '200' // Get more fighters
        }
      });

      const athletes = response.data.athletes || [];
      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      for (const athleteData of athletes) {
        const validationErrors = this.validateFighterData(athleteData);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          if (validationErrors.some(e => e.severity === 'error')) {
            skipped++;
            continue;
          }
        }

        try {
          const transformedFighter = this.transformFighterData(athleteData);
          
          // Check if fighter already exists
          const existingFighter = await this.fighterRepository.findByName(transformedFighter.name);
          if (existingFighter) {
            await this.fighterRepository.update(existingFighter.id, transformedFighter);
          } else {
            await this.fighterRepository.create(transformedFighter);
          }
          
          processed++;
          this.emit('fighterProcessed', { 
            fighterId: `espn_${athleteData.id}`, 
            name: transformedFighter.name 
          });

        } catch (error: any) {
          errors.push(this.createValidationError(
            'fighter_transformation',
            `Failed to transform fighter data: ${error.message}`,
            athleteData,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync fighter rankings from ESPN: ${error.message}`);
    }
  }

  public async getLiveFightData(eventId: string): Promise<LiveFightData[]> {
    try {
      const url = `https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/summary`;
      
      const response = await this.makeRequest<any>({
        method: 'GET',
        url,
        params: { event: eventId }
      });

      const liveFights: LiveFightData[] = [];
      
      // Process live fight data from ESPN's real-time feed
      if (response.data.competitions) {
        for (const competition of response.data.competitions) {
          const liveData = this.extractLiveFightData(competition, eventId);
          if (liveData) {
            liveFights.push(liveData);
            this.liveFightCache.set(liveData.fightId, liveData);
          }
        }
      }

      return liveFights;

    } catch (error: any) {
      this.emit('liveFightError', { eventId, error: error.message });
      return [];
    }
  }

  public validateData(data: any): ValidationError[] {
    if (data.sports) {
      // Scoreboard response
      return this.validateScoreboardData(data);
    } else if (data.athletes) {
      // Fighter rankings response
      return this.validateFighterRankingsData(data);
    } else if (data.id && data.name) {
      // Single event
      return this.validateEventData(data);
    }

    return [this.createValidationError('data', 'Unknown ESPN data format', data, 'error')];
  }

  public validateScoreboardData(scoreboard: ESPNScoreboardResponse): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!scoreboard.sports || !Array.isArray(scoreboard.sports)) {
      errors.push(this.createValidationError('sports', 'Sports array is required', scoreboard.sports, 'error'));
      return errors;
    }

    scoreboard.sports.forEach((sport, sportIndex) => {
      if (!sport.leagues || !Array.isArray(sport.leagues)) {
        errors.push(this.createValidationError(
          `sports[${sportIndex}].leagues`, 
          'Leagues array is required', 
          sport.leagues, 
          'warning'
        ));
        return;
      }

      sport.leagues.forEach((league, leagueIndex) => {
        if (league.events) {
          league.events.forEach((event, eventIndex) => {
            const eventErrors = this.validateEventData(event);
            errors.push(...eventErrors.map(e => ({
              ...e,
              field: `sports[${sportIndex}].leagues[${leagueIndex}].events[${eventIndex}].${e.field}`
            })));
          });
        }
      });
    });

    return errors;
  }

  public validateEventData(event: ESPNEvent): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!event.id) {
      errors.push(this.createValidationError('id', 'Event ID is required', event.id, 'error'));
    }

    if (!event.name || event.name.trim().length === 0) {
      errors.push(this.createValidationError('name', 'Event name is required', event.name, 'error'));
    }

    if (!event.date) {
      errors.push(this.createValidationError('date', 'Event date is required', event.date, 'error'));
    } else {
      const eventDate = new Date(event.date);
      if (isNaN(eventDate.getTime())) {
        errors.push(this.createValidationError('date', 'Invalid date format', event.date, 'error'));
      }
    }

    if (event.competitions) {
      event.competitions.forEach((competition, index) => {
        if (!competition.competitors || competition.competitors.length !== 2) {
          errors.push(this.createValidationError(
            `competitions[${index}].competitors`, 
            'Competition must have exactly 2 competitors', 
            competition.competitors, 
            'warning'
          ));
        }
      });
    }

    return errors;
  }

  public validateFighterRankingsData(rankings: ESPNFighterRankings): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!rankings.athletes || !Array.isArray(rankings.athletes)) {
      errors.push(this.createValidationError('athletes', 'Athletes array is required', rankings.athletes, 'error'));
      return errors;
    }

    rankings.athletes.forEach((athlete, index) => {
      const athleteErrors = this.validateFighterData(athlete);
      errors.push(...athleteErrors.map(e => ({
        ...e,
        field: `athletes[${index}].${e.field}`
      })));
    });

    return errors;
  }

  public validateFighterData(athlete: ESPNAthlete): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!athlete.id) {
      errors.push(this.createValidationError('id', 'Athlete ID is required', athlete.id, 'error'));
    }

    if (!athlete.displayName || athlete.displayName.trim().length === 0) {
      errors.push(this.createValidationError('displayName', 'Display name is required', athlete.displayName, 'error'));
    }

    if (athlete.weight && (athlete.weight < 100 || athlete.weight > 300)) {
      errors.push(this.createValidationError('weight', 'Weight seems unrealistic', athlete.weight, 'warning'));
    }

    if (athlete.height && (athlete.height < 50 || athlete.height > 90)) {
      errors.push(this.createValidationError('height', 'Height seems unrealistic', athlete.height, 'warning'));
    }

    if (athlete.age && (athlete.age < 18 || athlete.age > 50)) {
      errors.push(this.createValidationError('age', 'Age seems unrealistic for active fighter', athlete.age, 'warning'));
    }

    return errors;
  }

  public transformData(data: any): any {
    if (data.sports) {
      // Transform scoreboard data
      return this.transformScoreboardData(data);
    } else if (data.athletes) {
      // Transform fighter rankings
      return data.athletes.map((athlete: ESPNAthlete) => this.transformFighterData(athlete));
    } else if (data.id && data.name) {
      // Transform single event
      return this.transformEventData(data);
    }

    return data;
  }

  public transformScoreboardData(scoreboard: ESPNScoreboardResponse): any[] {
    const results: any[] = [];

    for (const sport of scoreboard.sports || []) {
      for (const league of sport.leagues || []) {
        for (const event of league.events || []) {
          results.push(this.transformEventData(event));
        }
      }
    }

    return results;
  }

  public transformEventData(espnEvent: ESPNEvent): Omit<Event, 'id'> {
    const competition = espnEvent.competitions?.[0];
    const venue = competition?.venue;

    return {
      name: espnEvent.name,
      date: new Date(espnEvent.date),
      venue: {
        name: venue?.fullName || 'TBD',
        city: venue?.address?.city || 'TBD',
        state: venue?.address?.state,
        country: venue?.address?.country || 'USA'
      },
      commission: 'TBD', // ESPN doesn't provide commission info
      fights: [] // Will be populated when fights are processed
    };
  }

  public transformFighterData(espnAthlete: ESPNAthlete): Omit<Fighter, 'id'> {
    const now = new Date();
    
    // Extract weight class from position or weight
    const weightClass = this.determineWeightClass(espnAthlete.weight, espnAthlete.position?.name);
    
    return {
      name: espnAthlete.displayName,
      nickname: undefined, // ESPN doesn't provide nicknames in basic data
      physicalStats: {
        height: espnAthlete.height || 0,
        weight: espnAthlete.weight || 0,
        reach: 0, // Not provided in basic ESPN data
        legReach: 0,
        stance: 'Orthodox' as FightStance // Default, not provided
      },
      record: {
        wins: 0, // Would need additional API calls to get fight record
        losses: 0,
        draws: 0,
        noContests: 0
      },
      rankings: {
        weightClass,
        rank: undefined, // Would need rankings-specific endpoint
        p4pRank: undefined
      },
      camp: {
        name: 'Unknown',
        location: espnAthlete.birthPlace ? 
          `${espnAthlete.birthPlace.city}, ${espnAthlete.birthPlace.country}` : 'Unknown',
        headCoach: 'Unknown'
      },
      socialMedia: {
        instagram: undefined,
        twitter: undefined
      },
      calculatedMetrics: {
        strikingAccuracy: { value: 0, period: 5, trend: 'stable' },
        takedownDefense: { value: 0, period: 5, trend: 'stable' },
        fightFrequency: 0,
        winStreak: 0,
        recentForm: []
      },
      trends: {
        performanceTrend: 'stable',
        activityLevel: espnAthlete.active ? 'active' : 'inactive',
        injuryHistory: [],
        lastFightDate: now
      },
      lastUpdated: now
    };
  }

  private async processFightsFromEvent(espnEvent: ESPNEvent, eventId: string): Promise<DataIngestionResult> {
    let processed = 0;
    let skipped = 0;
    const errors: ValidationError[] = [];

    if (!espnEvent.competitions) {
      return this.createIngestionResult(0, 0, []);
    }

    for (const competition of espnEvent.competitions) {
      if (!competition.competitors || competition.competitors.length !== 2) {
        skipped++;
        continue;
      }

      try {
        const transformedFight = this.transformCompetitionToFight(competition, eventId, espnEvent.id);
        
        // Check if fight already exists
        const existingFights = await this.fightRepository.search({
          eventId: transformedFight.eventId,
          limit: 100
        });
        
        const existingFight = existingFights.find(f => 
          (f.fighter1Id === transformedFight.fighter1Id && f.fighter2Id === transformedFight.fighter2Id) ||
          (f.fighter1Id === transformedFight.fighter2Id && f.fighter2Id === transformedFight.fighter1Id)
        );
        
        let savedFight: Fight;
        if (existingFight) {
          savedFight = await this.fightRepository.update(existingFight.id, transformedFight) || existingFight;
        } else {
          savedFight = await this.fightRepository.create(transformedFight);
          await this.eventRepository.addFight(eventId, savedFight.id);
        }
        
        processed++;
        this.emit('fightProcessed', { fightId: savedFight.id, eventId: transformedFight.eventId });

      } catch (error: any) {
        errors.push(this.createValidationError(
          'fight_transformation',
          `Failed to transform competition to fight: ${error.message}`,
          competition,
          'error'
        ));
        skipped++;
      }
    }

    return this.createIngestionResult(processed, skipped, errors);
  }

  private transformCompetitionToFight(competition: ESPNCompetition, eventId: string, espnEventId: string): Omit<Fight, 'id'> {
    const competitors = competition.competitors;
    const fighter1 = competitors[0];
    const fighter2 = competitors[1];

    // Determine fight status from ESPN status
    const fightStatus = this.mapESPNStatusToFightStatus(competition.status);
    
    // Extract result if fight is completed
    let result: any = undefined;
    if (fightStatus === 'completed' && competition.status.type.completed) {
      const winner = competitors.find(c => c.winner === true);
      if (winner) {
        result = {
          winnerId: `espn_${winner.team.id}`,
          method: 'Decision' as FightMethod, // ESPN doesn't provide method details
          round: 3, // Default assumption
          time: '5:00',
          details: undefined
        };
      }
    }

    return {
      eventId,
      fighter1Id: `espn_${fighter1.team.id}`,
      fighter2Id: `espn_${fighter2.team.id}`,
      weightClass: 'Lightweight' as WeightClass, // Default, ESPN doesn't provide weight class in competition
      titleFight: false, // Would need additional logic to determine
      mainEvent: competition.type?.id === 'main' || false,
      scheduledRounds: 3, // Default for non-title fights
      status: fightStatus,
      result,
      odds: [],
      predictions: []
    };
  }

  private extractLiveFightData(competition: ESPNCompetition, eventId: string): LiveFightData | null {
    if (!competition.status || competition.status.type.state !== 'in') {
      return null; // Fight not currently live
    }

    return {
      eventId,
      fightId: `espn_${competition.id}`,
      status: 'in_progress' as FightStatus,
      currentRound: competition.status.period || 1,
      timeRemaining: competition.status.displayClock || '5:00',
      lastUpdate: new Date()
    };
  }

  private determineWeightClass(weight?: number, positionName?: string): WeightClass {
    if (!weight) return 'Lightweight';

    // Map weight to UFC weight classes
    if (weight <= 125) return 'Flyweight';
    if (weight <= 135) return 'Bantamweight';
    if (weight <= 145) return 'Featherweight';
    if (weight <= 155) return 'Lightweight';
    if (weight <= 170) return 'Welterweight';
    if (weight <= 185) return 'Middleweight';
    if (weight <= 205) return 'Light Heavyweight';
    return 'Heavyweight';
  }

  private mapESPNStatusToFightStatus(status: ESPNEventStatus): FightStatus {
    const state = status.type.state.toLowerCase();
    
    switch (state) {
      case 'pre':
        return 'scheduled';
      case 'in':
        return 'in_progress';
      case 'post':
        return status.type.completed ? 'completed' : 'cancelled';
      default:
        return 'scheduled';
    }
  }

  // Public method to get cached live fight data
  public getCachedLiveFightData(fightId: string): LiveFightData | undefined {
    return this.liveFightCache.get(fightId);
  }

  // Public method to clear live fight cache
  public clearLiveFightCache(): void {
    this.liveFightCache.clear();
  }
}