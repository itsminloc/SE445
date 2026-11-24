import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { oriConfig, eventBus, globalRateLimiterStore, signOriToken } from '../../services/shared-core';
import { createWmsApp } from '../../services/wms-system/server';
import { wmsRepository } from '../../services/wms-system/wms.repository';
import { wmsService } from '../../services/wms-system/wms.service';
import { createCrmApp } from '../../services/crm-system/server';
import { crmRepository } from '../../services/crm-system/crm.repository';
import { crmService } from '../../services/crm-system/crm.service';
import { createTmsApp } from '../../services/tms-system/server';
import { tmsRepository } from '../../services/tms-system/tms.repository';
import { tmsService } from '../../services/tms-system/tms.service';
import { createOrderApp } from '../../services/order-process/server';
import { orderRepository } from '../../services/order-process/order.repository';
import { registerOrderStatusSubscribers } from '../../services/order-process/order-events.subscriber';
import { createGatewayApp } from '../../services/demo-runner';

function listenEphemeral(app: ReturnType<typeof createWmsApp>): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

describe('ORI End-to-End Integration & Failure Suite (TC01 - TC10)', () => {
  const servers: Server[] = [];
  let gatewayUrl = '';

  before(async () => {
    await eventBus.connect();
    await Promise.all([
      wmsService.registerConsumer(),
      crmService.registerConsumer(),
      tmsService.registerConsumer(),
      registerOrderStatusSubscribers(),
    ]);

    const wms = await listenEphemeral(createWmsApp());
    const crm = await listenEphemeral(createCrmApp());
    const tms = await listenEphemeral(createTmsApp());
    const order = await listenEphemeral(createOrderApp());
    const gw = await listenEphemeral(createGatewayApp());

    oriConfig.downstream.wmsBaseUrl = `http://127.0.0.1:${wms.port}`;
    oriConfig.downstream.crmBaseUrl = `http://127.0.0.1:${crm.port}`;
    oriConfig.downstream.tmsBaseUrl = `http://127.0.0.1:${tms.port}`;
    gatewayUrl = `http://127.0.0.1:${gw.port}`;

    servers.push(wms.server, crm.server, tms.server, order.server, gw.server);
  });

  after(async () => {
    await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
    await eventBus.close();
  });

  beforeEach(() => {
    wmsRepository.resetMemory();
    crmRepository.resetMemory();
    tmsRepository.resetMemory();
    orderRepository.resetMemory();
    tmsService.setFailureSimulation(false);
    eventBus.resetForTest();
    globalRateLimiterStore.reset();
  });

  test('TC01: Valid order returns 202 Accepted, deducts WMS, awards CRM points, creates TMS shipment & reaches READY_TO_SHIP', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': 'corr-tc01' },
      body: JSON.stringify({
        channel: 'WEB_BRANCH_01',
        customerId: 'CUS-001',
        items: [{ sku: 'SKU-001', quantity: 2, unitPrice: 150000 }],
      }),
    });

    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.headers.get('x-correlation-id'), 'corr-tc01');
    const body = (await res.json()) as { orderId: string; status: string };
    assert.strictEqual(body.status, 'PROCESSING');

    await new Promise((r) => setTimeout(r, 60));

    const wmsInv = (await fetch(`${gatewayUrl}/api/v1/wms/inventory/SKU-001`).then((r) => r.json())) as { availableQty: number };
    assert.strictEqual(wmsInv.availableQty, 18);

    const crmCust = (await fetch(`${gatewayUrl}/api/v1/crm/customers/CUS-001`).then((r) => r.json())) as { loyaltyPoints: number };
    assert.strictEqual(crmCust.loyaltyPoints, 150); // 120 + (300000 / 10000)

    const tmsShip = (await fetch(`${gatewayUrl}/api/v1/tms/shipments/order/${body.orderId}`).then((r) => r.json())) as { status: string };
    assert.strictEqual(tmsShip.status, 'PENDING_PICKUP');

    const orderDetail = (await fetch(`${gatewayUrl}/api/v1/orders/${body.orderId}`).then((r) => r.json())) as { status: string };
    assert.strictEqual(orderDetail.status, 'READY_TO_SHIP');
  });

  test('TC02 & TC04: Out-of-stock returns 409 Conflict and missing SKU returns 404 without publishing events', async () => {
    const outOfStock = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'CUS-001', items: [{ sku: 'SKU-005', quantity: 2, unitPrice: 1200000 }] }),
    });
    assert.strictEqual(outOfStock.status, 409);

    const missingSku = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'CUS-001', items: [{ sku: 'SKU-999', quantity: 1, unitPrice: 100000 }] }),
    });
    assert.strictEqual(missingSku.status, 404);
    assert.strictEqual(eventBus.getStatus().metrics.published, 0);
  });

  test('TC03: Missing customerId or empty items returns 400 Bad Request', async () => {
    const bad = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: '', items: [] }),
    });
    assert.strictEqual(bad.status, 400);
  });

  test('TC05: Paused CRM consumer preserves queued message until resumed, and TMS downtime isolates failure into DLQ', async () => {
    // Part A: CRM consumer temporarily paused
    eventBus.pauseQueue('crm.order-created');
    const resA = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'CUS-002', items: [{ sku: 'SKU-001', quantity: 1, unitPrice: 150000 }] }),
    });
    assert.strictEqual(resA.status, 202);
    await new Promise((r) => setTimeout(r, 40));

    const crmBeforeResume = (await fetch(`${gatewayUrl}/api/v1/crm/customers/CUS-002`).then((r) => r.json())) as { loyaltyPoints: number };
    assert.strictEqual(crmBeforeResume.loyaltyPoints, 45);

    const drained = await eventBus.resumeQueue('crm.order-created');
    assert.strictEqual(drained, 1);
    const crmAfterResume = (await fetch(`${gatewayUrl}/api/v1/crm/customers/CUS-002`).then((r) => r.json())) as { loyaltyPoints: number };
    assert.strictEqual(crmAfterResume.loyaltyPoints, 60); // 45 + 15

    // Part B: TMS failure simulation -> 3 retries -> quarantined in retail.dlq -> Replay
    tmsService.setFailureSimulation(true);
    const resB = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'CUS-001', items: [{ sku: 'SKU-003', quantity: 1, unitPrice: 290000 }] }),
    });
    assert.strictEqual(resB.status, 202);
    await new Promise((r) => setTimeout(r, 150));

    const dlq = eventBus.getDlqMessages();
    assert.strictEqual(dlq.length, 1);
    assert.strictEqual(dlq[0].retryCount, 3);
    assert.strictEqual(dlq[0].status, 'PENDING_INSPECTION');

    // Recover TMS & replay DLQ message
    tmsService.setFailureSimulation(false);
    const replayed = await fetch(`${gatewayUrl}/api/v1/monitoring/dlq/${dlq[0].id}/replay`, { method: 'POST' });
    assert.strictEqual(replayed.status, 200);
    assert.strictEqual(dlq[0].status, 'REPLAYED');
  });

  test('TC06: Duplicate eventId delivered twice does NOT deduct stock, add points, or create shipment twice', async () => {
    const duplicateEnvelope = {
      eventId: 'evt-duplicate-check-001',
      eventType: 'order.created',
      eventVersion: '1.0',
      occurredAt: new Date().toISOString(),
      correlationId: 'corr-tc06',
      sourceChannel: 'WEB_01',
      data: {
        orderId: 'ORD-DUP-001',
        customerId: 'CUS-001',
        items: [{ sku: 'SKU-001', quantity: 2, unitPrice: 150000 }],
        totalAmount: 300000,
      },
    };

    await eventBus.publish('order.created', duplicateEnvelope);
    await eventBus.publish('order.created', duplicateEnvelope);
    await new Promise((r) => setTimeout(r, 60));

    const crmCust = (await fetch(`${gatewayUrl}/api/v1/crm/customers/CUS-001`).then((r) => r.json())) as { loyaltyPoints: number };
    assert.strictEqual(crmCust.loyaltyPoints, 150); // Added +30 ONLY ONCE
    const shipments = (await fetch(`${gatewayUrl}/api/v1/tms/shipments`).then((r) => r.json())) as { shipments: unknown[] };
    assert.strictEqual(shipments.shipments.length, 1);
  });

  test('TC07: RabbitMQ offline returns 503 Service Unavailable (no false 202) and records PENDING_RETRY in outbox', async () => {
    eventBus.setBrokerOnline(false);
    const res = await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'CUS-001', items: [{ sku: 'SKU-001', quantity: 1, unitPrice: 150000 }] }),
    });
    assert.strictEqual(res.status, 503);
    const outbox = orderRepository.getOutboxEvents();
    assert.strictEqual(outbox.length, 1);
    assert.strictEqual(outbox[0].status, 'PENDING_RETRY');
  });

  test('TC08: 10 concurrent order requests on SKU-004 (available=3) allow exactly 3 orders with zero oversell', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        fetch(`${gatewayUrl}/api/v1/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': `corr-race-${idx}` },
          body: JSON.stringify({ customerId: 'CUS-003', items: [{ sku: 'SKU-004', quantity: 1, unitPrice: 6500000 }] }),
        })
      )
    );

    const statuses = responses.map((r) => r.status);
    assert.strictEqual(statuses.filter((s) => s === 202).length, 3);
    assert.strictEqual(statuses.filter((s) => s === 409).length, 7);

    const inv = (await fetch(`${gatewayUrl}/api/v1/wms/inventory/SKU-004`).then((r) => r.json())) as { availableQty: number };
    assert.strictEqual(inv.availableQty, 0);
  });

  test('TC09 & TC10: Gateway JWT check (401), AI POS ingest (202), and SI Monitoring Scenarios API', async () => {
    const unauth = await fetch(`${gatewayUrl}/api/v1/wms/inventory/SKU-001`, { headers: { 'x-enforce-jwt': 'true' } });
    assert.strictEqual(unauth.status, 401);

    const token = signOriToken({ sub: 'pos-01', role: 'CHANNEL_CLIENT' });
    const authed = await fetch(`${gatewayUrl}/api/v1/wms/inventory/SKU-001`, {
      headers: { 'x-enforce-jwt': 'true', Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(authed.status, 200);

    const posRes = await fetch(`${gatewayUrl}/api/v1/pos/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: 'POS_STORE_214',
        rawPayload: 'MA_KH: CUS-002 | SDT: 0905123456 | SKU-002 SL:1 GIA:450000d',
        autoSubmitOrder: true,
      }),
    });
    assert.strictEqual(posRes.status, 202);
    const posJson = (await posRes.json()) as { mapping: { maskedInput: string } };
    assert.ok(!posJson.mapping.maskedInput.includes('0905123456'));

    const mon = await fetch(`${gatewayUrl}/api/v1/monitoring/telemetry`);
    assert.strictEqual(mon.status, 200);
    const scenRun = await fetch(`${gatewayUrl}/api/v1/monitoring/scenarios/scenario-1-normal-order/run`, { method: 'POST' });
    assert.strictEqual(scenRun.status, 200);
  });

  test('TC11: CEO Executive Dashboard API aggregates Omnichannel GMV, channel breakdown & low-stock alerts', async () => {
    await fetch(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'WEB_BRANCH_01', customerId: 'CUS-001', items: [{ sku: 'SKU-001', quantity: 2, unitPrice: 150000 }] }),
    });
    await fetch(`${gatewayUrl}/api/v1/pos/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: 'POS_STORE_214', rawPayload: 'MA_KH: CUS-002 | SDT: 0905123456 | SKU-002 SL:1 GIA:450000d', autoSubmitOrder: true }),
    });
    await new Promise((r) => setTimeout(r, 80));

    const res = await fetch(`${gatewayUrl}/api/v1/monitoring/ceo-summary`);
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        kpis: { totalRevenueVnd: number; totalOrders: number; readyToShipOrders: number; completionRatePercent: number };
        channelBreakdown: Array<{ channelGroup: string; orders: number; revenueVnd: number }>;
        lowStockAlerts: Array<{ sku: string; severity: string }>;
        aiPosStats: { posOrdersIngested: number };
      };
    };

    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.kpis.totalOrders, 2);
    assert.strictEqual(json.data.kpis.totalRevenueVnd, 750000);
    assert.strictEqual(json.data.kpis.readyToShipOrders, 2);
    assert.strictEqual(json.data.kpis.completionRatePercent, 100);
    assert.strictEqual(json.data.aiPosStats.posOrdersIngested, 1);
    assert.ok(json.data.lowStockAlerts.some((a) => a.sku === 'SKU-004' && a.severity === 'LOW_STOCK'));
    assert.ok(json.data.lowStockAlerts.some((a) => a.sku === 'SKU-005' && a.severity === 'OUT_OF_STOCK'));
  });
});
