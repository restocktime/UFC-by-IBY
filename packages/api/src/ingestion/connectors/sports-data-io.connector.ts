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

export interface SportsDataIOFighter {
  FighterId: number;
  FirstName: string;
  LastName: string;
  Nickname?: string;
  WeightClass: string;
  BirthDate?: string;
  Height?: number;
  Weight?: number;
  Reach?: number;
  Wins: number;
  Losses: number;
  Draws: number;
  NoContests: number;
  TechnicalKnockouts: number;
  TechnicalKnockoutLosses: number;
  Submissions: number;
  SubmissionLosses: number;
  TitleWins: number;
  TitleLosses: number;
  TitleDraws: number;
}

export interface SportsDataIOEvent {
  EventId: number;
  Name: string;
  ShortName: string;
  Season: number;
  Day: string;
  DateTime: string;
  Status: string;
  BettingMarkets?: any[];
  Fights?: SportsDataIOFight[];
}

export interface SportsDataIOFight {
  FightId: number;
  EventId: number;
  Order?: number;
  Status: string;
  WeightClass: string;
  CardSegment: string;
  Referee?: string;
  Rounds: number;
  ResultClock?: string;
  ResultRound?: number;
  ResultType?: string;
  WinnerId?: number;
  Fighters: SportsDataIOFighter[];
}

export class SportsDataIOConnector extends APIConnector {
  private fighterRepository: FighterRepository;
  private fightRepository: FightRepository;
  private eventRepository: EventRepository;

  constructor(
    fighterRepository?: FighterRepository,
    fightRepository?: FightRepository,
    eventRepository?: EventRepository
  ) {
    const config = sourceConfigManager.getConfig('SPORTS_DATA_IO');
    if (!config) {
      throw new Error('SportsDataIO configuration not found');
    }
    
    super('SPORTS_DATA_IO', config);
    
    // Use provided repositories or create new instances
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
      // Sync fighters first
      const fighterResult = await this.syncFighters();
      totalProcessed += fighterResult.recordsProcessed;
      totalSkipped += fighterResult.recordsSkipped;
      allErrors.push(...fighterResult.errors);

      // Sync current season events and fights
      const currentSeason = new Date().getFullYear();
      const eventResult = await this.syncEvents(currentSeason);
      totalProcessed += eventResult.recordsProcessed;
      totalSkipped += eventResult.recordsSkipped;
      allErrors.push(...eventResult.errors);

      const result = this.createIngestionResult(totalProcessed, totalSkipped, allErrors);
      result.processingTimeMs = Date.now() - startTime;
      
      this.emit('syncComplete', result);
      return result;

    } catch (error: any) {
      this.emit('syncError', { error: error.message, sourceId: this.sourceId });
      throw error;
    }
  }

  public async syncFighters(): Promise<DataIngestionResult> {
    try {
      const url = sourceConfigManager.getEndpointUrl('SPORTS_DATA_IO', 'fighters');
      const response = await this.makeRequest<SportsDataIOFighter[]>({
        method: 'GET',
        url
      });

      const fighters = response.data;
      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      for (const fighterData of fighters) {
        const validationErrors = this.validateFighterData(fighterData);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          if (validationErrors.some(e => e.severity === 'error')) {
            skipped++;
            continue;
          }
        }

        try {
          const transformedFighter = this.transformFighterData(fighterData);
          
          // Check if fighter already exists
          const existingFighter = await this.fighterRepository.findByName(transformedFighter.name);
          if (existingFighter) {
            await this.fighterRepository.update(existingFighter.id, transformedFighter);
          } else {
            await this.fighterRepository.create(transformedFighter);
          }
          
          processed++;
          this.emit('fighterProcessed', { fighterId: transformedFighter.id, name: transformedFighter.name });
        } catch (error: any) {
          errors.push(this.createValidationError(
            'transformation',
            `Failed to transform fighter data: ${error.message}`,
            fighterData,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync fighters from SportsDataIO: ${error.message}`);
    }
  }

  public async syncEvents(season: number): Promise<DataIngestionResult> {
    try {
      const url = sourceConfigManager.getEndpointUrl('SPORTS_DATA_IO', 'events', { season: season.toString() });
      const response = await this.makeRequest<SportsDataIOEvent[]>({
        method: 'GET',
        url
      });

      const events = response.data;
      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      for (const eventData of events) {
        const validationErrors = this.validateEventData(eventData);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          if (validationErrors.some(e => e.severity === 'error')) {
            skipped++;
            continue;
          }
        }

        try {
          // Transform and save event first
          const transformedEvent = this.transformEventData(eventData);
          
          // Check if event already exists
          const existingEvent = await this.eventRepository.findByName(transformedEvent.name);
          let savedEvent: Event;
          if (existingEvent) {
            savedEvent = await this.eventRepository.update(existingEvent.id, transformedEvent) || existingEvent;
          } else {
            savedEvent = await this.eventRepository.create(transformedEvent);
          }
          
          // Process event fights
          const fightResults = await this.syncEventFights(eventData.EventId, savedEvent.id);
          processed += 1 + fightResults.recordsProcessed; // +1 for the event itself
          skipped += fightResults.recordsSkipped;
          errors.push(...fightResults.errors);

          this.emit('eventProcessed', { eventId: savedEvent.id, name: savedEvent.name, fightsCount: fightResults.recordsProcessed });

        } catch (error: any) {
          errors.push(this.createValidationError(
            'event_processing',
            `Failed to process event ${eventData.EventId}: ${error.message}`,
            eventData,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync events from SportsDataIO: ${error.message}`);
    }
  }

  public async syncEventFights(eventId: number, savedEventId?: string): Promise<DataIngestionResult> {
    try {
      const url = sourceConfigManager.getEndpointUrl('SPORTS_DATA_IO', 'fights', { eventId: eventId.toString() });
      const response = await this.makeRequest<SportsDataIOEvent>({
        method: 'GET',
        url
      });

      const eventData = response.data;
      const fights = eventData.Fights || [];
      
      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      for (const fightData of fights) {
        const validationErrors = this.validateFightData(fightData);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          if (validationErrors.some(e => e.severity === 'error')) {
            skipped++;
            continue;
          }
        }

        try {
          const transformedFight = this.transformFightData(fightData, savedEventId || `sportsdata_${eventId}`);
          
          // Check if fight already exists by looking for fights with same fighters and event
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
            
            // Add fight to event if we have the saved event ID
            if (savedEventId) {
              await this.eventRepository.addFight(savedEventId, savedFight.id);
            }
          }
          
          processed++;
          this.emit('fightProcessed', { fightId: savedFight.id, eventId: transformedFight.eventId });
        } catch (error: any) {
          errors.push(this.createValidationError(
            'fight_transformation',
            `Failed to transform fight data: ${error.message}`,
            fightData,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync fights for event ${eventId}: ${error.message}`);
    }
  }

  public validateData(data: any): ValidationError[] {
    if (Array.isArray(data)) {
      // Handle array of fighters or events
      const errors: ValidationError[] = [];
      data.forEach((item, index) => {
        if (item.FighterId !== undefined) {
          errors.push(...this.validateFighterData(item).map(e => ({
            ...e,
            field: `[${index}].${e.field}`
          })));
        } else if (item.EventId !== undefined) {
          errors.push(...this.validateEventData(item).map(e => ({
            ...e,
            field: `[${index}].${e.field}`
          })));
        }
      });
      return errors;
    }

    // Single item validation
    if (data.FighterId !== undefined) {
      return this.validateFighterData(data);
    } else if (data.EventId !== undefined) {
      return this.validateEventData(data);
    } else if (data.FightId !== undefined) {
      return this.validateFightData(data);
    }

    return [this.createValidationError('data', 'Unknown data type', data, 'error')];
  }

  public validateFighterData(fighter: SportsDataIOFighter): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!fighter.FighterId) {
      errors.push(this.createValidationError('FighterId', 'Fighter ID is required', fighter.FighterId, 'error'));
    }

    if (!fighter.FirstName || fighter.FirstName.trim().length === 0) {
      errors.push(this.createValidationError('FirstName', 'First name is required', fighter.FirstName, 'error'));
    }

    if (!fighter.LastName || fighter.LastName.trim().length === 0) {
      errors.push(this.createValidationError('LastName', 'Last name is required', fighter.LastName, 'error'));
    }

    // Validate weight class
    if (fighter.WeightClass && !this.isValidWeightClass(fighter.WeightClass)) {
      errors.push(this.createValidationError('WeightClass', 'Invalid weight class', fighter.WeightClass, 'warning'));
    }

    // Validate physical stats
    if (fighter.Height !== undefined && (fighter.Height < 50 || fighter.Height > 90)) {
      errors.push(this.createValidationError('Height', 'Height seems unrealistic', fighter.Height, 'warning'));
    }

    if (fighter.Weight !== undefined && (fighter.Weight < 100 || fighter.Weight > 300)) {
      errors.push(this.createValidationError('Weight', 'Weight seems unrealistic', fighter.Weight, 'warning'));
    }

    if (fighter.Reach !== undefined && (fighter.Reach < 50 || fighter.Reach > 90)) {
      errors.push(this.createValidationError('Reach', 'Reach seems unrealistic', fighter.Reach, 'warning'));
    }

    // Validate fight record
    if (fighter.Wins < 0 || fighter.Losses < 0 || fighter.Draws < 0 || fighter.NoContests < 0) {
      errors.push(this.createValidationError('record', 'Fight record cannot have negative values', {
        wins: fighter.Wins,
        losses: fighter.Losses,
        draws: fighter.Draws,
        noContests: fighter.NoContests
      }, 'error'));
    }

    return errors;
  }

  public validateEventData(event: SportsDataIOEvent): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!event.EventId) {
      errors.push(this.createValidationError('EventId', 'Event ID is required', event.EventId, 'error'));
    }

    if (!event.Name || event.Name.trim().length === 0) {
      errors.push(this.createValidationError('Name', 'Event name is required', event.Name, 'error'));
    }

    if (!event.DateTime) {
      errors.push(this.createValidationError('DateTime', 'Event date/time is required', event.DateTime, 'error'));
    } else {
      const eventDate = new Date(event.DateTime);
      if (isNaN(eventDate.getTime())) {
        errors.push(this.createValidationError('DateTime', 'Invalid date/time format', event.DateTime, 'error'));
      }
    }

    return errors;
  }

  public validateFightData(fight: SportsDataIOFight): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!fight.FightId) {
      errors.push(this.createValidationError('FightId', 'Fight ID is required', fight.FightId, 'error'));
    }

    if (!fight.EventId) {
      errors.push(this.createValidationError('EventId', 'Event ID is required', fight.EventId, 'error'));
    }

    if (!fight.Fighters || fight.Fighters.length !== 2) {
      errors.push(this.createValidationError('Fighters', 'Fight must have exactly 2 fighters', fight.Fighters, 'error'));
    }

    if (fight.WeightClass && !this.isValidWeightClass(fight.WeightClass)) {
      errors.push(this.createValidationError('WeightClass', 'Invalid weight class', fight.WeightClass, 'warning'));
    }

    if (fight.Rounds && (fight.Rounds < 1 || fight.Rounds > 5)) {
      errors.push(this.createValidationError('Rounds', 'Invalid number of rounds', fight.Rounds, 'warning'));
    }

    return errors;
  }

  public transformData(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => {
        if (item.FighterId !== undefined) {
          return this.transformFighterData(item);
        } else if (item.FightId !== undefined) {
          return this.transformFightData(item);
        }
        return item;
      });
    }

    if (data.FighterId !== undefined) {
      return this.transformFighterData(data);
    } else if (data.FightId !== undefined) {
      return this.transformFightData(data);
    }

    return data;
  }

  public transformFighterData(sportsDataFighter: SportsDataIOFighter): Omit<Fighter, 'id'> {
    const now = new Date();
    
    return {
      name: `${sportsDataFighter.FirstName} ${sportsDataFighter.LastName}`.trim(),
      nickname: sportsDataFighter.Nickname || undefined,
      physicalStats: {
        height: sportsDataFighter.Height || 0,
        weight: sportsDataFighter.Weight || 0,
        reach: sportsDataFighter.Reach || 0,
        legReach: 0, // Not provided by SportsDataIO
        stance: 'Orthodox' as FightStance // Default, not provided by SportsDataIO
      },
      record: {
        wins: sportsDataFighter.Wins || 0,
        losses: sportsDataFighter.Losses || 0,
        draws: sportsDataFighter.Draws || 0,
        noContests: sportsDataFighter.NoContests || 0
      },
      rankings: {
        weightClass: this.mapWeightClass(sportsDataFighter.WeightClass),
        rank: undefined, // Not provided in basic fighter data
        p4pRank: undefined
      },
      camp: {
        name: 'Unknown', // Not provided by SportsDataIO
        location: 'Unknown',
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
        activityLevel: 'active',
        injuryHistory: [],
        lastFightDate: now
      },
      lastUpdated: now
    };
  }

  public transformEventData(sportsDataEvent: SportsDataIOEvent): Omit<Event, 'id'> {
    return {
      name: sportsDataEvent.Name,
      date: new Date(sportsDataEvent.DateTime),
      venue: {
        name: 'TBD', // Not provided by SportsDataIO basic event data
        city: 'TBD',
        country: 'USA' // Default assumption for UFC events
      },
      commission: 'TBD', // Not provided by SportsDataIO
      fights: [] // Will be populated when fights are processed
    };
  }

  public transformFightData(sportsDataFight: SportsDataIOFight, eventId?: string): Omit<Fight, 'id'> {
    const fighters = sportsDataFight.Fighters || [];
    
    return {
      eventId: eventId || `sportsdata_${sportsDataFight.EventId}`,
      fighter1Id: fighters[0] ? `sportsdata_${fighters[0].FighterId}` : '',
      fighter2Id: fighters[1] ? `sportsdata_${fighters[1].FighterId}` : '',
      weightClass: this.mapWeightClass(sportsDataFight.WeightClass),
      titleFight: sportsDataFight.CardSegment === 'Main' || false,
      mainEvent: sportsDataFight.CardSegment === 'Main' || false,
      scheduledRounds: sportsDataFight.Rounds || 3,
      status: this.mapFightStatus(sportsDataFight.Status),
      result: sportsDataFight.WinnerId ? {
        winnerId: `sportsdata_${sportsDataFight.WinnerId}`,
        method: this.mapFightMethod(sportsDataFight.ResultType),
        round: sportsDataFight.ResultRound || 1,
        time: sportsDataFight.ResultClock || '0:00',
        details: undefined
      } : undefined,
      odds: [],
      predictions: []
    };
  }

  private isValidWeightClass(weightClass: string): boolean {
    const validWeightClasses: WeightClass[] = [
      'Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight',
      'Welterweight', 'Middleweight', 'Light Heavyweight', 'Heavyweight',
      'Women\'s Strawweight', 'Women\'s Flyweight', 'Women\'s Bantamweight', 'Women\'s Featherweight'
    ];
    
    return validWeightClasses.includes(weightClass as WeightClass);
  }

  private mapWeightClass(sportsDataWeightClass: string): WeightClass {
    const mapping: Record<string, WeightClass> = {
      'Flyweight': 'Flyweight',
      'Bantamweight': 'Bantamweight',
      'Featherweight': 'Featherweight',
      'Lightweight': 'Lightweight',
      'Welterweight': 'Welterweight',
      'Middleweight': 'Middleweight',
      'Light Heavyweight': 'Light Heavyweight',
      'Heavyweight': 'Heavyweight',
      'Women\'s Strawweight': 'Women\'s Strawweight',
      'Women\'s Flyweight': 'Women\'s Flyweight',
      'Women\'s Bantamweight': 'Women\'s Bantamweight',
      'Women\'s Featherweight': 'Women\'s Featherweight'
    };

    return mapping[sportsDataWeightClass] || 'Lightweight';
  }

  private mapFightStatus(sportsDataStatus: string): FightStatus {
    const statusMapping: Record<string, FightStatus> = {
      'Scheduled': 'scheduled',
      'InProgress': 'in_progress',
      'Final': 'completed',
      'Cancelled': 'cancelled',
      'Postponed': 'cancelled'
    };

    return statusMapping[sportsDataStatus] || 'scheduled';
  }

  private mapFightMethod(resultType?: string): FightMethod {
    if (!resultType) return 'Decision';

    const methodMapping: Record<string, FightMethod> = {
      'KO': 'KO/TKO',
      'TKO': 'KO/TKO',
      'Submission': 'Submission',
      'Decision': 'Decision',
      'UD': 'Decision', // Unanimous Decision
      'MD': 'Decision', // Majority Decision
      'SD': 'Decision', // Split Decision
      'DQ': 'DQ',
      'NC': 'No Contest'
    };

    return methodMapping[resultType] || 'Decision';
  }
}