import { BackupRecoveryService, BackupOptions, RestoreOptions, BackupMetadata } from '../backup-recovery.service';
import { DatabaseManager } from '../../database';
import { promises as fs } from 'fs';

// Mock dependencies
jest.mock('../../database');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    rm: jest.fn(),
    stat: jest.fn(),
  },
}));

describe('BackupRecoveryService', () => {
  let service: BackupRecoveryService;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock fs
    mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.readFile.mockResolvedValue('{}');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.rm.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1000 } as any);

    // Mock DatabaseManager
    mockDbManager = {
      getInstance: jest.fn(),
      getInfluxDB: jest.fn(),
      getMongoDB: jest.fn(),
    } as any;

    // Mock InfluxDB
    const mockInfluxDB = {
      getWriteApi: jest.fn().mockReturnValue({
        writePoint: jest.fn(),
        flush: jest.fn(),
      }),
      getQueryApi: jest.fn().mockReturnValue({
        collectRows: jest.fn().mockResolvedValue([]),
      }),
      createPoint: jest.fn().mockReturnValue({
        tag: jest.fn().mockReturnThis(),
        stringField: jest.fn().mockReturnThis(),
        intField: jest.fn().mockReturnThis(),
        booleanField: jest.fn().mockReturnThis(),
        timestamp: jest.fn().mockReturnThis(),
      }),
    };

    mockDbManager.getInfluxDB.mockReturnValue(mockInfluxDB as any);

    // Mock MongoDB
    const mockMongoDB = {
      getDb: jest.fn().mockReturnValue({
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { name: 'events' },
            { name: 'fighters' },
          ]),
        }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              { _id: '1', name: 'Test Event' },
            ]),
          }),
          deleteMany: jest.fn(),
          insertMany: jest.fn(),
          insertOne: jest.fn(),
        }),
      }),
    };

    mockDbManager.getMongoDB.mockReturnValue(mockMongoDB as any);

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);

    // Create service instance
    service = new BackupRecoveryService('./test-backups');
  });

  describe('createFullBackup', () => {
    it('should create full backup successfully', async () => {
      const options: BackupOptions = {
        compression: true,
        encryption: false,
        retentionDays: 30,
      };

      const backupId = await service.createFullBackup(options);

      expect(backupId).toMatch(/^full_backup_\d+$/);
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
      expect(mockDbManager.getMongoDB).toHaveBeenCalled();
    });

    it('should handle backup creation errors', async () => {
      const options: BackupOptions = {
        compression: true,
      };

      mockFs.mkdir.mockRejectedValue(new Error('Directory creation failed'));

      await expect(service.createFullBackup(options))
        .rejects.toThrow('Failed to create backup');
    });

    it('should include only specified collections', async () => {
      const options: BackupOptions = {
        includeCollections: ['events'],
        compression: false,
      };

      await service.createFullBackup(options);

      expect(mockDbManager.getMongoDB).toHaveBeenCalled();
    });

    it('should exclude specified collections', async () => {
      const options: BackupOptions = {
        excludeCollections: ['fighters'],
        compression: false,
      };

      await service.createFullBackup(options);

      expect(mockDbManager.getMongoDB).toHaveBeenCalled();
    });
  });

  describe('createIncrementalBackup', () => {
    it('should create incremental backup successfully', async () => {
      const lastBackupId = 'full_backup_123456789';
      const options: BackupOptions = {
        compression: true,
      };

      // Mock existing backup metadata
      const mockMetadata: BackupMetadata = {
        backupId: lastBackupId,
        timestamp: new Date('2024-01-01'),
        size: 1000,
        collections: ['events'],
        compression: true,
        encryption: false,
        checksum: 'checksum123',
        status: 'completed',
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMetadata));

      const backupId = await service.createIncrementalBackup(lastBackupId, options);

      expect(backupId).toMatch(/^incremental_backup_\d+$/);
      expect(mockFs.readFile).toHaveBeenCalled();
    });

    it('should handle missing last backup', async () => {
      const lastBackupId = 'nonexistent_backup';
      const options: BackupOptions = {};

      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(service.createIncrementalBackup(lastBackupId, options))
        .rejects.toThrow('Failed to create incremental backup');
    });

    it('should handle incremental backup errors', async () => {
      const lastBackupId = 'full_backup_123456789';
      const options: BackupOptions = {};

      const mockMetadata: BackupMetadata = {
        backupId: lastBackupId,
        timestamp: new Date('2024-01-01'),
        size: 1000,
        collections: ['events'],
        compression: false,
        encryption: false,
        checksum: 'checksum123',
        status: 'completed',
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMetadata));
      mockFs.mkdir.mockRejectedValue(new Error('Directory creation failed'));

      await expect(service.createIncrementalBackup(lastBackupId, options))
        .rejects.toThrow('Failed to create incremental backup');
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup successfully', async () => {
      const options: RestoreOptions = {
        backupId: 'full_backup_123456789',
        overwriteExisting: true,
        validateIntegrity: true,
      };

      const mockMetadata: BackupMetadata = {
        backupId: options.backupId,
        timestamp: new Date(),
        size: 1000,
        collections: ['events'],
        compression: false,
        encryption: false,
        checksum: 'checksum_123456789',
        status: 'completed',
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMetadata));
      mockFs.readdir.mockResolvedValue(['events.json', 'fighters.json']);

      await service.restoreFromBackup(options);

      expect(mockFs.readFile).toHaveBeenCalled();
      expect(mockDbManager.getMongoDB).toHaveBeenCalled();
    });

    it('should handle missing backup', async () => {
      const options: RestoreOptions = {
        backupId: 'nonexistent_backup',
      };

      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(service.restoreFromBackup(options))
        .rejects.toThrow('Failed to restore from backup');
    });

    it('should handle incomplete backup', async () => {
      const options: RestoreOptions = {
        backupId: 'incomplete_backup_123',
        validateIntegrity: false,
      };

      const mockMetadata: BackupMetadata = {
        backupId: options.backupId,
        timestamp: new Date(),
        size: 1000,
        collections: ['events'],
        compression: false,
        encryption: false,
        checksum: 'checksum123',
        status: 'failed',
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMetadata));

      await expect(service.restoreFromBackup(options))
        .rejects.toThrow('Backup is not in completed state: failed');
    });

    it('should handle integrity validation failure', async () => {
      const options: RestoreOptions = {
        backupId: 'backup_123',
        validateIntegrity: true,
      };

      const mockMetadata: BackupMetadata = {
        backupId: options.backupId,
        timestamp: new Date(),
        size: 1000,
        collections: ['events'],
        compression: false,
        encryption: false,
        checksum: 'original_checksum',
        status: 'completed',
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMetadata));
      mockFs.stat.mockResolvedValue({ size: 2000 } as any); // Different size

      await expect(service.restoreFromBackup(options))
        .rejects.toThrow('Backup integrity validation failed');
    });
  });

  describe('createRecoveryPoint', () => {
    it('should create recovery point successfully', async () => {
      const description = 'Before major update';

      const mockCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'recovery123' }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      const recoveryPointId = await service.createRecoveryPoint(description);

      expect(recoveryPointId).toMatch(/^full_backup_\d+$/);
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });

    it('should handle recovery point creation errors', async () => {
      const description = 'Test recovery point';

      mockFs.mkdir.mockRejectedValue(new Error('Backup creation failed'));

      await expect(service.createRecoveryPoint(description))
        .rejects.toThrow('Failed to create recovery point');
    });
  });

  describe('listBackups', () => {
    it('should list backups successfully', async () => {
      const mockBackupDirs = ['full_backup_123', 'incremental_backup_456'];
      const mockMetadata1: BackupMetadata = {
        backupId: 'full_backup_123',
        timestamp: new Date('2024-01-01'),
        size: 1000,
        collections: ['events'],
        compression: false,
        encryption: false,
        checksum: 'checksum1',
        status: 'completed',
      };
      const mockMetadata2: BackupMetadata = {
        backupId: 'incremental_backup_456',
        timestamp: new Date('2024-01-02'),
        size: 500,
        collections: ['fighters'],
        compression: true,
        encryption: false,
        checksum: 'checksum2',
        status: 'completed',
      };

      mockFs.readdir.mockResolvedValue(mockBackupDirs as any);
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockMetadata1))
        .mockResolvedValueOnce(JSON.stringify(mockMetadata2));

      const backups = await service.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0].timestamp.getTime()).toBeGreaterThan(backups[1].timestamp.getTime());
    });

    it('should handle listing errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory read failed'));

      await expect(service.listBackups())
        .rejects.toThrow('Failed to list backups');
    });

    it('should skip invalid backup directories', async () => {
      const mockBackupDirs = ['valid_backup_123', 'invalid_dir'];
      const mockMetadata: BackupMetadata = {
        backupId: 'valid_backup_123',
        timestamp: new Date(),
        size: 1000,
        collections: ['events'],
        compression: false,
        encryption: false,
        checksum: 'checksum1',
        status: 'completed',
      };

      mockFs.readdir.mockResolvedValue(mockBackupDirs as any);
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockMetadata))
        .mockRejectedValueOnce(new Error('Invalid metadata'));

      const backups = await service.listBackups();

      expect(backups).toHaveLength(1);
      expect(backups[0].backupId).toBe('valid_backup_123');
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup successfully', async () => {
      const backupId = 'backup_to_delete_123';

      await service.deleteBackup(backupId);

      expect(mockFs.access).toHaveBeenCalled();
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining(backupId),
        { recursive: true, force: true }
      );
    });

    it('should handle missing backup', async () => {
      const backupId = 'nonexistent_backup';

      mockFs.access.mockRejectedValue(new Error('File not found'));

      await expect(service.deleteBackup(backupId))
        .rejects.toThrow('Backup not found: nonexistent_backup');
    });

    it('should handle deletion errors', async () => {
      const backupId = 'backup_123';

      mockFs.rm.mockRejectedValue(new Error('Deletion failed'));

      await expect(service.deleteBackup(backupId))
        .rejects.toThrow('Failed to delete backup');
    });
  });

  describe('cleanupOldBackups', () => {
    it('should cleanup old backups successfully', async () => {
      const retentionDays = 30;
      const oldDate = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)); // 40 days ago
      const recentDate = new Date(Date.now() - (20 * 24 * 60 * 60 * 1000)); // 20 days ago

      const mockBackups: BackupMetadata[] = [
        {
          backupId: 'old_backup_1',
          timestamp: oldDate,
          size: 1000,
          collections: ['events'],
          compression: false,
          encryption: false,
          checksum: 'checksum1',
          status: 'completed',
        },
        {
          backupId: 'recent_backup_1',
          timestamp: recentDate,
          size: 1000,
          collections: ['events'],
          compression: false,
          encryption: false,
          checksum: 'checksum2',
          status: 'completed',
        },
      ];

      mockFs.readdir.mockResolvedValue(['old_backup_1', 'recent_backup_1'] as any);
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockBackups[0]))
        .mockResolvedValueOnce(JSON.stringify(mockBackups[1]));

      await service.cleanupOldBackups(retentionDays);

      // Should only delete the old backup
      expect(mockFs.rm).toHaveBeenCalledTimes(1);
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining('old_backup_1'),
        { recursive: true, force: true }
      );
    });

    it('should handle cleanup errors', async () => {
      const retentionDays = 30;

      mockFs.readdir.mockRejectedValue(new Error('Directory read failed'));

      await expect(service.cleanupOldBackups(retentionDays))
        .rejects.toThrow('Failed to cleanup old backups');
    });
  });
});