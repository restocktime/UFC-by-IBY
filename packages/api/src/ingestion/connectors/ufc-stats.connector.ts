import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ScrapingEngine, ScrapingConfig, ProxyConfig, ScrapingSession } from '../base/scraping-engine.js';
import { 
  Fighter, 
  Fight,
  ValidationError, 
  DataIngestionResult,
  WeightClass,
  FightStance,
  FightStatus,
  FightMethod
} from '@ufc-platform/shared';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';

export interface UFCStatsScrapingConfig extends ScrapingConfig {
  baseUrl: string;
}

export interface UFCStatsFighter {
  name: string;
  nickname?: string;
  height: string;
  weight: string;
  reach: string;
  stance: string;
  dob: string;
  record: {
    wins: number;
    losses: number;
    draws: number;
  };
  strikingStats: {
    significantStrikesLanded: number;
    significantStrikesAttempted: number;
    strikingAccuracy: number;
    strikesAbsorbedPerMinute: number;
    strikingDefense: number;
  };
  grapplingStats: {
    takedownsLanded: number;
    takedownsAttempted: number;
    takedownAccuracy: number;
    takedownDefense: number;
    submissionAttempts: number;
  };
  fightDetails: {
    averageFightTime: string;
    knockdowns: number;
    controlTime: number;
  };
}

export interface UFCStatsFight {
  event: string;
  date: string;
  fighter1: string;
  fighter2: string;
  result: string;
  method: string;
  round: number;
  time: string;
  weightClass: string;
  referee: string;
  detailedStats?: {
    fighter1Stats: FightStats;
    fighter2Stats: FightStats;
  };
}

export interface FightStats {
  significantStrikes: {
    landed: number;
    attempted: number;
    head: { landed: number; attempted: number };
    body: { landed: number; attempted: number };
    leg: { landed: number; attempted: number };
    distance: { landed: number; attempted: number };
    clinch: { landed: number; attempted: number };
    ground: { landed: number; attempted: number };
  };
  totalStrikes: {
    landed: number;
    attempted: number;
  };
  takedowns: {
    landed: number;
    attempted: number;
  };
  submissionAttempts: number;
  reversals: number;
  controlTime: string;
  knockdowns: number;
}

export class UFCStatsConnector extends ScrapingEngine {
  private fighterRepository: FighterRepository;
  private fightRepository: FightRepository;

  constructor(
    fighterRepository?: FighterRepository,
    fightRepository?: FightRepository
  ) {
    const config: UFCStatsScrapingConfig = {
      baseUrl: 'http://ufcstats.com',
      apiKey: undefined,
      rateLimit: {
        requestsPerMinute: 10, // Conservative rate limiting
        requestsPerHour: 300
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffMs: 30000
      },
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0'
      ],
      proxies: [], // Will be populated from environment or config
      requestDelay: {
        min: 2000, // 2 seconds minimum
        max: 5000  // 5 seconds maximum
      },
      antiDetection: {
        randomizeHeaders: true,
        rotateProxies: true,
        respectRobotsTxt: true
      }
    };
    
    super('UFC_STATS', config);
    
    this.fighterRepository = fighterRepository || new FighterRepository();
    this.fightRepository = fightRepository || new FightRepository();
  }

  public async syncData(): Promise<DataIngestionResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalSkipped = 0;
    const allErrors: ValidationError[] = [];

    try {
      // First, scrape the fighter list
      const fighterListResult = await this.scrapeFighterList();
      totalProcessed += fighterListResult.recordsProcessed;
      totalSkipped += fighterListResult.recordsSkipped;
      allErrors.push(...fighterListResult.errors);

      // Then scrape recent events and fights
      const recentEventsResult = await this.scrapeRecentEvents();
      totalProcessed += recentEventsResult.recordsProcessed;
      totalSkipped += recentEventsResult.recordsSkipped;
      allErrors.push(...recentEventsResult.errors);

      const result = this.createIngestionResult(totalProcessed, totalSkipped, allErrors);
      result.processingTimeMs = Date.now() - startTime;
      
      this.emit('syncComplete', result);
      return result;

    } catch (error: any) {
      this.emit('syncError', { error: error.message, sourceId: this.sourceId });
      throw error;
    }
  }

  public async scrapeFighterList(): Promise<DataIngestionResult> {
    try {
      const url = `${this.config.baseUrl}/statistics/fighters`;
      const html = await this.makeScrapingRequest(url);
      const $ = cheerio.load(html);

      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      // Parse fighter list table
      const fighterRows = $('table.b-statistics__table tbody tr').toArray();
      
      for (const row of fighterRows) {
        try {
          const $row = $(row);
          const fighterLink = $row.find('td:first-child a').attr('href');
          
          if (!fighterLink) {
            skipped++;
            continue;
          }

          // Extract basic info from the list
          const name = $row.find('td:first-child a').text().trim();
          const nickname = $row.find('td:nth-child(2)').text().trim();
          const height = $row.find('td:nth-child(3)').text().trim();
          const weight = $row.find('td:nth-child(4)').text().trim();
          const reach = $row.find('td:nth-child(5)').text().trim();
          const stance = $row.find('td:nth-child(6)').text().trim();
          const record = $row.find('td:nth-child(7)').text().trim();

          // Scrape detailed fighter page
          const detailedFighter = await this.scrapeFighterDetails(fighterLink, {
            name,
            nickname: nickname || undefined,
            height,
            weight,
            reach,
            stance,
            record
          });

          if (detailedFighter) {
            const validationErrors = this.validateFighterData(detailedFighter);
            if (validationErrors.length > 0) {
              errors.push(...validationErrors);
              if (validationErrors.some(e => e.severity === 'error')) {
                skipped++;
                continue;
              }
            }

            const transformedFighter = this.transformFighterData(detailedFighter);
            
            // Check if fighter already exists
            const existingFighter = await this.fighterRepository.findByName(transformedFighter.name);
            if (existingFighter) {
              await this.fighterRepository.update(existingFighter.id, transformedFighter);
            } else {
              await this.fighterRepository.create(transformedFighter);
            }
            
            processed++;
            this.emit('fighterProcessed', { name: transformedFighter.name });
          } else {
            skipped++;
          }

        } catch (error: any) {
          errors.push(this.createValidationError(
            'fighter_scraping',
            `Failed to scrape fighter: ${error.message}`,
            row,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to scrape fighter list from UFCStats: ${error.message}`);
    }
  }

  public async scrapeRecentEvents(): Promise<DataIngestionResult> {
    try {
      const url = `${this.config.baseUrl}/statistics/events/completed`;
      const html = await this.makeScrapingRequest(url);
      const $ = cheerio.load(html);

      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      // Get recent events (limit to last 10 for this sync)
      const eventRows = $('table.b-statistics__table tbody tr').slice(0, 10).toArray();
      
      for (const row of eventRows) {
        try {
          const $row = $(row);
          const eventLink = $row.find('td:first-child a').attr('href');
          
          if (!eventLink) {
            skipped++;
            continue;
          }

          // Scrape event details and fights
          const eventResult = await this.scrapeEventDetails(eventLink);
          processed += eventResult.recordsProcessed;
          skipped += eventResult.recordsSkipped;
          errors.push(...eventResult.errors);

        } catch (error: any) {
          errors.push(this.createValidationError(
            'event_scraping',
            `Failed to scrape event: ${error.message}`,
            row,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to scrape recent events from UFCStats: ${error.message}`);
    }
  }

  private async scrapeFighterDetails(fighterUrl: string, basicInfo: any): Promise<UFCStatsFighter | null> {
    try {
      const html = await this.makeScrapingRequest(fighterUrl);
      const $ = cheerio.load(html);

      // Extract detailed fighter information
      const fighterDetails: UFCStatsFighter = {
        name: basicInfo.name,
        nickname: basicInfo.nickname,
        height: basicInfo.height,
        weight: basicInfo.weight,
        reach: basicInfo.reach,
        stance: basicInfo.stance,
        dob: $('.b-list__box-list-item:contains("DOB:")').text().replace('DOB:', '').trim(),
        record: this.parseRecord(basicInfo.record),
        strikingStats: this.extractStrikingStats($),
        grapplingStats: this.extractGrapplingStats($),
        fightDetails: this.extractFightDetails($)
      };

      return fighterDetails;

    } catch (error: any) {
      this.emit('scrapingError', { 
        url: fighterUrl, 
        error: error.message, 
        type: 'fighter_details' 
      });
      return null;
    }
  }

  private async scrapeEventDetails(eventUrl: string): Promise<DataIngestionResult> {
    try {
      const html = await this.makeScrapingRequest(eventUrl);
      const $ = cheerio.load(html);

      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      // Extract fights from the event
      const fightRows = $('table.b-fight-details__table tbody tr').toArray();
      
      for (const row of fightRows) {
        try {
          const $row = $(row);
          const fightLink = $row.find('td:first-child a').attr('href');
          
          if (!fightLink) {
            skipped++;
            continue;
          }

          // Extract basic fight info
          const fighters = $row.find('td:first-child a').text().split(' vs. ');
          if (fighters.length !== 2) {
            skipped++;
            continue;
          }

          const result = $row.find('td:nth-child(2)').text().trim();
          const method = $row.find('td:nth-child(3)').text().trim();
          const round = parseInt($row.find('td:nth-child(4)').text().trim()) || 1;
          const time = $row.find('td:nth-child(5)').text().trim();
          const weightClass = $row.find('td:nth-child(6)').text().trim();

          // Scrape detailed fight stats
          const detailedFight = await this.scrapeFightDetails(fightLink, {
            fighter1: fighters[0].trim(),
            fighter2: fighters[1].trim(),
            result,
            method,
            round,
            time,
            weightClass
          });

          if (detailedFight) {
            const validationErrors = this.validateFightData(detailedFight);
            if (validationErrors.length > 0) {
              errors.push(...validationErrors);
              if (validationErrors.some(e => e.severity === 'error')) {
                skipped++;
                continue;
              }
            }

            // Transform and save fight data
            // Note: This would require event ID mapping which would be handled in a full implementation
            processed++;
            this.emit('fightProcessed', { 
              fighters: `${detailedFight.fighter1} vs ${detailedFight.fighter2}` 
            });
          } else {
            skipped++;
          }

        } catch (error: any) {
          errors.push(this.createValidationError(
            'fight_scraping',
            `Failed to scrape fight: ${error.message}`,
            row,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to scrape event details: ${error.message}`);
    }
  }

  private async scrapeFightDetails(fightUrl: string, basicInfo: any): Promise<UFCStatsFight | null> {
    try {
      const html = await this.makeScrapingRequest(fightUrl);
      const $ = cheerio.load(html);

      // Extract detailed fight statistics
      const fightDetails: UFCStatsFight = {
        event: $('.b-fight-details__fight-head').text().trim(),
        date: $('.b-fight-details__fight-head').text().trim(),
        fighter1: basicInfo.fighter1,
        fighter2: basicInfo.fighter2,
        result: basicInfo.result,
        method: basicInfo.method,
        round: basicInfo.round,
        time: basicInfo.time,
        weightClass: basicInfo.weightClass,
        referee: $('.b-fight-details__person:contains("Referee:")').text().replace('Referee:', '').trim(),
        detailedStats: {
          fighter1Stats: this.extractFightStats($, 0),
          fighter2Stats: this.extractFightStats($, 1)
        }
      };

      return fightDetails;

    } catch (error: any) {
      this.emit('scrapingError', { 
        url: fightUrl, 
        error: error.message, 
        type: 'fight_details' 
      });
      return null;
    }
  }

  private async makeScrapingRequest(url: string): Promise<string> {
    const session = this.getNextSession();
    if (!session) {
      throw new Error('No available sessions for scraping');
    }

    await this.waitForRateLimit(session);

    try {
      const agent = this.createProxyAgent(session.proxy);
      const headers = this.createHeaders(session);

      const response: AxiosResponse<string> = await axios.get(url, {
        headers,
        httpsAgent: agent,
        httpAgent: agent,
        timeout: 30000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      if (response.status === 403 || response.status === 429) {
        this.markSessionAsBlocked(session.id, `HTTP ${response.status}`);
        throw new Error(`Request blocked with status ${response.status}`);
      }

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.data;

    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
        this.markSessionAsBlocked(session.id, error.code);
      }
      throw error;
    }
  }

  private createProxyAgent(proxy?: ProxyConfig): any {
    if (!proxy) return undefined;

    const proxyUrl = proxy.username && proxy.password
      ? `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      : `${proxy.protocol}://${proxy.host}:${proxy.port}`;

    if (proxy.protocol.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    } else {
      return new HttpsProxyAgent(proxyUrl);
    }
  }

  private createHeaders(session: ScrapingSession): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': session.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    if (this.config.antiDetection.randomizeHeaders) {
      // Add some randomization to headers
      if (Math.random() > 0.5) {
        headers['Cache-Control'] = 'no-cache';
      }
      if (Math.random() > 0.7) {
        headers['Pragma'] = 'no-cache';
      }
    }

    return headers;
  }

  // Helper methods for parsing UFC Stats data
  private parseRecord(recordString: string): { wins: number; losses: number; draws: number } {
    const match = recordString.match(/(\d+)-(\d+)-(\d+)/);
    if (match) {
      return {
        wins: parseInt(match[1]) || 0,
        losses: parseInt(match[2]) || 0,
        draws: parseInt(match[3]) || 0
      };
    }
    return { wins: 0, losses: 0, draws: 0 };
  }

  private extractStrikingStats($: cheerio.CheerioAPI): UFCStatsFighter['strikingStats'] {
    // Extract striking statistics from the fighter page
    return {
      significantStrikesLanded: this.parseStatValue($, 'SLpM'),
      significantStrikesAttempted: 0, // Would need to calculate from accuracy
      strikingAccuracy: this.parsePercentage($, 'Str. Acc.'),
      strikesAbsorbedPerMinute: this.parseStatValue($, 'SApM'),
      strikingDefense: this.parsePercentage($, 'Str. Def.')
    };
  }

  private extractGrapplingStats($: cheerio.CheerioAPI): UFCStatsFighter['grapplingStats'] {
    return {
      takedownsLanded: 0, // Would need to calculate from average and accuracy
      takedownsAttempted: 0,
      takedownAccuracy: this.parsePercentage($, 'TD Acc.'),
      takedownDefense: this.parsePercentage($, 'TD Def.'),
      submissionAttempts: this.parseStatValue($, 'Sub. Avg.')
    };
  }

  private extractFightDetails($: cheerio.CheerioAPI): UFCStatsFighter['fightDetails'] {
    return {
      averageFightTime: $('.b-list__box-list-item:contains("Avg. Fight time:")').text().replace('Avg. Fight time:', '').trim(),
      knockdowns: 0, // Would need to sum from fight history
      controlTime: 0 // Would need to calculate from fight data
    };
  }

  private extractFightStats($: cheerio.CheerioAPI, fighterIndex: number): FightStats {
    // Extract detailed fight statistics for a specific fighter
    // This would parse the detailed stats tables on fight pages
    return {
      significantStrikes: {
        landed: 0,
        attempted: 0,
        head: { landed: 0, attempted: 0 },
        body: { landed: 0, attempted: 0 },
        leg: { landed: 0, attempted: 0 },
        distance: { landed: 0, attempted: 0 },
        clinch: { landed: 0, attempted: 0 },
        ground: { landed: 0, attempted: 0 }
      },
      totalStrikes: { landed: 0, attempted: 0 },
      takedowns: { landed: 0, attempted: 0 },
      submissionAttempts: 0,
      reversals: 0,
      controlTime: '0:00',
      knockdowns: 0
    };
  }

  private parseStatValue($: cheerio.CheerioAPI, statName: string): number {
    const statElement = $(`.b-list__box-list-item:contains("${statName}:")`);
    const value = statElement.text().replace(`${statName}:`, '').trim();
    return parseFloat(value) || 0;
  }

  private parsePercentage($: cheerio.CheerioAPI, statName: string): number {
    const statElement = $(`.b-list__box-list-item:contains("${statName}:")`);
    const value = statElement.text().replace(`${statName}:`, '').replace('%', '').trim();
    return parseFloat(value) || 0;
  }

  // Validation methods
  public validateData(data: any): ValidationError[] {
    if (data.name !== undefined) {
      return this.validateFighterData(data);
    } else if (data.fighter1 !== undefined) {
      return this.validateFightData(data);
    }
    return [this.createValidationError('data', 'Unknown data type', data, 'error')];
  }

  public validateFighterData(fighter: UFCStatsFighter): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!fighter.name || fighter.name.trim().length === 0) {
      errors.push(this.createValidationError('name', 'Fighter name is required', fighter.name, 'error'));
    }

    if (fighter.record.wins < 0 || fighter.record.losses < 0 || fighter.record.draws < 0) {
      errors.push(this.createValidationError('record', 'Fight record cannot have negative values', fighter.record, 'error'));
    }

    return errors;
  }

  public validateFightData(fight: UFCStatsFight): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!fight.fighter1 || fight.fighter1.trim().length === 0) {
      errors.push(this.createValidationError('fighter1', 'Fighter 1 name is required', fight.fighter1, 'error'));
    }

    if (!fight.fighter2 || fight.fighter2.trim().length === 0) {
      errors.push(this.createValidationError('fighter2', 'Fighter 2 name is required', fight.fighter2, 'error'));
    }

    if (fight.round < 1 || fight.round > 5) {
      errors.push(this.createValidationError('round', 'Invalid round number', fight.round, 'warning'));
    }

    return errors;
  }

  // Transform methods
  public transformData(data: any): any {
    if (data.name !== undefined) {
      return this.transformFighterData(data);
    } else if (data.fighter1 !== undefined) {
      return this.transformFightData(data);
    }
    return data;
  }

  public transformFighterData(ufcStatsFighter: UFCStatsFighter): Omit<Fighter, 'id'> {
    const now = new Date();
    
    return {
      name: ufcStatsFighter.name,
      nickname: ufcStatsFighter.nickname,
      physicalStats: {
        height: this.parseHeight(ufcStatsFighter.height),
        weight: this.parseWeight(ufcStatsFighter.weight),
        reach: this.parseReach(ufcStatsFighter.reach),
        legReach: 0, // Not available from UFC Stats
        stance: this.mapStance(ufcStatsFighter.stance)
      },
      record: {
        wins: ufcStatsFighter.record.wins,
        losses: ufcStatsFighter.record.losses,
        draws: ufcStatsFighter.record.draws,
        noContests: 0 // Not typically shown in basic record
      },
      rankings: {
        weightClass: this.inferWeightClass(ufcStatsFighter.weight),
        rank: undefined,
        p4pRank: undefined
      },
      camp: {
        name: 'Unknown',
        location: 'Unknown',
        headCoach: 'Unknown'
      },
      socialMedia: {
        instagram: undefined,
        twitter: undefined
      },
      calculatedMetrics: {
        strikingAccuracy: { 
          value: ufcStatsFighter.strikingStats.strikingAccuracy, 
          period: 5, 
          trend: 'stable' 
        },
        takedownDefense: { 
          value: ufcStatsFighter.grapplingStats.takedownDefense, 
          period: 5, 
          trend: 'stable' 
        },
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

  public transformFightData(ufcStatsFight: UFCStatsFight): any {
    // This would transform fight data to the platform's Fight interface
    // Implementation would depend on having event IDs and fighter IDs mapped
    return {
      fighter1: ufcStatsFight.fighter1,
      fighter2: ufcStatsFight.fighter2,
      result: ufcStatsFight.result,
      method: ufcStatsFight.method,
      round: ufcStatsFight.round,
      time: ufcStatsFight.time,
      weightClass: ufcStatsFight.weightClass,
      detailedStats: ufcStatsFight.detailedStats
    };
  }

  // Helper parsing methods
  private parseHeight(heightStr: string): number {
    // Parse height like "5' 11\"" to inches
    const match = heightStr.match(/(\d+)'\s*(\d+)"/);
    if (match) {
      return parseInt(match[1]) * 12 + parseInt(match[2]);
    }
    return 0;
  }

  private parseWeight(weightStr: string): number {
    // Parse weight like "155 lbs" to number
    const match = weightStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private parseReach(reachStr: string): number {
    // Parse reach like "74\"" to inches
    const match = reachStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private mapStance(stanceStr: string): FightStance {
    const stanceMapping: Record<string, FightStance> = {
      'Orthodox': 'Orthodox',
      'Southpaw': 'Southpaw',
      'Switch': 'Switch'
    };
    return stanceMapping[stanceStr] || 'Orthodox';
  }

  private inferWeightClass(weight: string): WeightClass {
    const weightNum = this.parseWeight(weight);
    
    if (weightNum <= 125) return 'Flyweight';
    if (weightNum <= 135) return 'Bantamweight';
    if (weightNum <= 145) return 'Featherweight';
    if (weightNum <= 155) return 'Lightweight';
    if (weightNum <= 170) return 'Welterweight';
    if (weightNum <= 185) return 'Middleweight';
    if (weightNum <= 205) return 'Light Heavyweight';
    return 'Heavyweight';
  }
}