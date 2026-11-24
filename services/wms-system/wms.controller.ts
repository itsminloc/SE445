import { Request, Response, NextFunction } from 'express';
import { wmsService } from './wms.service';
import { wmsRepository } from './wms.repository';

export class WmsController {
  async health(_req: Request, res: Response): Promise<void> {
    const db = await wmsRepository.probe();
    res.json({ service: 'wms-system', status: 'ok', database: db, timestamp: new Date().toISOString() });
  }

  async listInventory(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await wmsService.listInventory();
      res.json({ success: true, items });
    } catch (err) {
      next(err);
    }
  }

  async getBySku(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sku = String(req.params.sku || '');
      const item = await wmsService.getBySku(sku);
      res.json(item);
    } catch (err) {
      next(err);
    }
  }

  async reserveStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await wmsService.reserveStock({
        orderId: req.body?.orderId,
        correlationId: req.body?.correlationId || req.correlationId || 'unknown',
        items: req.body?.items,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const wmsController = new WmsController();
