import { ServiceDbPool, EntityNotFoundError } from '../shared-core';
import { CustomerProfile, PointTransaction } from './crm.model';
import { CRM_SEED_CUSTOMERS } from './crm.fixtures';

export class CrmRepository {
  private readonly db = new ServiceDbPool('crm_db');
  private memCustomers = new Map<string, CustomerProfile>();
  private memTransactions: PointTransaction[] = [];
  private memProcessedEvents = new Set<string>();
  private memProcessedOrders = new Set<string>();

  constructor() {
    this.resetMemory();
  }

  resetMemory(): void {
    this.memCustomers.clear();
    for (const c of CRM_SEED_CUSTOMERS) {
      this.memCustomers.set(c.customerId, { ...c, updatedAt: new Date().toISOString() });
    }
    this.memTransactions = [];
    this.memProcessedEvents.clear();
    this.memProcessedOrders.clear();
  }

  async init(): Promise<boolean> {
    return this.db.initAndCheck();
  }

  async probe() {
    return this.db.probe();
  }

  async findCustomer(customerId: string): Promise<CustomerProfile | null> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        customer_id: string;
        full_name: string;
        tier: CustomerProfile['tier'];
        loyalty_points: number;
        updated_at: Date;
      }>('SELECT customer_id, full_name, tier, loyalty_points, updated_at FROM customers WHERE customer_id = $1', [customerId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        customerId: r.customer_id,
        fullName: r.full_name,
        tier: r.tier,
        loyaltyPoints: Number(r.loyalty_points),
        updatedAt: r.updated_at.toISOString(),
      };
    }
    const c = this.memCustomers.get(customerId);
    return c ? { ...c } : null;
  }

  async listAll(): Promise<CustomerProfile[]> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        customer_id: string;
        full_name: string;
        tier: CustomerProfile['tier'];
        loyalty_points: number;
        updated_at: Date;
      }>('SELECT customer_id, full_name, tier, loyalty_points, updated_at FROM customers ORDER BY customer_id');
      return rows.map((r) => ({
        customerId: r.customer_id,
        fullName: r.full_name,
        tier: r.tier,
        loyaltyPoints: Number(r.loyalty_points),
        updatedAt: r.updated_at.toISOString(),
      }));
    }
    return [...this.memCustomers.values()].map((c) => ({ ...c }));
  }

  /**
   * Idempotent point award protected by processed_events + UNIQUE(order_id) (TC06).
   */
  async awardPointsIdempotent(
    eventId: string,
    orderId: string,
    customerId: string,
    points: number,
    correlationId: string
  ): Promise<{ customerId: string; totalPoints: number; tier: string; duplicateIgnored: boolean }> {
    if (this.db.isPostgresActive()) {
      return this.db.withTransaction(async (client) => {
        const dup = await client.query(
          'INSERT INTO processed_events (event_id, order_id, event_type, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING event_id',
          [eventId, orderId, 'order.created', correlationId]
        );
        if (dup.rows.length === 0) {
          const existing = await this.findCustomer(customerId);
          return { customerId, totalPoints: existing?.loyaltyPoints ?? 0, tier: existing?.tier ?? 'SILVER', duplicateIgnored: true };
        }
        const upd = await client.query<{ loyalty_points: number; tier: string }>(
          'UPDATE customers SET loyalty_points = loyalty_points + $1, updated_at = NOW() WHERE customer_id = $2 RETURNING loyalty_points, tier',
          [points, customerId]
        );
        if (upd.rows.length === 0) {
          throw new EntityNotFoundError(`Không tìm thấy khách hàng ${customerId}.`, 'CUSTOMER_NOT_FOUND');
        }
        await client.query(
          'INSERT INTO point_transactions (order_id, customer_id, points, correlation_id) VALUES ($1, $2, $3, $4)',
          [orderId, customerId, points, correlationId]
        );
        return { customerId, totalPoints: Number(upd.rows[0].loyalty_points), tier: upd.rows[0].tier, duplicateIgnored: false };
      });
    }

    const customer = this.memCustomers.get(customerId);
    if (!customer) {
      throw new EntityNotFoundError(`Không tìm thấy khách hàng ${customerId}.`, 'CUSTOMER_NOT_FOUND');
    }
    if (this.memProcessedEvents.has(eventId) || this.memProcessedOrders.has(orderId)) {
      return { customerId, totalPoints: customer.loyaltyPoints, tier: customer.tier, duplicateIgnored: true };
    }
    this.memProcessedEvents.add(eventId);
    this.memProcessedOrders.add(orderId);
    customer.loyaltyPoints += points;
    customer.updatedAt = new Date().toISOString();
    this.memTransactions.push({ orderId, customerId, points, correlationId, createdAt: customer.updatedAt });
    return { customerId, totalPoints: customer.loyaltyPoints, tier: customer.tier, duplicateIgnored: false };
  }
}

export const crmRepository = new CrmRepository();
