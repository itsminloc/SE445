import { ValidationError } from '../shared-core';
import { CanonicalOrderItem, CanonicalOrderRequest, ShippingAddress } from './order.model';

/**
 * Experience API Adapter: Normalizes heterogeneous payloads from 15 E-commerce websites
 * and 250+ POS terminals into the unified Canonical Order Model.
 */
export function normalizeToCanonicalOrder(rawBody: Record<string, unknown>): CanonicalOrderRequest {
  if (!rawBody || typeof rawBody !== 'object') {
    throw new ValidationError('Payload đơn hàng phải là JSON object hợp lệ.');
  }

  const rawUser = rawBody.user as Record<string, unknown> | undefined;
  const customerId = String(
    rawBody.customerId ?? rawBody.customer_id ?? rawBody.cust_id ?? rawUser?.id ?? ''
  ).trim();

  if (!customerId) {
    throw new ValidationError('Thiếu customerId trong yêu cầu tạo đơn.', { field: 'customerId' });
  }

  const rawItems = (rawBody.items ?? rawBody.products ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ValidationError('Danh sách items không được rỗng.', { field: 'items' });
  }

  const items: CanonicalOrderItem[] = rawItems.map((entry, idx) => {
    const sku = String(entry?.sku ?? entry?.product_code ?? '').trim();
    const quantity = Number(entry?.quantity ?? entry?.qty);
    const rawPrice = entry?.unitPrice ?? entry?.price ?? 150000;
    const unitPrice = Number(rawPrice);

    if (!sku) {
      throw new ValidationError(`Item tại vị trí ${idx} thiếu mã sku.`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(`Item ${sku} phải có quantity nguyên dương.`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new ValidationError(`Item ${sku} có unitPrice không hợp lệ.`);
    }
    return { sku, quantity, unitPrice };
  });

  const channel = String(rawBody.channel ?? rawBody.store_id ?? 'WEB_BRANCH_01').trim();
  const branchId = rawBody.branchId ? String(rawBody.branchId).trim() : undefined;

  const rawAddr = (rawBody.shippingAddress ?? rawBody.delivery_addr) as Record<string, unknown> | string | undefined;
  let shippingAddress: ShippingAddress | undefined;
  if (typeof rawAddr === 'string' && rawAddr.trim()) {
    shippingAddress = { street: rawAddr.trim(), city: 'Da Nang' };
  } else if (rawAddr && typeof rawAddr === 'object') {
    shippingAddress = {
      recipient: rawAddr.recipient ? String(rawAddr.recipient) : undefined,
      street: String(rawAddr.street || '254 Nguyen Van Linh'),
      city: String(rawAddr.city || 'Da Nang'),
    };
  }

  return {
    channel,
    branchId,
    customerId,
    items,
    shippingAddress,
    simulateTmsFailure: Boolean(rawBody.simulateTmsFailure),
  };
}
