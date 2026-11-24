# System Specification — SE445 ORI (Omnichannel Retail Integration)

Tham chiếu chi tiết: [proposal_2_CaseStudy02_vie.pdf](../proposal_2_CaseStudy02_vie.pdf)

- **Gateway (`:8080` Nginx / `:8000` Kong DB-less):** Single Entry Point, JWT Auth, Rate Limiting (`100 req/min`), `X-Correlation-ID`.
- **Experience & Process Layer (`order-process :3004`):** Chuẩn hóa payload 15 Websites & 250+ POS (`Canonical Order Model`), AI POS Mapper (`Gemini + Fallback`), Sync Stock Reservation (`< 200ms`), Async Publish `order.created` (`202 Accepted`), Outbox Guard, SI Monitoring & SSE Telemetry.
- **System APIs Layer:**
  - `wms-system (:3001)` -> `wms_db`: Conditional atomic update chống oversell (`TC08`), idempotent confirm deduction.
  - `crm-system (:3002)` -> `crm_db`: Tra cứu khách hàng, cộng điểm idempotent (`TC06`).
  - `tms-system (:3003)` -> `tms_db`: Tạo vận đơn (`PENDING_PICKUP`), cờ mô phỏng lỗi `x-simulate-failure` (`TC05`).
- **Event Broker (`RabbitMQ :5672/:15672`):** Topic Exchange `retail.events`, 3 queues (`wms.order-created`, `crm.order-created`, `tms.order-created`), Retry `x3` + `retail.dlx` -> `retail.dlq`.
