/**
 * Unified Local Demo Runner (Zero-Docker 0 VND Mode + Optional Postgres/RabbitMQ)
 * Boots all 4 microservices (WMS :3001, CRM :3002, TMS :3003, Order Process :3004)
 * plus a unified Gateway + SI Monitoring UI server on http://localhost:8080.
 */

import path from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import {
  oriConfig,
  correlationMiddleware,
  createErrorHandler,
  createRateLimiter,
  authenticateJwt,
  eventBus,
  createLogger,
} from './shared-core';
import { createWmsApp } from './wms-system/server';
import { wmsRepository } from './wms-system/wms.repository';
import { wmsService } from './wms-system/wms.service';
import { createCrmApp } from './crm-system/server';
import { crmRepository } from './crm-system/crm.repository';
import { crmService } from './crm-system/crm.service';
import { createTmsApp } from './tms-system/server';
import { tmsRepository } from './tms-system/tms.repository';
import { tmsService } from './tms-system/tms.service';
import { createOrderApp } from './order-process/server';
import { orderRepository } from './order-process/order.repository';
import { orderRouter } from './order-process/order.routes';
import { registerOrderStatusSubscribers } from './order-process/order-events.subscriber';
import { wmsRouter } from './wms-system/wms.routes';
import { crmRouter } from './crm-system/crm.routes';
import { tmsRouter } from './tms-system/tms.routes';

const logger = createLogger('ori-gateway');

export function createGatewayApp() {
  const gateway = express();
  gateway.disable('x-powered-by');
  gateway.use(cors());
  gateway.use(express.json());
  gateway.use(correlationMiddleware);

  const apiRateLimit = createRateLimiter({
    windowMs: 60_000,
    maxRequests: oriConfig.security.rateLimitPerMin,
    keyPrefix: 'ori:gateway',
  });

  gateway.get('/health', (_req: Request, res: Response) => {
    res.json({ service: 'ori-gateway', status: 'ok', timestamp: new Date().toISOString() });
  });

  const conditionalJwt = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-enforce-jwt'] === 'true' || process.env.ENFORCE_GATEWAY_JWT === 'true') {
      return authenticateJwt(req, res, next);
    }
    next();
  };

  gateway.use('/api/v1/wms', apiRateLimit, conditionalJwt, wmsRouter);
  gateway.use('/api/v1/crm', apiRateLimit, conditionalJwt, crmRouter);
  gateway.use('/api/v1/tms', apiRateLimit, conditionalJwt, tmsRouter);
  gateway.use('/', apiRateLimit, orderRouter);

  const dashboardDir = path.resolve(process.cwd(), 'si-dashboard');
  gateway.use(express.static(dashboardDir));
  gateway.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(dashboardDir, 'index.html'));
  });

  gateway.use(createErrorHandler('ori-gateway'));
  return gateway;
}

export async function startAllDemoServices() {
  await Promise.all([wmsRepository.init(), crmRepository.init(), tmsRepository.init(), orderRepository.init()]);
  const brokerMode = await eventBus.connect();
  await Promise.all([
    wmsService.registerConsumer(),
    crmService.registerConsumer(),
    tmsService.registerConsumer(),
    registerOrderStatusSubscribers(),
  ]);

  const servers = [
    createWmsApp().listen(oriConfig.ports.wms, '0.0.0.0'),
    createCrmApp().listen(oriConfig.ports.crm, '0.0.0.0'),
    createTmsApp().listen(oriConfig.ports.tms, '0.0.0.0'),
    createOrderApp().listen(oriConfig.ports.order, '0.0.0.0'),
    createGatewayApp().listen(parseInt(process.env.GATEWAY_PORT || '8080', 10), '0.0.0.0'),
  ];

  logger.info(`ORI Demo Suite running (${brokerMode} broker): Gateway http://localhost:${process.env.GATEWAY_PORT || '8080'}`);
  return servers;
}

if (require.main === module) {
  void startAllDemoServices();
}
