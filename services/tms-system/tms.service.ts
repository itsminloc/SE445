import crypto from 'node:crypto';
import {
  EntityNotFoundError,
  EventEnvelope,
  ServiceUnavailableError,
  ValidationError,
  createLogger,
  eventBus,
} from '../shared-core';
import { CreateShipmentRequest, ShipmentRecord } from './tms.model';
import { tmsRepository } from './tms.repository';

const logger = createLogger('tms-system');

export class TmsService {
  private simulateFailure = false;

  setFailureSimulation(enabled: boolean): void {
    this.simulateFailure = enabled;
    logger.warn(`TMS failure simulation set to ${enabled}`);
  }

  isFailureSimulated(): boolean {
    return this.simulateFailure;
  }

  async createShipment(req: CreateShipmentRequest, headerSimulateFailure = false) {
    if (this.simulateFailure || headerSimulateFailure) {
      throw new ServiceUnavailableError('TMS Delivery Service đang bảo trì hoặc gặp sự cố (Simulated 503).', 'TMS_DOWNTIME');
    }
    if (!req.orderId) {
      throw new ValidationError('orderId là bắt buộc khi tạo vận đơn.');
    }
    const eventId = req.eventId || `evt-tms-${req.orderId}`;
    const address = req.shippingAddress || { street: '254 Nguyen Van Linh', city: 'Da Nang' };
    const carrier = req.carrier || 'GHN_EXPRESS_MOCK';
    const res = await tmsRepository.createShipmentIdempotent(eventId, req.orderId, address, carrier, req.correlationId);

    if (res.duplicateIgnored) {
      logger.warn(`Duplicate shipment event ${eventId} ignored`, req.correlationId, { orderId: req.orderId });
    } else {
      logger.info(`Created shipment ${res.shipment.shipmentId} for ${req.orderId}`, req.correlationId);
    }
    return res;
  }

  async getByOrderId(orderId: string): Promise<ShipmentRecord> {
    const record = await tmsRepository.findByOrderId(orderId);
    if (!record) {
      throw new EntityNotFoundError(`Không tìm thấy vận đơn cho đơn hàng ${orderId}.`, 'SHIPMENT_NOT_FOUND');
    }
    return record;
  }

  async listAll(): Promise<ShipmentRecord[]> {
    return tmsRepository.listAll();
  }

  async handleOrderCreatedEvent(
    event: EventEnvelope<{ orderId: string; shippingAddress?: Record<string, unknown>; simulateTmsFailure?: boolean }>
  ): Promise<void> {
    const res = await this.createShipment(
      {
        eventId: event.eventId,
        orderId: event.data.orderId,
        shippingAddress: event.data.shippingAddress,
        correlationId: event.correlationId,
      },
      Boolean(event.data.simulateTmsFailure)
    );
    if (!res.duplicateIgnored) {
      await eventBus.publish('tms.completed', {
        eventId: `evt-${crypto.randomUUID()}`,
        eventType: 'tms.shipment.created',
        eventVersion: '1.0',
        occurredAt: new Date().toISOString(),
        correlationId: event.correlationId,
        sourceChannel: 'tms-system',
        data: { orderId: event.data.orderId, shipmentId: res.shipment.shipmentId },
      });
    }
  }

  async registerConsumer(): Promise<void> {
    await eventBus.subscribe('tms.order-created', 'order.created', async (event) => {
      await this.handleOrderCreatedEvent(
        event as EventEnvelope<{ orderId: string; shippingAddress?: Record<string, unknown>; simulateTmsFailure?: boolean }>
      );
    });
  }
}

export const tmsService = new TmsService();
