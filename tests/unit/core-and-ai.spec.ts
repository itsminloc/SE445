import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  maskPhone,
  maskEmail,
  maskRawPosPii,
  sanitizeTextInput,
  globalRateLimiterStore,
  createRateLimiter,
  signOriToken,
  verifyOriToken,
} from '../../services/shared-core';
import { normalizeToCanonicalOrder } from '../../services/order-process/order.adapter';
import { aiPosMapperService } from '../../services/order-process/ai-pos-mapper.service';
import { calculateLoyaltyPoints } from '../../services/crm-system/crm.service';

describe('ORI Unit Tests: Security, Adapters, Loyalty & AI POS Mapper', () => {
  beforeEach(() => {
    aiPosMapperService.clearCache();
  });

  test('UNIT-01: PII masking & XSS sanitization protect customer data before AI calls', () => {
    assert.strictEqual(maskPhone('0905123456'), '090****456');
    assert.strictEqual(maskEmail('locle@dtu.edu.vn'), 'lo****@dtu.edu.vn');
    const maskedPos = maskRawPosPii('KH: 0905123456 | Email: customer@abc.vn | SKU-001');
    assert.ok(!maskedPos.includes('0905123456'));
    assert.ok(!maskedPos.includes('customer@abc.vn'));
    assert.strictEqual(sanitizeTextInput('<script>alert(1)</script>Hello'), 'Hello');
  });

  test('UNIT-02: Canonical Order Adapter normalizes heterogeneous Web payloads and rejects invalid inputs (TC03)', () => {
    const normalized = normalizeToCanonicalOrder({
      channel: 'WEB_BRANCH_09',
      user: { id: 'CUS-002' },
      products: [{ product_code: 'SKU-002', qty: 2, price: 450000 }],
      delivery_addr: '123 Le Duan',
    });

    assert.strictEqual(normalized.customerId, 'CUS-002');
    assert.strictEqual(normalized.items[0].sku, 'SKU-002');
    assert.strictEqual(normalized.items[0].quantity, 2);
    assert.strictEqual(normalized.shippingAddress?.street, '123 Le Duan');

    assert.throws(() => normalizeToCanonicalOrder({ items: [{ sku: 'SKU-001', quantity: 1 }] }), /customerId/);
    assert.throws(() => normalizeToCanonicalOrder({ customerId: 'CUS-001', items: [] }), /items/);
  });

  test('UNIT-03: AI POS Data Mapping masks PII, parses CSV/text receipts and hits template cache', async () => {
    const raw = 'CH: POS-12 | MA_KH: CUS-003 | SDT: 0912345678 | SKU-001 SL: 2 GIA: 150000d';
    const first = await aiPosMapperService.mapRawPosPayload(raw, 'POS_STORE_12');
    assert.strictEqual(first.engine, 'OFFLINE_FALLBACK');
    assert.ok(!first.maskedInput.includes('0912345678'));
    assert.strictEqual(first.canonicalOrder.customerId, 'CUS-003');
    assert.strictEqual(first.canonicalOrder.items[0].quantity, 2);
    assert.strictEqual(first.canonicalOrder.totalAmount, 300000);

    const second = await aiPosMapperService.mapRawPosPayload(raw, 'POS_STORE_12');
    assert.strictEqual(second.engine, 'TEMPLATE_CACHE');
  });

  test('UNIT-04: CRM loyalty points formula and JWT sign/verify work accurately', () => {
    assert.strictEqual(calculateLoyaltyPoints(300000), 30);
    assert.strictEqual(calculateLoyaltyPoints(9999), 0);
    assert.strictEqual(calculateLoyaltyPoints(-500), 0);

    const token = signOriToken({ sub: 'client-1', role: 'CHANNEL_CLIENT', channel: 'WEB_01' });
    const decoded = verifyOriToken(token);
    assert.strictEqual(decoded.sub, 'client-1');
    assert.strictEqual(decoded.role, 'CHANNEL_CLIENT');
  });

  test('UNIT-05: Rate limiter blocks requests exceeding threshold with HTTP 429', async () => {
    globalRateLimiterStore.reset('unit:rl');
    const app = express();
    app.get('/ping', createRateLimiter({ windowMs: 60_000, maxRequests: 3, keyPrefix: 'unit:rl' }), (_req, res) => {
      res.json({ ok: true });
    });

    const server = await new Promise<import('node:http').Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    const port = (server.address() as { port: number }).port;
    try {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`http://localhost:${port}/ping`);
        assert.strictEqual(res.status, 200);
      }
      const blocked = await fetch(`http://localhost:${port}/ping`);
      assert.strictEqual(blocked.status, 429);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
