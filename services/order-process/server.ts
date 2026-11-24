import express, { Express } from 'express';
import cors from 'cors';
import { correlationMiddleware, createErrorHandler, oriConfig, eventBus, createLogger } from '../shared-core';
import { orderRouter } from './order.routes';
import { orderRepository } from './order.repository';
import { registerOrderStatusSubscribers } from './order-events.subscriber';

const logger = createLogger('order-process');

export function createOrderApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());
  app.use(correlationMiddleware);
  app.use('/', orderRouter);
  app.use(createErrorHandler('order-process'));
  return app;
}

if (require.main === module) {
  (async () => {
    await orderRepository.init();
    await eventBus.connect();
    await registerOrderStatusSubscribers();
    const app = createOrderApp();
    app.listen(oriConfig.ports.order, '0.0.0.0', () => {
      logger.info(`Order Process API listening on port ${oriConfig.ports.order}`);
    });
  })();
}
