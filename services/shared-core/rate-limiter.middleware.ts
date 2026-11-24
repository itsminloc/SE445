import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory Sliding/Fixed-Window Rate Limiter (supports 100 req/min Kong-equivalent gateway enforcement).
 */
export class InMemoryRateLimiterStore {
  private buckets = new Map<string, BucketEntry>();

  hit(key: string, windowMs: number): { count: number; retryAfterSec: number } {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      const next: BucketEntry = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, next);
      return { count: 1, retryAfterSec: Math.ceil(windowMs / 1000) };
    }
    existing.count += 1;
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { count: existing.count, retryAfterSec };
  }

  reset(prefix?: string): void {
    if (!prefix) {
      this.buckets.clear();
      return;
    }
    for (const k of this.buckets.keys()) {
      if (k.startsWith(prefix)) this.buckets.delete(k);
    }
  }
}

export const globalRateLimiterStore = new InMemoryRateLimiterStore();

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.ip || req.socket.remoteAddress || '127.0.0.1';

    const customBucket = req.headers['x-ratelimit-key'];
    const identity = typeof customBucket === 'string' && customBucket.trim() ? customBucket.trim() : clientIp;
    const key = `${options.keyPrefix}:${identity}`;

    const { count, retryAfterSec } = globalRateLimiterStore.hit(key, options.windowMs);
    const remaining = Math.max(0, options.maxRequests - count);

    res.setHeader('RateLimit-Limit', String(options.maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));

    if (count > options.maxRequests) {
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        timestamp: new Date().toISOString(),
        status: 429,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        message: `Vượt ngưỡng ${options.maxRequests} requests/phút. Vui lòng thử lại sau ${retryAfterSec}s.`,
        correlationId: req.correlationId || 'unknown',
        path: req.originalUrl,
      });
      return;
    }
    next();
  };
}
