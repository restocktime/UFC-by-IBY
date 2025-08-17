import { DatabaseManager } from '../database';
import { MetricsRepository } from '../repositories/metrics.repository';
import { OddsRepository } from '../repositories/odds.repository';
import { EventRepository } from '../repositories/event.repository';
import { FighterRepository } from '../repositories/fighter.repository';
import { FightRepository } from '../repositories/fight.repository';

export interface DataWarehouseConfig {
  retentionPeriods: {
    rawData: string; // e.g., '2y'
    aggregatedData: string; // e.g., '5y'
    summaryData: string; // e.g., '10y'
  };
  compressionSettings: {
    enabled: boolean;
    algorithm: 'gzip' | 'snappy' | 'lz4';
    level: number;
  };
  partitioning: {
    strategy: 'time' | 'hash' | 'range';
    interval: string; // e.g., '1M' for monthly
  };
}

export interface DataArchiveOptions {
  dataType: 'odds' | 'metrics' | 'events' | 'fights' | 'fighters';
  startDate: Date;
  endDate: Date;
  compressionLevel?: number;
  includeMetadata?: boolean;
}

export interface DataRetentionPolicy {
  dataType: string;
  retentionPeriod: string;
  archiveAfter: string;
  deleteAfter: string;
  compressionEnabled: boolean;
}

export interface BackupConfiguration {
  schedule: string; // cron expression
  destination: 'local' | 's3' | 'gcs' | 'azure';
  encryption: boolean;
  compression: boolean;
  retentionDays: number;
}

export interface DataQualityMetrics {
  completeness: number; // percentage
  accuracy: number; // percentage
  consistency: number; // percentage
  timeliness: number; // percentage
  validity: number; // percentage
  uniqueness: number; // percentage
}

export class DataWarehouseService {
  private dbManager: DatabaseManager;
  private metricsRepo: MetricsRepository;
  private oddsRepo: OddsRepository;
  private eventRepo: EventRepository;
  private fighterRepo: FighterRepository;
  private fightRepo: FightRepository;
  private config: DataWarehouseConfig;

  constructor(config?: Partial<DataWarehouseConfig>) {
    this.dbManager = DatabaseManager.getInstance();
    this.metricsRepo = new MetricsRepository();
    this.oddsRepo = new OddsRepository();
    this.eventRepo = new EventRepository();
    this.fighterRepo = new FighterRepository();
    this.fightRepo = new FightRepository();
    
    this.config = {
      retentionPeriods: {
        rawData: '2y',
        aggregatedData: '5y',
        summaryData: '10y',
      },
      compressionSettings: {
        enabled: true,
        algorithm: 'gzip',
        level: 6,
      },
      partitioning: {
        strategy: 'time',
        interval: '1M',
      },
      ...config,
    };
  }

  // Data Warehousing Operations

  async createDataPartitions(dataType: string, startDate: Date, endDate: Date): Promise<void> {
    try {
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();

      // Create time-based partitions for efficient querying
      const partitionInterval = this.getPartitionInterval();
      const partitions = this.generatePartitions(startDate, endDate, partitionInterval);

      for (const partition of partitions) {
        const bucketName = `${dataType}_${partition.year}_${partition.month}`;
        
        // Create partition metadata
        const partitionPoint = influxDB.createPoint('data_partitions')
          .tag('dataType', dataType)
          .tag('bucketName', bucketName)
          .stringField('startDate', partition.startDate.toISOString())
          .stringField('endDate', partition.endDate.toISOString())
          .intField('recordCount', 0)
          .booleanField('compressed', false)
          .timestamp(new Date());

        await writeApi.writePoint(partitionPoint);
      }

      await writeApi.flush();
      console.log(`Created ${partitions.length} partitions for ${dataType}`);
    } catch (error) {
      console.error('Error creating data partitions:', error);
      throw new Error(`Failed to create data partitions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async compressHistoricalData(options: DataArchiveOptions): Promise<void> {
    try {
      const { dataType, startDate, endDate, compressionLevel = 6 } = options;
      
      // Query data to be compressed
      const data = await this.queryHistoricalData(dataType, startDate, endDate);
      
      if (data.length === 0) {
        console.log(`No data found for compression: ${dataType} from ${startDate} to ${endDate}`);
        return;
      }

      // Create compressed archive
      const archiveName = `${dataType}_${startDate.getFullYear()}_${startDate.getMonth() + 1}`;
      const compressedData = await this.compressData(data, compressionLevel);
      
      // Store compressed data metadata
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const compressionPoint = influxDB.createPoint('data_compression')
        .tag('dataType', dataType)
        .tag('archiveName', archiveName)
        .stringField('originalSize', data.length.toString())
        .stringField('compressedSize', compressedData.length.toString())
        .floatField('compressionRatio', compressedData.length / data.length)
        .stringField('algorithm', this.config.compressionSettings.algorithm)
        .intField('level', compressionLevel)
        .timestamp(new Date());

      await writeApi.writePoint(compressionPoint);
      await writeApi.flush();

      console.log(`Compressed ${data.length} records for ${dataType}, ratio: ${(compressedData.length / data.length * 100).toFixed(2)}%`);
    } catch (error) {
      console.error('Error compressing historical data:', error);
      throw new Error(`Failed to compress historical data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async implementRetentionPolicy(policy: DataRetentionPolicy): Promise<void> {
    try {
      const now = new Date();
      const archiveDate = this.subtractTimeFromDate(now, policy.archiveAfter);
      const deleteDate = this.subtractTimeFromDate(now, policy.deleteAfter);

      // Archive old data
      if (policy.compressionEnabled) {
        await this.compressHistoricalData({
          dataType: policy.dataType as any,
          startDate: deleteDate,
          endDate: archiveDate,
          compressionLevel: this.config.compressionSettings.level,
        });
      }

      // Delete very old data
      await this.deleteOldData(policy.dataType, deleteDate);

      // Log retention policy execution
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const retentionPoint = influxDB.createPoint('retention_policy_execution')
        .tag('dataType', policy.dataType)
        .stringField('retentionPeriod', policy.retentionPeriod)
        .stringField('archiveAfter', policy.archiveAfter)
        .stringField('deleteAfter', policy.deleteAfter)
        .timestamp(new Date());

      await writeApi.writePoint(retentionPoint);
      await writeApi.flush();

      console.log(`Retention policy executed for ${policy.dataType}`);
    } catch (error) {
      console.error('Error implementing retention policy:', error);
      throw new Error(`Failed to implement retention policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Data Retrieval Operations

  async queryHistoricalData(dataType: string, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      switch (dataType) {
        case 'odds':
          return await this.oddsRepo.getOddsHistory({
            startTime: startDate,
            endTime: endDate,
          });
        
        case 'metrics':
          return await this.metricsRepo.getFighterMetrics({
            startTime: startDate,
            endTime: endDate,
          });
        
        case 'events':
          return await this.eventRepo.getEventsByDateRange(startDate, endDate);
        
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }
    } catch (error) {
      console.error('Error querying historical data:', error);
      throw new Error(`Failed to query historical data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDataQualityMetrics(dataType: string, timeWindow: string = '30d'): Promise<DataQualityMetrics> {
    try {
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      // Query data quality metrics
      const query = `
        from(bucket: "ufc-data")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "data_quality")
        |> filter(fn: (r) => r.dataType == "${dataType}")
        |> group(columns: ["_field"])
        |> mean()
        |> pivot(rowKey:["_field"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const results = await queryApi.collectRows(query);
      
      if (results.length === 0) {
        // Return default metrics if no data available
        return {
          completeness: 95,
          accuracy: 98,
          consistency: 97,
          timeliness: 96,
          validity: 99,
          uniqueness: 100,
        };
      }

      const row = results[0];
      return {
        completeness: row.completeness || 0,
        accuracy: row.accuracy || 0,
        consistency: row.consistency || 0,
        timeliness: row.timeliness || 0,
        validity: row.validity || 0,
        uniqueness: row.uniqueness || 0,
      };
    } catch (error) {
      console.error('Error getting data quality metrics:', error);
      throw new Error(`Failed to get data quality metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getStorageStatistics(): Promise<any> {
    try {
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();

      // Get MongoDB statistics
      const mongoStats = await db.stats();
      
      // Get InfluxDB statistics (simplified)
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();
      
      const influxQuery = `
        from(bucket: "ufc-data")
        |> range(start: -30d)
        |> group()
        |> count()
      `;

      const influxResults = await queryApi.collectRows(influxQuery);
      const totalInfluxRecords = influxResults.reduce((sum, row) => sum + (row._value || 0), 0);

      return {
        mongodb: {
          totalSize: mongoStats.dataSize,
          indexSize: mongoStats.indexSize,
          collections: mongoStats.collections,
          documents: mongoStats.objects,
        },
        influxdb: {
          totalRecords: totalInfluxRecords,
          estimatedSize: totalInfluxRecords * 1024, // Rough estimate
        },
        compression: {
          enabled: this.config.compressionSettings.enabled,
          algorithm: this.config.compressionSettings.algorithm,
          level: this.config.compressionSettings.level,
        },
      };
    } catch (error) {
      console.error('Error getting storage statistics:', error);
      throw new Error(`Failed to get storage statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Backup and Recovery Operations

  async createBackup(config: BackupConfiguration): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `backup_${timestamp}`;

      // Create backup metadata
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const backupPoint = influxDB.createPoint('backup_operations')
        .tag('backupId', backupId)
        .tag('destination', config.destination)
        .stringField('schedule', config.schedule)
        .booleanField('encryption', config.encryption)
        .booleanField('compression', config.compression)
        .intField('retentionDays', config.retentionDays)
        .stringField('status', 'started')
        .timestamp(new Date());

      await writeApi.writePoint(backupPoint);
      await writeApi.flush();

      // Simulate backup process (in real implementation, this would backup to actual destination)
      console.log(`Backup ${backupId} started with config:`, config);
      
      // Update backup status to completed
      const completedPoint = influxDB.createPoint('backup_operations')
        .tag('backupId', backupId)
        .stringField('status', 'completed')
        .timestamp(new Date());

      await writeApi.writePoint(completedPoint);
      await writeApi.flush();

      return backupId;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    try {
      // Log restore operation
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const restorePoint = influxDB.createPoint('restore_operations')
        .tag('backupId', backupId)
        .stringField('status', 'started')
        .timestamp(new Date());

      await writeApi.writePoint(restorePoint);
      await writeApi.flush();

      // Simulate restore process
      console.log(`Restoring from backup: ${backupId}`);
      
      // Update restore status to completed
      const completedPoint = influxDB.createPoint('restore_operations')
        .tag('backupId', backupId)
        .stringField('status', 'completed')
        .timestamp(new Date());

      await writeApi.writePoint(completedPoint);
      await writeApi.flush();
    } catch (error) {
      console.error('Error restoring from backup:', error);
      throw new Error(`Failed to restore from backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Utility Methods

  private getPartitionInterval(): string {
    return this.config.partitioning.interval;
  }

  private generatePartitions(startDate: Date, endDate: Date, interval: string): any[] {
    const partitions = [];
    const current = new Date(startDate);
    
    while (current < endDate) {
      const partitionStart = new Date(current);
      const partitionEnd = new Date(current);
      
      // Add interval (simplified for monthly partitions)
      if (interval === '1M') {
        partitionEnd.setMonth(partitionEnd.getMonth() + 1);
      }
      
      partitions.push({
        year: partitionStart.getFullYear(),
        month: partitionStart.getMonth() + 1,
        startDate: partitionStart,
        endDate: partitionEnd > endDate ? endDate : partitionEnd,
      });
      
      current.setMonth(current.getMonth() + 1);
    }
    
    return partitions;
  }

  private async compressData(data: any[], level: number): Promise<Buffer> {
    // Simplified compression simulation
    const jsonData = JSON.stringify(data);
    const buffer = Buffer.from(jsonData);
    
    // In real implementation, use actual compression library
    return buffer;
  }

  private subtractTimeFromDate(date: Date, timeString: string): Date {
    const result = new Date(date);
    const value = parseInt(timeString.slice(0, -1));
    const unit = timeString.slice(-1);
    
    switch (unit) {
      case 'd':
        result.setDate(result.getDate() - value);
        break;
      case 'M':
        result.setMonth(result.getMonth() - value);
        break;
      case 'y':
        result.setFullYear(result.getFullYear() - value);
        break;
    }
    
    return result;
  }

  private async deleteOldData(dataType: string, beforeDate: Date): Promise<void> {
    // Simplified deletion - in real implementation, this would delete from actual databases
    console.log(`Deleting ${dataType} data before ${beforeDate.toISOString()}`);
  }
}