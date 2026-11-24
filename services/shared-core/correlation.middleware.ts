import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export interface LogRecord {
  timestamp: string;
  service: string;
  correlationId: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Propagates X-Correlation-ID (or X-Request-ID from Nginx) across all microservices.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming =
    (req.headers['x-correlation-id'] as string | undefined) ||
    (req.headers['x-request-id'] as string | undefined);

  const correlationId = incoming && incoming.trim().length > 0 ? incoming.trim() : `req-${crypto.randomUUID()}`;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
}

export class ServiceLogger {
  constructor(private readonly serviceName: string) {}

  private write(level: LogRecord['level'], message: string, correlationId = 'system', meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'test' && level === 'DEBUG') return;
    const entry: LogRecord = {
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      correlationId,
      level,
      message,
      ...(meta ? { meta } : {}),
    };
    if (process.env.NODE_ENV !== 'test') {
      const line = JSON.stringify(entry);
      if (level === 'ERROR') console.error(line);
      else console.log(line);
    }
  }

  info(message: string, correlationId?: string, meta?: Record<string, unknown>): void {
    this.write('INFO', message, correlationId, meta);
  }

  warn(message: string, correlationId?: string, meta?: Record<string, unknown>): void {
    this.write('WARN', message, correlationId, meta);
  }

  error(message: string, correlationId?: string, meta?: Record<string, unknown>): void {
    this.write('ERROR', message, correlationId, meta);
  }

  debug(message: string, correlationId?: string, meta?: Record<string, unknown>): void {
    this.write('DEBUG', message, correlationId, meta);
  }
}

export function createLogger(serviceName: string): ServiceLogger {
  return new ServiceLogger(serviceName);
}
