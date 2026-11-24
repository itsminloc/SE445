import crypto from 'node:crypto';
import { EntityNotFoundError, EventEnvelope, ValidationError, createLogger, eventBus } from '../shared-core';
import { AwardPointsRequest, CustomerProfile } from './crm.model';
import { crmRepository } from './crm.repository';

const logger = createLogger('crm-system');

export function calculateLoyaltyPoints(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return Math.floor(totalAmount / 10000);
}

export class CrmService {
  async listCustomers(): Promise<CustomerProfile[]> {
    return crmRepository.listAll();
  }

  async getCustomer(customerId: string): Promise<CustomerProfile> {
    const customer = await crmRepository.findCustomer(customerId);
    if (!customer) {
      throw new EntityNotFoundError(`Không tìm thấy khách hàng ${customerId}.`, 'CUSTOMER_NOT_FOUND');
    }
    return customer;
  }

  async awardPoints(req: AwardPointsRequest) {
    if (!req.eventId || !req.orderId || !req.customerId || !Number.isFinite(req.points) || req.points < 0) {
      throw new ValidationError('Dữ liệu cộng điểm cần eventId, orderId, customerId và points >= 0.');
    }
    const result = await crmRepository.awardPointsIdempotent(
      req.eventId,
      req.orderId,
      req.customerId,
      req.points,
      req.correlationId
    );
    if (result.duplicateIgnored) {
      logger.warn(`Duplicate loyalty event ${req.eventId} ignored`, req.correlationId, { orderId: req.orderId });
    } else {
      logger.info(`Awarded ${req.points} points to ${req.customerId}`, req.correlationId, { orderId: req.orderId });
    }
    return result;
  }

  async handleOrderCreatedEvent(event: EventEnvelope<{ orderId: string; customerId: string; totalAmount: number }>): Promise<void> {
    const { orderId, customerId, totalAmount } = event.data;
    const points = calculateLoyaltyPoints(totalAmount);
    const res = await this.awardPoints({
      eventId: event.eventId,
      orderId,
      customerId,
      points,
      correlationId: event.correlationId,
    });
    if (!res.duplicateIgnored) {
      await eventBus.publish('crm.completed', {
        eventId: `evt-${crypto.randomUUID()}`,
        eventType: 'crm.points.awarded',
        eventVersion: '1.0',
        occurredAt: new Date().toISOString(),
        correlationId: event.correlationId,
        sourceChannel: 'crm-system',
        data: { orderId, customerId, points },
      });
    }
  }

  async registerConsumer(): Promise<void> {
    await eventBus.subscribe('crm.order-created', 'order.created', async (event) => {
      await this.handleOrderCreatedEvent(event as EventEnvelope<{ orderId: string; customerId: string; totalAmount: number }>);
    });
  }
}

export const crmService = new CrmService();
