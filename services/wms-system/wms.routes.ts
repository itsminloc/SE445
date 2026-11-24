import { Router } from 'express';
import { wmsController } from './wms.controller';

export const wmsRouter = Router();

wmsRouter.get('/health', (req, res) => wmsController.health(req, res));
wmsRouter.get('/inventory', (req, res, next) => wmsController.listInventory(req, res, next));
wmsRouter.get('/inventory/:sku', (req, res, next) => wmsController.getBySku(req, res, next));
wmsRouter.post('/inventory/reserve', (req, res, next) => wmsController.reserveStock(req, res, next));
