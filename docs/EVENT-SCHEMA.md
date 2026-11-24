# Event Schema & RabbitMQ Topology

- **Exchange:** `retail.events` (`topic`, `durable: true`)
- **Dead Letter Exchange:** `retail.dlx` (`direct`, `durable: true`) -> Queue `retail.dlq`
- **Queues:** `wms.order-created`, `crm.order-created`, `tms.order-created` (binding key: `order.created`, max retries: `3`)

## Event Envelope (`order.created`)
```json
{
  "eventId": "evt-uuid",
  "eventType": "order.created",
  "eventVersion": "1.0",
  "occurredAt": "2026-11-24T00:00:00.000Z",
  "correlationId": "req-uuid",
  "sourceChannel": "WEB_BRANCH_01",
  "data": {
    "orderId": "ORD-20261124-0001",
    "customerId": "CUS-001",
    "items": [{ "sku": "SKU-001", "quantity": 2, "unitPrice": 150000 }],
    "totalAmount": 300000
  }
}
```
