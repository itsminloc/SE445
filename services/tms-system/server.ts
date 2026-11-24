import express, { Express } from 'express';
import cors from 'cors';
import { correlationMiddleware, createErrorHandler, oriConfig, eventBus, createLogger } from '../shared-core';
import { tmsRouter } from './tms.routes';
import { tmsRepository } from './tms.repository';
import { tmsService } from './tms.service';

const logger = createLogger('tms-system');

export function createTmsApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());
  app.use(correlationMiddleware);
  app.use('/', tmsRouter);
  app.use(createErrorHandler('tms-system'));
  return app;
}

if (require.main === module) {
  (async () => {
    await tmsRepository.init();
    await eventBus.connect();
    await tmsService.registerConsumer();
    const app = createTmsApp();
    app.listen(oriConfig.ports.tms, '0.0.0.0', () => {
      logger.info(`TMS System API listening on port ${oriConfig.ports.tms}`);
    });
  })();
}
