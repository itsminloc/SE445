import { Router } from 'express';
import { orderController } from './order.controller';
import { monitoringController } from './monitoring.controller';

export const orderRouter = Router();

orderRouter.get('/health', (req, res) => orderController.health(req, res));
orderRouter.post('/api/v1/auth/token', (req, res) => orderController.issueDemoToken(req, res));

// Order Experience & Process Endpoints
orderRouter.post('/orders', (req, res, next) => orderController.createOrder(req, res, next));
orderRouter.get('/orders', (req, res, next) => orderController.listOrders(req, res, next));
orderRouter.get('/orders/:id', (req, res, next) => orderController.getOrder(req, res, next));

orderRouter.post('/api/v1/orders', (req, res, next) => orderController.createOrder(req, res, next));
orderRouter.get('/api/v1/orders', (req, res, next) => orderController.listOrders(req, res, next));
orderRouter.get('/api/v1/orders/:id', (req, res, next) => orderController.getOrder(req, res, next));
orderRouter.post('/api/v1/pos/ingest', (req, res, next) => orderController.ingestPosOrder(req, res, next));

// SI Monitoring & Testing Lab Endpoints
orderRouter.get('/api/v1/monitoring/telemetry', (req, res, next) => monitoringController.getTelemetry(req, res, next));
orderRouter.get('/api/v1/monitoring/ceo-summary', (req, res, next) => monitoringController.getCeoSummary(req, res, next));
orderRouter.get('/api/v1/monitoring/stream', (req, res) => monitoringController.streamTelemetry(req, res));
orderRouter.get('/api/v1/monitoring/scenarios', (req, res) => monitoringController.getScenarios(req, res));
orderRouter.post('/api/v1/monitoring/scenarios/:scenarioId/run', (req, res, next) => monitoringController.runScenario(req, res, next));
orderRouter.get('/api/v1/monitoring/dlq', (req, res) => monitoringController.getDlq(req, res));
orderRouter.post('/api/v1/monitoring/dlq/:id/replay', (req, res) => monitoringController.replayDlq(req, res));
orderRouter.post('/api/v1/monitoring/dlq/clear', (req, res) => monitoringController.clearDlq(req, res));
