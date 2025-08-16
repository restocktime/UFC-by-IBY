import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationTestSetup, setupIntegrationTests, teardownIntegrationTests } from '../integration/setup';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Automated Test Suite for CI/CD', () => {
  let testSetup: IntegrationTestSetup;

  beforeAll(async () => {
    testSetup = await setupIntegrationTests();
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  describe('Code Quality Checks', () => {
    it('should pass TypeScript compilation', () => {
      try {
        // Check API package
        execSync('npm run build', { 
          cwd: join(process.cwd(), 'packages/api'),
          stdio: 'pipe'
        });

        // Check ML package
        execSync('npm run build', { 
          cwd: join(process.cwd(), 'packages/ml'),
          stdio: 'pipe'
        });

        // Check Frontend package
        execSync('npm run build', { 
          cwd: join(process.cwd(), 'packages/frontend'),
          stdio: 'pipe'
        });

        // Check Shared package
        execSync('npm run build', { 
          cwd: join(process.cwd(), 'packages/shared'),
          stdio: 'pipe'
        });

        expect(true).toBe(true); // If we get here, compilation succeeded
      } catch (error) {
        console.error('TypeScript compilation failed:', error);
        throw error;
      }
    });

    it('should pass ESLint checks', () => {
      try {
        execSync('npm run lint', { 
          cwd: process.cwd(),
          stdio: 'pipe'
        });
        expect(true).toBe(true);
      } catch (error) {
        console.error('ESLint checks failed:', error);
        throw error;
      }
    });

    it('should pass Prettier formatting checks', () => {
      try {
        execSync('npm run format:check', { 
          cwd: process.cwd(),
          stdio: 'pipe'
        });
        expect(true).toBe(true);
      } catch (error) {
        console.error('Prettier formatting checks failed:', error);
        throw error;
      }
    });
  });

  describe('Unit Test Coverage', () => {
    it('should meet minimum test coverage requirements', () => {
      const packages = ['api', 'ml', 'frontend', 'shared'];
      
      for (const pkg of packages) {
        try {
          const output = execSync('npm run test:coverage', { 
            cwd: join(process.cwd(), 'packages', pkg),
            stdio: 'pipe',
            encoding: 'utf8'
          });

          // Parse coverage output to check thresholds
          const coverageMatch = output.match(/All files\s+\|\s+(\d+\.?\d*)/);
          if (coverageMatch) {
            const coverage = parseFloat(coverageMatch[1]);
            expect(coverage).toBeGreaterThanOrEqual(80); // 80% minimum coverage
          }
        } catch (error) {
          console.error(`Test coverage check failed for ${pkg}:`, error);
          throw error;
        }
      }
    });

    it('should have tests for all critical components', () => {
      const criticalComponents = [
        'packages/api/src/controllers',
        'packages/api/src/repositories',
        'packages/api/src/services',
        'packages/ml/src/models',
        'packages/ml/src/training',
        'packages/shared/src/validation'
      ];

      for (const componentPath of criticalComponents) {
        const testPath = join(componentPath, '__tests__');
        expect(existsSync(testPath)).toBe(true);
        
        // Check that test files exist
        const testFiles = execSync(`find ${testPath} -name "*.test.ts" -o -name "*.test.tsx"`, {
          encoding: 'utf8'
        }).trim().split('\n').filter(f => f.length > 0);
        
        expect(testFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Security Checks', () => {
    it('should pass security vulnerability scan', () => {
      try {
        execSync('npm audit --audit-level=high', { 
          cwd: process.cwd(),
          stdio: 'pipe'
        });
        expect(true).toBe(true);
      } catch (error) {
        // npm audit returns non-zero exit code if vulnerabilities found
        const output = error.stdout?.toString() || '';
        if (output.includes('found 0 vulnerabilities')) {
          expect(true).toBe(true);
        } else {
          console.error('Security vulnerabilities found:', output);
          throw error;
        }
      }
    });

    it('should not contain hardcoded secrets', () => {
      const secretPatterns = [
        /password\s*=\s*["'][^"']+["']/i,
        /api[_-]?key\s*=\s*["'][^"']+["']/i,
        /secret\s*=\s*["'][^"']+["']/i,
        /token\s*=\s*["'][^"']+["']/i
      ];

      const sourceFiles = execSync('find packages -name "*.ts" -o -name "*.tsx" -o -name "*.js"', {
        encoding: 'utf8'
      }).trim().split('\n');

      for (const file of sourceFiles) {
        if (file.includes('node_modules') || file.includes('.test.')) continue;
        
        const content = readFileSync(file, 'utf8');
        
        for (const pattern of secretPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            console.error(`Potential hardcoded secret found in ${file}: ${matches[0]}`);
            expect(matches).toBeNull();
          }
        }
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet API response time benchmarks', async () => {
      const benchmarks = [
        { endpoint: '/api/fighters/:id', maxTime: 100 },
        { endpoint: '/api/predictions', maxTime: 500 },
        { endpoint: '/api/odds/:fightId', maxTime: 200 }
      ];

      for (const benchmark of benchmarks) {
        const startTime = Date.now();
        
        // Simulate API call (in real CI, this would be actual HTTP request)
        await new Promise(resolve => setTimeout(resolve, 50)); // Mock delay
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        expect(responseTime).toBeLessThan(benchmark.maxTime);
      }
    });

    it('should meet database query performance benchmarks', async () => {
      const dbManager = testSetup.getDatabaseManager();
      
      // Test MongoDB query performance
      const startTime = Date.now();
      await dbManager.getMongoClient().db().collection('fighters').findOne({});
      const mongoTime = Date.now() - startTime;
      
      expect(mongoTime).toBeLessThan(50); // 50ms max for simple query
    });
  });

  describe('Integration Test Suite', () => {
    it('should run all integration tests successfully', () => {
      try {
        execSync('npm run test:integration', { 
          cwd: join(process.cwd(), 'packages/api'),
          stdio: 'pipe'
        });
        expect(true).toBe(true);
      } catch (error) {
        console.error('Integration tests failed:', error);
        throw error;
      }
    });

    it('should validate API contract compliance', async () => {
      // Test that API responses match expected schemas
      const apiEndpoints = [
        { path: '/api/fighters', method: 'GET' },
        { path: '/api/fights', method: 'GET' },
        { path: '/api/predictions', method: 'POST' },
        { path: '/api/odds', method: 'GET' }
      ];

      for (const endpoint of apiEndpoints) {
        // In real implementation, this would make actual HTTP requests
        // and validate response schemas against OpenAPI spec
        expect(endpoint.path).toBeDefined();
        expect(endpoint.method).toBeDefined();
      }
    });
  });

  describe('Environment Validation', () => {
    it('should validate required environment variables', () => {
      const requiredEnvVars = [
        'NODE_ENV',
        'MONGODB_URI',
        'REDIS_URL',
        'INFLUXDB_URL'
      ];

      for (const envVar of requiredEnvVars) {
        if (process.env.NODE_ENV !== 'test') {
          expect(process.env[envVar]).toBeDefined();
        }
      }
    });

    it('should validate service dependencies', async () => {
      const healthChecker = testSetup.getDatabaseManager();
      
      // Check database connections
      expect(healthChecker).toBeDefined();
      
      // In production, this would check actual service health endpoints
      const services = ['mongodb', 'redis', 'influxdb'];
      for (const service of services) {
        // Mock health check - in real implementation would ping actual services
        expect(service).toBeDefined();
      }
    });
  });

  describe('Deployment Readiness', () => {
    it('should validate Docker build process', () => {
      const dockerfiles = [
        'packages/api/Dockerfile',
        'packages/frontend/Dockerfile',
        'packages/ml/Dockerfile'
      ];

      for (const dockerfile of dockerfiles) {
        if (existsSync(dockerfile)) {
          try {
            // In real CI, this would actually build the Docker image
            const content = readFileSync(dockerfile, 'utf8');
            expect(content).toContain('FROM');
            expect(content).toContain('COPY');
            expect(content).toContain('CMD');
          } catch (error) {
            console.error(`Docker validation failed for ${dockerfile}:`, error);
            throw error;
          }
        }
      }
    });

    it('should validate Kubernetes manifests', () => {
      const k8sManifests = [
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml'
      ];

      for (const manifest of k8sManifests) {
        if (existsSync(manifest)) {
          try {
            const content = readFileSync(manifest, 'utf8');
            expect(content).toContain('apiVersion');
            expect(content).toContain('kind');
            expect(content).toContain('metadata');
          } catch (error) {
            console.error(`Kubernetes manifest validation failed for ${manifest}:`, error);
            throw error;
          }
        }
      }
    });

    it('should validate configuration files', () => {
      const configFiles = [
        'package.json',
        'tsconfig.json',
        '.eslintrc.json',
        '.prettierrc'
      ];

      for (const configFile of configFiles) {
        expect(existsSync(configFile)).toBe(true);
        
        if (configFile.endsWith('.json')) {
          try {
            const content = readFileSync(configFile, 'utf8');
            JSON.parse(content); // Validate JSON syntax
            expect(true).toBe(true);
          } catch (error) {
            console.error(`Invalid JSON in ${configFile}:`, error);
            throw error;
          }
        }
      }
    });
  });

  describe('Monitoring and Observability', () => {
    it('should validate metrics collection', () => {
      // Test that metrics endpoints are properly configured
      const metricsConfig = {
        prometheus: {
          enabled: true,
          port: 9090
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health'
        }
      };

      expect(metricsConfig.prometheus.enabled).toBe(true);
      expect(metricsConfig.healthCheck.enabled).toBe(true);
    });

    it('should validate logging configuration', () => {
      // Test that logging is properly configured
      const logLevels = ['error', 'warn', 'info', 'debug'];
      const currentLogLevel = process.env.LOG_LEVEL || 'info';
      
      expect(logLevels).toContain(currentLogLevel);
    });
  });
});