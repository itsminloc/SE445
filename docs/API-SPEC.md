# API Specification (SE445 ORI)

| Method & Path | Tầng | Sync / Async | HTTP Status |
| :--- | :--- | :--- | :--- |
| `POST /api/v1/orders` | Experience / Process | Sync check + Async event | `202`, `400`, `401`, `404`, `409`, `429`, `503` |
| `GET /api/v1/orders/:id` | Process | Sync | `200`, `404` |
| `POST /api/v1/pos/ingest` | Experience (AI Mapper) | Sync + Optional Async | `200`, `202`, `422` |
| `GET /api/v1/wms/inventory/:sku` | WMS System | Sync (`<200ms`) | `200`, `404` |
| `POST /api/v1/wms/inventory/reserve` | WMS System | Sync (Locking) | `200`, `404`, `409` |
| `GET /api/v1/crm/customers/:id` | CRM System | Sync | `200`, `404` |
| `POST /api/v1/tms/shipments` | TMS System | Sync / Test | `201`, `503` (`x-simulate-failure`) |
| `GET /api/v1/monitoring/telemetry` | SI Monitoring | Sync / SSE `/stream` | `200` |
| `GET /api/v1/monitoring/ceo-summary` | CEO Executive Dashboard | Sync | `200` |
| `POST /api/v1/monitoring/scenarios/:id/run` | SI Scenario Lab | Sync + EDA | `200`, `400` |
| `GET /api/v1/monitoring/dlq` | DLQ Inspector | Sync (`replay`/`clear`) | `200`, `404` |
