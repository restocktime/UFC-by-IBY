export { EncryptionService } from './encryption.service';
export { RateLimiterService } from './rate-limiter.service';
export { AuditLoggerService } from './audit-logger.service';
export { SecurityMiddleware } from './security.middleware';
export { SecurityController } from './security.controller';
export { APIKeyManagerService } from './api-key-manager.service';
export { RequestValidatorService } from './request-validator.service';
export { AbusePreventionService } from './abuse-prevention.service';
export { securityRoutes, auditLogger, rateLimiter, encryption } from './security.routes';

export type {
  EncryptionConfig,
  EncryptedData,
} from './encryption.service';

export type {
  RateLimitConfig,
  RateLimitInfo,
} from './rate-limiter.service';

export type {
  AuditEvent,
  SecurityAlert,
} from './audit-logger.service';

export type {
  SecurityConfig,
} from './security.middleware';

export type {
  APIKeyConfig,
  APIKeyRotationResult,
} from './api-key-manager.service';

export type {
  RequestValidationConfig,
  ValidationResult,
} from './request-validator.service';

export type {
  AbusePattern,
  RequestHistory,
  AbuseDetectionResult,
  IPBanInfo,
} from './abuse-prevention.service';