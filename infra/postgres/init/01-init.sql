-- ==========================================================
-- SE445 ORI - Database per Service Logical Initialization
-- Creates 4 isolated logical DBs: order_db, wms_db, crm_db, tms_db
-- ==========================================================

CREATE DATABASE order_db;
CREATE DATABASE wms_db;
CREATE DATABASE crm_db;
CREATE DATABASE tms_db;

-- ----------------------------------------------------------
-- 1. order_db (Order Orchestrator + Transactional Outbox)
-- ----------------------------------------------------------
\connect order_db;

CREATE TABLE IF NOT EXISTS orders (
  order_id        VARCHAR(64) PRIMARY KEY,
  customer_id     VARCHAR(64) NOT NULL,
  channel         VARCHAR(64) NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
  wms_status      VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  crm_status      VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  tms_status      VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  total_amount    NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  correlation_id  VARCHAR(128) NOT NULL,
  shipping_address JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id              SERIAL PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  sku             VARCHAR(64) NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  event_id        VARCHAR(64) PRIMARY KEY,
  aggregate_id    VARCHAR(64) NOT NULL,
  event_type      VARCHAR(64) NOT NULL,
  payload         JSONB NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMP
);

-- ----------------------------------------------------------
-- 2. wms_db (Warehouse Management System)
-- ----------------------------------------------------------
\connect wms_db;

CREATE TABLE IF NOT EXISTS inventory (
  sku             VARCHAR(64) PRIMARY KEY,
  product_name    VARCHAR(200) NOT NULL,
  available_qty   INTEGER NOT NULL CHECK (available_qty >= 0),
  reserved_qty    INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  unit_price      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id              SERIAL PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL,
  sku             VARCHAR(64) NOT NULL,
  delta_qty       INTEGER NOT NULL,
  movement_type   VARCHAR(32) NOT NULL,
  correlation_id  VARCHAR(128) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id        VARCHAR(64) PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL UNIQUE,
  event_type      VARCHAR(64) NOT NULL,
  correlation_id  VARCHAR(128) NOT NULL,
  processed_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO inventory (sku, product_name, available_qty, reserved_qty, unit_price) VALUES
  ('SKU-001', 'Laptop Gaming ABC Pro 15', 20, 0, 150000),
  ('SKU-002', 'Bàn phím Cơ Wireless K2', 5, 0, 450000),
  ('SKU-003', 'Chuột Không dây UltraLight', 50, 0, 290000),
  ('SKU-004', 'Màn hình 27 inch 4K IPS', 3, 0, 6500000),
  ('SKU-005', 'Tai nghe Studio ANC', 0, 0, 1200000)
ON CONFLICT (sku) DO NOTHING;

-- ----------------------------------------------------------
-- 3. crm_db (Customer Relationship Management)
-- ----------------------------------------------------------
\connect crm_db;

CREATE TABLE IF NOT EXISTS customers (
  customer_id     VARCHAR(64) PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  tier            VARCHAR(32) NOT NULL DEFAULT 'SILVER',
  loyalty_points  INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id              SERIAL PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL UNIQUE,
  customer_id     VARCHAR(64) NOT NULL REFERENCES customers(customer_id),
  points          INTEGER NOT NULL,
  correlation_id  VARCHAR(128) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id        VARCHAR(64) PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL UNIQUE,
  event_type      VARCHAR(64) NOT NULL,
  correlation_id  VARCHAR(128) NOT NULL,
  processed_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO customers (customer_id, full_name, tier, loyalty_points) VALUES
  ('CUS-001', 'Nguyễn Văn An', 'GOLD', 120),
  ('CUS-002', 'Trần Thị Bình', 'SILVER', 45),
  ('CUS-003', 'Lê Minh Cường', 'PLATINUM', 540)
ON CONFLICT (customer_id) DO NOTHING;

-- ----------------------------------------------------------
-- 4. tms_db (Transportation Management System)
-- ----------------------------------------------------------
\connect tms_db;

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id       VARCHAR(64) PRIMARY KEY,
  order_id          VARCHAR(64) NOT NULL UNIQUE,
  shipping_address  JSONB NOT NULL,
  carrier           VARCHAR(64) NOT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'PENDING_PICKUP',
  correlation_id    VARCHAR(128) NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id        VARCHAR(64) PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL UNIQUE,
  event_type      VARCHAR(64) NOT NULL,
  correlation_id  VARCHAR(128) NOT NULL,
  processed_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
