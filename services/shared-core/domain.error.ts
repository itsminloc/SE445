/**
 * Core Domain Error Hierarchy (adapted from CyberRig DomainError pattern)
 * Standardizes HTTP status codes and structured error codes across all ORI services.
 */

export abstract class DomainError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'DOMAIN_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Thiếu hoặc sai JWT Access Token.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Bạn không có quyền truy cập tài nguyên này.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class EntityNotFoundError extends DomainError {
  constructor(message: string, code = 'ENTITY_NOT_FOUND', details?: unknown) {
    super(message, 404, code, details);
  }
}

export class InsufficientStockError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'INSUFFICIENT_STOCK', details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class UnprocessableError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

export class RateLimitError extends DomainError {
  constructor(message = 'Vượt quá giới hạn tần suất (Rate Limit Exceeded).') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class BrokerUnavailableError extends DomainError {
  constructor(message = 'Message Broker (RabbitMQ) hiện không kết nối được.', details?: unknown) {
    super(message, 503, 'BROKER_UNAVAILABLE', details);
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(message: string, code = 'SERVICE_UNAVAILABLE', details?: unknown) {
    super(message, 503, code, details);
  }
}
