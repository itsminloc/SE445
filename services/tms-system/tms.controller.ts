import { Request, Response, NextFunction } from 'express';
import { tmsService } from './tms.service';
import { tmsRepository } from './tms.repository';

export class TmsController {
  async health(_req: Request, res: Response): Promise<void> {
    const db = await tmsRepository.probe();
    res.json({
      service: 'tms-system',
      status: tmsService.isFailureSimulated() ? 'degraded' : 'ok',
      simulateFailure: tmsService.isFailureSimulated(),
      database: db,
      timestamp: new Date().toISOString(),
    });
  }

  async createShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const headerFail = String(req.headers['x-simulate-failure'] || '').toLowerCase() === 'true';
      const result = await tmsService.createShipment(
        {
          eventId: req.body?.eventId,
          orderId: req.body?.orderId,
          shippingAddress: req.body?.shippingAddress,
          carrier: req.body?.carrier,
          correlationId: req.correlationId || 'unknown',
        },
        headerFail
      );
      res.status(201).json(result.shipment);
    } catch (err) {
      next(err);
    }
  }

  async listShipments(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shipments = await tmsService.listAll();
      res.json({ success: true, shipments });
    } catch (err) {
      next(err);
    }
  }

  async getByOrderId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shipment = await tmsService.getByOrderId(String(req.params.orderId || ''));
      res.json(shipment);
    } catch (err) {
      next(err);
    }
  }

  toggleSimulateFailure(req: Request, res: Response): void {
    const enabled = Boolean(req.body?.enabled);
    tmsService.setFailureSimulation(enabled);
    res.json({ success: true, simulateFailure: tmsService.isFailureSimulated() });
  }
}

export const tmsController = new TmsController();
