import { APIConnector } from '../base/api-connector.js';
import { sourceConfigManager } from '../config/source-configs.js';
import { ValidationError, DataIngestionResult } from '@ufc-prediction/shared';
import { Fighter, Fight, Event } from '@ufc-prediction/shared';

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

export interface SportsDataIOFight {
  FightId: number;
  Order: number;
  Status: string;
  WeightClass: string;
  CardSegment: string;
  Referee?: string;
  Rounds: number;
  ResultClock?: string;
  ResultRound?: number;
  ResultType?: string;
  Winner?: SportsDataIOFighter;
  Loser?: SportsDataIOFighter;
  Fighters: SportsDataIOFighter[];
}

export interface SportsDataIOEvent {
  EventId: number;
  League: string;
  Name: string;
  ShortName?: string;
  Season: number;
  Day: string;
  DateTime: string;
  Status: string;
  BettingMarkets?: any[];
  Fights: SportsDataIOFight[];
}

export class SportsDataIOConnector extends APIConnector {
  private fighterRepository: any; // Will be injected
  private fightRepository: any; // Will be injected
  private eventRepository: any; // Will be injected

  constructor(
    fighterRepository?: any,
    fightRepository?: any,
    eventRepository?: any
  ) {
    const config = sourceConfigManager.getConfig('SPORTS_DATA_IO');
    if (!config) {
      throw new Error('SportsDataIO configuration not found');
    }

    super('SPORTS_DATA_IO', config);
    
    this.fighterRepository = fighterRepository;
    this.fightRepository = fightRepository;
    this.eventRepository = eventRepository;
  }

  /**
   * Validate SportsDataIO fighter data
   */
  validateData(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (Array.isArray(data)) {
      // Validate array of fighters
      data.forEach((fighter, index) => {
        const fighterErrors = this.validateFighterData(fighter, `[${index}]`);
        errors.push(...fighterErrors);
      });
    } else if (data.Fights) {
      // Validate event data
      const eventErrors = this.validateEventData(data);
      errors.push(...eventErrors);
    } else {
      // Validate single fighter
      const fighterErrors = this.validateFighterData(data);
      errors.push(...fighterErrors);
    }

    return errors;
  }

  private validateFighterData(fighter: any, prefix = ''): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!fighter.FighterId) {
      errors.push(this.createValidationError(
        `${prefix}FighterId`,
        'Fighter ID is required',
        fighter.FighterId
      ));
    }

    if (!fighter.FirstName && !fighter.LastName) {
      errors.push(this.createValidationError(
        `${prefix}Name`,
        'Fighter must have at least first or last name',
        { FirstName: fighter.FirstName, LastName: fighter.LastName }
      ));
    }

    if (fighter.Wins < 0 || fighter.Losses < 0 || fighter.Draws < 0) {
      errors.push(this.createValidationError(
        `${prefix}Record`,
        'Fight record cannot contain negative values',
        { Wins: fighter.Wins, Losses: fighter.Losses, Draws: fighter.Draws }
      ));
    }

    if (fighter.Height && (fighter.Height < 50 || fighter.Height > 90)) {
      errors.push(this.createValidationError(
        `${prefix}Height`,
        'Fighter height seems unrealistic (should be 50-90 inches)',
        fighter.Height,
        'warning'
      ));
    }

    if (fighter.Weight && (fighter.Weight < 100 || fighter.Weight > 300)) {
      errors.push(this.createValidationError(
        `${prefix}Weight`,
        'Fighter weight seems unrealistic (should be 100-300 lbs)',
        fighter.Weight,
        'warning'
      ));
    }

    return errors;
  }

  private validateEventData(event: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!event.EventId) {
      errors.push(this.createValidationError(
        'EventId',
        'Event ID is required',
        event.EventId
      ));
    }

    if (!event.Name) {
      errors.push(this.createValidationError(
        'Name',
        'Event name is required',
        event.Name
      ));
    }

    if (!event.DateTime) {
      errors.push(this.createValidationError(
        'DateTime',
        'Event date/time is required',
        event.DateTime
      ));
    }

    if (event.Fights && Array.isArray(event.Fights)) {
      event.Fights.forEach((fight: any, index: number) => {
        const fightErrors = this.validateFightData(fight, `Fights[${index}]`);
        errors.push(...fightErrors);
      });
    }

    return errors;
  }

  private validateFightData(fight: any, prefix = ''): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!fight.FightId) {
      errors.push(this.createValidationError(
        `${prefix}.FightId`,
        'Fight ID is required',
        fight.FightId
      ));
    }

    if (!fight.Fighters || !Array.isArray(fight.Fighters) || fight.Fighters.length !== 2) {
      errors.push(this.createValidationError(
        `${prefix}.Fighters`,
        'Fight must have exactly 2 fighters',
        fight.Fighters
      ));
    }

    if (fight.Rounds && (fight.Rounds < 1 || fight.Rounds > 5)) {
      errors.push(this.createValidationError(
        `${prefix}.Rounds`,
        'Fight rounds should be between 1 and 5',
        fight.Rounds,
        'warning'
      ));
    }

    return errors;
  }

  /**
   * Transform SportsDataIO data to internal format
   */
  transformData(data: any): any {
    if (Array.isArray(data)) {
      // Transform array of fighters
      return data.map(fighter => this.transformFighterData(fighter));
    } else if (data.Fights) {
      // Transform event data
      return this.transformEventData(data);
    } else {
      // Transform single fighter
      return this.transformFighterData(data);
    }
  }

  private transformFighterData(sportsDataFighter: SportsDataIOFighter): Fighter {
    return {
      id: sportsDataFighter.FighterId.toString(),
      name: `${sportsDataFighter.FirstName} ${sportsDataFighter.LastName}`.trim(),
      nickname: sportsDataFighter.Nickname || undefined,
      physicalStats: {
        height: sportsDataFighter.Height || 0,
        weight: sportsDataFighter.Weight || 0,
        reach: sportsDataFighter.Reach || 0,
        legReach: 0, // Not provided by SportsDataIO
        stance: 'Orthodox' // Default, not provided by SportsDataIO
      },
      record: {
        wins: sportsDataFighter.Wins || 0,
        losses: sportsDataFighter.Losses || 0,
        draws: sportsDataFighter.Draws || 0,
        noContests: sportsDataFighter.NoContests || 0
      },
      rankings: {
        weightClass: this.normalizeWeightClass(sportsDataFighter.WeightClass),
        rank: undefined,
        p4pRank: undefined
      },
      camp: {
        name: '',
        location: '',
        headCoach: ''
      },
      socialMedia: {}
    };
  }

  private transformEventData(sportsDataEvent: SportsDataIOEvent): Event {
    return {
      id: sportsDataEvent.EventId.toString(),
      name: sportsDataEvent.Name,
      date: new Date(sportsDataEvent.DateTime),
      venue: {
        name: '',
        city: '',
        country: 'USA'
      },
      commission: '',
      fights: sportsDataEvent.Fights.map(fight => fight.FightId.toString())
    };
  }

  private normalizeWeightClass(weightClass: string): any {
    const weightClassMap: Record<string, string> = {
      'Heavyweight': 'heavyweight',
      'Light Heavyweight': 'light_heavyweight',
      'Middleweight': 'middleweight',
      'Welterweight': 'welterweight',
      'Lightweight': 'lightweight',
      'Featherweight': 'featherweight',
      'Bantamweight': 'bantamweight',
      'Flyweight': 'flyweight',
      "Women's Strawweight": 'womens_strawweight',
      "Women's Flyweight": 'womens_flyweight',
      "Women's Bantamweight": 'womens_bantamweight',
      "Women's Featherweight": 'womens_featherweight'
    };

    return weightClassMap[weightClass] || 'unknown';
  }

  /**
   * Sync all fighter data
   */
  async syncFighters(): Promise<DataIngestionResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest({
        method: 'GET',
        url: '/scores/json/Fighters',
        params: {
          key: this.config.apiKey
        }
      });

      const errors = this.validateData(response.data);
      const transformedFighters = this.transformData(response.data);

      // Store fighters if repository is available
      if (this.fighterRepository) {
        for (const fighter of transformedFighters) {
          try {
            await this.fighterRepository.upsert(fighter);
          } catch (error: any) {
            errors.push(this.createValidationError(
              'storage',
              `Failed to store fighter ${fighter.id}: ${error.message}`,
              fighter.id
            ));
          }
        }
      }

      const result = this.createIngestionResult(
        transformedFighters.length,
        0,
        errors
      );
      result.processingTimeMs = Date.now() - startTime;

      this.emit('fightersSynced', {
        count: transformedFighters.length,
        errors: errors.length
      });

      return result;
    } catch (error: any) {
      const result = this.createIngestionResult(0, 0, [
        this.createValidationError('sync', `Fighter sync failed: ${error.message}`, error)
      ]);
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Sync specific event data by event ID
   */
  async syncEvent(eventId: number): Promise<DataIngestionResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest({
        method: 'GET',
        url: `/scores/json/Event/${eventId}`,
        params: {
          key: this.config.apiKey
        }
      });

      const errors = this.validateData(response.data);
      const transformedEvent = this.transformData(response.data);

      // Store event if repository is available
      if (this.eventRepository) {
        try {
          await this.eventRepository.upsert(transformedEvent);
        } catch (error: any) {
          errors.push(this.createValidationError(
            'storage',
            `Failed to store event ${transformedEvent.id}: ${error.message}`,
            transformedEvent.id
          ));
        }
      }

      // Store fights if repository is available
      let fightsProcessed = 0;
      if (this.fightRepository && response.data.Fights) {
        for (const fightData of response.data.Fights) {
          try {
            const transformedFight = this.transformFightData(fightData, transformedEvent.id);
            await this.fightRepository.upsert(transformedFight);
            fightsProcessed++;
          } catch (error: any) {
            errors.push(this.createValidationError(
              'storage',
              `Failed to store fight ${fightData.FightId}: ${error.message}`,
              fightData.FightId
            ));
          }
        }
      }

      const result = this.createIngestionResult(
        1 + fightsProcessed, // 1 event + fights
        0,
        errors
      );
      result.processingTimeMs = Date.now() - startTime;

      this.emit('eventSynced', {
        eventId,
        fightsCount: fightsProcessed,
        errors: errors.length
      });

      return result;
    } catch (error: any) {
      const result = this.createIngestionResult(0, 0, [
        this.createValidationError('sync', `Event sync failed: ${error.message}`, error)
      ]);
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }

  private transformFightData(sportsDataFight: SportsDataIOFight, eventId: string): Fight {
    const fighters = sportsDataFight.Fighters || [];
    
    return {
      id: sportsDataFight.FightId.toString(),
      eventId: eventId,
      fighter1Id: fighters[0]?.FighterId.toString() || '',
      fighter2Id: fighters[1]?.FighterId.toString() || '',
      weightClass: this.normalizeWeightClass(sportsDataFight.WeightClass),
      titleFight: sportsDataFight.CardSegment === 'Main',
      mainEvent: sportsDataFight.Order === 1,
      scheduledRounds: sportsDataFight.Rounds || 3,
      status: this.normalizeFightStatus(sportsDataFight.Status),
      result: sportsDataFight.ResultType ? {
        winnerId: sportsDataFight.Winner?.FighterId.toString(),
        method: this.normalizeResultType(sportsDataFight.ResultType),
        round: sportsDataFight.ResultRound || 0,
        time: sportsDataFight.ResultClock || '',
        details: ''
      } : undefined,
      odds: [],
      predictions: []
    };
  }

  private normalizeFightStatus(status: string): any {
    const statusMap: Record<string, string> = {
      'Scheduled': 'scheduled',
      'InProgress': 'in_progress',
      'Final': 'completed',
      'Cancelled': 'cancelled',
      'Postponed': 'cancelled'
    };

    return statusMap[status] || 'scheduled';
  }

  private normalizeResultType(resultType: string): any {
    const methodMap: Record<string, string> = {
      'KO': 'ko',
      'TKO': 'tko',
      'Submission': 'submission',
      'Decision': 'decision',
      'DQ': 'dq',
      'No Contest': 'no_contest'
    };

    return methodMap[resultType] || 'decision';
  }

  /**
   * Sync current season schedule
   */
  async syncSchedule(season: number = new Date().getFullYear()): Promise<DataIngestionResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest({
        method: 'GET',
        url: `/scores/json/Schedule/${season}`,
        params: {
          key: this.config.apiKey
        }
      });

      const errors: ValidationError[] = [];
      let eventsProcessed = 0;

      if (Array.isArray(response.data)) {
        for (const eventData of response.data) {
          try {
            const eventErrors = this.validateEventData(eventData);
            errors.push(...eventErrors);

            const transformedEvent = this.transformEventData(eventData);
            
            if (this.eventRepository) {
              await this.eventRepository.upsert(transformedEvent);
              eventsProcessed++;
            }
          } catch (error: any) {
            errors.push(this.createValidationError(
              'storage',
              `Failed to process event ${eventData.EventId}: ${error.message}`,
              eventData.EventId
            ));
          }
        }
      }

      const result = this.createIngestionResult(eventsProcessed, 0, errors);
      result.processingTimeMs = Date.now() - startTime;

      this.emit('scheduleSynced', {
        season,
        eventsCount: eventsProcessed,
        errors: errors.length
      });

      return result;
    } catch (error: any) {
      const result = this.createIngestionResult(0, 0, [
        this.createValidationError('sync', `Schedule sync failed: ${error.message}`, error)
      ]);
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Main sync method - syncs fighters and current events
   */
  async syncData(): Promise<DataIngestionResult> {
    const startTime = Date.now();
    const allErrors: ValidationError[] = [];
    let totalRecordsProcessed = 0;

    try {
      // Sync fighters first
      const fighterResult = await this.syncFighters();
      allErrors.push(...fighterResult.errors);
      totalRecordsProcessed += fighterResult.recordsProcessed;

      // Sync current season schedule
      const scheduleResult = await this.syncSchedule();
      allErrors.push(...scheduleResult.errors);
      totalRecordsProcessed += scheduleResult.recordsProcessed;

      const result = this.createIngestionResult(totalRecordsProcessed, 0, allErrors);
      result.processingTimeMs = Date.now() - startTime;

      return result;
    } catch (error: any) {
      const result = this.createIngestionResult(totalRecordsProcessed, 0, [
        ...allErrors,
        this.createValidationError('sync', `Full sync failed: ${error.message}`, error)
      ]);
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }
}