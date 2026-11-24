import crypto from 'node:crypto';
import { ServiceDbPool } from '../shared-core';
import { ShipmentRecord } from './tms.model';

export class TmsRepository {
  private readonly db = new ServiceDbPool('tms_db');
  private memShipmentsByOrder = new Map<string, ShipmentRecord>();
  private memProcessedEvents = new Set<string>();

  resetMemory(): void {
    this.memShipmentsByOrder.clear();
    this.memProcessedEvents.clear();
  }

  async init(): Promise<boolean> {
    return this.db.initAndCheck();
  }

  async probe() {
    return this.db.probe();
  }

  async createShipmentIdempotent(
    eventId: string,
    orderId: string,
    shippingAddress: Record<string, unknown>,
    carrier: string,
    correlationId: string
  ): Promise<{ shipment: ShipmentRecord; duplicateIgnored: boolean }> {
    const shipmentId = `SHP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    if (this.db.isPostgresActive()) {
      return this.db.withTransaction(async (client) => {
        const dup = await client.query(
          'INSERT INTO processed_events (event_id, order_id, event_type, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING event_id',
          [eventId, orderId, 'order.created', correlationId]
        );
        if (dup.rows.length === 0) {
          const existing = await this.findByOrderId(orderId);
          return { shipment: existing!, duplicateIgnored: true };
        }
        const ins = await client.query<{ created_at: Date }>(
          `INSERT INTO shipments (shipment_id, order_id, shipping_address, carrier, status, correlation_id)
           VALUES ($1, $2, $3::jsonb, $4, 'PENDING_PICKUP', $5) RETURNING created_at`,
          [shipmentId, orderId, JSON.stringify(shippingAddress), carrier, correlationId]
        );
        return {
          shipment: {
            shipmentId,
            orderId,
            shippingAddress,
            carrier,
            status: 'PENDING_PICKUP',
            correlationId,
            createdAt: ins.rows[0].created_at.toISOString(),
          },
          duplicateIgnored: false,
        };
      });
    }

    if (this.memProcessedEvents.has(eventId) || this.memShipmentsByOrder.has(orderId)) {
      return { shipment: this.memShipmentsByOrder.get(orderId)!, duplicateIgnored: true };
    }
    this.memProcessedEvents.add(eventId);
    const record: ShipmentRecord = {
      shipmentId,
      orderId,
      shippingAddress,
      carrier,
      status: 'PENDING_PICKUP',
      correlationId,
      createdAt: new Date().toISOString(),
    };
    this.memShipmentsByOrder.set(orderId, record);
    return { shipment: { ...record }, duplicateIgnored: false };
  }

  async findByOrderId(orderId: string): Promise<ShipmentRecord | null> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        shipment_id: string;
        order_id: string;
        shipping_address: Record<string, unknown>;
        carrier: string;
        status: ShipmentRecord['status'];
        correlation_id: string;
        created_at: Date;
      }>('SELECT shipment_id, order_id, shipping_address, carrier, status, correlation_id, created_at FROM shipments WHERE order_id = $1', [orderId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        shipmentId: r.shipment_id,
        orderId: r.order_id,
        shippingAddress: r.shipping_address,
        carrier: r.carrier,
        status: r.status,
        correlationId: r.correlation_id,
        createdAt: r.created_at.toISOString(),
      };
    }
    const s = this.memShipmentsByOrder.get(orderId);
    return s ? { ...s } : null;
  }

  async listAll(): Promise<ShipmentRecord[]> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        shipment_id: string;
        order_id: string;
        shipping_address: Record<string, unknown>;
        carrier: string;
        status: ShipmentRecord['status'];
        correlation_id: string;
        created_at: Date;
      }>('SELECT shipment_id, order_id, shipping_address, carrier, status, correlation_id, created_at FROM shipments ORDER BY created_at DESC');
      return rows.map((r) => ({
        shipmentId: r.shipment_id,
        orderId: r.order_id,
        shippingAddress: r.shipping_address,
        carrier: r.carrier,
        status: r.status,
        correlationId: r.correlation_id,
        createdAt: r.created_at.toISOString(),
      }));
    }
    return [...this.memShipmentsByOrder.values()].reverse();
  }
}

export const tmsRepository = new TmsRepository();
