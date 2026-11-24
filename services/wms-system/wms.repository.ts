import { ServiceDbPool, EntityNotFoundError, InsufficientStockError } from '../shared-core';
import { InventoryItem, ReserveItemInput, StockMovement } from './wms.model';
import { WMS_SEED_INVENTORY } from './wms.fixtures';

export class WmsRepository {
  private readonly db = new ServiceDbPool('wms_db');
  private memInventory = new Map<string, InventoryItem>();
  private memMovements: StockMovement[] = [];
  private memProcessedEvents = new Set<string>();
  private memProcessedOrders = new Set<string>();

  constructor() {
    this.resetMemory();
  }

  resetMemory(): void {
    this.memInventory.clear();
    for (const item of WMS_SEED_INVENTORY) {
      this.memInventory.set(item.sku, { ...item, updatedAt: new Date().toISOString() });
    }
    this.memMovements = [];
    this.memProcessedEvents.clear();
    this.memProcessedOrders.clear();
  }

  async init(): Promise<boolean> {
    return this.db.initAndCheck();
  }

  async probe() {
    return this.db.probe();
  }

  async findBySku(sku: string): Promise<InventoryItem | null> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        sku: string;
        product_name: string;
        available_qty: number;
        reserved_qty: number;
        unit_price: string;
        updated_at: Date;
      }>('SELECT sku, product_name, available_qty, reserved_qty, unit_price, updated_at FROM inventory WHERE sku = $1', [sku]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        sku: r.sku,
        productName: r.product_name,
        availableQty: Number(r.available_qty),
        reservedQty: Number(r.reserved_qty),
        unitPrice: Number(r.unit_price),
        updatedAt: r.updated_at.toISOString(),
      };
    }
    const item = this.memInventory.get(sku);
    return item ? { ...item } : null;
  }

  async listAll(): Promise<InventoryItem[]> {
    if (this.db.isPostgresActive()) {
      const rows = await this.db.query<{
        sku: string;
        product_name: string;
        available_qty: number;
        reserved_qty: number;
        unit_price: string;
        updated_at: Date;
      }>('SELECT sku, product_name, available_qty, reserved_qty, unit_price, updated_at FROM inventory ORDER BY sku');
      return rows.map((r) => ({
        sku: r.sku,
        productName: r.product_name,
        availableQty: Number(r.available_qty),
        reservedQty: Number(r.reserved_qty),
        unitPrice: Number(r.unit_price),
        updatedAt: r.updated_at.toISOString(),
      }));
    }
    return [...this.memInventory.values()].map((i) => ({ ...i }));
  }

  /**
   * Atomic multi-item reservation (Prevents overselling under high concurrency - TC08).
   */
  async reserveItemsAtomic(orderId: string, correlationId: string, items: ReserveItemInput[]): Promise<Array<{ sku: string; remainingAvailable: number }>> {
    if (this.db.isPostgresActive()) {
      return this.db.withTransaction(async (client) => {
        const results: Array<{ sku: string; remainingAvailable: number }> = [];
        for (const item of items) {
          const check = await client.query<{ available_qty: number }>(
            'SELECT available_qty FROM inventory WHERE sku = $1 FOR UPDATE',
            [item.sku]
          );
          if (check.rows.length === 0) {
            throw new EntityNotFoundError(`Không tìm thấy SKU ${item.sku} trong WMS.`, 'SKU_NOT_FOUND', { sku: item.sku });
          }
          const updated = await client.query<{ available_qty: number }>(
            `UPDATE inventory SET available_qty = available_qty - $1, reserved_qty = reserved_qty + $1, updated_at = NOW()
             WHERE sku = $2 AND available_qty >= $1 RETURNING available_qty`,
            [item.quantity, item.sku]
          );
          if (updated.rows.length === 0) {
            throw new InsufficientStockError(`SKU ${item.sku} không đủ tồn kho.`, {
              sku: item.sku,
              available: check.rows[0].available_qty,
              requested: item.quantity,
            });
          }
          await client.query(
            `INSERT INTO stock_movements (order_id, sku, delta_qty, movement_type, correlation_id) VALUES ($1, $2, $3, 'RESERVE', $4)`,
            [orderId, item.sku, -item.quantity, correlationId]
          );
          results.push({ sku: item.sku, remainingAvailable: Number(updated.rows[0].available_qty) });
        }
        return results;
      });
    }

    // Synchronous critical section in Node.js single-threaded event loop -> zero race condition
    const snapshots = new Map<string, InventoryItem>();
    for (const item of items) {
      const current = this.memInventory.get(item.sku);
      if (!current) {
        throw new EntityNotFoundError(`Không tìm thấy SKU ${item.sku} trong WMS.`, 'SKU_NOT_FOUND', { sku: item.sku });
      }
      if (current.availableQty < item.quantity) {
        throw new InsufficientStockError(`SKU ${item.sku} không đủ tồn kho (còn ${current.availableQty}, yêu cầu ${item.quantity}).`, {
          sku: item.sku,
          available: current.availableQty,
          requested: item.quantity,
        });
      }
      snapshots.set(item.sku, current);
    }

    const now = new Date().toISOString();
    const reservedResults: Array<{ sku: string; remainingAvailable: number }> = [];
    for (const item of items) {
      const target = snapshots.get(item.sku)!;
      target.availableQty -= item.quantity;
      target.reservedQty += item.quantity;
      target.updatedAt = now;
      this.memMovements.push({ orderId, sku: item.sku, deltaQty: -item.quantity, movementType: 'RESERVE', correlationId, createdAt: now });
      reservedResults.push({ sku: item.sku, remainingAvailable: target.availableQty });
    }
    return reservedResults;
  }

  /**
   * Idempotent async confirmation of stock deduction upon `order.created` event (TC06).
   */
  async confirmDeductionIdempotent(
    eventId: string,
    orderId: string,
    correlationId: string,
    items: ReserveItemInput[]
  ): Promise<{ duplicateIgnored: boolean }> {
    if (this.db.isPostgresActive()) {
      return this.db.withTransaction(async (client) => {
        const dup = await client.query(
          'INSERT INTO processed_events (event_id, order_id, event_type, correlation_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING event_id',
          [eventId, orderId, 'order.created', correlationId]
        );
        if (dup.rows.length === 0) return { duplicateIgnored: true };

        for (const item of items) {
          await client.query(
            `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1), updated_at = NOW() WHERE sku = $2`,
            [item.quantity, item.sku]
          );
          await client.query(
            `INSERT INTO stock_movements (order_id, sku, delta_qty, movement_type, correlation_id) VALUES ($1, $2, $3, 'DEDUCT_CONFIRM', $4)`,
            [orderId, item.sku, -item.quantity, correlationId]
          );
        }
        return { duplicateIgnored: false };
      });
    }

    if (this.memProcessedEvents.has(eventId) || this.memProcessedOrders.has(orderId)) {
      return { duplicateIgnored: true };
    }
    this.memProcessedEvents.add(eventId);
    this.memProcessedOrders.add(orderId);
    const now = new Date().toISOString();
    for (const item of items) {
      const inv = this.memInventory.get(item.sku);
      if (inv) {
        inv.reservedQty = Math.max(0, inv.reservedQty - item.quantity);
        inv.updatedAt = now;
      }
      this.memMovements.push({ orderId, sku: item.sku, deltaQty: -item.quantity, movementType: 'DEDUCT_CONFIRM', correlationId, createdAt: now });
    }
    return { duplicateIgnored: false };
  }

  getProcessedEventCount(): number {
    return this.memProcessedEvents.size;
  }
}

export const wmsRepository = new WmsRepository();
