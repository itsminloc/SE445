import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { DomainError } from './domain.error';

/**
 * Global Error Handler Middleware (aligned with Case Study 02 & CyberRig error contract).
 */
export function createErrorHandler(serviceName: string): ErrorRequestHandler {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const correlationId = req.correlationId || 'unknown';
    const timestamp = new Date().toISOString();

    if (err instanceof DomainError) {
      res.status(err.statusCode).json({
        success: false,
        timestamp,
        service: serviceName,
        status: err.statusCode,
        errorCode: err.code,
        message: err.message,
        correlationId,
        path: req.originalUrl,
        ...(err.details !== undefined ? { details: err.details } : {}),
      });
      return;
    }

    if (process.env.NODE_ENV !== 'test') {
      console.error(JSON.stringify({ timestamp, service: serviceName, correlationId, level: 'ERROR', message: err.message }));
    }

    res.status(500).json({
      success: false,
      timestamp,
      service: serviceName,
      status: 500,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Đã xảy ra lỗi hệ thống không mong muốn.',
      correlationId,
      path: req.originalUrl,
    });
  };
}
