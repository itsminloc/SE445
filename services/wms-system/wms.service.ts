import crypto from 'node:crypto';
import { EntityNotFoundError, EventEnvelope, ValidationError, createLogger, eventBus } from '../shared-core';
import { ReserveStockRequest, InventoryItem } from './wms.model';
import { wmsRepository } from './wms.repository';

const logger = createLogger('wms-system');

export class WmsService {
  async listInventory(): Promise<InventoryItem[]> {
    return wmsRepository.listAll();
  }

  async getBySku(sku: string): Promise<InventoryItem> {
    if (!sku || !sku.trim()) {
      throw new ValidationError('SKU không được để trống.');
    }
    const item = await wmsRepository.findBySku(sku.trim());
    if (!item) {
      throw new EntityNotFoundError(`Không tìm thấy SKU ${sku}.`, 'SKU_NOT_FOUND', { sku });
    }
    return item;
  }

  async reserveStock(req: ReserveStockRequest): Promise<{ reserved: boolean; items: Array<{ sku: string; remainingAvailable: number }> }> {
    if (!req.orderId || !Array.isArray(req.items) || req.items.length === 0) {
      throw new ValidationError('Yêu cầu giữ chỗ phải có orderId và ít nhất 1 item.');
    }
    for (const item of req.items) {
      if (!item.sku || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ValidationError('Mỗi item phải có sku và quantity nguyên dương.');
      }
    }
    const items = await wmsRepository.reserveItemsAtomic(req.orderId, req.correlationId, req.items);
    logger.info(`Reserved stock for order ${req.orderId}`, req.correlationId, { items });
    return { reserved: true, items };
  }

  async handleOrderCreatedEvent(event: EventEnvelope<{ orderId: string; items: Array<{ sku: string; quantity: number }> }>): Promise<void> {
    const { orderId, items } = event.data;
    const res = await wmsRepository.confirmDeductionIdempotent(event.eventId, orderId, event.correlationId, items);
    if (res.duplicateIgnored) {
      logger.warn(`Duplicate event ${event.eventId} ignored (idempotent)`, event.correlationId, { orderId });
      return;
    }
    logger.info(`Confirmed stock deduction for order ${orderId}`, event.correlationId, { eventId: event.eventId });
    await eventBus.publish('wms.completed', {
      eventId: `evt-${crypto.randomUUID()}`,
      eventType: 'wms.stock.deducted',
      eventVersion: '1.0',
      occurredAt: new Date().toISOString(),
      correlationId: event.correlationId,
      sourceChannel: 'wms-system',
      data: { orderId },
    });
  }

  async registerConsumer(): Promise<void> {
    await eventBus.subscribe('wms.order-created', 'order.created', async (event) => {
      await this.handleOrderCreatedEvent(event as EventEnvelope<{ orderId: string; items: Array<{ sku: string; quantity: number }> }>);
    });
  }
}

export const wmsService = new WmsService();
