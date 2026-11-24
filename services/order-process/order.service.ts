import crypto from 'node:crypto';
import {
  oriConfig,
  DomainError,
  EntityNotFoundError,
  InsufficientStockError,
  ServiceUnavailableError,
  EventEnvelope,
  createLogger,
  eventBus,
} from '../shared-core';
import { CanonicalOrderRequest, OrderRecord } from './order.model';
import { orderRepository } from './order.repository';

const logger = createLogger('order-process');

export class OrderService {
  private sequenceCounter = 1;

  async placeOrder(canonical: CanonicalOrderRequest, correlationId: string) {
    const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(this.sequenceCounter++).padStart(4, '0')}`;
    const totalAmount = canonical.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    // 1. Synchronous Inventory Check & Atomic Reservation (<200ms)
    await this.reserveInventorySync(orderId, canonical, correlationId);

    const now = new Date().toISOString();
    const orderRecord: OrderRecord = {
      orderId,
      customerId: canonical.customerId,
      channel: canonical.channel,
      status: 'PROCESSING',
      wmsStatus: 'RESERVED',
      crmStatus: 'PENDING',
      tmsStatus: 'PENDING',
      totalAmount,
      correlationId,
      items: canonical.items,
      shippingAddress: canonical.shippingAddress || { street: '254 Nguyen Van Linh', city: 'Da Nang' },
      createdAt: now,
      updatedAt: now,
    };

    await orderRepository.createOrder(orderRecord);

    // 2. Build & Publish `order.created` Event (Asynchronous EDA)
    const eventId = `evt-${crypto.randomUUID()}`;
    const event: EventEnvelope<Record<string, unknown>> = {
      eventId,
      eventType: 'order.created',
      eventVersion: '1.0',
      occurredAt: now,
      correlationId,
      sourceChannel: canonical.channel,
      data: {
        orderId,
        customerId: canonical.customerId,
        items: canonical.items,
        totalAmount,
        shippingAddress: orderRecord.shippingAddress,
        simulateTmsFailure: Boolean(canonical.simulateTmsFailure),
      },
    };

    try {
      await eventBus.publish('order.created', event);
      await orderRepository.saveOutboxEvent({
        eventId,
        aggregateId: orderId,
        eventType: 'order.created',
        payload: event as unknown as Record<string, unknown>,
        status: 'PUBLISHED',
        createdAt: now,
        publishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await orderRepository.saveOutboxEvent({
        eventId,
        aggregateId: orderId,
        eventType: 'order.created',
        payload: event as unknown as Record<string, unknown>,
        status: 'PENDING_RETRY',
        createdAt: now,
      });
      await orderRepository.markSubstep(orderId, { status: 'FAILED' });
      throw err;
    }

    logger.info(`Order ${orderId} accepted (202 PROCESSING)`, correlationId, { totalAmount });
    return {
      orderId,
      status: 'PROCESSING',
      correlationId,
      totalAmount,
      createdAt: now,
      trackingUrl: `/api/v1/orders/${orderId}`,
    };
  }

  private async reserveInventorySync(orderId: string, canonical: CanonicalOrderRequest, correlationId: string): Promise<void> {
    const url = `${oriConfig.downstream.wmsBaseUrl}/inventory/reserve`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
        body: JSON.stringify({ orderId, correlationId, items: canonical.items }),
      });
    } catch (err) {
      throw new ServiceUnavailableError('Không kết nối được tới WMS System API.', 'WMS_UNREACHABLE', { reason: (err as Error).message });
    }

    if (res.ok) return;

    const payload = (await res.json().catch(() => ({}))) as { message?: string; errorCode?: string; details?: unknown };
    if (res.status === 404) {
      throw new EntityNotFoundError(payload.message || 'SKU không tồn tại trong WMS.', payload.errorCode || 'SKU_NOT_FOUND', payload.details);
    }
    if (res.status === 409) {
      throw new InsufficientStockError(payload.message || 'Không đủ tồn kho khả dụng.', payload.details);
    }
    if (res.status >= 400 && res.status < 500) {
      throw new InsufficientStockError(payload.message || 'Lỗi dữ liệu tồn kho.', payload.details);
    }
    throw new DomainErrorImpl(payload.message || 'WMS lỗi hệ thống.', res.status, payload.errorCode || 'WMS_ERROR');
  }

  async getOrder(orderId: string): Promise<OrderRecord> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new EntityNotFoundError(`Không tìm thấy đơn hàng ${orderId}.`, 'ORDER_NOT_FOUND');
    }
    return order;
  }

  async listOrders(): Promise<OrderRecord[]> {
    return orderRepository.listOrders();
  }
}

class DomainErrorImpl extends DomainError {}

export const orderService = new OrderService();
