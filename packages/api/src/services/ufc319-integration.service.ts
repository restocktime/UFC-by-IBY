import { SportsDataIOConnector } from '../ingestion/connectors/sports-data-io.connector.js';
import { EventRepository } from '../repositories/event.repository.js';
import { FighterRepository } from '../repositories/fighter.repository.js';
import { FightRepository } from '../repositories/fight.repository.js';
import { Event, Fighter, Fight, DataIngestionResult } from '@ufc-platform/shared';

export interface UFC319EventData {
  event: Event;
  fighters: Fighter[];
  fights: Fight[];
  ingestionResults: DataIngestionResult[];
}

export class UFC319IntegrationService {
  private sportsDataConnector: SportsDataIOConnector;
  private eventRepository: EventRepository;
  private fighterRepository: FighterRepository;
  private fightRepository: FightRepository;

  constructor() {
    this.eventRepository = new EventRepository();
    this.fighterRepository = new FighterRepository();
    this.fightRepository = new FightRepository();
    
    this.sportsDataConnector = new SportsDataIOConnector(
      this.fighterRepository,
      this.fightRepository,
      this.eventRepository
    );
  }

  /**
   * Integrate UFC 319 event data specifically
   * Event ID: 864 as specified in the requirements
   */
  public async integrateUFC319Event(): Promise<UFC319EventData> {
    const UFC_319_EVENT_ID = 864;
    const results: DataIngestionResult[] = [];

    try {
      console.log('Starting UFC 319 event integration...');

      // Step 1: Fetch and process the event details
      console.log('Fetching UFC 319 event details...');
      const eventResult = await this.fetchEventDetails(UFC_319_EVENT_ID);
      results.push(eventResult.ingestionResult);

      // Step 2: Fetch and process all fighters for the event
      console.log('Fetching UFC 319 fighters...');
      const fightersResult = await this.fetchEventFighters(UFC_319_EVENT_ID);
      results.push(fightersResult.ingestionResult);

      // Step 3: Fetch and process all fights for the event
      console.log('Fetching UFC 319 fights...');
      const fightsResult = await this.fetchEventFights(UFC_319_EVENT_ID);
      results.push(fightsResult.ingestionResult);

      // Step 4: Update event with fight references
      if (eventResult.event && fightsResult.fights.length > 0) {
        await this.linkFightsToEvent(eventResult.event.id, fightsResult.fights);
      }

      console.log('UFC 319 integration completed successfully');

      return {
        event: eventResult.event,
        fighters: fightersResult.fighters,
        fights: fightsResult.fights,
        ingestionResults: results
      };

    } catch (error: any) {
      console.error('UFC 319 integration failed:', error.message);
      throw new Error(`UFC 319 integration failed: ${error.message}`);
    }
  }

  /**
   * Fetch specific event details for UFC 319
   */
  private async fetchEventDetails(eventId: number): Promise<{
    event: Event;
    ingestionResult: DataIngestionResult;
  }> {
    try {
      // Use the connector to fetch event data
      const ingestionResult = await this.sportsDataConnector.syncEventFights(eventId);
      
      // Find the event in our database
      const events = await this.eventRepository.search({ limit: 100 });
      const event = events.find(e => e.name.includes('UFC 319') || e.name.includes('319'));
      
      if (!event) {
        throw new Error('UFC 319 event not found after sync');
      }

      return {
        event,
        ingestionResult
      };

    } catch (error: any) {
      throw new Error(`Failed to fetch UFC 319 event details: ${error.message}`);
    }
  }

  /**
   * Fetch all fighters participating in UFC 319
   */
  private async fetchEventFighters(eventId: number): Promise<{
    fighters: Fighter[];
    ingestionResult: DataIngestionResult;
  }> {
    try {
      // Sync all fighters first
      const ingestionResult = await this.sportsDataConnector.syncFighters();
      
      // Get all fighters (we'll filter for UFC 319 fighters when we have fight data)
      const allFighters = await this.fighterRepository.search({ limit: 1000 });
      
      return {
        fighters: allFighters,
        ingestionResult
      };

    } catch (error: any) {
      throw new Error(`Failed to fetch UFC 319 fighters: ${error.message}`);
    }
  }

  /**
   * Fetch all fights for UFC 319
   */
  private async fetchEventFights(eventId: number): Promise<{
    fights: Fight[];
    ingestionResult: DataIngestionResult;
  }> {
    try {
      // Sync fights for the specific event
      const ingestionResult = await this.sportsDataConnector.syncEventFights(eventId);
      
      // Find fights for this event
      const allFights = await this.fightRepository.search({ limit: 100 });
      const eventFights = allFights.filter(fight => 
        fight.eventId.includes('864') || fight.eventId.includes('sportsdata_864')
      );
      
      return {
        fights: eventFights,
        ingestionResult
      };

    } catch (error: any) {
      throw new Error(`Failed to fetch UFC 319 fights: ${error.message}`);
    }
  }

  /**
   * Link fights to the event
   */
  private async linkFightsToEvent(eventId: string, fights: Fight[]): Promise<void> {
    try {
      for (const fight of fights) {
        await this.eventRepository.addFight(eventId, fight.id);
      }
    } catch (error: any) {
      console.warn(`Failed to link some fights to event: ${error.message}`);
    }
  }

  /**
   * Get current UFC 319 data from database
   */
  public async getUFC319Data(): Promise<UFC319EventData | null> {
    try {
      // Find UFC 319 event
      const events = await this.eventRepository.search({ limit: 100 });
      const event = events.find(e => e.name.includes('UFC 319') || e.name.includes('319'));
      
      if (!event) {
        return null;
      }

      // Get fights for this event
      const fights = await this.fightRepository.search({ 
        eventId: event.id,
        limit: 50 
      });

      // Get fighters for these fights
      const fighterIds = new Set<string>();
      fights.forEach(fight => {
        fighterIds.add(fight.fighter1Id);
        fighterIds.add(fight.fighter2Id);
      });

      const fighters: Fighter[] = [];
      for (const fighterId of fighterIds) {
        try {
          const fighter = await this.fighterRepository.findById(fighterId);
          if (fighter) {
            fighters.push(fighter);
          }
        } catch (error) {
          console.warn(`Fighter ${fighterId} not found`);
        }
      }

      return {
        event,
        fighters,
        fights,
        ingestionResults: []
      };

    } catch (error: any) {
      throw new Error(`Failed to get UFC 319 data: ${error.message}`);
    }
  }

  /**
   * Automatic event discovery and updates
   * Checks for new UFC events and updates existing ones
   */
  public async discoverAndUpdateEvents(): Promise<DataIngestionResult> {
    try {
      console.log('Starting automatic event discovery...');
      
      // Sync current season events
      const currentSeason = new Date().getFullYear();
      const result = await this.sportsDataConnector.syncEvents(currentSeason);
      
      console.log(`Event discovery completed. Processed: ${result.recordsProcessed}, Skipped: ${result.recordsSkipped}`);
      
      return result;

    } catch (error: any) {
      throw new Error(`Event discovery failed: ${error.message}`);
    }
  }

  /**
   * Get fighter statistics and information
   */
  public async getFighterDetails(fighterId: string): Promise<Fighter | null> {
    try {
      return await this.fighterRepository.findById(fighterId);
    } catch (error: any) {
      console.error(`Failed to get fighter details for ${fighterId}:`, error.message);
      return null;
    }
  }

  /**
   * Get fight card details and scheduling
   */
  public async getFightCardDetails(eventId?: string): Promise<{
    event: Event | null;
    fights: Fight[];
    mainEvent?: Fight;
    preliminaryCard: Fight[];
    mainCard: Fight[];
  }> {
    try {
      let event: Event | null = null;
      let fights: Fight[] = [];

      if (eventId) {
        event = await this.eventRepository.findById(eventId);
        if (event) {
          fights = await this.fightRepository.search({ 
            eventId: event.id,
            limit: 50 
          });
        }
      } else {
        // Get UFC 319 by default
        const ufc319Data = await this.getUFC319Data();
        if (ufc319Data) {
          event = ufc319Data.event;
          fights = ufc319Data.fights;
        }
      }

      // Categorize fights
      const mainEvent = fights.find(fight => fight.mainEvent);
      const mainCard = fights.filter(fight => fight.titleFight || fight.mainEvent);
      const preliminaryCard = fights.filter(fight => !fight.titleFight && !fight.mainEvent);

      return {
        event,
        fights,
        mainEvent,
        preliminaryCard,
        mainCard
      };

    } catch (error: any) {
      throw new Error(`Failed to get fight card details: ${error.message}`);
    }
  }
}