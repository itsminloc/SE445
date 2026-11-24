import { Router } from 'express';
import { tmsController } from './tms.controller';

export const tmsRouter = Router();

tmsRouter.get('/health', (req, res) => tmsController.health(req, res));
tmsRouter.post('/shipments', (req, res, next) => tmsController.createShipment(req, res, next));
tmsRouter.get('/shipments', (req, res, next) => tmsController.listShipments(req, res, next));
tmsRouter.get('/shipments/order/:orderId', (req, res, next) => tmsController.getByOrderId(req, res, next));
tmsRouter.post('/simulate-failure', (req, res) => tmsController.toggleSimulateFailure(req, res));
