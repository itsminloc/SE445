import { Request, Response, NextFunction } from 'express';
import { crmService } from './crm.service';
import { crmRepository } from './crm.repository';

export class CrmController {
  async health(_req: Request, res: Response): Promise<void> {
    const db = await crmRepository.probe();
    res.json({ service: 'crm-system', status: 'ok', database: db, timestamp: new Date().toISOString() });
  }

  async listCustomers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customers = await crmService.listCustomers();
      res.json({ success: true, customers });
    } catch (err) {
      next(err);
    }
  }

  async getCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await crmService.getCustomer(String(req.params.id || ''));
      res.json(customer);
    } catch (err) {
      next(err);
    }
  }

  async awardPoints(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await crmService.awardPoints({
        eventId: req.body?.eventId || `evt-direct-${req.body?.orderId}`,
        orderId: req.body?.orderId,
        customerId: req.body?.customerId,
        points: Number(req.body?.points),
        correlationId: req.correlationId || 'unknown',
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const crmController = new CrmController();
