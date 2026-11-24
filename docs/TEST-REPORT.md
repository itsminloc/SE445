# Test Report — SE445 Case Study 02, 03 & 04 (ORI Platform)

**Project:** SE445-C — Unified Omnichannel Retail Integration (ORI)  
**Executed Date:** 2026-11-24  
**Runtime Environment:** Windows 11, Node.js `v24.14.0`, TypeScript `5.7.2` (`strict: true`), In-Memory Dual-Mode DB & EventBus (`USE_IN_MEMORY_DB=true`, `USE_IN_MEMORY_BROKER=true`)  

---

## 1. Executive Summary

| Quality Gate / Verification | Command | Result | Notes |
| --- | --- | --- | --- |
| TypeScript Strict Check | `npm run typecheck` | **PASS (exit 0)** | `tsc --noEmit`, 0 errors, `noImplicitAny: true`, `noUnusedLocals: true` |
| Production Build | `npm run build` | **PASS (exit 0)** | Compiled to `dist/` |
| Automated Test Suite | `npm test` | **14 / 14 PASS (0 fail, 0 skipped)** | 2 suites (`UNIT-01..05` + `TC01..TC11`) in `3146.7ms` |
| Container & Mesh Verifier | `npm run verify:infra` | **PASS (exit 0)** | 11 infra/Dockerfile artifacts verified, `docker compose config --quiet` valid, 4/4 services `HEALTHY` |
| Clean Code SRP Line Cap | PowerShell file line audit | **PASS** | 100% files in `services/` & `si-dashboard/` are `<= 280` lines (`max: 300`); 0 uses of `: any` |
| Supply Chain Vulnerability Audit | `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** | Clean production dependency tree |
| Docker Daemon Runtime | `docker compose up -d` | **NOT EXECUTED LOCALLY** | Docker Desktop engine stopped on host; Compose syntax validated via CLI |

---

## 2. Detailed Test Cases (`UNIT-01..05` & `TC01..TC11`)

### 2.1 Unit Test Suite (`tests/unit/core-and-ai.spec.ts`)
| Test ID | Scope Verified | Status |
| --- | --- | --- |
| `UNIT-01` | Decree 13/2023 PII Masking (`maskPhone`, `maskEmail`, `maskRawPosPii`) & XSS `sanitizeTextInput` | **PASS** (`1.77ms`) |
| `UNIT-02` | Canonical Order Adapter normalization & missing `customerId` / `items` rejection | **PASS** (`1.14ms`) |
| `UNIT-03` | AI POS Data Mapper PII redaction, offline CSV/text parsing & Template Cache hit | **PASS** (`0.95ms`) |
| `UNIT-04` | CRM loyalty point calculation (`10,000d = 1 pt`) & JWT sign/verify (`HS256`) | **PASS** (`3.17ms`) |
| `UNIT-05` | Sliding/fixed-window Gateway Rate Limiter enforcement (`HTTP 429`) | **PASS** (`75.94ms`) |

### 2.2 End-to-End Integration, Failure & CEO KPI Suite (`tests/integration/ori-e2e-scenarios.spec.ts`)
| Case ID | Scenario & Assertion | Status |
| --- | --- | --- |
| `TC01` | Valid order → `202 Accepted`, atomic WMS deduction (`SKU-001`: 20 → 18), CRM +30 pts (`120 → 150`), TMS shipment (`PENDING_PICKUP`), order converges to `READY_TO_SHIP` | **PASS** (`205.04ms`) |
| `TC02` & `TC04` | Out-of-stock (`SKU-005`) returns `409 Conflict`; unknown SKU (`SKU-999`) returns `404 Not Found` with 0 events published | **PASS** (`26.29ms`) |
| `TC03` | Invalid/missing `customerId` or empty `items` rejected with `400 Bad Request` | **PASS** (`9.53ms`) |
| `TC05` | Paused CRM consumer safely buffers message until resumed; simulated TMS downtime retries 3x and isolates event into `retail.dlq` | **PASS** (`230.77ms`) |
| `TC06` | Duplicate `eventId` delivered twice executes WMS/CRM/TMS mutations **only once** (idempotency guard) | **PASS** (`77.40ms`) |
| `TC07` | RabbitMQ offline returns `503 Service Unavailable` (no false `202`) and records `PENDING_RETRY` in `outbox_events` | **PASS** (`18.71ms`) |
| `TC08` | 10 concurrent order requests competing for `SKU-004` (`available=3`) allow **exact 3** `202` orders + **7** `409` rejections (0 oversell) | **PASS** (`61.57ms`) |
| `TC09` & `TC10` | Gateway JWT check (`401` without token, `200` with token), AI POS ingest (`202` with phone masked), Telemetry & Scenario APIs (`200`) | **PASS** (`98.41ms`) |
| `TC11` | CEO Executive Dashboard `GET /api/v1/monitoring/ceo-summary` returns exact GMV (`750,000d`), 100% completion SLA, channel share & `SKU-004`/`SKU-005` alerts | **PASS** (`101.89ms`) |

---

## 3. Case Study 03 Infrastructure Connectivity Verification (`npm run verify:infra`)
- Verified per-service Dockerfiles: `services/wms-system/Dockerfile`, `services/crm-system/Dockerfile`, `services/tms-system/Dockerfile`, `services/order-process/Dockerfile`.
- Verified Compose topologies: `docker-compose.yml` & `docker-compose.dev.yml` (`docker compose config --quiet` passed cleanly).
- Live mesh probe passed `5/5` HTTP checks (`Gateway /health`, `WMS`, `CRM`, `TMS`, `Telemetry`) and confirmed `4/4` services `HEALTHY`.
