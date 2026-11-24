# Database Schema — Database per Service (`01-init.sql`)

Thực hành mô hình **Database per Service** trên cụm PostgreSQL 16 (`infra/postgres/init/01-init.sql`), kèm In-Memory Transactional Adapter phục vụ test/demo độc lập:

1. **`order_db`**: `orders`, `order_items`, `outbox_events` (`status: PUBLISHED | PENDING_RETRY`).
2. **`wms_db`**: `inventory (CHECK available_qty >= 0)`, `stock_movements`, `processed_events (event_id PK, order_id UNIQUE)`.
3. **`crm_db`**: `customers`, `point_transactions (order_id UNIQUE)`, `processed_events`.
4. **`tms_db`**: `shipments (order_id UNIQUE)`, `processed_events`.
