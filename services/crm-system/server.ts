import express, { Express } from 'express';
import cors from 'cors';
import { correlationMiddleware, createErrorHandler, oriConfig, eventBus, createLogger } from '../shared-core';
import { crmRouter } from './crm.routes';
import { crmRepository } from './crm.repository';
import { crmService } from './crm.service';

const logger = createLogger('crm-system');

export function createCrmApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());
  app.use(correlationMiddleware);
  app.use('/', crmRouter);
  app.use(createErrorHandler('crm-system'));
  return app;
}

if (require.main === module) {
  (async () => {
    await crmRepository.init();
    await eventBus.connect();
    await crmService.registerConsumer();
    const app = createCrmApp();
    app.listen(oriConfig.ports.crm, '0.0.0.0', () => {
      logger.info(`CRM System API listening on port ${oriConfig.ports.crm}`);
    });
  })();
}
