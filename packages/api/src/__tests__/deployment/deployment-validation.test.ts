import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Deployment Validation Tests', () => {
  const projectRoot = join(__dirname, '../../../..');

  describe('Docker Configuration Validation', () => {
    it('should have valid Dockerfiles for all services', () => {
      const dockerfiles = [
        'packages/api/Dockerfile',
        'packages/frontend/Dockerfile',
        'packages/ml/Dockerfile'
      ];

      for (const dockerfile of dockerfiles) {
        const dockerfilePath = join(projectRoot, dockerfile);
        expect(existsSync(dockerfilePath)).toBe(true);

        const content = readFileSync(dockerfilePath, 'utf8');
        
        // Check for required Dockerfile instructions
        expect(content).toContain('FROM');
        expect(content).toContain('WORKDIR');
        expect(content).toContain('COPY');
        expect(content).toContain('CMD');
        expect(content).toContain('EXPOSE');
        
        // Check for security best practices
        expect(content).toContain('USER'); // Non-root user
        expect(content).toContain('HEALTHCHECK'); // Health check
        
        // Check for multi-stage build optimization
        expect(content).toContain('AS base');
        expect(content).toContain('AS deps');
        expect(content).toContain('AS builder');
        expect(content).toContain('AS runner');
      }
    });

    it('should have valid docker-compose configuration', () => {
      const dockerComposePath = join(projectRoot, 'docker-compose.yml');
      expect(existsSync(dockerComposePath)).toBe(true);

      const content = readFileSync(dockerComposePath, 'utf8');
      
      // Check for required services
      expect(content).toContain('mongodb:');
      expect(content).toContain('redis:');
      expect(content).toContain('influxdb:');
      expect(content).toContain('api:');
      expect(content).toContain('frontend:');
      expect(content).toContain('ml:');
      
      // Check for health checks
      expect(content).toContain('healthcheck:');
      
      // Check for networks
      expect(content).toContain('networks:');
      expect(content).toContain('ufc-network');
      
      // Check for volumes
      expect(content).toContain('volumes:');
    });
  });

  describe('Kubernetes Configuration Validation', () => {
    it('should have valid Kubernetes manifests', () => {
      const manifests = [
        'k8s/namespace.yaml',
        'k8s/configmap.yaml',
        'k8s/secrets.yaml',
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml',
        'k8s/ingress.yaml'
      ];

      for (const manifest of manifests) {
        const manifestPath = join(projectRoot, manifest);
        expect(existsSync(manifestPath)).toBe(true);

        const content = readFileSync(manifestPath, 'utf8');
        
        // Check for required Kubernetes fields
        expect(content).toContain('apiVersion:');
        expect(content).toContain('kind:');
        expect(content).toContain('metadata:');
        
        // Check for namespace
        if (!manifest.includes('namespace.yaml')) {
          expect(content).toContain('namespace: ufc-platform');
        }
      }
    });

    it('should have proper resource limits and requests', () => {
      const deploymentManifests = [
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml'
      ];

      for (const manifest of deploymentManifests) {
        const manifestPath = join(projectRoot, manifest);
        const content = readFileSync(manifestPath, 'utf8');
        
        // Check for resource configuration
        expect(content).toContain('resources:');
        expect(content).toContain('requests:');
        expect(content).toContain('limits:');
        expect(content).toContain('memory:');
        expect(content).toContain('cpu:');
      }
    });

    it('should have proper health checks configured', () => {
      const deploymentManifests = [
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml'
      ];

      for (const manifest of deploymentManifests) {
        const manifestPath = join(projectRoot, manifest);
        const content = readFileSync(manifestPath, 'utf8');
        
        // Check for health checks
        expect(content).toContain('livenessProbe:');
        expect(content).toContain('readinessProbe:');
        expect(content).toContain('httpGet:');
        expect(content).toContain('path: /health');
      }
    });

    it('should have HPA configured for scalability', () => {
      const deploymentManifests = [
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml'
      ];

      for (const manifest of deploymentManifests) {
        const manifestPath = join(projectRoot, manifest);
        const content = readFileSync(manifestPath, 'utf8');
        
        // Check for HPA configuration
        expect(content).toContain('HorizontalPodAutoscaler');
        expect(content).toContain('minReplicas:');
        expect(content).toContain('maxReplicas:');
        expect(content).toContain('metrics:');
      }
    });

    it('should have security contexts configured', () => {
      const deploymentManifests = [
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml'
      ];

      for (const manifest of deploymentManifests) {
        const manifestPath = join(projectRoot, manifest);
        const content = readFileSync(manifestPath, 'utf8');
        
        // Check for security contexts
        expect(content).toContain('securityContext:');
        expect(content).toContain('runAsNonRoot: true');
        expect(content).toContain('runAsUser: 1001');
        expect(content).toContain('allowPrivilegeEscalation: false');
        expect(content).toContain('readOnlyRootFilesystem: true');
      }
    });
  });

  describe('CI/CD Pipeline Validation', () => {
    it('should have valid GitHub Actions workflow', () => {
      const workflowPath = join(projectRoot, '.github/workflows/ci-cd.yml');
      expect(existsSync(workflowPath)).toBe(true);

      const content = readFileSync(workflowPath, 'utf8');
      
      // Check for required workflow elements
      expect(content).toContain('name: CI/CD Pipeline');
      expect(content).toContain('on:');
      expect(content).toContain('jobs:');
      
      // Check for required jobs
      expect(content).toContain('test:');
      expect(content).toContain('build:');
      expect(content).toContain('security-scan:');
      expect(content).toContain('deploy-staging:');
      expect(content).toContain('deploy-production:');
      
      // Check for service dependencies
      expect(content).toContain('services:');
      expect(content).toContain('mongodb:');
      expect(content).toContain('redis:');
      expect(content).toContain('influxdb:');
      
      // Check for security scanning
      expect(content).toContain('trivy-action');
      expect(content).toContain('npm audit');
    });

    it('should have deployment and rollback scripts', () => {
      const scripts = [
        'scripts/deploy-test.sh',
        'scripts/rollback.sh'
      ];

      for (const script of scripts) {
        const scriptPath = join(projectRoot, script);
        expect(existsSync(scriptPath)).toBe(true);

        const content = readFileSync(scriptPath, 'utf8');
        
        // Check for shebang
        expect(content.startsWith('#!/bin/bash')).toBe(true);
        
        // Check for error handling
        expect(content).toContain('set -e');
        
        // Check for logging functions
        expect(content).toContain('log_info');
        expect(content).toContain('log_error');
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should have proper environment configuration', () => {
      // Check for ConfigMap
      const configMapPath = join(projectRoot, 'k8s/configmap.yaml');
      const configMapContent = readFileSync(configMapPath, 'utf8');
      
      expect(configMapContent).toContain('NODE_ENV:');
      expect(configMapContent).toContain('LOG_LEVEL:');
      expect(configMapContent).toContain('API_PORT:');
      expect(configMapContent).toContain('ML_PORT:');
      
      // Check for Secrets template
      const secretsPath = join(projectRoot, 'k8s/secrets.yaml');
      const secretsContent = readFileSync(secretsPath, 'utf8');
      
      expect(secretsContent).toContain('MONGODB_URI:');
      expect(secretsContent).toContain('REDIS_URL:');
      expect(secretsContent).toContain('INFLUXDB_URL:');
      expect(secretsContent).toContain('JWT_SECRET:');
    });

    it('should have proper ingress configuration', () => {
      const ingressPath = join(projectRoot, 'k8s/ingress.yaml');
      const content = readFileSync(ingressPath, 'utf8');
      
      // Check for TLS configuration
      expect(content).toContain('tls:');
      expect(content).toContain('secretName:');
      
      // Check for rate limiting
      expect(content).toContain('rate-limit');
      
      // Check for SSL redirect
      expect(content).toContain('ssl-redirect');
      
      // Check for service routing
      expect(content).toContain('backend:');
      expect(content).toContain('service:');
    });
  });

  describe('Build Validation', () => {
    it('should build all packages successfully', () => {
      const packages = ['api', 'frontend', 'ml', 'shared'];
      
      for (const pkg of packages) {
        try {
          execSync(`npm run build`, {
            cwd: join(projectRoot, 'packages', pkg),
            stdio: 'pipe'
          });
        } catch (error) {
          throw new Error(`Build failed for package ${pkg}: ${error}`);
        }
      }
    });

    it('should have valid package.json files', () => {
      const packages = ['api', 'frontend', 'ml', 'shared'];
      
      for (const pkg of packages) {
        const packageJsonPath = join(projectRoot, 'packages', pkg, 'package.json');
        expect(existsSync(packageJsonPath)).toBe(true);
        
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        
        // Check for required fields
        expect(packageJson.name).toBeDefined();
        expect(packageJson.version).toBeDefined();
        expect(packageJson.scripts).toBeDefined();
        expect(packageJson.scripts.build).toBeDefined();
        expect(packageJson.scripts.test).toBeDefined();
      }
    });
  });

  describe('Security Validation', () => {
    it('should not contain hardcoded secrets in configuration files', () => {
      const configFiles = [
        'k8s/configmap.yaml',
        'docker-compose.yml',
        '.github/workflows/ci-cd.yml'
      ];
      
      const secretPatterns = [
        /password\s*[:=]\s*['"]\w+['"]/i,
        /secret\s*[:=]\s*['"]\w+['"]/i,
        /token\s*[:=]\s*['"]\w+['"]/i,
        /key\s*[:=]\s*['"]\w+['"]/i
      ];
      
      for (const configFile of configFiles) {
        const filePath = join(projectRoot, configFile);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          
          for (const pattern of secretPatterns) {
            const matches = content.match(pattern);
            if (matches && !content.includes('# Base64 encoded') && !content.includes('dev-') && !content.includes('test-')) {
              throw new Error(`Potential hardcoded secret found in ${configFile}: ${matches[0]}`);
            }
          }
        }
      }
    });

    it('should have proper RBAC configuration hints', () => {
      // Check that deployment scripts mention RBAC
      const deployTestPath = join(projectRoot, 'scripts/deploy-test.sh');
      const content = readFileSync(deployTestPath, 'utf8');
      
      // Should check for proper permissions
      expect(content).toContain('kubectl');
      expect(content).toContain('cluster-info');
    });
  });

  describe('Monitoring and Observability', () => {
    it('should have monitoring configuration', () => {
      // Check for health check endpoints in all services
      const deploymentManifests = [
        'k8s/api-deployment.yaml',
        'k8s/frontend-deployment.yaml',
        'k8s/ml-deployment.yaml'
      ];

      for (const manifest of deploymentManifests) {
        const manifestPath = join(projectRoot, manifest);
        const content = readFileSync(manifestPath, 'utf8');
        
        expect(content).toContain('/health');
      }
    });

    it('should have proper logging configuration', () => {
      const configMapPath = join(projectRoot, 'k8s/configmap.yaml');
      const content = readFileSync(configMapPath, 'utf8');
      
      expect(content).toContain('LOG_LEVEL:');
    });
  });
});