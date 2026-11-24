import express, { Express } from 'express';
import cors from 'cors';
import { correlationMiddleware, createErrorHandler, oriConfig, eventBus, createLogger } from '../shared-core';
import { wmsRouter } from './wms.routes';
import { wmsRepository } from './wms.repository';
import { wmsService } from './wms.service';

const logger = createLogger('wms-system');

export function createWmsApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());
  app.use(correlationMiddleware);
  app.use('/', wmsRouter);
  app.use(createErrorHandler('wms-system'));
  return app;
}

if (require.main === module) {
  (async () => {
    await wmsRepository.init();
    await eventBus.connect();
    await wmsService.registerConsumer();
    const app = createWmsApp();
    app.listen(oriConfig.ports.wms, '0.0.0.0', () => {
      logger.info(`WMS System API listening on port ${oriConfig.ports.wms}`);
    });
  })();
}
