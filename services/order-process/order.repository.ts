import { ServiceDbPool } from '../shared-core';
import { OrderRecord, OrderStatus, OutboxEventRecord } from './order.model';

export class OrderRepository {
  private readonly db = new ServiceDbPool('order_db');
  private memOrders = new Map<string, OrderRecord>();
  private memOutbox = new Map<string, OutboxEventRecord>();

  resetMemory(): void {
    this.memOrders.clear();
    this.memOutbox.clear();
  }

  async init(): Promise<boolean> {
    return this.db.initAndCheck();
  }

  async probe() {
    return this.db.probe();
  }

  async createOrder(order: OrderRecord): Promise<void> {
    if (this.db.isPostgresActive()) {
      await this.db.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO orders (order_id, customer_id, channel, status, wms_status, crm_status, tms_status, total_amount, correlation_id, shipping_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
          [
            order.orderId,
            order.customerId,
            order.channel,
            order.status,
            order.wmsStatus,
            order.crmStatus,
            order.tmsStatus,
            order.totalAmount,
            order.correlationId,
            JSON.stringify(order.shippingAddress || {}),
          ]
        );
        for (const item of order.items) {
          await client.query(
            'INSERT INTO order_items (order_id, sku, quantity, unit_price) VALUES ($1, $2, $3, $4)',
            [order.orderId, item.sku, item.quantity, item.unitPrice]
          );
        }
      });
      return;
    }
    this.memOrders.set(order.orderId, { ...order });
  }

  async saveOutboxEvent(entry: OutboxEventRecord): Promise<void> {
    if (this.db.isPostgresActive()) {
      await this.db.query(
        `INSERT INTO outbox_events (event_id, aggregate_id, event_type, payload, status, published_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (event_id) DO UPDATE SET status = EXCLUDED.status, published_at = EXCLUDED.published_at`,
        [entry.eventId, entry.aggregateId, entry.eventType, JSON.stringify(entry.payload), entry.status, entry.publishedAt || null]
      );
      return;
    }
    this.memOutbox.set(entry.eventId, { ...entry });
  }

  async findById(orderId: string): Promise<OrderRecord | null> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        order_id: string;
        customer_id: string;
        channel: string;
        status: OrderStatus;
        wms_status: OrderRecord['wmsStatus'];
        crm_status: OrderRecord['crmStatus'];
        tms_status: OrderRecord['tmsStatus'];
        total_amount: string;
        correlation_id: string;
        shipping_address: OrderRecord['shippingAddress'];
        created_at: Date;
        updated_at: Date;
      }>('SELECT * FROM orders WHERE order_id = $1', [orderId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      const itemRows = await this.db.query<{ sku: string; quantity: number; unit_price: string }>(
        'SELECT sku, quantity, unit_price FROM order_items WHERE order_id = $1',
        [orderId]
      );
      return {
        orderId: r.order_id,
        customerId: r.customer_id,
        channel: r.channel,
        status: r.status,
        wmsStatus: r.wms_status,
        crmStatus: r.crm_status,
        tmsStatus: r.tms_status,
        totalAmount: Number(r.total_amount),
        correlationId: r.correlation_id,
        shippingAddress: r.shipping_address,
        items: itemRows.map((i) => ({ sku: i.sku, quantity: Number(i.quantity), unitPrice: Number(i.unit_price) })),
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      };
    }
    const found = this.memOrders.get(orderId);
    return found ? { ...found } : null;
  }

  async listOrders(): Promise<OrderRecord[]> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{ order_id: string }>('SELECT order_id FROM orders ORDER BY created_at DESC LIMIT 30');
      const results: OrderRecord[] = [];
      for (const r of rows) {
        const o = await this.findById(r.order_id);
        if (o) results.push(o);
      }
      return results;
    }
    return [...this.memOrders.values()].reverse().slice(0, 30);
  }

  async markSubstep(orderId: string, patch: Partial<Pick<OrderRecord, 'wmsStatus' | 'crmStatus' | 'tmsStatus' | 'status'>>): Promise<void> {
    if (this.db.isPostgresActive()) {
      await this.db.query(
        `UPDATE orders
         SET wms_status = COALESCE($1, wms_status),
             crm_status = COALESCE($2, crm_status),
             tms_status = COALESCE($3, tms_status),
             status = COALESCE(
               $4,
               CASE
                 WHEN COALESCE($1, wms_status) = 'DEDUCTED'
                  AND COALESCE($2, crm_status) = 'POINTS_AWARDED'
                  AND COALESCE($3, tms_status) = 'SHIPMENT_CREATED' THEN 'READY_TO_SHIP'
                 WHEN COALESCE($3, tms_status) = 'DLQ_QUARANTINED' THEN 'PARTIAL_FAILED'
                 ELSE status
               END
             ),
             updated_at = NOW()
         WHERE order_id = $5`,
        [patch.wmsStatus ?? null, patch.crmStatus ?? null, patch.tmsStatus ?? null, patch.status ?? null, orderId]
      );
      return;
    }

    const existing = this.memOrders.get(orderId);
    if (!existing) return;
    const next: OrderRecord = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    if (next.wmsStatus === 'DEDUCTED' && next.crmStatus === 'POINTS_AWARDED' && next.tmsStatus === 'SHIPMENT_CREATED') {
      next.status = 'READY_TO_SHIP';
    } else if (next.tmsStatus === 'DLQ_QUARANTINED') {
      next.status = 'PARTIAL_FAILED';
    }
    this.memOrders.set(orderId, next);
  }

  getOutboxEvents(): OutboxEventRecord[] {
    return [...this.memOutbox.values()];
  }
}

export const orderRepository = new OrderRepository();
