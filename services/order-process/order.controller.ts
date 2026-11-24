import { Request, Response, NextFunction } from 'express';
import { signOriToken, ValidationError } from '../shared-core';
import { normalizeToCanonicalOrder } from './order.adapter';
import { orderService } from './order.service';
import { aiPosMapperService } from './ai-pos-mapper.service';
import { orderRepository } from './order.repository';

export class OrderController {
  async health(_req: Request, res: Response): Promise<void> {
    const db = await orderRepository.probe();
    res.json({ service: 'order-process', status: 'ok', database: db, timestamp: new Date().toISOString() });
  }

  issueDemoToken(req: Request, res: Response): void {
    const channel = String(req.body?.channel || 'WEB_BRANCH_01');
    const role = req.body?.role === 'ADMIN' ? 'ADMIN' : 'CHANNEL_CLIENT';
    const token = signOriToken({ sub: `demo-${channel.toLowerCase()}`, role, channel });
    res.json({ success: true, token, role, channel });
  }

  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const canonical = normalizeToCanonicalOrder(req.body as Record<string, unknown>);
      const result = await orderService.placeOrder(canonical, req.correlationId || 'unknown');
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  }

  async ingestPosOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawPayload = String(req.body?.rawPayload || '');
      const storeId = String(req.body?.storeId || 'POS_STORE_214');
      const autoSubmit = req.body?.autoSubmitOrder !== false;

      if (!rawPayload.trim()) {
        throw new ValidationError('rawPayload không được để trống.');
      }
      const mapped = await aiPosMapperService.mapRawPosPayload(rawPayload, storeId);
      if (!autoSubmit) {
        res.status(200).json({ success: true, mapping: mapped });
        return;
      }
      const order = await orderService.placeOrder(mapped.canonicalOrder, req.correlationId || 'unknown');
      res.status(202).json({ success: true, mapping: mapped, order });
    } catch (err) {
      next(err);
    }
  }

  async listOrders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await orderService.listOrders();
      res.json({ success: true, orders });
    } catch (err) {
      next(err);
    }
  }

  async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await orderService.getOrder(String(req.params.id || ''));
      res.json(order);
    } catch (err) {
      next(err);
    }
  }
}

export const orderController = new OrderController();
